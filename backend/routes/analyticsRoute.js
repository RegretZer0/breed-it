const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Swine = require("../models/Swine");
const Farmer = require("../models/UserFarmer");
const { requireSessionAndToken } = require("../middleware/authMiddleware");

// ---------------------------------------------------------
// 1. QUALITY RANKING (Optimized for 2-Year Cycle Efficiency)
// ---------------------------------------------------------
router.get("/quality-ranking", requireSessionAndToken, async (req, res) => {
    try {
        const { role, id, farmerProfileId, managerId } = req.user;

        // Base query: Only analyze adult swine that are still in the farm
        let query = { 
            age_stage: "adult",
            current_status: { $ne: "Culled/Sold" } 
        };

        if (role === "farmer") {
            if (!farmerProfileId) {
                return res.status(400).json({ success: false, message: "Farmer profile not linked" });
            }
            query.farmer_id = new mongoose.Types.ObjectId(farmerProfileId);
        } else {
            const effectiveManagerId = role === "farm_manager" ? id : managerId;
            const farmers = await Farmer.find({ registered_by: effectiveManagerId }).select("_id");
            const farmerIds = farmers.map(f => f._id);
            
            query.$or = [
                { farmer_id: { $in: farmerIds } },
                { registered_by: effectiveManagerId }
            ];
        }

        const swines = await Swine.find(query).lean();
        
        // Fetch ALL offspring once to calculate efficiency for all sows
        const allOffspring = await Swine.find({ dam_id: { $ne: null } }).select("dam_id health_status").lean();

        const analytics = swines.map(swine => {
            let finalScore = 0;

            // --- A. PHYSICAL CONFORMITY (45% of total) ---
            let physicalPoints = 45;
            const latestPerf = swine.performance_records[swine.performance_records.length - 1] || {};
            
            const weight = latestPerf.weight || 0;
            if (weight < 15 || weight > 25) physicalPoints -= 15;

            const deformities = latestPerf.deformities?.filter(d => d !== "None") || [];
            if (deformities.length > 0) physicalPoints -= Math.min(30, deformities.length * 15);

            if (swine.sex === "Female" && (latestPerf.teat_count || 0) < 12) physicalPoints -= 10;

            finalScore += Math.max(0, physicalPoints);

            // --- B. PROVEN SUCCESS (40% of total) ---
            let successPoints = 0;
            if (swine.sex === "Female") {
                const offspring = allOffspring.filter(child => child.dam_id === swine.swine_id);
                const totalBorn = offspring.length;
                const deceasedCount = offspring.filter(child => child.health_status === "Deceased").length;
                
                // DATA LINK: Use Breeding Cycles length to determine Parity (number of litters)
                const parityCount = swine.breeding_cycles?.length || 0;

                if (parityCount > 0 && totalBorn > 0) {
                    const mortalityRate = (deceasedCount / totalBorn) * 100;
                    const avgLitterSize = totalBorn / parityCount;

                    // Mortality Component (Max 25)
                    if (mortalityRate <= 5) successPoints += 25;
                    else if (mortalityRate <= 15) successPoints += 15;
                    else successPoints += 5;

                    // Efficiency Component (Max 15) - Based on average per parity
                    if (avgLitterSize >= 10) successPoints += 15;
                    else if (avgLitterSize >= 7) successPoints += 10;
                    else successPoints += 5;
                } else {
                    successPoints = 25; // Gilt baseline (clean slate for new breeding stock)
                }
            } else {
                successPoints = 35; // Boar baseline
            }
            finalScore += successPoints;

            // --- C. GENETIC SAFETY (15% of total) ---
            finalScore += 15; 

            return {
                _id: swine._id,
                swine_id: swine.swine_id,
                breed: swine.breed,
                sex: swine.sex,
                qualityScore: Math.min(Math.round(finalScore), 100),
                current_status: swine.current_status
            };
        });

        analytics.sort((a, b) => b.qualityScore - a.qualityScore);
        res.json({ success: true, data: analytics });

    } catch (err) {
        console.error("Analytics Ranking Error:", err);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
});

// ---------------------------------------------------------
// 2. COMPATIBILITY CALCULATOR (Ownership-Validated)
// ---------------------------------------------------------
router.get("/compatibility", requireSessionAndToken, async (req, res) => {
    try {
        const { femaleId, maleId } = req.query;
        const { role, farmerProfileId } = req.user;

        const female = await Swine.findById(femaleId).lean();
        const male = await Swine.findById(maleId).lean();

        if (!female || !male) {
            return res.status(404).json({ success: false, message: "One or both swine not found" });
        }

        // Ownership Security check
        if (role === "farmer" && farmerProfileId) {
            const profileIdStr = farmerProfileId.toString();
            if (female.farmer_id?.toString() !== profileIdStr || male.farmer_id?.toString() !== profileIdStr) {
                return res.status(403).json({ success: false, message: "Access Denied: Only your swine can be analyzed." });
            }
        }

        let totalCompatibility = 0;
        let logs = [];

        // --- 1. PHYSICAL CONFORMITY (45%) ---
        let physicalScore = 45;
        const fPerf = female.performance_records[female.performance_records.length - 1] || {};
        
        if (fPerf.weight < 15 || fPerf.weight > 25) {
            physicalScore -= 15;
            logs.push(`❗ Sow weight (${fPerf.weight || 0}kg) is outside 15-25kg window.`);
        }
        
        const deformCount = fPerf.deformities?.filter(d => d !== "None").length || 0;
        if (deformCount > 0) {
            physicalScore -= 30;
            logs.push(`❗ Deformity: Issues detected in Sow morphology.`);
        }

        if ((fPerf.teat_count || 0) < 12) {
            physicalScore -= 10;
            logs.push(`🍼 Advisory: Sow has less than 12 teats.`);
        }
        totalCompatibility += Math.max(0, physicalScore);

        // --- 2. PROVEN SUCCESS (40%) ---
        let successScore = 0;
        const offspring = await Swine.find({ dam_id: female.swine_id }).select("health_status").lean();
        const parityCount = female.breeding_cycles?.length || 0;
        
        if (offspring.length > 0 && parityCount > 0) {
            const totalBorn = offspring.length;
            const deceasedCount = offspring.filter(c => c.health_status === "Deceased").length;
            const mortalityRate = (deceasedCount / totalBorn) * 100;
            const avgLitterSize = totalBorn / parityCount;

            if (mortalityRate <= 5 && avgLitterSize >= 9) {
                successScore = 40;
                logs.push(`📈 Elite Efficiency: ${mortalityRate.toFixed(1)}% mortality with avg ${avgLitterSize.toFixed(1)} piglets per litter.`);
            } else if (mortalityRate <= 15) {
                successScore = 25;
                logs.push(`📊 Stable Production: ${totalBorn} offspring across ${parityCount} parities.`);
            } else {
                successScore = 10;
                logs.push(`⚠️ Caution: High mortality rate (${mortalityRate.toFixed(1)}%) among offspring.`);
            }
        } else {
            successScore = 25; 
            logs.push("🌱 New Gilt: Neutral start (No farrowing history recorded).");
        }
        totalCompatibility += successScore;

        // --- 3. GENETIC SAFETY (15%) ---
        let geneticScore = 15;
        const sharedSire = (female.sire_id && male.sire_id && female.sire_id === male.sire_id);
        const sharedDam = (female.dam_id && male.dam_id && female.dam_id === male.dam_id);
        const directLine = (female.sire_id === male.swine_id || male.sire_id === female.swine_id || female.dam_id === male.swine_id);

        if (sharedSire || sharedDam || directLine) {
            geneticScore = 0;
            logs.push("❌ CRITICAL: Immediate Inbreeding detected! Pair is related.");
        } else {
            logs.push("✅ Genetic Safety: No immediate shared ancestry.");
        }
        totalCompatibility += geneticScore;

        res.json({ 
            success: true, 
            compatibilityScore: Math.round(totalCompatibility), 
            analysis: logs 
        });

    } catch (err) {
        console.error("Compatibility Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;