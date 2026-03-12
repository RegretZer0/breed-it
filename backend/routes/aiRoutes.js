// backend/routes/aiRoutes.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const AIRecord = require("../models/AIRecord");
const HeatReport = require("../models/HeatReports");
const Swine = require("../models/Swine");
const Farmer = require("../models/UserFarmer");

const { requireSessionAndToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

/* ======================================================
    HELPERS
====================================================== */
function isObjectIdLike(v) {
  return mongoose.Types.ObjectId.isValid(String(v || ""));
}

async function resolveSwineByTagOrId(value, session) {
  // Prefer tag lookup (swine_id string), fallback to Mongo _id
  const v = String(value || "").trim();
  if (!v) return null;

  let sw = await Swine.findOne({ swine_id: v }).session(session || null);
  if (sw) return sw;

  if (isObjectIdLike(v)) {
    sw = await Swine.findById(v).session(session || null);
    if (sw) return sw;
  }

  return null;
}

async function resolveFarmerById(value, session) {
  const v = String(value || "").trim();
  if (!v) return null;
  if (!isObjectIdLike(v)) return null;
  return Farmer.findById(v).session(session || null);
}

//Progress History Related
function formatActorName(user) {
  if (!user) return "Unknown User";

  const first = user.first_name || "";
  const last = user.last_name || "";
  const full = `${first} ${last}`.trim();

  return (
    full ||
    user.name ||
    user.full_name ||
    user.display_name ||
    user.email ||
    "Unknown User"
  );
}

function formatActorRole(user) {
  return String(user?.role || "unknown").replace(/_/g, " ");
}

function pushProgressHistory(report, {
  eventKey = "",
  title = "",
  description = "",
  fromStatus = "",
  toStatus = "",
  actor = null,
  actionAt = new Date(),
  meta = {}
} = {}) {
  if (!report.progress_history) report.progress_history = [];

  report.progress_history.push({
    event_key: eventKey,
    title,
    description,
    from_status: fromStatus || report.status || "",
    to_status: toStatus || report.status || "",
    actor_id: actor?._id || actor?.id || null,
    actor_name: formatActorName(actor),
    actor_role: formatActorRole(actor),
    action_at: actionAt,
    meta
  });
}

function ensureSubmittedHistory(report, actor = null) {
  if (!report.progress_history) report.progress_history = [];

  const hasSubmitted = report.progress_history.some(
    (item) => String(item?.event_key || "").toLowerCase() === "report_submitted"
  );

  if (hasSubmitted) return;

  pushProgressHistory(report, {
    eventKey: "report_submitted",
    title: "Report Submitted",
    description: `Heat report submitted for sow ${report.swine_code || report.swine_id?.swine_id || ""}.`,
    fromStatus: "",
    toStatus: "pending",
    actor: actor || {
      _id: report.farmer_id?._id || report.farmer_id || null,
      first_name: report.farmer_id?.first_name || "",
      last_name: report.farmer_id?.last_name || "",
      role: "farmer"
    },
    actionAt: report.createdAt || new Date(),
    meta: {
      signs: Array.isArray(report.signs) ? report.signs : [],
      heat_probability: report.heat_probability ?? null
    }
  });
}

/* ======================================================
    POST /api/ai/add
    Add new AI Record (Confirms the Insemination)
    - Supports "Time Warp" via event_date
    - Updates HeatReport and Swine breeding cycle safely
====================================================== */
router.post(
  "/add",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { swineId, maleSwineId, heatReportId, farmerId, event_date } = req.body;
      const user = req.user;

      if (!swineId || !maleSwineId || !heatReportId || !farmerId) {
        await session.abortTransaction();
        return res.status(400).json({ success: false, message: "All fields are required" });
      }

      // Resolve sow by tag or _id
      const swine = await resolveSwineByTagOrId(swineId, session);
      const heatReport = await HeatReport.findById(heatReportId)
        .populate("swine_id")
        .populate("farmer_id")
        .session(session);

      if (!swine || !heatReport) {
        await session.abortTransaction();
        return res.status(404).json({ success: false, message: "Swine or heat report not found" });
      }

      // Farmer is required as _id
      const farmer = await resolveFarmerById(farmerId, session);
      if (!farmer) {
        await session.abortTransaction();
        return res.status(404).json({ success: false, message: "Farmer not found" });
      }

      // Resolve boar: if it exists in Swine, store its tag; otherwise treat as external code
      const maleSwineDoc = await resolveSwineByTagOrId(maleSwineId, session);
      const boarTag = maleSwineDoc ? maleSwineDoc.swine_id : String(maleSwineId).trim();

      // ✅ TIME WARP: Use manual event_date if provided, otherwise default to now
      const actualInseminationDate = event_date ? new Date(event_date) : new Date();
      const managerId = user.role === "farm_manager" ? user.id : user.managerId;

      // 1) Create AI Record
      const newAI = new AIRecord({
        insemination_id: `AI-${Date.now()}`,
        swine_id: swine._id,
        male_swine_id: boarTag, 
        manager_id: managerId,
        farmer_id: farmer._id,
        heat_report_id: heatReport._id,
        swine_code: swine.swine_id,
        farmer_name: `${farmer.first_name || ""} ${farmer.last_name || ""}`.trim(),
        insemination_date: actualInseminationDate,
        ai_confirmed: true,
        ai_confirmed_at: new Date(),
        status: "Ongoing"
      });

      await newAI.save({ session });

    // 2) Update Heat Report -> under_observation + 23-day recheck
      const previousStatus = heatReport.status;

      ensureSubmittedHistory(heatReport);

      heatReport.status = "under_observation";
      heatReport.ai_confirmed_at = actualInseminationDate;
      heatReport.ai_confirmed_by = user.id;

      // ✅ Recalculate recheck based on the manual date
      const heatCheckDate = new Date(actualInseminationDate);
      heatCheckDate.setDate(heatCheckDate.getDate() + 23);
      heatReport.next_heat_check = heatCheckDate;

      pushProgressHistory(heatReport, {
        eventKey: "ai_confirmed",
        title: "Artificial Insemination Confirmed",
        description: `AI procedure recorded for sow ${swine.swine_id}.`,
        fromStatus: previousStatus,
        toStatus: "under_observation",
        actor: user,
        actionAt: actualInseminationDate,
        meta: {
          swine_code: swine.swine_id,
          male_swine_id: boarTag,
          ai_date: actualInseminationDate,
          ai_record_id: newAI._id
        }
      });

      heatReport.markModified("progress_history");
      await heatReport.save({ session });

      // 3) Sync with Swine Breeding Cycle
      const cycleUpdate = await Swine.updateOne(
        { _id: swine._id, "breeding_cycles.heat_report_id": heatReport._id },
        {
          $set: {
            "breeding_cycles.$.ai_service_date": actualInseminationDate,
            "breeding_cycles.$.ai_record_id": newAI._id,
            "breeding_cycles.$.cycle_sire_id": boarTag,
            current_status: "Under Observation"
          }
        },
        { session }
      );

      const cycleLinked = cycleUpdate && (cycleUpdate.modifiedCount > 0 || cycleUpdate.nModified > 0);

      await session.commitTransaction();

      return res.status(201).json({
        success: true,
        message: cycleLinked
          ? "AI record created and Swine cycle updated. Re-check scheduled based on service date."
          : "AI record created. (Warning: breeding cycle not linked.)",
        aiRecord: newAI
      });
    } catch (err) {
      try { await session.abortTransaction(); } catch (_) {}
      console.error("AI Record Error:", err);
      return res.status(500).json({ success: false, message: "Server error", error: err.message });
    } finally {
      session.endSession();
    }
  }
);

