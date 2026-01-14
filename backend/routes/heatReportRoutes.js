const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs"); // Added for file reading/deletion
const mongoose = require("mongoose");

const HeatReport = require("../models/HeatReports");
const Swine = require("../models/Swine");
const Farmer = require("../models/UserFarmer");
const Notification = require("../models/Notification");
const UserModel = require("../models/UserModel");
const AIRecord = require("../models/AIRecord");

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
    PROBABILITY HELPER
====================================================== */
const calculateProbability = (signs) => {
  const weights = {
    "Reddened Vulva": 10,
    "Swollen Vulva": 10,
    "Mucous Discharge": 15,
    "Seeking the Boar": 20,
    "Perked/Twitching Ears": 15,
    "Standing Reflex": 30,
    "Back Pressure Test": 30
  };
  let score = 0;
  signs.forEach(sign => {
    if (weights[sign]) score += weights[sign];
  });
  return Math.min(score, 100);
};

/* ======================================================
    ADD NEW HEAT REPORT (Updated for Multiple Base64 Media)
====================================================== */
router.post(
  "/add",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder", "farmer"),
  upload.array("evidence", 5), // Changed to .array to support up to 5 files
  async (req, res) => {
    try {
      const { swineId, signs, farmerId } = req.body;
      const files = req.files; // Access multiple files

      if (!swineId || !signs || !files || files.length === 0 || !farmerId) {
        return res.status(400).json({ success: false, message: "All fields are required" });
      }

      const farmer = await Farmer.findOne({ user_id: farmerId });
      const swine = await Swine.findOne({ swine_id: swineId });

      if (!farmer || !swine) return res.status(404).json({ success: false, message: "Farmer or Swine not found" });

      // --- CONVERT MULTIPLE FILES TO BASE64 ARRAY ---
      const evidenceData = files.map(file => {
        const filePath = path.join(__dirname, "../", file.path);
        const fileBuffer = fs.readFileSync(filePath);
        const base64String = fileBuffer.toString("base64");
        
        // Construct the Data URL (e.g., data:image/jpeg;base64,...)
        const dataUrl = `data:${file.mimetype};base64,${base64String}`;
        
        // Clean up: delete the temporary file from 'uploads/'
        fs.unlinkSync(filePath);
        
        return dataUrl;
      });

      const parsedSigns = Array.isArray(signs) ? signs : JSON.parse(signs);

      const newReport = new HeatReport({
        swine_id: swine._id,
        farmer_id: farmer._id,
        manager_id: farmer.managerId,
        signs: parsedSigns,
        standing_reflex: parsedSigns.includes("Standing Reflex"),
        back_pressure_test: parsedSigns.includes("Back Pressure Test"),
        evidence_url: evidenceData, // This is now an array of Base64 strings
        heat_probability: calculateProbability(parsedSigns),
        status: "pending"
      });

      await newReport.save();

      const recipients = await UserModel.find({
        $or: [{ _id: farmer.managerId }, { manager_id: farmer.managerId, role: "encoder" }]
      });

      if (recipients.length > 0) {
        const notifications = recipients.map(u => ({
          user_id: u._id,
          title: "New Heat Report",
          message: `Farmer ${farmer.first_name} submitted report for Swine ${swine.swine_id}.`,
          type: "info"
        }));
        await Notification.insertMany(notifications);
      }

      res.status(201).json({ success: true, report: newReport });
    } catch (err) {
      console.error("Add Report Error:", err);
      res.status(500).json({ success: false, message: "Server error while adding report" });
    }
  }
);

/* ======================================================
    GET ALL HEAT REPORTS (Admin/Encoder)
====================================================== */
router.get("/all", requireSessionAndToken, allowRoles("farm_manager", "encoder"), async (req, res) => {
  try {
    const user = req.user;
    const managerId = user.role === "farm_manager" ? user.id : user.managerId;
    const reports = await HeatReport.find({ manager_id: managerId })
      .populate("swine_id", "swine_id breed status")
      .populate("farmer_id", "first_name last_name farmer_id")
      .sort({ createdAt: -1 });
    res.json({ success: true, reports });
  } catch (err) {
    console.error("Get Reports Error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch reports" });
  }
});

/* ======================================================
    GET FARMER'S SPECIFIC REPORTS
====================================================== */
router.get("/farmer/:userId", requireSessionAndToken, allowRoles("farmer", "farm_manager", "encoder"), async (req, res) => {
  try {
    const { userId } = req.params;
    let farmer = await Farmer.findOne({ user_id: userId });
    const queryId = farmer ? farmer._id : userId;

    const reports = await HeatReport.find({ farmer_id: queryId })
      .populate("swine_id", "swine_id breed status")
      .sort({ createdAt: -1 });

    res.json({ success: true, reports });
  } catch (err) {
    console.error("Farmer Get Reports Error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch farmer reports" });
  }
});

