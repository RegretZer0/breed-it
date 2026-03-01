const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

// --- MODELS ---
const AIRecord = require("../models/AIRecord");
const Swine = require("../models/Swine");
const User = require("../models/UserModel");
const Farmer = require("../models/UserFarmer");
const HeatReport = require("../models/HeatReports");

const { requireSessionAndToken } = require("../middleware/authMiddleware");

// Helper to format names consistently across different collections
const formatName = (userObj) => {
  if (!userObj) return null;
  const first = userObj.first_name || userObj.full_name || "";
  const last = userObj.last_name || "";
  return `${first} ${last}`.trim();
};

/* =========================================================
   ENUM-SAFE HELPERS (fixes your retain/pending error)
========================================================= */
function getEnumValues(model, path) {
  try {
    const p = model?.schema?.path?.(path);
    const values = p?.enumValues;
    return Array.isArray(values) ? values : [];
  } catch {
    return [];
  }
}

function normLower(v) {
  return String(v ?? "").toLowerCase().trim();
}

function pickEnumValue(allowed, candidates = [], fuzzyKeywords = []) {
  const allow = Array.isArray(allowed) ? allowed : [];
  const cand = Array.isArray(candidates) ? candidates.map(String) : [];

  // 1) direct match
  for (const c of cand) {
    if (allow.includes(c)) return { value: c, method: "direct" };
  }

  // 2) fuzzy match (keywords must all appear in enum value)
  const keys = (Array.isArray(fuzzyKeywords) ? fuzzyKeywords : [])
    .map((k) => normLower(k))
    .filter(Boolean);

  if (keys.length) {
    for (const a of allow) {
      const low = normLower(a);
      if (keys.every((k) => low.includes(k))) return { value: a, method: "fuzzy" };
    }
  }

  return { value: null, method: "none" };
}

function setEnumSafeCurrentStatus(swineDoc, candidates, fuzzyKeywords) {
  const allowed = getEnumValues(Swine, "current_status");

  // If enum not available for some reason, still set first candidate (best effort)
  if (!allowed.length) {
    const first = Array.isArray(candidates) ? candidates[0] : candidates;
    swineDoc.current_status = String(first);
    return { ok: true, value: swineDoc.current_status, method: "no-enum", allowed };
  }

  const picked = pickEnumValue(allowed, candidates, fuzzyKeywords);
  if (!picked.value) {
    return { ok: false, value: swineDoc.current_status, method: "no-match", allowed };
  }

  swineDoc.current_status = picked.value;
  return { ok: true, value: picked.value, method: picked.method, allowed };
}

/* =========================================================
   Optional debug endpoint to see allowed enum values
   GET /api/reproduction/debug/status-enum
========================================================= */
router.get("/debug/status-enum", requireSessionAndToken, async (req, res) => {
  const allowed = getEnumValues(Swine, "current_status");
  return res.json({ success: true, allowed });
});

