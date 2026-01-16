const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const AIRecord = require("../models/AIRecord");
const HeatReport = require("../models/HeatReports");
const Swine = require("../models/Swine");
const Farmer = require("../models/UserFarmer");

const { requireSessionAndToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

// ------------------------------------------------------
// Add new AI Record (Confirms the Insemination)
// ------------------------------------------------------
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
        return res.status(400).json({ success: false, message: "All fields are required" });
      }

      // Find documents by their unique string swine_id or _id as needed
      const swine = await Swine.findOne({ swine_id: swineId });
      const maleSwine = await Swine.findOne({ swine_id: maleSwineId });
      const heatReport = await HeatReport.findById(heatReportId);

      if (!swine || !maleSwine || !heatReport) {
        return res.status(404).json({ success: false, message: "Swine or heat report not found" });
      }

      const farmer = await Farmer.findById(farmerId);
      if (!farmer) return res.status(404).json({ success: false, message: "Farmer not found" });

      const now = new Date();

      // 1. Create the AI Record
      const newAI = new AIRecord({
        insemination_id: `AI-${Date.now()}`,
        swine_id: swine._id,
        male_swine_id: maleSwine._id,
        manager_id: user.role === "farm_manager" ? user.id : user.managerId,
        farmer_id: farmer._id,
        heat_report_id: heatReport._id,
        ai_confirmed: true,
        ai_confirmed_at: now,
        status: "Ongoing"
      });
      await newAI.save({ session });

      // 2. Update Heat Report status & start 23-day recheck countdown
      heatReport.status = "under_observation";
      heatReport.ai_confirmed_at = now;
      const heatCheckDate = new Date();
      heatCheckDate.setDate(heatCheckDate.getDate() + 23);
      heatReport.next_heat_check = heatCheckDate;
      await heatReport.save({ session });

      // 3. Sync with Swine Breeding Cycle
      // We look for the cycle that matches this specific Heat Report
      await Swine.updateOne(
        { _id: swine._id, "breeding_cycles.heat_report_id": heatReport._id },
        { 
          $set: { 
            "breeding_cycles.$.ai_service_date": now,
            "breeding_cycles.$.ai_record_id": newAI._id,
            "breeding_cycles.$.cycle_sire_id": maleSwine.swine_id, // Store code for lineage
            current_status: "Under Observation" 
          }
        },
        { session }
      );

      await session.commitTransaction();
      res.status(201).json({
        success: true,
        message: "AI record created and Swine cycle updated. 23-day countdown started.",
        aiRecord: newAI,
      });
    } catch (err) {
      await session.abortTransaction();
      console.error("AI Record Error:", err);
      res.status(500).json({ success: false, message: "Server error", error: err.message });
    } finally {
      session.endSession();
    }
  }
);

// ------------------------------------------------------
// Get AI records for manager
// ------------------------------------------------------
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
        .populate("male_swine_id", "swine_id breed sex")
        .populate("farmer_id", "first_name last_name farmer_id")
        .populate("heat_report_id")
        .sort({ createdAt: -1 });

      res.json({ success: true, aiRecords: records });
    } catch (err) {
      res.status(500).json({ success: false, message: "Server error", error: err.message });
    }
  }
);

// ------------------------------------------------------
// Confirm Swine Still in Heat (Re-breed / Cycle Reset)
// ------------------------------------------------------
router.post(
  "/still-in-heat/:heatReportId",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const report = await HeatReport.findById(req.params.heatReportId);
      if (!report) return res.status(404).json({ success: false, message: "Report not found" });

      // Update AIRecord as Failed
      await AIRecord.findOneAndUpdate(
        { heat_report_id: report._id, status: "Ongoing" },
        { still_in_heat: true, status: "Failed" }
      );

      // Reset Heat Report for re-approval/re-AI
      report.status = "approved";
      report.next_heat_check = null;
      await report.save();

      // Update Swine Status back to In-Heat
      await Swine.findByIdAndUpdate(report.swine_id, { current_status: "In-Heat" });

      res.json({ success: true, message: "Swine still in heat. Cycle reset for re-insemination." });
    } catch (err) {
      res.status(500).json({ success: false, message: "Server error", error: err.message });
    }
  }
);

// ------------------------------------------------------
// Confirm Pregnancy (Moves Swine to 114-day countdown)
// ------------------------------------------------------
router.post(
  "/confirm-pregnancy/:heatReportId",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const report = await HeatReport.findById(req.params.heatReportId);
      if (!report) return res.status(404).json({ success: false, message: "Heat report not found" });

      const gestationDays = 114;
      const farrowingDate = new Date(report.ai_confirmed_at || Date.now());
      farrowingDate.setDate(farrowingDate.getDate() + gestationDays);

      // 1. Update Heat Report
      report.status = "pregnant";
      report.pregnancy_confirmed = true;
      report.expected_farrowing = farrowingDate;
      await report.save();

      // 2. Update AIRecord
      await AIRecord.findOneAndUpdate(
        { heat_report_id: report._id },
        { pregnancy_confirmed: true, status: "Success", farrowing_date: farrowingDate }
      );

      // 3. Update Swine Cycle
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

      res.json({
        success: true,
        message: "Pregnancy confirmed. Expected farrowing date set in all records.",
      });
    } catch (err) {
      res.status(500).json({ success: false, message: "Server error", error: err.message });
    }
  }
);

module.exports = router;