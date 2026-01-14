const express = require("express");
const router = express.Router();

const BreedingCycle = require("../models/BreedingCycle");
const HeatReport = require("../models/HeatReports");
const Swine = require("../models/Swine");

const { requireSessionAndToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

// ------------------------------
// Confirm AI and start 23-day cycle
// ------------------------------
router.post(
  "/confirm-ai",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const { heatReportId, aiDate } = req.body;

      const report = await HeatReport.findById(heatReportId);
      if (!report || report.status !== "accepted") {
        return res.status(400).json({ success: false, message: "Invalid or unapproved heat report" });
      }

      const ai_date = new Date(aiDate);
      const heat_check_date = new Date(ai_date);
      heat_check_date.setDate(heat_check_date.getDate() + 23);

      const cycle = new BreedingCycle({
        swine_id: report.swine_id,
        farmer_id: report.farmer_id,
        manager_id: report.manager_id,
        ai_date,
        heat_check_date
      });

      await cycle.save();

      res.json({
        success: true,
        message: "AI confirmed. 23-day heat countdown started.",
        cycle
      });

    } catch (err) {
      console.error("Confirm AI error:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

router.post(
  "/heat-repeat",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const { cycleId } = req.body;

      const cycle = await BreedingCycle.findById(cycleId);
      if (!cycle) return res.status(404).json({ success: false, message: "Cycle not found" });

      cycle.status = "HEAT_REPEAT";
      cycle.cycle_number += 1;
      await cycle.save();

      res.json({
        success: true,
        message: "Sow still in heat. New AI cycle required.",
        cycle
      });
    } catch (err) {
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

router.post(
  "/confirm-pregnancy",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const { cycleId } = req.body;

      const cycle = await BreedingCycle.findById(cycleId);
      if (!cycle) return res.status(404).json({ success: false, message: "Cycle not found" });

      const expectedFarrowing = new Date(cycle.ai_date);
      expectedFarrowing.setDate(expectedFarrowing.getDate() + 114);

      cycle.pregnancy_confirmed = true;
      cycle.expected_farrowing_date = expectedFarrowing;
      cycle.status = "PREGNANT_CONFIRMED";

      await cycle.save();

      res.json({
        success: true,
        message: "Pregnancy confirmed. Farrowing countdown started.",
        cycle
      });

    } catch (err) {
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

module.exports = router;
