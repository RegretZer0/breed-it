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
      const heatReport = await HeatReport.findById(heatReportId).session(session);

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
        insemination_date: actualInseminationDate, // ✅ Set to manual date
        ai_confirmed: true,
        ai_confirmed_at: new Date(), // Timestamp of when the record was saved
        status: "Ongoing"
      });

      await newAI.save({ session });

      // 2) Update Heat Report -> under_observation + 23-day recheck
      heatReport.status = "under_observation";
      heatReport.ai_confirmed_at = actualInseminationDate; // ✅ Sync with manual date

      // ✅ Recalculate recheck based on the manual date
      const heatCheckDate = new Date(actualInseminationDate);
      heatCheckDate.setDate(heatCheckDate.getDate() + 23);
      heatReport.next_heat_check = heatCheckDate;

      await heatReport.save({ session });

      // 3) Sync with Swine Breeding Cycle
      const cycleUpdate = await Swine.updateOne(
        { _id: swine._id, "breeding_cycles.heat_report_id": heatReport._id },
        {
          $set: {
            "breeding_cycles.$.ai_service_date": actualInseminationDate, // ✅ Sync manual date
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
      const report = await HeatReport.findById(req.params.heatReportId);
      if (!report) return res.status(404).json({ success: false, message: "Report not found" });

      await AIRecord.findOneAndUpdate(
        { heat_report_id: report._id, status: "Ongoing" },
        { still_in_heat: true, status: "Failed" }
      );

      report.status = "approved";
      report.next_heat_check = null;
      report.expected_farrowing = null;
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
      const report = await HeatReport.findById(req.params.heatReportId);
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
      report.status = "pregnant";
      report.pregnancy_confirmed = true; 
      report.expected_farrowing = farrowingDate;
      report.pregnancy_confirmed_at = actualCheckDate; // ✅ Manual check date
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
              "breeding_cycles.$.pregnancy_check_date": actualCheckDate, // ✅ Sync manual date
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