/* ======================================================
    GET /api/ai/all
====================================================== */
router.get(
  "/all",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const user = req.user;
      const managerId = user.role === "farm_manager" ? user.id : user.managerId;

      const records = await AIRecord.find({ manager_id: managerId })
        .populate("swine_id", "swine_id breed sex")
        .populate("farmer_id", "first_name last_name farmer_id")
        .populate("heat_report_id")
        .sort({ createdAt: -1 })
        .lean();

      const boarTags = [
        ...new Set(
          records
            .map(r => (r.male_swine_id ? String(r.male_swine_id).trim() : ""))
            .filter(Boolean)
        )
      ];

      const boarDocs = await Swine.find({ swine_id: { $in: boarTags } })
        .select("swine_id breed sex")
        .lean();

      const boarMap = new Map(boarDocs.map(b => [b.swine_id, b]));

      const hydrated = records.map(r => {
        const tag = r.male_swine_id ? String(r.male_swine_id).trim() : "";
        return {
          ...r,
          male_swine_id: tag || r.male_swine_id,
          male_swine: boarMap.get(tag) || null
        };
      });

      res.json({ success: true, aiRecords: hydrated });
    } catch (err) {
      res.status(500).json({ success: false, message: "Server error", error: err.message });
    }
  }
);

/* ======================================================
    POST /api/ai/still-in-heat/:heatReportId
====================================================== */
router.post(
  "/still-in-heat/:heatReportId",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const report = await HeatReport.findById(req.params.heatReportId)
        .populate("swine_id")
        .populate("farmer_id");
      if (!report) return res.status(404).json({ success: false, message: "Report not found" });

      await AIRecord.findOneAndUpdate(
        { heat_report_id: report._id, status: "Ongoing" },
        { still_in_heat: true, status: "Failed" }
      );

            const previousStatus = report.status;

      ensureSubmittedHistory(report);

      report.status = "approved";
      report.next_heat_check = null;
      report.expected_farrowing = null;
      report.still_in_heat = true;
      report.still_in_heat_at = new Date();
      report.still_in_heat_by = req.user.id;

      pushProgressHistory(report, {
        eventKey: "cycle_reset_still_in_heat",
        title: "Cycle Reset to In-Heat",
        description: "Sow returned to heat after AI/observation.",
        fromStatus: previousStatus,
        toStatus: "approved",
        actor: req.user,
        actionAt: new Date(),
        meta: {
          heat_report_id: report._id
        }
      });

      report.markModified("progress_history");
      await report.save();

      if (report.swine_id) {
        await Swine.findByIdAndUpdate(report.swine_id, { current_status: "In-Heat" });
      }

      res.json({ success: true, message: "Swine still in heat. Cycle reset for re-insemination." });
    } catch (err) {
      res.status(500).json({ success: false, message: "Server error", error: err.message });
    }
  }
);

