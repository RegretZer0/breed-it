const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Swine = require("../models/Swine");
const Farmer = require("../models/UserFarmer");
const { requireSessionAndToken } = require("../middleware/authMiddleware");

// ---------------------------------------------------------
// 1. QUALITY RANKING (Ownership-Aware & Status-Filtered)
// ---------------------------------------------------------
router.get("/quality-ranking", requireSessionAndToken, async (req, res) => {
    try {
        const { role, id, farmerProfileId, managerId } = req.user;

        // Base query: Only analyze adult swine that are still in the farm
        let query = { 
            age_stage: "adult",
            current_status: { $ne: "Culled/Sold" } 
        };

        /** * DATA PRIVACY LOGIC (Consistent with swineRoutes.js)
         */
        if (role === "farmer") {
            // Use farmerProfileId to match the farmer_id field in Swine model
            if (!farmerProfileId) {
                return res.status(400).json({ success: false, message: "Farmer profile not linked" });
            }
            query.farmer_id = new mongoose.Types.ObjectId(farmerProfileId);
        } else {
            // For Managers/Encoders: Fetch all swine belonging to farmers under this manager
            const effectiveManagerId = role === "farm_manager" ? id : managerId;
            const farmers = await Farmer.find({ registered_by: effectiveManagerId }).select("_id");
            const farmerIds = farmers.map(f => f._id);
            
            query.$or = [
                { farmer_id: { $in: farmerIds } },
                { registered_by: effectiveManagerId }
            ];
        }

        const swines = await Swine.find(query);

        const analytics = swines.map(swine => {
            let performanceScore = 0;
            let physicalScore = 0;
            let reproductiveScore = 0;

            // PHYSICAL & PERFORMANCE
            const latestPerf = swine.performance_records[swine.performance_records.length - 1];
            if (latestPerf) {
                physicalScore = (latestPerf.teat_count * 2) + (latestPerf.passed_selection ? 20 : 0);
                performanceScore = Math.min(latestPerf.weight / 2, 30); 
            }

            // SEX-SPECIFIC REPRODUCTIVE SCORING
            if (swine.sex === "Female") {
                if (swine.breeding_cycles && swine.breeding_cycles.length > 0) {
                    const totalPiglets = swine.breeding_cycles.reduce((acc, c) => acc + (c.farrowing_results?.total_piglets || 0), 0);
                    const totalLoss = swine.breeding_cycles.reduce((acc, c) => acc + (c.farrowing_results?.mortality_count || 0), 0);
                    reproductiveScore = (totalPiglets * 5) - (totalLoss * 10);
                } else {
                    reproductiveScore = 20; 
                }
            } else {
                reproductiveScore = 45; 
            }

            const totalScore = Math.max(Math.min(Math.round(performanceScore + physicalScore + reproductiveScore), 100), 0);

            return {
                _id: swine._id,
                swine_id: swine.swine_id,
                breed: swine.breed,
                sex: swine.sex,
                sire_id: swine.sire_id,
                dam_id: swine.dam_id,
                qualityScore: totalScore > 0 ? totalScore : 10,
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
        const { role, id, farmerProfileId } = req.user;

        const female = await Swine.findById(femaleId);
        const male = await Swine.findById(maleId);

        if (!female || !male) {
            return res.status(404).json({ success: false, message: "One or both swine not found" });
        }

        // SECURITY CHECK
        if (role === "farmer") {
            const profileIdStr = farmerProfileId.toString();
            const femaleOwner = female.farmer_id.toString();
            const maleOwner = male.farmer_id.toString();

            if (femaleOwner !== profileIdStr || maleOwner !== profileIdStr) {
                return res.status(403).json({ 
                    success: false, 
                    message: "Access Denied: You can only analyze your assigned swine." 
                });
            }
        }

        let score = 70; 
        let logs = [];

        // INBREEDING CHECK
        const sharedSire = (female.sire_id && male.sire_id && female.sire_id === male.sire_id);
        const sharedDam = (female.dam_id && male.dam_id && female.dam_id === male.dam_id);
        const directLine = (female.sire_id === male.swine_id || male.sire_id === female.swine_id);

        if (sharedSire || sharedDam || directLine) {
            score -= 60;
            logs.push("⚠️ CRITICAL: Close relative detected! Risk of genetic defects (Inbreeding).");
        } else {
            logs.push("✅ Lineage: No immediate relation detected.");
        }

        // BREED SYNERGY
        if (female.breed === male.breed) {
            score += 15;
            logs.push(`✅ Breed: Purebred ${female.breed} pairing.`);
        } else {
            score += 10;
            logs.push(`ℹ️ Breed: Crossbreeding for hybrid vigor (Heterosis).`);
        }

        // PHYSICAL COMPATIBILITY
        const fPerf = female.performance_records[female.performance_records.length - 1];
        const mPerf = male.performance_records[male.performance_records.length - 1];

        if (fPerf && mPerf) {
            const weightDiff = Math.abs(fPerf.weight - mPerf.weight);
            if (weightDiff < 50) {
                score += 5;
                logs.push("✅ Size: Parent weights are compatible for safe breeding.");
            } else {
                logs.push("ℹ️ Note: Significant weight difference between parents.");
            }
        }

        res.json({ 
            success: true, 
            compatibilityScore: Math.max(Math.min(score, 100), 0), 
            analysis: logs 
        });

    } catch (err) {
        console.error("Compatibility Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;