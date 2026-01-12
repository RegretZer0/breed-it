const express = require("express");
const router = express.Router();

const SwinePerformance = require("../models/SwinePerformance");
const AIRecord = require("../models/AIRecord");
const Swine = require("../models/Swine");

const { requireSessionAndToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

// Generate Breeding Analytics Report
router.get("/report", requireSessionAndToken, allowRoles("farm_manager", "encoder"), async (req, res) => {
  try {
    const user = req.user;
    const managerId = user.role === "farm_manager" ? user.id : user.managerId;

    // ----------------------
    // Fetch all swines for this manager
    // ----------------------
    const allSwines = await Swine.find({ manager_id: managerId });
    console.log("Total swines for manager:", allSwines.length);

    // ----------------------
    // Fetch performance and AI records
    // ----------------------
    const performance = await SwinePerformance.find({ manager_id: managerId }).populate("swine_id");
    const ai = await AIRecord.find({ manager_id: managerId })
      .populate("swine_id")
      .populate("male_swine_id");

    // ----------------------
    // Performance Score
    // ----------------------
    const performanceScoresMap = {};
    performance.forEach(p => {
      const swine = p.swine_id;
      if (!swine) return;

      const weightScore = p.weight ? Math.min(p.weight / 200, 1) : 0;
      const lengthScore = p.bodyLength ? Math.min(p.bodyLength / 150, 1) : 0;

      let teethScore = 0.5;
      if (p.teethAlignment) {
        switch (p.teethAlignment.toLowerCase()) {
          case "straight": teethScore = 1; break;
          case "minor issue": teethScore = 0.7; break;
          case "misaligned": teethScore = 0.4; break;
        }
      }

      let legScore = 0.5;
        if (p.legConformation) {
          switch (p.legConformation.toLowerCase()) {
            case "straight": 
              legScore = 1; 
              break;
            case "slightly bent": 
              legScore = 0.6; 
              break;
            case "bent": 
            default:
              legScore = 0.4; 
              break;
          }
        }

      let hoofScore = 0.5;
      if (p.hoofCondition) {
        switch (p.hoofCondition.toLowerCase()) {
          case "healthy": hoofScore = 1; break;
          case "minor crack": hoofScore = 0.7; break;
          case "damaged": hoofScore = 0.4; break;
        }
      }

      let bodyScore = 0.5;
      if (p.bodySymmetryAndMuscling) {
        switch (p.bodySymmetryAndMuscling.toLowerCase()) {
          case "excellent": bodyScore = 1; break;
          case "good": bodyScore = 0.8; break;
          case "fair": bodyScore = 0.6; break;
          case "poor": bodyScore = 0.4; break;
        }
      }

      const finalScore =
        weightScore * 0.3 +
        lengthScore * 0.2 +
        teethScore * 0.15 +
        legScore * 0.15 +
        hoofScore * 0.1 +
        bodyScore * 0.1;

      performanceScoresMap[swine.swine_id] = {
        swine_id: swine.swine_id,
        name: swine.name || "",
        performance_score: Number(finalScore.toFixed(2)),
      };
    });

    // Include swines without performance records
    allSwines.forEach(s => {
      if (!performanceScoresMap[s.swine_id]) {
        performanceScoresMap[s.swine_id] = {
          swine_id: s.swine_id,
          name: s.name || "",
          performance_score: 0,
        };
      }
    });

    const uniquePerf = Object.values(performanceScoresMap);

    // ----------------------
    // Reproduction Score (age in months, first-year piglets)
    // ----------------------
    const now = new Date();
    const offspringBySwine = {}; // { swineID: { total: x, firstYear: y } }
    const swineAges = {}; // { swineID: ageInMonths }

    performance.forEach(p => {
      if (!p.swine_id) return;
      const swineID = p.swine_id.swine_id;
      const birthDate = p.swine_id.birthDate ? new Date(p.swine_id.birthDate) : null;

      const ageInMonths = birthDate ? (now - birthDate) / (1000 * 60 * 60 * 24 * 30) : 24;
      swineAges[swineID] = Math.min(ageInMonths, 24); // cap at 24 months

      const piglets = p.noOfPiglets || p.no_of_piglets || 0;

      if (!offspringBySwine[swineID]) offspringBySwine[swineID] = { total: 0, firstYear: 0 };
      offspringBySwine[swineID].total += piglets;

      if (birthDate && ((new Date(p.recordDate || p.record_date)) - birthDate) / (1000 * 60 * 60 * 24 * 30) <= 12) {
        offspringBySwine[swineID].firstYear += piglets;
      }
    });

    // Make sure all swines are included even without records
    allSwines.forEach(s => {
      if (!offspringBySwine[s.swine_id]) offspringBySwine[s.swine_id] = { total: 0, firstYear: 0 };
      if (!swineAges[s.swine_id]) {
        const birthDate = s.birthDate ? new Date(s.birthDate) : null;
        const ageInMonths = birthDate ? (now - birthDate) / (1000 * 60 * 60 * 24 * 30) : 24;
        swineAges[s.swine_id] = Math.min(ageInMonths, 24);
      }
    });

    const maxPiglets = Math.max(...Object.values(offspringBySwine).map(o => o.total), 1);

    const reproductionScores = Object.entries(offspringBySwine).map(([swineID, data]) => {
      const ageFactor = Math.min(swineAges[swineID] / 24, 1); // 0–24 months normalized
      const pigletFactor = data.total / maxPiglets; // relative to max in system
      const score = Math.min(ageFactor * pigletFactor, 1); // capped at 1

      return {
        swine_id: swineID,
        reproduction_score: Number(score.toFixed(2)),
        total_piglets: data.total,
        age_months: Math.round(swineAges[swineID]),
      };
    });

    // ----------------------
    // Compatibility Score (by pair)
    // ----------------------
    const compatibilityScores = [];
    ai.forEach(rec => {
      if (!rec.swine_id || !rec.male_swine_id) return;

      const femaleID = rec.swine_id.swine_id;
      const maleID = rec.male_swine_id.swine_id;

      const femaleScore = uniquePerf.find(s => s.swine_id === femaleID)?.performance_score || 0;
      const maleScore = uniquePerf.find(s => s.swine_id === maleID)?.performance_score || 0;

      const compat = (femaleScore + maleScore) / 2;
      compatibilityScores.push({
        female: femaleID,
        male: maleID,
        compatibility_score: Number(compat.toFixed(2)),
      });
    });

    // ----------------------
    // Ranking by Performance (individual)
    // ----------------------
    const performance_ranking = [...uniquePerf].sort(
      (a, b) => b.performance_score - a.performance_score
    );

    // ----------------------
    // Ranking by Compatibility (pairs)
    // ----------------------
    const compatibility_ranking = [...compatibilityScores].sort(
      (a, b) => b.compatibility_score - a.compatibility_score
    );

    // ----------------------
    // Return report
    // ----------------------
    res.json({
      total_swines: allSwines.length,
      performance_scores: uniquePerf,
      reproduction_scores: reproductionScores,
      compatibility_scores: compatibilityScores,
      ranking_performance: performance_ranking,
      ranking_compatibility: compatibility_ranking,
    });

  } catch (err) {
    console.error("Analytics error:", err);
    res.status(500).json({ error: "Error generating analytics" });
  }
});

module.exports = router;