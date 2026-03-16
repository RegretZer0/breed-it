const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

// --- MODELS ---
const AIRecord = require("../models/AIRecord");
const Swine = require("../models/Swine");
const User = require("../models/UserModel");
const Farmer = require("../models/UserFarmer");
const HeatReport = require("../models/HeatReports");
const Notification = require("../models/Notifications");
const timeHelper = require("../utils/timeHelper");

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

  for (const c of cand) {
    if (allow.includes(c)) return { value: c, method: "direct" };
  }

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
========================================================= */
router.get("/debug/status-enum", requireSessionAndToken, async (req, res) => {
  const allowed = getEnumValues(Swine, "current_status");
  return res.json({ success: true, allowed });
});

// ---------------------------------------------------------
// 1. FETCH AI HISTORY
// ---------------------------------------------------------
router.get("/ai-history", requireSessionAndToken, async (req, res) => {
  try {
    const { id: userId, role, farmerProfileId, managerId } = req.user;
    let query = {};

    if (role === "farmer") {
      if (!farmerProfileId) {
        return res.status(400).json({ success: false, message: "Farmer profile not linked" });
      }
      query = { farmer_id: new mongoose.Types.ObjectId(farmerProfileId) };
    } else {
      const targetManagerId = role === "farm_manager" || role === "admin" ? userId : managerId;
      if (!targetManagerId) {
        return res.status(400).json({ success: false, message: "Farm context not found" });
      }
      query = { manager_id: new mongoose.Types.ObjectId(targetManagerId) };
    }

    const records = await AIRecord.find(query)
      .populate("swine_id", "swine_id")
      .populate(
        "heat_report_id",
        "status ai_confirmed_at next_heat_check expected_farrowing actual_farrowing_date weaning_date pregnancy_confirmed_at date_reported"
      )
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

        let boarTag = r.male_swine_id || "N/A";
        if (mongoose.Types.ObjectId.isValid(r.male_swine_id)) {
          const boarSwine = await Swine.findById(r.male_swine_id).select("swine_id");
          if (boarSwine) boarTag = boarSwine.swine_id;
        }

        return {
          _id: r._id,
          id: r._id,
          insemination_id: r.insemination_id || "",
          ai_record_id: r.insemination_id || String(r._id),

          farmer_id: r.farmer_id,
          farmer_name: name,

          swine_code: r.swine_id?.swine_id || r.swine_code || "N/A",
          sow_tag: r.swine_id?.swine_id || r.swine_code || "N/A",
          sow_code: r.swine_id?.swine_id || r.swine_code || "N/A",

          male_swine_id: boarTag,
          boar_tag: boarTag,
          boar_code: boarTag,

          insemination_date: r.insemination_date || null,
          ai_service_date: r.insemination_date || null,
          date: r.insemination_date || null,

          pregnancy_check_date: r.pregnancy_check_date || null,
          pregnancy_confirmed: !!r.pregnancy_confirmed,

          farrowing_date: r.farrowing_date || null,
          expected_farrowing_date:
            r.heat_report_id?.expected_farrowing || r.farrowing_date || null,

          weaning_date: r.weaning_date || r.heat_report_id?.weaning_date || null,

          status: r.heat_report_id?.status || r.status || "Ongoing",

          heat_report_id: r.heat_report_id
            ? {
                _id: r.heat_report_id._id,
                status: r.heat_report_id.status || null,
                ai_confirmed_at: r.heat_report_id.ai_confirmed_at || null,
                next_heat_check: r.heat_report_id.next_heat_check || null,
                expected_farrowing: r.heat_report_id.expected_farrowing || null,
                actual_farrowing_date: r.heat_report_id.actual_farrowing_date || null,
                weaning_date: r.heat_report_id.weaning_date || null,
                pregnancy_confirmed_at: r.heat_report_id.pregnancy_confirmed_at || null,
                date_reported: r.heat_report_id.date_reported || null,
              }
            : null,
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

    let now;
    try {
      now = await timeHelper.getVirtualNow();
      if (!(now instanceof Date)) now = new Date(now);
    } catch (e) {
      now = new Date();
    }

    let query = { age_stage: "piglet" };
    if (role === "farmer") {
      query.farmer_id = new mongoose.Types.ObjectId(farmerProfileId);
    }

    const piglets = await Swine.find(query);

    const data = piglets.map((p) => {
      const birthDate = p.birth_date ? new Date(p.birth_date) : new Date(p.createdAt);
      const diffInMs = now.getTime() - birthDate.getTime();
      const ageInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

      let phase = "Suckling (Day 1-30)";
      let color = "blue";
      let canAction = false;

      if (ageInDays >= 121) {
        phase = "Final Selection";
        color = "green";
        canAction = true;
      } else if (ageInDays > 90) {
        phase = "3-Month Monitoring";
        color = "orange";
      } else if (ageInDays > 30) {
        phase = "Nursery";
        color = "orange";
      } else {
        phase = "Suckling";
        color = "blue";
      }

      const sortedPerf = [...(p.performance_records || [])].sort(
        (a, b) => new Date(b.record_date || 0) - new Date(a.record_date || 0)
      );

      const latestPerf = sortedPerf[0] || {};

      const latestWeightRecord = sortedPerf.find(
        (r) =>
          r.weight !== undefined &&
          r.weight !== null &&
          !Number.isNaN(Number(r.weight)) &&
          Number(r.weight) > 0
      );

      const latestWeight = latestWeightRecord ? Number(latestWeightRecord.weight) : 0;

      const deformitySource =
        Array.isArray(latestPerf.deformities) && latestPerf.deformities.length
          ? latestPerf.deformities
          : ["None"];

      const deformitiesList = deformitySource.map((d) => String(d).trim());
      const hasDeformity = deformitiesList.some(
        (d) => d && d.toLowerCase() !== "none"
      );

      if (hasDeformity) {
        phase = "To be Culled/Sold (Deformity)";
        color = "red";
        canAction = false;
      }

      return {
        id: p._id,
        swine_tag: p.swine_id,
        dam_id: p.dam_id || "N/A",
        current_status: phase,
        age_days: isNaN(ageInDays) ? 0 : ageInDays,
        days_remaining: Math.max(0, 120 - ageInDays),
        status_color: color,
        can_action: canAction,
        latest_weight: latestWeight,
        deformities: deformitiesList,
        latest_performance: latestPerf
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    console.error("CRITICAL ERROR in /piglet-monitoring:", err);
    res.status(500).json({ success: false, message: "Server Error: " + err.message });
  }
});

// ---------------------------------------------------------
// 4. PIGLET FINAL DECISION (Aligned with Notification Model)
// ---------------------------------------------------------
router.post("/piglet-action", requireSessionAndToken, async (req, res) => {
  try {
    const { swineId, action } = req.body; 
    const swine = await Swine.findById(swineId).populate("farmer_id");

    if (!swine) return res.status(404).json({ success: false, message: "Swine not found" });

    const actRaw = String(action || "").toLowerCase().trim();
    const act = actRaw === "retain" ? "breeding" : actRaw === "sale" ? "sell" : actRaw;

    if (act === "pending") {
      return res.json({
        success: true,
        message: "Set to Pending.",
        applied: { action: "pending", changed: false, current_status: swine.current_status },
      });
    }

    const virtualNow = await timeHelper.getVirtualNow();

    if (act === "breeding") {
      swine.age_stage = "adult";
      const result = setEnumSafeCurrentStatus(
        swine,
        ["Active Breeder", "Active", "Open", "Breeder"],
        ["active"] 
      );

      if (!result.ok) {
        return res.status(400).json({ success: false, message: "No enum-safe status found for Retain." });
      }

      await swine.save();

      // NOTIFICATION: Final Selection (Explicitly set to active status)
      await Notification.create({
        user_id: swine.farmer_id.user_id || swine.farmer_id,
        title: "Final Selection Reached 🏆",
        message: `Piglet ${swine.swine_id} has passed monitoring and is now graduated to Adult Breeder status.`,
        type: "success",
        status: "active",           // Required: Bypasses the default "scheduled" status
        scheduled_for: virtualNow,  // Required for proper indexing/sorting
        createdAt: virtualNow
      });

      return res.json({
        success: true,
        message: `Piglet ${swine.swine_id} graduated to Adult status.`,
        applied: { action: "breeding", changed: true, method: result.method, current_status: swine.current_status },
      });
    }

    // Handle "Sell" / Culling Action
    const result = setEnumSafeCurrentStatus(
      swine,
      ["Culled/Sold", "Sold", "Marked for Sale", "Culled"],
      ["sold"] 
    );

    if (!result.ok) {
      return res.status(400).json({ success: false, message: "No enum-safe status found for Sale." });
    }

    // Check for deformities to customize message
    const latestPerf = swine.performance_records?.[swine.performance_records.length - 1] || {};
    const deformitiesList = latestPerf.deformities || [];
    const hasDeformity = deformitiesList.some(d => d && d !== "None" && d !== "");

    await swine.save();

    // NOTIFICATION: Culled/Sold Alert
    await Notification.create({
      user_id: swine.farmer_id.user_id || swine.farmer_id,
      title: "Swine Culled/Sold ⚠️",
      message: hasDeformity 
        ? `Sow ${swine.swine_id} is culled due to detected deformity (${deformitiesList.join(", ")}).`
        : `Swine ${swine.swine_id} has been marked for Sale/Culling.`,
      type: "error",               // "danger" changed to "error" to match Notification.js enum
      status: "active",            // Required: Bypasses the default "scheduled" status
      scheduled_for: virtualNow,   // Required for proper indexing/sorting
      createdAt: virtualNow
    });

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
// 5. SELECTION PROCESS CANDIDATES
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
// 6. PROCESS SELECTION (Updated with Notifications)
// ---------------------------------------------------------
router.put("/process-selection", requireSessionAndToken, async (req, res) => {
  try {
    const { swineId, isApproved } = req.body;
    const { role, farmerProfileId } = req.user;

    const swine = await Swine.findById(swineId).populate("farmer_id");
    if (!swine) return res.status(404).json({ success: false, message: "Swine not found" });

    if (role === "farmer" && swine.farmer_id._id.toString() !== farmerProfileId.toString()) {
      return res.status(403).json({ success: false, message: "Access denied: Not your swine" });
    }

    const virtualNow = await timeHelper.getVirtualNow();

    let newStatus = isApproved
      ? swine.current_status === "1st Selection Ongoing"
        ? "2nd Selection Ongoing"
        : "Active Breeder"
      : "Marked for Sale";

    swine.current_status = newStatus;
    if (newStatus === "Active Breeder") swine.age_stage = "adult";
    
    await swine.save();

    // NOTIFICATION: Selection Milestone Update (Aligned with Model)
    await Notification.create({
      user_id: swine.farmer_id.user_id || swine.farmer_id,
      title: "Selection Status Updated",
      message: `Swine ${swine.swine_id} has been moved to: ${newStatus}.`,
      type: isApproved ? "success" : "warning",
      status: "active",           // Required: Bypasses the default "scheduled" status
      scheduled_for: virtualNow,  // Required for proper indexing/sorting
      createdAt: virtualNow 
    });

    res.json({ success: true, message: `Swine updated to ${newStatus}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------------------------------------------------------
// 7. FETCH PREGNANT SOWS
// ---------------------------------------------------------
router.get("/due-for-farrowing", requireSessionAndToken, async (req, res) => {
  try {
    const { id: userId, role, managerId, farmerProfileId } = req.user;
    const now = await timeHelper.getVirtualNow();

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
      const expected = activeCycle.expected_farrowing_date ? new Date(activeCycle.expected_farrowing_date) : null;
      const isOverdue = expected && expected <= now;

      return {
        id: sow._id,
        swine_tag: sow.swine_id,
        breed: sow.breed,
        parity: sow.parity,
        expected_date: activeCycle.expected_farrowing_date,
        is_overdue: isOverdue,
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
// 8. COMPLETE BREEDING CYCLE
// ---------------------------------------------------------
router.post("/complete-cycle", requireSessionAndToken, async (req, res) => {
  const { ai_record_id, farrowing_date } = req.body;

  try {
    if (!ai_record_id) return res.status(400).json({ success: false, message: "AI Record ID is required" });

    const aiRecord = await AIRecord.findById(ai_record_id);
    if (!aiRecord) {
      return res.status(404).json({ success: false, message: "No active record found." });
    }

    const virtualNow = await timeHelper.getVirtualNow();

    aiRecord.status = "Success";
    aiRecord.farrowing_date = farrowing_date || virtualNow;

    await aiRecord.save();

    res.json({ success: true, message: "Reproduction record updated." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;