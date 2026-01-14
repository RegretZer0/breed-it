const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const mongoose = require("mongoose");

const HeatReport = require("../models/HeatReports");
const Swine = require("../models/Swine");
const Farmer = require("../models/UserFarmer");

const { requireSessionAndToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

/* ======================================================
   MULTER CONFIG
====================================================== */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

/* ======================================================
   ADD NEW HEAT REPORT
====================================================== */
router.post(
  "/add",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder", "farmer"),
  upload.single("evidence"),
  async (req, res) => {
    try {
      const { swineId, signs, farmerId } = req.body;
      const file = req.file;

      if (!swineId || !signs || !file || !farmerId) {
        return res.status(400).json({ success: false, message: "All fields are required" });
      }

      const farmer = await Farmer.findOne({ user_id: farmerId });
      if (!farmer) {
        return res.status(404).json({ success: false, message: "Farmer not found" });
      }

      const user = req.user;

      // 🔐 Role-based access
      if (
        (user.role === "farm_manager" && farmer.managerId.toString() !== user.id) ||
        (user.role === "encoder" && farmer.managerId.toString() !== user.managerId) ||
        (user.role === "farmer" && farmer.user_id.toString() !== user.id)
      ) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }

      const swine = await Swine.findOne({ swine_id: swineId });
      if (!swine) {
        return res.status(404).json({ success: false, message: "Swine not found" });
      }

      const newReport = new HeatReport({
        swine_id: swine._id,
        farmer_id: farmer._id,
        manager_id: farmer.managerId, // ✅ FIX: always save manager_id
        signs: Array.isArray(signs) ? signs : JSON.parse(signs),
        evidence_url: `/uploads/${file.filename}`,
        status: "pending"
      });

      await newReport.save();

      res.status(201).json({
        success: true,
        message: "Heat report submitted",
        report: newReport
      });
    } catch (err) {
      console.error("Heat report error:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

/* ======================================================
   GET ALL HEAT REPORTS FOR MANAGER / ENCODER
====================================================== */
router.get(
  "/all",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const user = req.user;

      const managerIdStr =
        user.role === "farm_manager" ? user.id : user.managerId;

      if (!managerIdStr) {
        return res.status(400).json({
          success: false,
          message: "Manager ID missing"
        });
      }

      const managerId = new mongoose.Types.ObjectId(managerIdStr);

      console.log("Fetching reports for manager:", managerIdStr);

      // ✅ FIX: query directly by manager_id
      const reports = await HeatReport.find({ manager_id: managerId })
        .populate("swine_id", "swine_id breed sex")
        .populate("farmer_id", "_id first_name last_name farmer_id user_id")
        .lean();

      console.log("Reports found:", reports.length);

      const populatedReports = reports.map(r => ({
        ...r,
        swine_code: r.swine_id?.swine_id || "Unknown",
        swine_breed: r.swine_id?.breed || "-",
        swine_sex: r.swine_id?.sex || "-",
        farmer_name: r.farmer_id
          ? `${r.farmer_id.first_name} ${r.farmer_id.last_name}`
          : "Unknown",
        farmer_code: r.farmer_id?.farmer_id || "Unknown",
        heat_probability: Math.min(
          100,
          Math.round((r.signs.length / 5) * 100)
        )
      }));

      res.json({ success: true, reports: populatedReports });
    } catch (err) {
      console.error("Fetch all heat reports error:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

/* ======================================================
   GET ALL HEAT REPORTS FOR A SPECIFIC FARMER
====================================================== */
router.get(
  "/farmer/:farmerId",
  requireSessionAndToken,
  allowRoles("farmer"),
  async (req, res) => {
    try {
      const user = req.user;
      const { farmerId } = req.params;

      if (user.id !== farmerId) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }

      const farmer = await Farmer.findOne({ user_id: farmerId });
      if (!farmer) {
        return res.status(404).json({ success: false, message: "Farmer not found" });
      }

      const reports = await HeatReport.find({ farmer_id: farmer._id })
        .populate("swine_id", "swine_id breed sex")
        .populate("farmer_id", "first_name last_name farmer_id")
        .lean();

      res.json({ success: true, reports });
    } catch (err) {
      console.error("Fetch farmer heat reports error:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

/* ======================================================
   GET SINGLE HEAT REPORT
====================================================== */
router.get(
  "/:id",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder", "farmer"),
  async (req, res) => {
    try {
      const user = req.user;

      const report = await HeatReport.findById(req.params.id)
        .populate("swine_id", "swine_id breed sex")
        .populate(
          "farmer_id",
          "first_name last_name farmer_id user_id"
        )
        .lean();

      if (!report) {
        return res.status(404).json({ success: false, message: "Report not found" });
      }

      // 🔐 SAFE permission checks
      if (
        (user.role === "farm_manager" &&
          report.manager_id?.toString() !== user.id) ||
        (user.role === "encoder" &&
          report.manager_id?.toString() !== user.managerId) ||
        (user.role === "farmer" &&
          report.farmer_id?.user_id?.toString() !== user.id)
      ) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }

      res.json({ success: true, report });
    } catch (err) {
      console.error("Fetch single report error:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

/* ======================================================
   APPROVE HEAT REPORT
====================================================== */
router.post(
  "/:id/approve",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const report = await HeatReport.findById(req.params.id);
      if (!report) return res.status(404).json({ success: false, message: "Report not found" });

      const user = req.user;

      // Ensure only the assigned manager can approve
      if (user.role === "farm_manager" && report.manager_id?.toString() !== user.id) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }
      if (user.role === "encoder" && report.manager_id?.toString() !== user.managerId) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }

      // Update the report status
      report.status = "accepted";           // mark as approved
      report.approved_at = new Date();      // timestamp for approval
      report.manager_id = report.manager_id || user.id; // ensure manager_id is set
      report.ai_confirmed = false;          // reset AI confirmation
      report.next_heat_check = new Date(Date.now() + 23 * 24 * 60 * 60 * 1000); // next check 23 days later

      // Optionally, set the next AI step immediately
      report.ai_confirmed = false;
      report.next_heat_check = new Date(Date.now() + 23 * 24 * 60 * 60 * 1000); // 23 days later

      await report.save();

      res.json({ success: true, message: "Heat report approved", report });
    } catch (err) {
      console.error("Approve heat error:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

/* ======================================================
   CONFIRM ARTIFICIAL INSEMINATION (23 DAYS)
====================================================== */
router.post(
  "/:id/confirm-ai",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const report = await HeatReport.findById(req.params.id);
      if (!report) return res.status(404).json({ success: false });

      report.status = "waiting_heat_check";
      report.ai_confirmed = true;
      report.ai_confirmed_at = new Date();
      report.next_heat_check = new Date(Date.now() + 23 * 86400000);

      await report.save();
      res.json({ success: true });
    } catch (err) {
      console.error("Confirm AI error:", err);
      res.status(500).json({ success: false });
    }
  }
);

/* ======================================================
   CONFIRM PREGNANCY (114–115 DAYS)
====================================================== */
router.post(
  "/:id/confirm-pregnancy",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const report = await HeatReport.findById(req.params.id);
      if (!report) return res.status(404).json({ success: false });

      report.status = "pregnant";
      report.pregnancy_confirmed_at = new Date();
      report.expected_farrowing = new Date(Date.now() + 115 * 86400000);

      await report.save();
      res.json({ success: true });
    } catch (err) {
      console.error("Confirm pregnancy error:", err);
      res.status(500).json({ success: false });
    }
  }
);

/* ======================================================
   OVULATION / FARROWING CALENDAR DATA
====================================================== */
router.get(
  "/:id/calendar",
  requireSessionAndToken,
  async (req, res) => {
    try {
      const report = await HeatReport.findById(req.params.id);
      if (!report) return res.status(404).json({ success: false });

      res.json({
        success: true,
        status: report.status,
        next_heat_check: report.next_heat_check,
        expected_farrowing: report.expected_farrowing
      });
    } catch (err) {
      console.error("Calendar fetch error:", err);
      res.status(500).json({ success: false });
    }
  }
);

/* ======================================================
   STILL IN HEAT (RESTART 23 DAYS)
====================================================== */
router.post(
  "/:id/still-heat",
  requireSessionAndToken,
  allowRoles("farmer"),
  upload.single("evidence"),
  async (req, res) => {
    try {
      const report = await HeatReport.findById(req.params.id);
      if (!report) return res.status(404).json({ success: false });

      report.ai_confirmed_at = new Date();
      report.next_heat_check = new Date(Date.now() + 23 * 24 * 60 * 60 * 1000);
      report.status = "waiting_heat_check";

      await report.save();
      res.json({ success: true });
    } catch (err) {
      console.error("Still heat error:", err);
      res.status(500).json({ success: false });
    }
  }
);

module.exports = router;
