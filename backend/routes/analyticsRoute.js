const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Swine = require("../models/Swine");
const Farmer = require("../models/UserFarmer");
const SystemSettings = require("../models/SystemSettings"); // ✅ Added for Time Warp
const { requireSessionAndToken } = require("../middleware/authMiddleware");

/**
 * Helper to get the current system time (Real or Mocked)
 */
const getVirtualTime = async () => {
    const settings = await SystemSettings.findOne();
    return (settings && settings.mockDate) ? new Date(settings.mockDate) : new Date();
};

// ---------------------------------------------------------
// 1. QUALITY RANKING (Time Warp Aware)
// ---------------------------------------------------------
router.get("/quality-ranking", requireSessionAndToken, async (req, res) => {
    try {
        const { role, id, farmerProfileId, managerId } = req.user;
        const virtualNow = await getVirtualTime(); // ✅ Get the 2026 Date

        let query = { 
            age_stage: "adult",
            current_status: { $ne: "Culled/Sold" },
            // Only rank swine that were actually created/born before the warped date
            createdAt: { $lte: virtualNow } 
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
        
        // Fetch offspring born BEFORE the warped date
        const allOffspring = await Swine.find({ 
            $or: [{ dam_id: { $ne: null } }, { sire_id: { $ne: null } }],
            createdAt: { $lte: virtualNow } // ✅ Filter by Warp
        }).select("dam_id sire_id health_status").lean();

        const analytics = swines.map(swine => {
            let finalScore = 0;

            // --- A. PHYSICAL CONFORMITY (45% of total) ---
            let physicalPoints = 45;
            // Get latest performance record that exists BEFORE the warped date
            const latestPerf = swine.performance_records
                .filter(record => new Date(record.date || swine.createdAt) <= virtualNow)
                .pop() || {};
            
            if ((latestPerf.weight || 0) < 15 || (latestPerf.weight || 0) > 25) physicalPoints -= 15;
            const deformities = latestPerf.deformities?.filter(d => d !== "None") || [];
            if (deformities.length > 0) physicalPoints -= Math.min(30, deformities.length * 15);
            if (swine.sex === "Female" && (latestPerf.teat_count || 0) < 12) physicalPoints -= 10;

            finalScore += Math.max(0, physicalPoints);

            // --- B. PROVEN SUCCESS (40% of total) ---
            const offspring = allOffspring.filter(child => 
                swine.sex === "Female" ? child.dam_id === swine.swine_id : child.sire_id === swine.swine_id
            );

            const totalOffspring = offspring.length;
            const deceasedCount = offspring.filter(child => child.health_status === "Deceased").length;
            
            // Only count breeding cycles completed before the warp
            const parityCount = swine.breeding_cycles?.filter(cycle => 
                new Date(cycle.actual_farrowing_date || cycle.expected_farrowing_date) <= virtualNow
            ).length || 0;

            let successPoints = 0;
            if (totalOffspring > 0) {
                const mortalityRate = (deceasedCount / totalOffspring) * 100;
                
                if (mortalityRate <= 5) successPoints += 25;
                else if (mortalityRate <= 15) successPoints += 15;
                else successPoints += 5;

                if (swine.sex === "Female" && parityCount > 0) {
                    const avgLitter = totalOffspring / parityCount;
                    if (avgLitter >= 10) successPoints += 15;
                    else if (avgLitter >= 7) successPoints += 10;
                    else successPoints += 5;
                } else {
                    if (totalOffspring > 20) successPoints += 15;
                    else successPoints += 10;
                }
            } else {
                successPoints = 25; 
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
        res.json({ 
            success: true, 
            data: analytics,
            asOf: virtualNow.toDateString() // ✅ Show user what date the ranking is for
        });
    } catch (err) {
        console.error("Quality Ranking Error:", err);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
});

// ---------------------------------------------------------
// 2. COMPATIBILITY CALCULATOR (Time Warp Aware)
// ---------------------------------------------------------
router.get("/compatibility", requireSessionAndToken, async (req, res) => {
    try {
        const { femaleId, maleId } = req.query;
        const { role, farmerProfileId } = req.user;
        const virtualNow = await getVirtualTime();

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
        logs.push(`📅 Analysis Date: ${virtualNow.toDateString()}`);

        // --- 1. DUAL PHYSICAL CONFORMITY (45%) ---
        let totalPhysicalScore = 0;
        [female, male].forEach(pig => {
            let pScore = 22.5;
            // Get latest performance relative to Warp
            const perf = pig.performance_records
                .filter(r => new Date(r.date || pig.createdAt) <= virtualNow)
                .pop() || {};

            if (perf.weight < 15 || perf.weight > 25) {
                pScore -= 7.5;
                logs.push(`❗ ${pig.sex} weight (${perf.weight || 0}kg) is sub-optimal for ${virtualNow.getFullYear()}.`);
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
            $or: [{ dam_id: female.swine_id }, { sire_id: male.swine_id }],
            createdAt: { $lte: virtualNow } // ✅ Only count offspring that exist in this timeline
        }).select("dam_id sire_id health_status").lean();

        // Female Success
        const fOffspring = offspring.filter(o => o.dam_id === female.swine_id);
        if (fOffspring.length > 0) {
            const mRate = (fOffspring.filter(o => o.health_status === "Deceased").length / fOffspring.length) * 100;
            totalSuccessScore += mRate <= 10 ? 20 : 10;
            logs.push(`📊 Sow Success: Mortality at ${mRate.toFixed(1)}% as of Warp.`);
        } else {
            totalSuccessScore += 12.5;
            logs.push("🌱 Sow: New Gilt baseline.");
        }

        // Male Success
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
        console.error("Compatibility Calculator Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;