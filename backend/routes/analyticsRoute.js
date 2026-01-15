const express = require("express");
const router = express.Router();
const Swine = require("../models/Swine");
const { requireSessionAndToken } = require("../middleware/authMiddleware");

// ---------------------------------------------------------
// 1. QUALITY RANKING (Ownership-Aware)
// ---------------------------------------------------------
router.get("/quality-ranking", requireSessionAndToken, async (req, res) => {
    try {
        const { role, id } = req.user;

        // Base query: Only analyze adult swine
        let query = { age_stage: "adult" };

        /** * DATA PRIVACY: Farmers only see their own registrations.
         * Managers/Admins/Encoders maintain global oversight.
         */
        if (role === "farmer") {
            query.$or = [{ farmer_id: id }, { registered_by: id }, { userId: id }];
        }

        const swines = await Swine.find(query);

        const analytics = swines.map(swine => {
            let performanceScore = 0;
            let physicalScore = 0;
            let reproductiveScore = 0;

            // PHYSICAL & PERFORMANCE (Common Metrics)
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
                }
            } else {
                reproductiveScore = 45; // Base libido/fertility for adult boars
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
        const { role, id } = req.user;

        // Fetch pigs
        const female = await Swine.findById(femaleId);
        const male = await Swine.findById(maleId);

        if (!female || !male) {
            return res.status(404).json({ success: false, message: "One or both swine not found" });
        }

        /**
         * SECURITY CHECK: Prevent farmers from analyzing pigs they don't own.
         */
        if (role === "farmer") {
            const ownsFemale = [female.farmer_id, female.registered_by, female.userId].includes(id);
            const ownsMale = [male.farmer_id, male.registered_by, male.userId].includes(id);

            if (!ownsFemale || !ownsMale) {
                return res.status(403).json({ 
                    success: false, 
                    message: "Access Denied: You can only analyze swine registered to your account." 
                });
            }
        }

        let score = 70; // Baseline
        let logs = [];

        // --- INBREEDING CHECK ---
        const sharedSire = (female.sire_id && male.sire_id && female.sire_id === male.sire_id);
        const sharedDam = (female.dam_id && male.dam_id && female.dam_id === male.dam_id);
        const directLine = (female.sire_id === male.swine_id || male.sire_id === female.swine_id);

        if (sharedSire || sharedDam || directLine) {
            score -= 60;
            logs.push("⚠️ CRITICAL: Close relative detected! Risk of genetic defects (Inbreeding).");
        } else {
            logs.push("✅ Lineage: No immediate relation detected.");
        }

        // --- BREED SYNERGY ---
        if (female.breed === male.breed) {
            score += 15;
            logs.push(`✅ Breed: Purebred ${female.breed} pairing.`);
        } else {
            score += 10;
            logs.push(`ℹ️ Breed: Crossbreeding for hybrid vigor (Heterosis).`);
        }

        // --- PHYSICAL COMPATIBILITY ---
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