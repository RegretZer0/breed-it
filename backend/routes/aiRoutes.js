// aiRoutes.js
const express = require("express");
const router = express.Router();

const AIRecord = require("../models/AIRecord");
const HeatReport = require("../models/HeatReport");
const Swine = require("../models/Swine");
const Farmer = require("../models/UserFarmer");

const { requireSessionAndToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

// ----------------------
// Add new AI Record
// ----------------------
router.post(
  "/add",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const { swineId, maleSwineId, heatReportId, farmerId } = req.body;
      const user = req.user;

      if (!swineId || !maleSwineId || !heatReportId || !farmerId) {
        return res.status(400).json({ success: false, message: "All fields are required" });
      }

      const swine = await Swine.findOne({ swine_id: swineId });
      const maleSwine = await Swine.findOne({ swine_id: maleSwineId });
      const heatReport = await HeatReport.findById(heatReportId);

      if (!swine || !maleSwine || !heatReport) {
        return res.status(404).json({ success: false, message: "Swine or heat report not found" });
      }

      // Only manager or encoder under manager can add
      const farmer = await Farmer.findById(farmerId);
      if (!farmer) return res.status(404).json({ success: false, message: "Farmer not found" });

      if (
        (user.role === "farm_manager" && farmer.registered_by.toString() !== user.id) ||
        (user.role === "encoder" && farmer.registered_by.toString() !== user.managerId)
      ) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }

      const newAI = new AIRecord({
        swine_id: swine._id,
        male_swine_id: maleSwine._id,
        manager_id: farmer.registered_by,
        farmer_id: farmerId,
        heat_report_id: heatReport._id,
        ai_confirmed: true,
        ai_confirmed_at: new Date(),
      });

      await newAI.save();

      // ----------------------
      // Update Heat Report: start 23-day countdown
      // ----------------------
      heatReport.status = "accepted";
      heatReport.ai_confirmed = true;
      heatReport.ai_confirmed_at = new Date();
      heatReport.next_heat_check = new Date(Date.now() + 23 * 24 * 60 * 60 * 1000); // 23 days
      await heatReport.save();

      res.status(201).json({
        success: true,
        message: "AI record created and heat report updated. 23-day countdown started.",
        aiRecord: newAI,
      });
    } catch (err) {
      console.error("AI Record Error:", err);
      res.status(500).json({ success: false, message: "Server error", error: err.message });
    }
  }
);

// ----------------------
// Get AI records for manager
// ----------------------
router.get(
  "/all",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const user = req.user;
      let managerId;

      if (user.role === "farm_manager") managerId = user.id;
      else if (user.role === "encoder") managerId = user.managerId;
      if (!managerId) return res.status(403).json({ success: false, message: "No linked manager" });

      const records = await AIRecord.find({ manager_id: managerId })
        .populate("swine_id", "swine_id breed sex")
        .populate("male_swine_id", "swine_id breed sex")
        .populate("farmer_id", "name email farmer_id")
        .populate("heat_report_id")
        .lean();

      res.json({ success: true, aiRecords: records });
    } catch (err) {
      console.error("Fetch AI records error:", err);
      res.status(500).json({ success: false, message: "Server error", error: err.message });
    }
  }
);

// ----------------------
// Confirm Swine Still in Heat (follow-up)
// ----------------------
router.post(
  "/still-in-heat/:heatReportId",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const { heatReportId } = req.params;
      const { evidenceUrl } = req.body; // Optional follow-up evidence

      const report = await HeatReport.findById(heatReportId);
      if (!report) return res.status(404).json({ success: false, message: "Heat report not found" });

      // Update report: still in heat
      report.still_in_heat = true;
      if (evidenceUrl) report.followup_evidence_url = evidenceUrl;

      // Restart 23-day countdown
      report.next_heat_check = new Date(Date.now() + 23 * 24 * 60 * 60 * 1000);
      report.status = "accepted"; // Keep accepted
      await report.save();

      res.json({ success: true, message: "Swine still in heat, 23-day countdown restarted.", report });
    } catch (err) {
      console.error("Still in heat error:", err);
      res.status(500).json({ success: false, message: "Server error", error: err.message });
    }
  }
);

// ----------------------
// Confirm Pregnancy
// ----------------------
router.post(
  "/confirm-pregnancy/:heatReportId",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const { heatReportId } = req.params;
      const report = await HeatReport.findById(heatReportId).populate("swine_id");

      if (!report) return res.status(404).json({ success: false, message: "Heat report not found" });

      // Update pregnancy state
      report.pregnancy_confirmed = true;
      report.swine_id.pregnancy_status = "pregnant";

      // Set farrowing date
      report.farrowing_date = new Date(Date.now() + 114 * 24 * 60 * 60 * 1000); // 114 days
      await report.save();
      await report.swine_id.save();

      res.json({
        success: true,
        message: `Pregnancy confirmed. Farrowing countdown started for ${report.swine_id.swine_id}.`,
        report,
      });
    } catch (err) {
      console.error("Confirm pregnancy error:", err);
      res.status(500).json({ success: false, message: "Server error", error: err.message });
    }
  }
);

module.exports = router;
