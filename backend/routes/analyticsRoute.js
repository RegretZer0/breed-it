const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Swine = require("../models/Swine");
const Farmer = require("../models/UserFarmer");
const { requireSessionAndToken } = require("../middleware/authMiddleware");

// ---------------------------------------------------------
// 1. QUALITY RANKING (Treats both Boars and Sows equally)
// ---------------------------------------------------------
router.get("/quality-ranking", requireSessionAndToken, async (req, res) => {
    try {
        const { role, id, farmerProfileId, managerId } = req.user;

        let query = { 
            age_stage: "adult",
            current_status: { $ne: "Culled/Sold" } 
        };

        if (role === "farmer") {
            if (!farmerProfileId) return res.status(400).json({ success: false, message: "Farmer profile not linked" });
            query.farmer_id = new mongoose.Types.ObjectId(farmerProfileId);
        } else {
            const effectiveManagerId = role === "farm_manager" ? id : managerId;
            const farmers = await Farmer.find({ registered_by: effectiveManagerId }).select("_id");
            const farmerIds = farmers.map(f => f._id);
            query.$or = [{ farmer_id: { $in: farmerIds } }, { registered_by: effectiveManagerId }];
        }

        const swines = await Swine.find(query).lean();
        
        // Fetch ALL offspring once to calculate efficiency for both Sires and Dams
        const allOffspring = await Swine.find({ 
            $or: [{ dam_id: { $ne: null } }, { sire_id: { $ne: null } }] 
        }).select("dam_id sire_id health_status").lean();

        const analytics = swines.map(swine => {
            let finalScore = 0;

            // --- A. PHYSICAL CONFORMITY (45% of total) ---
            let physicalPoints = 45;
            const latestPerf = swine.performance_records[swine.performance_records.length - 1] || {};
            
            if ((latestPerf.weight || 0) < 15 || (latestPerf.weight || 0) > 25) physicalPoints -= 15;
            const deformities = latestPerf.deformities?.filter(d => d !== "None") || [];
            if (deformities.length > 0) physicalPoints -= Math.min(30, deformities.length * 15);
            if (swine.sex === "Female" && (latestPerf.teat_count || 0) < 12) physicalPoints -= 10;

            finalScore += Math.max(0, physicalPoints);

            // --- B. PROVEN SUCCESS (40% of total) ---
            // Search offspring by dam_id if female, sire_id if male
            const offspring = allOffspring.filter(child => 
                swine.sex === "Female" ? child.dam_id === swine.swine_id : child.sire_id === swine.swine_id
            );

            const totalOffspring = offspring.length;
            const deceasedCount = offspring.filter(child => child.health_status === "Deceased").length;
            const parityCount = swine.breeding_cycles?.length || 0;

            let successPoints = 0;
            if (totalOffspring > 0) {
                const mortalityRate = (deceasedCount / totalOffspring) * 100;
                
                // Mortality Component (Max 25)
                if (mortalityRate <= 5) successPoints += 25;
                else if (mortalityRate <= 15) successPoints += 15;
                else successPoints += 5;

                // Efficiency Component (Max 15)
                // For Boars, we look at total volume; for Sows, average per parity.
                if (swine.sex === "Female" && parityCount > 0) {
                    const avgLitter = totalOffspring / parityCount;
                    if (avgLitter >= 10) successPoints += 15;
                    else if (avgLitter >= 7) successPoints += 10;
                    else successPoints += 5;
                } else {
                    // Boar efficiency based on healthy offspring count
                    if (totalOffspring > 20) successPoints += 15;
                    else successPoints += 10;
                }
            } else {
                successPoints = 25; // Baseline for new stock (Gilts/Young Boars)
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
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
});

// ---------------------------------------------------------
// 2. COMPATIBILITY CALCULATOR (Now includes Boar Performance)
// ---------------------------------------------------------
router.get("/compatibility", requireSessionAndToken, async (req, res) => {
    try {
        const { femaleId, maleId } = req.query;
        const { role, farmerProfileId } = req.user;

        const female = await Swine.findById(femaleId).lean();
        const male = await Swine.findById(maleId).lean();

        if (!female || !male) return res.status(404).json({ success: false, message: "One or both swine not found" });

        if (role === "farmer" && farmerProfileId) {
            const profileIdStr = farmerProfileId.toString();
            if (female.farmer_id?.toString() !== profileIdStr || male.farmer_id?.toString() !== profileIdStr) {
                return res.status(403).json({ success: false, message: "Access Denied." });
            }
        }

        let logs = [];

        // --- 1. DUAL PHYSICAL CONFORMITY (45%) ---
        let totalPhysicalScore = 0;
        [female, male].forEach(pig => {
            let pScore = 22.5; // Split 45 points between two parents
            const perf = pig.performance_records[pig.performance_records.length - 1] || {};
            if (perf.weight < 15 || perf.weight > 25) {
                pScore -= 7.5;
                logs.push(`❗ ${pig.sex} weight (${perf.weight || 0}kg) is sub-optimal.`);
            }
            if (perf.deformities?.filter(d => d !== "None").length > 0) {
                pScore -= 15;
                logs.push(`❗ Deformity: Issues detected in ${pig.sex} morphology.`);
            }
            totalPhysicalScore += Math.max(0, pScore);
        });

        // --- 2. DUAL PROVEN SUCCESS (40%) ---
        let totalSuccessScore = 0;
        const offspring = await Swine.find({ 
            $or: [{ dam_id: female.swine_id }, { sire_id: male.swine_id }] 
        }).select("dam_id sire_id health_status").lean();

        // Evaluate Female Success
        const fOffspring = offspring.filter(o => o.dam_id === female.swine_id);
        const fParity = female.breeding_cycles?.length || 0;
        if (fOffspring.length > 0) {
            const mRate = (fOffspring.filter(o => o.health_status === "Deceased").length / fOffspring.length) * 100;
            totalSuccessScore += mRate <= 10 ? 20 : 10;
            logs.push(`📊 Sow Success: Mortality at ${mRate.toFixed(1)}%.`);
        } else {
            totalSuccessScore += 12.5;
            logs.push("🌱 Sow: New Gilt baseline.");
        }

        // Evaluate Male Success
        const mOffspring = offspring.filter(o => o.sire_id === male.swine_id);
        if (mOffspring.length > 0) {
            const mRate = (mOffspring.filter(o => o.health_status === "Deceased").length / mOffspring.length) * 100;
            totalSuccessScore += mRate <= 10 ? 20 : 10;
            logs.push(`📊 Boar Success: Sired ${mOffspring.length} piglets with ${mRate.toFixed(1)}% mortality.`);
        } else {
            totalSuccessScore += 12.5;
            logs.push("🌱 Boar: No previous siring history.");
        }

        // --- 3. GENETIC SAFETY (15%) ---
        let geneticScore = 15;
        const isRelated = (female.sire_id && male.sire_id && female.sire_id === male.sire_id) ||
                         (female.dam_id && male.dam_id && female.dam_id === male.dam_id) ||
                         (female.sire_id === male.swine_id || male.sire_id === female.swine_id);

        if (isRelated) {
            geneticScore = 0;
            logs.push("❌ CRITICAL: Immediate Inbreeding detected!");
        } else {
            logs.push("✅ Genetic Safety: No immediate shared ancestry.");
        }

        const totalCompatibility = Math.min(Math.round(totalPhysicalScore + totalSuccessScore + geneticScore), 100);

        res.json({ 
            success: true, 
            compatibilityScore: totalCompatibility, 
            analysis: logs 
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;