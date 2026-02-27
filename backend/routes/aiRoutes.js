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
   - Keeps AIRecord.male_swine_id as String (per your model)
   - Stores boar tag if possible; supports external boar code
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
      const { swineId, maleSwineId, heatReportId, farmerId } = req.body;
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

      const now = new Date();
      const managerId = user.role === "farm_manager" ? user.id : user.managerId;

      // 1) Create AI Record (male_swine_id is String in your model)
      const newAI = new AIRecord({
        insemination_id: `AI-${Date.now()}`,
        swine_id: swine._id,
        male_swine_id: boarTag, // ✅ string for internal tag OR external code
        manager_id: managerId,
        farmer_id: farmer._id,
        heat_report_id: heatReport._id,
        swine_code: swine.swine_id,
        farmer_name: `${farmer.first_name || ""} ${farmer.last_name || ""}`.trim(),
        insemination_date: now,
        ai_confirmed: true,
        ai_confirmed_at: now,
        status: "Ongoing"
      });

      await newAI.save({ session });

      // 2) Update Heat Report -> under_observation + 23-day recheck
      heatReport.status = "under_observation";
      heatReport.ai_confirmed_at = now;

      const heatCheckDate = new Date(now);
      heatCheckDate.setDate(heatCheckDate.getDate() + 23);
      heatReport.next_heat_check = heatCheckDate;

      await heatReport.save({ session });

      // 3) Sync with Swine Breeding Cycle (only if cycle exists)
      const cycleUpdate = await Swine.updateOne(
        { _id: swine._id, "breeding_cycles.heat_report_id": heatReport._id },
        {
          $set: {
            "breeding_cycles.$.ai_service_date": now,
            "breeding_cycles.$.ai_record_id": newAI._id,
            "breeding_cycles.$.cycle_sire_id": boarTag, // store tag/code
            current_status: "Under Observation"
          }
        },
        { session }
      );

      // If cycle not found, we still succeed but warn (prevents breaking flow)
      const cycleLinked = cycleUpdate && (cycleUpdate.modifiedCount > 0 || cycleUpdate.nModified > 0);

      await session.commitTransaction();

      return res.status(201).json({
        success: true,
        message: cycleLinked
          ? "AI record created and Swine cycle updated. 23-day countdown started."
          : "AI record created. 23-day countdown started. (Warning: breeding cycle not linked to this heat report.)",
        aiRecord: newAI
      });
    } catch (err) {
      try {
        await session.abortTransaction();
      } catch (_) {}
      console.error("AI Record Error:", err);
      return res.status(500).json({ success: false, message: "Server error", error: err.message });
    } finally {
      session.endSession();
    }
  }
);

/* ======================================================
   GET /api/ai/all
   Get AI records for manager
   - male_swine_id is String → cannot populate
   - we "enrich" boar info by looking up Swine by tag when possible
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

      // Enrich boar details (optional, safe)
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
          // keep original field
          male_swine_id: tag || r.male_swine_id,
          // add a safe helper object for frontend rendering
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
   Confirm Swine Still in Heat (Re-breed / Cycle Reset)
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

      // Update Swine Status back to In-Heat (if swine_id exists)
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
   Confirm Pregnancy (Moves Swine to 114-day countdown)
====================================================== */
router.post(
  "/confirm-pregnancy/:heatReportId",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const report = await HeatReport.findById(req.params.heatReportId);
      if (!report) return res.status(404).json({ success: false, message: "Heat report not found" });

      const gestationDays = 114;
      const baseDate = report.ai_confirmed_at ? new Date(report.ai_confirmed_at) : new Date();
      const farrowingDate = new Date(baseDate);
      farrowingDate.setDate(farrowingDate.getDate() + gestationDays);

      // 1) Update Heat Report
      report.status = "pregnant";
      report.pregnancy_confirmed = true; // if field exists in schema, ok; if not, mongoose ignores unless strict=false
      report.expected_farrowing = farrowingDate;
      report.pregnancy_confirmed_at = new Date();
      await report.save();

      // 2) Update AIRecord
      await AIRecord.findOneAndUpdate(
        { heat_report_id: report._id },
        { pregnancy_confirmed: true, status: "Success", farrowing_date: farrowingDate }
      );

      // 3) Update Swine Cycle (only if it exists)
      if (report.swine_id) {
        await Swine.updateOne(
          { _id: report.swine_id, "breeding_cycles.heat_report_id": report._id },
          {
            $set: {
              "breeding_cycles.$.is_pregnant": true,
              "breeding_cycles.$.pregnancy_check_date": new Date(),
              "breeding_cycles.$.expected_farrowing_date": farrowingDate,
              current_status: "Pregnant"
            }
          }
        );
      }

      res.json({
        success: true,
        message: "Pregnancy confirmed. Expected farrowing date set in all records."
      });
    } catch (err) {
      res.status(500).json({ success: false, message: "Server error", error: err.message });
    }
  }
);

module.exports = router;