/* ======================================================
    POST /api/ai/confirm-pregnancy/:heatReportId
    - Supports "Time Warp" via event_date
====================================================== */
router.post(
  "/confirm-pregnancy/:heatReportId",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const { event_date } = req.body; 
        const report = await HeatReport.findById(req.params.heatReportId)
          .populate("swine_id")
          .populate("farmer_id");
      if (!report) return res.status(404).json({ success: false, message: "Heat report not found" });

      const gestationDays = 114;
      
      // ✅ Date when the pregnancy check was actually performed
      const actualCheckDate = event_date ? new Date(event_date) : new Date();

      // ✅ Base the 114 days on the AI service date, not today's date
      // Fallback to actualCheckDate if ai_confirmed_at is somehow missing
      const baseDate = report.ai_confirmed_at ? new Date(report.ai_confirmed_at) : actualCheckDate;
      const farrowingDate = new Date(baseDate);
      farrowingDate.setDate(farrowingDate.getDate() + gestationDays);

    // 1) Update Heat Report
      const previousStatus = report.status;

      ensureSubmittedHistory(report);

      report.status = "pregnant";
      report.pregnancy_confirmed = true; 
      report.expected_farrowing = farrowingDate;
      report.pregnancy_confirmed_at = actualCheckDate;
      report.pregnancy_confirmed_by = req.user.id;

      pushProgressHistory(report, {
        eventKey: "pregnancy_confirmed",
        title: "Pregnancy Confirmed",
        description: `Pregnancy confirmed for sow ${report.swine_id?.swine_id || ""}.`,
        fromStatus: previousStatus,
        toStatus: "pregnant",
        actor: req.user,
        actionAt: actualCheckDate,
        meta: {
          swine_code: report.swine_id?.swine_id || "",
          expected_farrowing: farrowingDate
        }
      });

      report.markModified("progress_history");
      await report.save();

      // 2) Update AIRecord
      await AIRecord.findOneAndUpdate(
        { heat_report_id: report._id },
        { pregnancy_confirmed: true, status: "Success", farrowing_date: farrowingDate }
      );

      // 3) Update Swine Cycle
      if (report.swine_id) {
        await Swine.updateOne(
          { _id: report.swine_id, "breeding_cycles.heat_report_id": report._id },
          {
            $set: {
              "breeding_cycles.$.is_pregnant": true,
              "breeding_cycles.$.pregnancy_check_date": actualCheckDate,
              "breeding_cycles.$.expected_farrowing_date": farrowingDate,
              current_status: "Pregnant"
            }
          }
        );
      }

      res.json({
        success: true,
        message: "Pregnancy confirmed. Expected farrowing date calculated from insemination date."
      });
    } catch (err) {
      res.status(500).json({ success: false, message: "Server error", error: err.message });
    }
  }
);

module.exports = router;