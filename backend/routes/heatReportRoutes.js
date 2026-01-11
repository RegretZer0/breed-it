const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");

const HeatReport = require("../models/HeatReports");
const Swine = require("../models/Swine");
const Farmer = require("../models/UserFarmer");

const { requireSessionAndToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

// ----------------------
// Add new heat report
// ----------------------
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

      const farmer = await Farmer.findById(farmerId);
      if (!farmer) return res.status(404).json({ success: false, message: "Farmer not found" });

      const user = req.user;

      // ---------------- ACCESS CONTROL ----------------
      if (
        (user.role === "farm_manager" && farmer.registered_by.toString() !== user.id) ||
        (user.role === "encoder" && (!user.managerId || farmer.registered_by.toString() !== user.managerId)) ||
        (user.role === "farmer" && farmer.user_id.toString() !== user.id)
      ) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }

      const swine = await Swine.findOne({ swine_id: swineId });
      if (!swine) return res.status(404).json({ success: false, message: "Swine not found" });

      const newReport = new HeatReport({
        swine_id: swine._id,
        farmer_id: farmerId,
        manager_id: farmer.registered_by, // always use the manager of the farmer
        signs: Array.isArray(signs) ? signs : JSON.parse(signs),
        evidence_url: `/uploads/${file.filename}`,
        date_reported: new Date()
      });

      await newReport.save();

      res.status(201).json({ success: true, message: "Heat report submitted", report: newReport });
    } catch (err) {
      console.error("Heat report error:", err);
      res.status(500).json({ success: false, message: "Server error", error: err.message });
    }
  }
);

// ----------------------
// Get all heat reports for a manager
// ----------------------
router.get(
  "/all",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const user = req.user;
      let managerId;

      if (user.role === "farm_manager") {
        managerId = user.id;
      } else if (user.role === "encoder") {
        managerId = user.managerId;
        if (!managerId) return res.status(403).json({ success: false, message: "Encoder has no linked manager" });
      }

      // Fetch all farmers under this manager
      const farmers = await Farmer.find({ registered_by: managerId }).select("_id");
      const farmerIds = farmers.map(f => f._id);

      // Fetch heat reports for all farmers under this manager
      const reports = await HeatReport.find({ farmer_id: { $in: farmerIds } })
        .populate("swine_id", "swine_id breed sex")
        .populate("farmer_id", "name email farmer_id")
        .lean();

      const populatedReports = reports.map(r => ({
        ...r,
        swine_code: r.swine_id?.swine_id || "Unknown",
        swine_breed: r.swine_id?.breed || "-",
        swine_sex: r.swine_id?.sex || "-",
        farmer_name: r.farmer_id?.name || "Unknown",
        farmer_code: r.farmer_id?.farmer_id || "Unknown",
        heat_probability: Math.min(100, Math.round((r.signs.length / 5) * 100))
      }));

      res.json({ success: true, reports: populatedReports });
    } catch (err) {
      console.error("Fetch all heat reports error:", err);
      res.status(500).json({ success: false, message: "Server error", error: err.message });
    }
  }
);

// ----------------------
// Get single heat report by ID
// ----------------------
router.get(
  "/:id",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder", "farmer"),
  async (req, res) => {
    try {
      const user = req.user;
      const report = await HeatReport.findById(req.params.id)
        .populate("swine_id", "swine_id breed sex")
        .populate("farmer_id", "name email farmer_id")
        .lean();

      if (!report) return res.status(404).json({ success: false, message: "Heat report not found" });

      // ---------------- ACCESS CONTROL ----------------
      if (
        (user.role === "farm_manager" && report.manager_id.toString() !== user.id) ||
        (user.role === "encoder" && report.manager_id.toString() !== user.managerId) ||
        (user.role === "farmer" && report.farmer_id.toString() !== user.id)
      ) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }

      const heatProbability = Math.min(100, Math.round((report.signs.length / 5) * 100));

      res.json({
        success: true,
        report: {
          ...report,
          swine_code: report.swine_id?.swine_id || "Unknown",
          swine_breed: report.swine_id?.breed || "-",
          swine_sex: report.swine_id?.sex || "-",
          farmer_name: report.farmer_id?.name || "Unknown",
          farmer_code: report.farmer_id?.farmer_id || "Unknown",
          heat_probability: heatProbability
        }
      });
    } catch (err) {
      console.error("Fetch heat report error:", err);
      res.status(500).json({ success: false, message: "Server error", error: err.message });
    }
  }
);

module.exports = router;
