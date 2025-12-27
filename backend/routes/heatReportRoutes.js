const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");

// Models
const HeatReport = require("../models/HeatReports");
const Swine = require("../models/Swine");
const Farmer = require("../models/UserFarmer");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

// Add new heat report 
router.post("/add", upload.single("evidence"), async (req, res) => {
  try {
    const { swineId, signs, farmerId } = req.body; // removed adminId from frontend
    const file = req.file;

    if (!swineId || !signs || !file || !farmerId) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    // Get the farmer and their registered admin
    const farmer = await Farmer.findById(farmerId);
    if (!farmer) {
      return res.status(404).json({ success: false, message: "Farmer not found" });
    }

    const adminId = farmer.registered_by; // ✅ correct field

    if (!adminId) {
      return res.status(400).json({ success: false, message: "Farmer does not have an assigned admin" });
    }

    // Query by swine_id instead of _id
    const swine = await Swine.findOne({ swine_id: swineId });
    if (!swine) {
      return res.status(404).json({ success: false, message: "Swine not found" });
    }

    const signsArray = Array.isArray(signs) ? signs : JSON.parse(signs);

    const newReport = new HeatReport({
      swine_id: swine._id,
      farmer_id: farmerId,
      admin_id: adminId, // ✅ set admin_id from farmer
      signs: signsArray,
      evidence_url: `/uploads/${file.filename}`
    });

    await newReport.save();

    res.status(201).json({
      success: true,
      message: "Heat report submitted",
      report: newReport
    });

  } catch (err) {
    console.error("Heat report error:", err);
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
});

// Get all heat reports (admin-scoped)
router.get("/all", async (req, res) => {
  try {
    const { adminId } = req.query;
    if (!adminId) return res.status(400).json({ success: false, message: "adminId is required" });

    const reports = await HeatReport.find({ admin_id: adminId })
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
});

// Get single heat report by ID (admin-scoped)
router.get("/:id", async (req, res) => {
  try {
    const { adminId } = req.query;
    if (!adminId) return res.status(400).json({ success: false, message: "adminId is required" });

    const report = await HeatReport.findOne({ _id: req.params.id, admin_id: adminId })
      .populate("swine_id", "swine_id breed sex")
      .populate("farmer_id", "name email farmer_id")
      .lean();

    if (!report) return res.status(404).json({ success: false, message: "Heat report not found or access denied" });

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
});

module.exports = router;
