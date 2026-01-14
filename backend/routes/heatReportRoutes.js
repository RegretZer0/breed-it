const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const mongoose = require("mongoose");

const HeatReport = require("../models/HeatReports");
const Swine = require("../models/Swine");
const Farmer = require("../models/UserFarmer");
const Notification = require("../models/Notification");
const UserModel = require("../models/UserModel");


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
  upload.array("evidence", 11), // ✅ MULTI FILE SUPPORT
  async (req, res) => {
    try {
      const { swineId, farmerId } = req.body;

      // ✅ SAFE signs parsing
      let signs = [];
      if (req.body.signs) {
        try {
          signs = JSON.parse(req.body.signs);
        } catch {
          signs = [];
        }
      }

      // ✅ EVIDENCE VALIDATION (CORRECT)
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one image or video is required"
        });
      }

      // ---------------- FIND FARMER PROFILE ----------------
      const farmer = await Farmer.findOne({ user_id: farmerId });
      if (!farmer) {
        return res.status(404).json({
          success: false,
          message: "Farmer not found"
        });
      }

      const user = req.user;

      // ---------------- ROLE-BASED ACCESS ----------------
      if (
        (user.role === "farm_manager" &&
          farmer.managerId.toString() !== user.id) ||
        (user.role === "encoder" &&
          farmer.managerId.toString() !== user.managerId) ||
        (user.role === "farmer" &&
          farmer.user_id.toString() !== user.id)
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied"
        });
      }

      // ---------------- FIND SWINE (OPTIONAL) ----------------
      let swine = null;
      if (swineId) {
        swine = await Swine.findOne({ swine_id: swineId });
        if (!swine) {
          return res.status(404).json({
            success: false,
            message: "Swine not found"
          });
        }
      }

      // ---------------- SAVE EVIDENCE URLS ----------------
      const evidenceUrls = req.files.map(
        f => `/uploads/${f.filename}`
      );

      // ---------------- CREATE REPORT ----------------
      const newReport = new HeatReport({
        swine_id: swine ? swine._id : null,
        farmer_id: farmer._id,
        manager_id: farmer.managerId,
        signs,
        evidence_urls: evidenceUrls, // ✅ ARRAY
        status: "pending"
      });

      await newReport.save();

      // ---------------- RESPONSE ----------------
      res.status(201).json({
        success: true,
        message: "Heat report submitted successfully",
        report: newReport
      });

    } catch (err) {
      console.error("Heat report error:", err);
      res.status(500).json({
        success: false,
        message: "Server error"
      });
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
      const swine = await Swine.findById(report.swine_id);

      // Ensure only the assigned manager can approve
      if (user.role === "farm_manager" && report.manager_id?.toString() !== user.id) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }
      if (user.role === "encoder" && report.manager_id?.toString() !== user.managerId) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }

      // Update the report status
      report.status = "accepted";
      report.approved_at = new Date();
      report.manager_id = report.manager_id || user.id;
      report.ai_confirmed = false;
      report.next_heat_check = new Date(Date.now() + 23 * 24 * 60 * 60 * 1000);

      await report.save();

      // ---------------- NOTIFY FARMER ----------------
      try {
        const farmer = await Farmer.findById(report.farmer_id);
        if (farmer) {
          await Notification.create({
            user_id: farmer.user_id,
            title: "Heat Report Approved",
            message: `Your heat report for swine ${swine.swine_id} has been approved. Next heat check is scheduled in 23 days.`,
            type: "success"
          });
        }
      } catch (notifErr) {
        console.error("Failed to send notification:", notifErr);
      }

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

      const swine = await Swine.findById(report.swine_id);

      report.status = "waiting_heat_check";
      report.ai_confirmed = true;
      report.ai_confirmed_at = new Date();
      report.next_heat_check = new Date(Date.now() + 23 * 24 * 60 * 60 * 1000);

      await report.save();

      // ---------------- NOTIFY FARMER ----------------
      try {
        const farmer = await Farmer.findById(report.farmer_id);
        if (farmer) {
          await Notification.create({
            user_id: farmer.user_id,
            title: "Artificial Insemination Confirmed",
            message: `Artificial insemination has been confirmed for swine ${swine?.swine_id || "Unknown"}. The next heat check is scheduled in 23 days.`,
            type: "info"
          });
        }
      } catch (notifErr) {
        console.error("Failed to send notification:", notifErr);
      }

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

      const swine = await Swine.findById(report.swine_id);

      report.status = "pregnant";
      report.pregnancy_confirmed_at = new Date();
      report.expected_farrowing = new Date(Date.now() + 115 * 24 * 60 * 60 * 1000);

      await report.save();

      // ---------------- NOTIFY FARMER ----------------
      try {
        const farmer = await Farmer.findById(report.farmer_id);
        if (farmer) {
          await Notification.create({
            user_id: farmer.user_id,
            title: "Pregnancy Confirmed",
            message: `Pregnancy has been confirmed for swine ${swine?.swine_id || "Unknown"}. Expected farrowing is scheduled in approximately 114–115 days.`,
            type: "success"
          });
        }
      } catch (notifErr) {
        console.error("Failed to send notification:", notifErr);
      }

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
