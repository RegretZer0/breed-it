// analyticsRoutes.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Swine = require("../models/Swine");
const Farmer = require("../models/UserFarmer");
const { requireSessionAndToken } = require("../middleware/authMiddleware");

// ---------------------------------------------------------
// Helpers
// ---------------------------------------------------------
function getLatestPerformance(swine) {
  const arr = Array.isArray(swine?.performance_records) ? swine.performance_records : [];
  const latest = arr.length ? arr[arr.length - 1] : null;
  if (!latest) return null;

  return {
    stage: latest.stage,
    record_date: latest.record_date,
    weight: latest.weight,
    body_length: latest.body_length,
    heart_girth: latest.heart_girth,
    teeth_count: latest.teeth_count,
    leg_conformation: latest.leg_conformation,
    teat_count: latest.teat_count,
    teat_alignment: latest.teat_alignment,
    deformities: latest.deformities,
  };
}

function computeTotals(swine) {
  const cycles = Array.isArray(swine?.breeding_cycles) ? swine.breeding_cycles : [];

  const totalPiglets = cycles.reduce((sum, c) => sum + (c?.farrowing_results?.total_piglets || 0), 0);
  const totalMortality = cycles.reduce((sum, c) => sum + (c?.farrowing_results?.mortality_count || 0), 0);

  return { totalPiglets, totalMortality };
}