/* ======================================================
    GET CALENDAR EVENTS
====================================================== */
router.get("/calendar-events", requireSessionAndToken, async (req, res) => {
  try {
    const user = req.user;
    const managerId = user.role === "farm_manager" ? user.id : user.managerId;
    const { farmerId } = req.query;

    let query = { 
      manager_id: managerId,
      status: { $in: ["waiting_heat_check", "pregnant"] }
    };

    if (farmerId) {
      const farmerDoc = await Farmer.findOne({ user_id: farmerId });
      if (farmerDoc) {
        query.farmer_id = farmerDoc._id;
      }
    }

    const reports = await HeatReport.find(query)
      .populate("swine_id", "swine_id")
      .populate({
        path: "farmer_id",
        model: "Farmer",
        select: "first_name last_name"
      });

    const events = [];

    reports.forEach(r => {
      let farmerName = "N/A";
      if (r.farmer_id && typeof r.farmer_id === 'object') {
          farmerName = `${r.farmer_id.first_name} ${r.farmer_id.last_name}`;
      }

      if (r.status === "waiting_heat_check" && r.next_heat_check) {
        events.push({
          id: r._id,
          title: `🔍 Heat Check: ${r.swine_id?.swine_id || 'N/A'} (${farmerName})`,
          start: r.next_heat_check.toISOString().split('T')[0],
          backgroundColor: "#f39c12",
          borderColor: "#e67e22",
          allDay: true,
          extendedProps: { type: "observation", status: r.status, farmer: farmerName }
        });
      }

      if (r.status === "pregnant" && r.expected_farrowing) {
        events.push({
          id: r._id,
          title: `🐷 Farrowing: ${r.swine_id?.swine_id || 'N/A'} (${farmerName})`,
          start: r.expected_farrowing.toISOString().split('T')[0],
          backgroundColor: "#27ae60",
          borderColor: "#2ecc71",
          allDay: true,
          extendedProps: { type: "farrowing", status: r.status, farmer: farmerName }
        });
      }
    });

    res.json({ success: true, events });
  } catch (err) {
    console.error("Calendar Events Error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch calendar data" });
  }
});

/* ======================================================
    APPROVE HEAT REPORT
====================================================== */
router.post("/:id/approve", requireSessionAndToken, allowRoles("farm_manager", "encoder"), async (req, res) => {
  try {
    const report = await HeatReport.findById(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: "Report not found" });

    report.status = "approved";
    report.approved_at = new Date();
    report.approved_by = req.user.id;
    await report.save();

    await Swine.findByIdAndUpdate(report.swine_id, { status: "In-Heat" });
    res.json({ success: true, message: "Report approved." });
  } catch (err) {
    console.error("Approve Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ======================================================
    CONFIRM AI
====================================================== */
router.post(
  "/:id/confirm-ai",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { maleSwineId } = req.body;
      if (!maleSwineId) return res.status(400).json({ success: false, message: "Male Swine selection is required" });

      const report = await HeatReport.findById(req.params.id).populate("swine_id").populate("farmer_id");
      if (!report) return res.status(404).json({ success: false, message: "Heat report not found" });

      const newAIRecord = new AIRecord({
        insemination_id: `AI-${Date.now()}`,
        swine_id: report.swine_id._id,
        swine_code: report.swine_id.swine_id,
        male_swine_id: maleSwineId,
        manager_id: req.user.id,
        farmer_id: report.farmer_id._id,
        heat_report_id: report._id,
        insemination_date: new Date(),
        ai_confirmed: true,
        ai_confirmed_at: new Date(),
        status: "Ongoing"
      });
      await newAIRecord.save({ session });

      report.status = "waiting_heat_check";
      report.ai_confirmed_at = new Date();
      
      const heatCheckDate = new Date();
      heatCheckDate.setDate(heatCheckDate.getDate() + 23);
      report.next_heat_check = heatCheckDate;

      await report.save({ session });

      await Swine.findByIdAndUpdate(report.swine_id._id, { status: "Awaiting Recheck" }, { session });

      await session.commitTransaction();
      res.json({ success: true, message: "AI Record created. 23-day countdown started." });
    } catch (err) {
      await session.abortTransaction();
      console.error("AI Confirmation Error:", err);
      res.status(500).json({ success: false, message: err.message });
    } finally {
      session.endSession();
    }
  }
);

/* ======================================================
    CONFIRM PREGNANCY
====================================================== */
router.post("/:id/confirm-pregnancy", requireSessionAndToken, allowRoles("farm_manager", "encoder"), async (req, res) => {
  try {
    const report = await HeatReport.findById(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: "Report not found" });

    report.status = "pregnant";
    
    const baseDate = report.ai_confirmed_at || new Date();
    const farrowingDate = new Date(baseDate);
    farrowingDate.setDate(farrowingDate.getDate() + 115);
    
    report.expected_farrowing = farrowingDate;
    report.next_heat_check = null; 
    await report.save();

    await AIRecord.findOneAndUpdate({ heat_report_id: report._id }, { 
        pregnancy_confirmed: true, 
        status: "Success",
        farrowing_date: report.expected_farrowing
    });

    await Swine.findByIdAndUpdate(report.swine_id, { status: "Pregnant" });
    res.json({ success: true, message: "Pregnancy confirmed." });
  } catch (err) {
    console.error("Pregnancy Confirmation Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ======================================================
    STILL IN HEAT
====================================================== */
router.post("/:id/still-heat", requireSessionAndToken, allowRoles("farmer", "farm_manager", "encoder"), async (req, res) => {
  try {
    const report = await HeatReport.findById(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: "Report not found" });

    report.status = "approved"; 
    report.next_heat_check = null;
    report.expected_farrowing = null;
    await report.save();

    await AIRecord.findOneAndUpdate({ heat_report_id: report._id, status: "Ongoing" }, { 
        still_in_heat: true, 
        status: "Failed" 
    });

    await Swine.findByIdAndUpdate(report.swine_id, { status: "In-Heat" });
    res.json({ success: true, message: "Cycle reset due to heat re-emergence." });
  } catch (err) {
    console.error("Still-Heat Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;