// ---------------------------------------------------------
// 1. FETCH AI HISTORY (FIXED FOR STRING-BASED MALE_SWINE_ID)
// ---------------------------------------------------------
router.get("/ai-history", requireSessionAndToken, async (req, res) => {
  try {
    const { id: userId, role, farmerProfileId, managerId } = req.user;
    let query = {};

    if (role === "farmer") {
      if (!farmerProfileId)
        return res.status(400).json({ success: false, message: "Farmer profile not linked" });
      query = { farmer_id: new mongoose.Types.ObjectId(farmerProfileId) };
    } else {
      const targetManagerId = role === "farm_manager" || role === "admin" ? userId : managerId;
      if (!targetManagerId)
        return res.status(400).json({ success: false, message: "Farm context not found" });
      query = { manager_id: new mongoose.Types.ObjectId(targetManagerId) };
    }

    const records = await AIRecord.find(query)
      .populate("swine_id", "swine_id")
      .sort({ insemination_date: -1 })
      .lean();

    const formatted = await Promise.all(
      records.map(async (r) => {
        let name = "Unknown Farmer";
        let farmerInfo = await Farmer.findById(r.farmer_id).select("first_name last_name");

        if (!farmerInfo) {
          farmerInfo = await User.findById(r.farmer_id).select("full_name first_name last_name");
        }

        if (farmerInfo) {
          name = formatName(farmerInfo);
        } else if (r.farmer_name) {
          name = r.farmer_name;
        }

        // Since male_swine_id is a String, we check if it's an ID or a direct Tag
        let boarTag = r.male_swine_id || "N/A";

        if (mongoose.Types.ObjectId.isValid(r.male_swine_id)) {
          const boarSwine = await Swine.findById(r.male_swine_id).select("swine_id");
          if (boarSwine) boarTag = boarSwine.swine_id;
        }

        return {
          id: r._id,
          farmer_id: r.farmer_id,
          farmer_name: name,
          sow_tag: r.swine_id?.swine_id || r.swine_code || "N/A",
          boar_tag: boarTag,
          date: r.insemination_date,
          status: r.status,
        };
      })
    );

    res.json({ success: true, data: formatted });
  } catch (err) {
    console.error("AI History Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------------------------------------------------------
// 2. FETCH PERFORMANCE ANALYTICS
// ---------------------------------------------------------
router.get("/performance-analytics", requireSessionAndToken, async (req, res) => {
  try {
    const { id: userId, role, farmerProfileId, managerId } = req.user;
    let query = {};

    if (role === "farmer") {
      if (!farmerProfileId)
        return res.status(400).json({ success: false, message: "Farmer profile not linked" });
      query = { farmer_id: new mongoose.Types.ObjectId(farmerProfileId) };
    } else {
      const effectiveManagerId = role === "farm_manager" || role === "admin" ? userId : managerId;
      const managedFarmers = await Farmer.find({ registered_by: effectiveManagerId }).select("_id");
      const farmerIds = managedFarmers.map((f) => f._id);

      query = {
        $or: [{ farmer_id: { $in: farmerIds } }, { registered_by: new mongoose.Types.ObjectId(effectiveManagerId) }],
      };
    }

    const swines = await Swine.find(query)
      .populate({
        path: "farmer_id",
        model: "Farmer",
        select: "first_name last_name",
      })
      .lean();

    let morphologyRecords = [];
    let deformityMonitoring = [];

    swines.forEach((swine) => {
      const displayFarmerName = formatName(swine.farmer_id) || "Unknown User";

      if (swine.performance_records && swine.performance_records.length > 0) {
        swine.performance_records.forEach((perf) => {
          let cleanTeeth = perf.teeth_count ?? "0";
          if (perf.teeth_alignment && perf.teeth_alignment.toLowerCase() !== "n/a") {
            cleanTeeth += ` (${perf.teeth_alignment})`;
          }

          morphologyRecords.push({
            farmer_id: swine.farmer_id,
            farmer_name: displayFarmerName,
            swine_tag: swine.swine_id,
            swine_sex: swine.sex || "Unknown",
            morphology: {
              stage: perf.stage || "Routine",
              date: perf.record_date,
              weight: perf.weight ?? 0,
              body_length: perf.body_length ?? 0,
              heart_girth: perf.heart_girth ?? 0,
              teat_count: perf.teat_count ?? null,
              teeth: cleanTeeth,
            },
          });

          if (perf.deformities && perf.deformities.length > 0) {
            const realDeformities = perf.deformities.filter((d) => d && d.toLowerCase() !== "none");
            if (realDeformities.length > 0) {
              deformityMonitoring.push({
                farmer_id: swine.farmer_id,
                farmer_name: displayFarmerName,
                swine_tag: swine.swine_id,
                deformity_types: realDeformities.join(", "),
                date_detected: perf.record_date,
              });
            }
          }
        });
      }
    });

    res.json({ success: true, morphology: morphologyRecords, deformities: deformityMonitoring });
  } catch (err) {
    console.error("Performance Analytics Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------------------------------------------------------
// 3. PIGLET MONITORING & LIFECYCLE
// ---------------------------------------------------------
router.get("/piglet-monitoring", requireSessionAndToken, async (req, res) => {
  try {
    const { role, farmerProfileId } = req.user;
    let query = { age_stage: "piglet" };

    if (role === "farmer") {
      query.farmer_id = new mongoose.Types.ObjectId(farmerProfileId);
    }

    const piglets = await Swine.find(query);

    const data = piglets.map((p) => {
      const phaseInfo = p.lifecycle_phase;
      const latestPerf = p.performance_records?.[p.performance_records.length - 1] || {};

      const canAction =
        phaseInfo.phase === "Final Selection" && latestPerf.weight >= 15 && latestPerf.weight <= 25;

      return {
        id: p._id,
        swine_tag: p.swine_id,
        dam_id: p.dam_id || "N/A",
        current_status: phaseInfo.phase,
        days_remaining: phaseInfo.daysLeft,
        status_color: phaseInfo.status,
        can_action: canAction,
        latest_weight: latestPerf.weight || 0,
        deformities: latestPerf.deformities || ["None"],
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------------------------------------------------------
// 4. PIGLET FINAL DECISION (FIXED: enum-safe current_status)
// ---------------------------------------------------------
router.post("/piglet-action", requireSessionAndToken, async (req, res) => {
  try {
    const { swineId, action } = req.body; // action: 'breeding' | 'sell' | 'pending'
    const swine = await Swine.findById(swineId);

    if (!swine) return res.status(404).json({ success: false, message: "Swine not found" });

    const actRaw = String(action || "").toLowerCase().trim();
    const act = actRaw === "retain" ? "breeding" : actRaw === "sale" ? "sell" : actRaw;

    // ✅ Pending: DO NOT update enum field if you don't know enum values.
    // This prevents enum validation crash.
    if (act === "pending") {
      return res.json({
        success: true,
        message: "Set to Pending (saved client-side).",
        applied: { action: "pending", changed: false, current_status: swine.current_status },
      });
    }

    if (act === "breeding") {
      swine.age_stage = "adult";

      // Choose enum-safe value based on your schema
      // Try exact first then fuzzy
      const result = setEnumSafeCurrentStatus(
        swine,
        ["Active", "Active Breeder", "Breeding", "Breeder"],
        ["active"] // fuzzy keyword
      );

      if (!result.ok) {
        return res.status(400).json({
          success: false,
          message: "No enum-safe status found for Retain. Check Swine.current_status enum.",
          debug: { allowed: result.allowed },
        });
      }

      await swine.save();
      return res.json({
        success: true,
        message: `Piglet ${swine.swine_id} updated to ${swine.current_status}.`,
        applied: { action: "breeding", changed: true, method: result.method, current_status: swine.current_status },
      });
    }

    // sell / default
    const result = setEnumSafeCurrentStatus(
      swine,
      ["Culled/Sold", "Sold", "Marked for Sale", "Culled"],
      ["sold"] // fuzzy keyword
    );

    if (!result.ok) {
      return res.status(400).json({
        success: false,
        message: "No enum-safe status found for Sale. Check Swine.current_status enum.",
        debug: { allowed: result.allowed },
      });
    }

    await swine.save();
    return res.json({
      success: true,
      message: `Piglet ${swine.swine_id} updated to ${swine.current_status}.`,
      applied: { action: "sell", changed: true, method: result.method, current_status: swine.current_status },
    });
  } catch (err) {
    console.error("Piglet Action Error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ---------------------------------------------------------
// 5. SELECTION PROCESS CANDIDATES (OLD LOGIC KEPT)
// ---------------------------------------------------------
router.get("/selection-candidates", requireSessionAndToken, async (req, res) => {
  try {
    const { id: userId, role, farmerProfileId, managerId } = req.user;
    let query = { current_status: { $in: ["1st Selection Ongoing", "2nd Selection Ongoing"] } };

    if (role === "farmer") {
      if (!farmerProfileId)
        return res.status(400).json({ success: false, message: "Farmer profile not linked" });
      query.farmer_id = new mongoose.Types.ObjectId(farmerProfileId);
    } else {
      const effectiveManagerId = role === "farm_manager" || role === "admin" ? userId : managerId;
      const managedFarmers = await Farmer.find({ registered_by: effectiveManagerId }).select("_id");
      const farmerIds = managedFarmers.map((f) => f._id);

      query.$or = [
        { farmer_id: { $in: farmerIds } },
        { registered_by: new mongoose.Types.ObjectId(effectiveManagerId) },
      ];
    }

    const candidates = await Swine.find(query)
      .populate({
        path: "farmer_id",
        model: "Farmer",
        select: "first_name last_name",
      })
      .lean();

    const formatted = candidates.map((c) => {
      const latestPerf =
        c.performance_records && c.performance_records.length > 0 ? c.performance_records[c.performance_records.length - 1] : null;
      return {
        id: c._id,
        swine_tag: c.swine_id,
        farmer_id: c.farmer_id,
        farmer_name: formatName(c.farmer_id) || "Unknown Farmer",
        current_stage: c.current_status,
        can_promote: latestPerf ? latestPerf.passed_selection : false,
        recommendation: latestPerf && latestPerf.passed_selection ? "Retain for Breeding" : "Mark for Sale",
      };
    });

    res.json({ success: true, data: formatted });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------------------------------------------------------
// 6. PROCESS SELECTION (OLD LOGIC KEPT)
// ---------------------------------------------------------
router.put("/process-selection", requireSessionAndToken, async (req, res) => {
  try {
    const { swineId, isApproved } = req.body;
    const { role, farmerProfileId } = req.user;

    const swine = await Swine.findById(swineId);
    if (!swine) return res.status(404).json({ success: false, message: "Swine not found" });

    if (role === "farmer" && swine.farmer_id.toString() !== farmerProfileId.toString()) {
      return res.status(403).json({ success: false, message: "Access denied: Not your swine" });
    }

    let newStatus = isApproved
      ? swine.current_status === "1st Selection Ongoing"
        ? "2nd Selection Ongoing"
        : "Active Breeder"
      : "Marked for Sale";

    swine.current_status = newStatus;
    await swine.save();

    res.json({ success: true, message: `Swine updated to ${newStatus}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------------------------------------------------------
// 7. FETCH PREGNANT SOWS (READY FOR FARROWING)
// ---------------------------------------------------------
router.get("/due-for-farrowing", requireSessionAndToken, async (req, res) => {
  try {
    const { id: userId, role, managerId, farmerProfileId } = req.user;
    let query = {
      current_status: "Pregnant",
      "breeding_cycles.is_pregnant": true,
      "breeding_cycles.farrowed": false,
    };

    if (role === "farmer") {
      query.farmer_id = new mongoose.Types.ObjectId(farmerProfileId);
    } else {
      const targetManagerId = role === "farm_manager" || role === "admin" ? userId : managerId;
      query.registered_by = new mongoose.Types.ObjectId(targetManagerId);
    }

    const pregnantSows = await Swine.find(query).lean();

    const formatted = pregnantSows.map((sow) => {
      const activeCycle = sow.breeding_cycles.find((c) => c.is_pregnant && !c.farrowed) || {};
      return {
        id: sow._id,
        swine_tag: sow.swine_id,
        breed: sow.breed,
        parity: sow.parity,
        expected_date: activeCycle.expected_farrowing_date,
        ai_record_id: activeCycle.ai_record_id,
        sire_id: activeCycle.cycle_sire_id || "N/A",
      };
    });

    res.json({ success: true, data: formatted });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------------------------------------------------------
// 8. COMPLETE BREEDING CYCLE (FARROWING)
// ---------------------------------------------------------
router.post("/complete-cycle", requireSessionAndToken, async (req, res) => {
  const { ai_record_id, farrowing_date } = req.body;

  try {
    if (!ai_record_id) return res.status(400).json({ success: false, message: "AI Record ID is required" });

    const aiRecord = await AIRecord.findById(ai_record_id);

    if (!aiRecord) {
      return res.status(404).json({ success: false, message: "No active record found." });
    }

    aiRecord.status = "Success";
    aiRecord.farrowing_date = farrowing_date;

    await aiRecord.save();

    res.json({ success: true, message: "Reproduction record updated." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;