// ---------------------------------------------------------
// 1. QUALITY RANKING (Treats both Boars and Sows equally)
// Returns card-ready fields for frontend pig cards
// ---------------------------------------------------------
router.get("/quality-ranking", requireSessionAndToken, async (req, res) => {
  try {
    const { role, id, farmerProfileId, managerId } = req.user;

    let query = {
      age_stage: "adult",
      current_status: { $ne: "Culled/Sold" },
    };

    if (role === "farmer") {
      if (!farmerProfileId) {
        return res.status(400).json({ success: false, message: "Farmer profile not linked" });
      }
      query.farmer_id = new mongoose.Types.ObjectId(farmerProfileId);
    } else {
      const effectiveManagerId = role === "farm_manager" ? id : managerId;

      const farmers = await Farmer.find({ registered_by: effectiveManagerId }).select("_id");
      const farmerIds = farmers.map((f) => f._id);

      query.$or = [{ farmer_id: { $in: farmerIds } }, { registered_by: effectiveManagerId }];
    }

    // Select extra fields needed by the frontend pig-card
    const swines = await Swine.find(query)
      .select([
        "swine_id",
        "breed",
        "sex",
        "color",
        "batch",
        "profile_photo",
        "birth_date",
        "date_registered",
        "age_stage",
        "current_status",
        "health_status",
        "sire_id",
        "dam_id",
        "is_external_boar",
        "parity",
        "performance_records",
        "breeding_cycles",
        "createdAt",
      ].join(" "))
      .lean();

    // Fetch ALL offspring once to calculate efficiency for both Sires and Dams
    const allOffspring = await Swine.find({
      $or: [{ dam_id: { $ne: null } }, { sire_id: { $ne: null } }],
    })
      .select("dam_id sire_id health_status")
      .lean();

    const analytics = swines.map((swine) => {
      let finalScore = 0;

      // --- A. PHYSICAL CONFORMITY (45% of total) ---
      let physicalPoints = 45;
      const perfArr = Array.isArray(swine.performance_records) ? swine.performance_records : [];
      const latestPerf = perfArr.length ? perfArr[perfArr.length - 1] : {};

      const w = Number(latestPerf.weight || 0);
      if (w < 15 || w > 25) physicalPoints -= 15;

      const deformities = (latestPerf.deformities || []).filter((d) => d && d !== "None");
      if (deformities.length > 0) physicalPoints -= Math.min(30, deformities.length * 15);

      if (swine.sex === "Female" && Number(latestPerf.teat_count || 0) < 12) physicalPoints -= 10;

      finalScore += Math.max(0, physicalPoints);

      // --- B. PROVEN SUCCESS (40% of total) ---
      const offspring = allOffspring.filter((child) =>
        swine.sex === "Female" ? child.dam_id === swine.swine_id : child.sire_id === swine.swine_id
      );

      const totalOffspring = offspring.length;
      const deceasedCount = offspring.filter((child) => child.health_status === "Deceased").length;
      const parityCount = Array.isArray(swine.breeding_cycles) ? swine.breeding_cycles.length : 0;

      let successPoints = 0;
      if (totalOffspring > 0) {
        const mortalityRate = (deceasedCount / totalOffspring) * 100;

        // Mortality Component (Max 25)
        if (mortalityRate <= 5) successPoints += 25;
        else if (mortalityRate <= 15) successPoints += 15;
        else successPoints += 5;

        // Efficiency Component (Max 15)
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
        successPoints = 25; // Baseline for new stock
      }
      finalScore += successPoints;

      // --- C. GENETIC SAFETY (15% of total) ---
      finalScore += 15;

      const qualityScore = Math.min(Math.round(finalScore), 100);

      // Card helpers
      const latest_performance = getLatestPerformance(swine);
      const totals = computeTotals(swine);

      return {
        // Existing fields used by frontend
        _id: swine._id,
        swine_id: swine.swine_id,
        breed: swine.breed,
        sex: swine.sex,
        qualityScore,
        current_status: swine.current_status,

        // Additional fields for pig-card details
        age_stage: swine.age_stage,
        health_status: swine.health_status,
        color: swine.color,
        batch: swine.batch,
        profile_photo: swine.profile_photo || "",
        birth_date: swine.birth_date || null,
        date_registered: swine.date_registered || null,
        createdAt: swine.createdAt || null,
        sire_id: swine.sire_id || "",
        dam_id: swine.dam_id || "",
        is_external_boar: !!swine.is_external_boar,
        parity: Number(swine.parity || 0),

        // Computed/derived
        latest_performance,
        total_piglets_count: totals.totalPiglets,
        total_mortality_count: totals.totalMortality,
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
// Logs are kept clean (no emoji characters)
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

    if (role === "farmer" && farmerProfileId) {
      const profileIdStr = farmerProfileId.toString();
      if (female.farmer_id?.toString() !== profileIdStr || male.farmer_id?.toString() !== profileIdStr) {
        return res.status(403).json({ success: false, message: "Access Denied." });
      }
    }

    const logs = [];

    // --- 1. DUAL PHYSICAL CONFORMITY (45%) ---
    let totalPhysicalScore = 0;
    [female, male].forEach((pig) => {
      let pScore = 22.5;
      const perfArr = Array.isArray(pig.performance_records) ? pig.performance_records : [];
      const perf = perfArr.length ? perfArr[perfArr.length - 1] : {};

      const weight = Number(perf.weight || 0);
      if (weight < 15 || weight > 25) {
        pScore -= 7.5;
        logs.push(`${pig.sex} weight (${weight}kg) is sub-optimal.`);
      }

      const deformCount = (perf.deformities || []).filter((d) => d && d !== "None").length;
      if (deformCount > 0) {
        pScore -= 15;
        logs.push(`Deformity detected in ${pig.sex} morphology.`);
      }

      totalPhysicalScore += Math.max(0, pScore);
    });

    // --- 2. DUAL PROVEN SUCCESS (40%) ---
    let totalSuccessScore = 0;
    const offspring = await Swine.find({
      $or: [{ dam_id: female.swine_id }, { sire_id: male.swine_id }],
    })
      .select("dam_id sire_id health_status")
      .lean();

    // Female success
    const fOffspring = offspring.filter((o) => o.dam_id === female.swine_id);
    if (fOffspring.length > 0) {
      const mRate = (fOffspring.filter((o) => o.health_status === "Deceased").length / fOffspring.length) * 100;
      totalSuccessScore += mRate <= 10 ? 20 : 10;
      logs.push(`Sow success: mortality at ${mRate.toFixed(1)}%.`);
    } else {
      totalSuccessScore += 12.5;
      logs.push("Sow baseline: no prior farrowing history.");
    }

    // Male success
    const mOffspring = offspring.filter((o) => o.sire_id === male.swine_id);
    if (mOffspring.length > 0) {
      const mRate = (mOffspring.filter((o) => o.health_status === "Deceased").length / mOffspring.length) * 100;
      totalSuccessScore += mRate <= 10 ? 20 : 10;
      logs.push(`Boar success: sired ${mOffspring.length} piglets with ${mRate.toFixed(1)}% mortality.`);
    } else {
      totalSuccessScore += 12.5;
      logs.push("Boar baseline: no previous siring history.");
    }

    // --- 3. GENETIC SAFETY (15%) ---
    let geneticScore = 15;
    const isRelated =
      (female.sire_id && male.sire_id && female.sire_id === male.sire_id) ||
      (female.dam_id && male.dam_id && female.dam_id === male.dam_id) ||
      (female.sire_id === male.swine_id || male.sire_id === female.swine_id);

    if (isRelated) {
      geneticScore = 0;
      logs.push("Critical: immediate inbreeding detected.");
    } else {
      logs.push("Genetic safety: no immediate shared ancestry.");
    }

    const totalCompatibility = Math.min(Math.round(totalPhysicalScore + totalSuccessScore + geneticScore), 100);

    res.json({
      success: true,
      compatibilityScore: totalCompatibility,
      analysis: logs,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;