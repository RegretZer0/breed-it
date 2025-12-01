const express = require("express");
const router = express.Router();

const SwinePerformance = require("../models/SwinePerformance");
const AIRecord = require("../models/AIRecord");
const Swine = require("../models/Swine");

// ----------------------------------------------------
// Generate Breeding Analytics Report
// ----------------------------------------------------
router.get("/report", async (req, res) => {
  try {
    // Load all records
    const performance = await SwinePerformance.find().populate("swine_id");
    const ai = await AIRecord.find()
      .populate("swine_id")
      .populate("male_swine_id");

    // ----------------------------------------------------
    // 1. PERFORMANCE SCORE
    // ----------------------------------------------------

    const performanceScores = performance
      .map(p => {
        const swine = p.swine_id;
        if (!swine) return null;

        // Normalize weight & body length
        const weightScore = p.weight ? p.weight / 200 : 0;           // 200 kg ideal
        const lengthScore = p.bodyLength ? p.bodyLength / 150 : 0;   // 150 cm ideal

        // Health scoring
        const teeth = p.teethAlignment === "Good" ? 1 : 0.5;
        const legs = p.legConformation === "Good" ? 1 : 0.5;
        const hoof = p.hoofCondition === "Good" ? 1 : 0.5;

        const healthScore = (teeth + legs + hoof) / 3;

        const finalScore =
          ((weightScore + lengthScore) / 2) * 0.6 +
          healthScore * 0.4;

        return {
          swine_id: swine.swine_id,
          name: swine.name || "",
          performance_score: Number(finalScore.toFixed(2)),
        };
      })
      .filter(Boolean);

    // Remove duplicates (if multiple performance records exist)
    const uniquePerf = Object.values(
      performanceScores.reduce((acc, cur) => {
        acc[cur.swine_id] = cur;
        return acc;
      }, {})
    );

    // ----------------------------------------------------
    // 2. REPRODUCTION SCORE (based on number of piglets)
    // ----------------------------------------------------

    const offspringCounts = {};

    ai.forEach(rec => {
      if (!rec.swine_id) return;

      const femaleID = rec.swine_id.swine_id;
      if (!offspringCounts[femaleID]) offspringCounts[femaleID] = 0;

      // Support both noOfPiglets and no_of_piglets
      const piglets = rec.noOfPiglets || rec.no_of_piglets || 0;
      offspringCounts[femaleID] += piglets;
    });

    const reproductionScores = Object.entries(offspringCounts).map(
      ([swineID, count]) => ({
        swine_id: swineID,
        reproduction_score: Number(Math.min(count / 50, 1).toFixed(2)), // 50 total piglets ideal
      })
    );

    // ----------------------------------------------------
    // 3. COMPATIBILITY SCORE (based on performance of both)
    // ----------------------------------------------------

    const compatibilityScores = [];

    ai.forEach(rec => {
      if (!rec.swine_id || !rec.male_swine_id) return;

      const femaleID = rec.swine_id.swine_id;
      const maleID = rec.male_swine_id.swine_id;

      const femaleScore =
        uniquePerf.find(s => s.swine_id === femaleID)?.performance_score || 0;

      const maleScore =
        uniquePerf.find(s => s.swine_id === maleID)?.performance_score || 0;

      const compat = (femaleScore + maleScore) / 2;

      compatibilityScores.push({
        female: femaleID,
        male: maleID,
        compatibility_score: Number(compat.toFixed(2)),
      });
    });

    // ----------------------------------------------------
    // 4. RANKING (high performance → top)
    // ----------------------------------------------------

    const ranking = [...uniquePerf].sort(
      (a, b) => b.performance_score - a.performance_score
    );

    // ----------------------------------------------------
    // RETURN FINAL REPORT
    // ----------------------------------------------------

    res.json({
      performance_scores: uniquePerf,
      reproduction_scores: reproductionScores,
      compatibility_scores: compatibilityScores,
      ranking: ranking,
    });
  } catch (err) {
    console.error("Analytics error:", err);
    res.status(500).json({ error: "Error generating analytics" });
  }
});

module.exports = router;
