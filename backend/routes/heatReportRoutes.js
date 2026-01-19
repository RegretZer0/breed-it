const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");

const HeatReport = require("../models/HeatReports");
const Swine = require("../models/Swine");
const Farmer = require("../models/UserFarmer");
const Notification = require("../models/Notifications");
const UserModel = require("../models/UserModel");
const AIRecord = require("../models/AIRecord");

const { requireApiLogin } = require("../middleware/pageAuth.middleware");
const { allowRoles } = require("../middleware/roleMiddleware");

/* ======================================================
    MULTER CONFIG
====================================================== */
const uploadDir = "uploads/";
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) =>
    cb(null, Date.now() + "-" + Math.round(Math.random() * 1E9) + path.extname(file.originalname))
});

const upload = multer({ 
    storage,
    limits: { fileSize: 10 * 1024 * 1024 } 
});

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
    ADD NEW HEAT REPORT
====================================================== */
router.post(
  "/add",
  requireApiLogin,
  allowRoles("farm_manager", "encoder", "farmer"),
  upload.array("evidence", 5),
  async (req, res) => {
    try {
      const { swineId, signs } = req.body;
      const files = req.files;

      if (!swineId || !signs || !files || files.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Swine ID, signs, and evidence are required"
        });
      }

      let farmer = null;
      if (req.user.farmerProfileId) {
        farmer = await Farmer.findById(req.user.farmerProfileId);
      }
      if (!farmer) {
        farmer = await Farmer.findOne({ user_id: req.user.id });
      }

      if (!farmer) {
        return res.status(404).json({
          success: false,
          message: "Farmer profile not found or not linked"
        });
      }

      const swine = await Swine.findOne({ swine_id: swineId });
      if (!swine) {
        return res.status(404).json({
          success: false,
          message: "Swine not found"
        });
      }

      const evidenceData = files.map(file => {
        const filePath = path.join(__dirname, "../", file.path);
        const fileBuffer = fs.readFileSync(filePath);
        const base64String = fileBuffer.toString("base64");
        const dataUrl = `data:${file.mimetype};base64,${base64String}`;
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
        evidence_url: evidenceData,
        heat_probability: calculateProbability(parsedSigns),
        status: "pending"
      });

      await newReport.save();

      const recipients = await UserModel.find({
        $or: [
          { _id: farmer.managerId },
          { manager_id: farmer.managerId, role: "encoder" }
        ]
      });

      if (recipients.length > 0) {
        await Notification.insertMany(
          recipients.map(u => ({
            user_id: u._id,
            title: "New Heat Report",
            message: `Farmer ${farmer.first_name} submitted a heat report for Swine ${swine.swine_id}.`,
            type: "info"
          }))
        );
      }

      res.status(201).json({ success: true, report: newReport });
    } catch (err) {
        console.error("Add Report Error:", err);
        res.status(500).json({
          success: false,
          message: err.message || "Server error while adding report"
        });
      }
  }
);

/* ======================================================
    GET ALL HEAT REPORTS (Admin/Encoder Only)
====================================================== */
router.get("/all", requireApiLogin, allowRoles("farm_manager", "encoder"), async (req, res) => {
  try {
    const user = req.user;
    const managerId = user.role === "farm_manager" ? user.id : user.managerId;
    const reports = await HeatReport.find({ manager_id: managerId })
      .populate("swine_id", "swine_id breed current_status")
      .populate("farmer_id", "first_name last_name farmer_id user_id")
      .sort({ createdAt: -1 });
    res.json({ success: true, reports });
  } catch (err) {
    console.error("Get Reports Error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch reports" });
  }
});

/* ======================================================
    GET REPORTS FOR SPECIFIC FARMER
====================================================== */
router.get("/farmer/:userId", requireApiLogin, allowRoles("farmer", "farm_manager", "encoder"), async (req, res) => {
    try {
        const { userId } = req.params;
        const farmerProfile = await Farmer.findOne({ user_id: userId });
        if (!farmerProfile) {
            return res.status(404).json({ success: false, message: "Farmer profile not found" });
        }
        const reports = await HeatReport.find({ farmer_id: farmerProfile._id })
            .populate("swine_id", "swine_id breed current_status")
            .sort({ createdAt: -1 });

        res.json({ success: true, reports });
    } catch (err) {
        console.error("Get Farmer Reports Error:", err);
        res.status(500).json({ success: false, message: "Failed to fetch your reports" });
    }
});

/* ======================================================
    APPROVE HEAT REPORT (Starts Breeding Cycle)
====================================================== */
router.post("/:id/approve", requireApiLogin, allowRoles("farm_manager"), async (req, res) => {
  try {
    const report = await HeatReport.findById(req.params.id).populate("swine_id").populate("farmer_id");
    if (!report) return res.status(404).json({ success: false, message: "Report not found" });

    const now = new Date();
    const scheduledInsemination = new Date(now);
    scheduledInsemination.setDate(now.getDate() + 2);

    report.status = "approved";
    report.approved_at = now;
    report.approved_by = req.user.id;
    report.next_heat_check = scheduledInsemination; 
    
    await report.save();

    const swine = await Swine.findById(report.swine_id);
    const nextCycleNumber = (swine.breeding_cycles?.length || 0) + 1;

    // ✅ Pushing new breeding cycle for parity tracking
    await Swine.findByIdAndUpdate(report.swine_id, { 
        current_status: "In-Heat",
        $push: {
            breeding_cycles: {
                cycle_number: nextCycleNumber,
                heat_report_id: report._id,
                estrus_date: report.approved_at,
                is_pregnant: false
            }
        }
    });

    if (report.farmer_id && report.farmer_id.user_id) {
        await Notification.create({
            user_id: report.farmer_id.user_id,
            title: "Heat Approved & AI Scheduled",
            message: `Swine ${report.swine_id.swine_id} is approved! Insemination is scheduled for ${scheduledInsemination.toLocaleDateString()}.`,
            type: "success"
        });
    }
    
    res.json({ success: true, message: `Report approved. Insemination scheduled for ${scheduledInsemination.toLocaleDateString()}.` });
  } catch (err) {
    console.error("Approve Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ======================================================
    CONFIRM AI (Links Boar to Cycle)
====================================================== */
router.post("/:id/confirm-ai", requireApiLogin, allowRoles("farm_manager"), async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { maleSwineId } = req.body;
      const report = await HeatReport.findById(req.params.id).populate("swine_id").populate("farmer_id");
      
      const now = new Date();
      const newAIRecord = new AIRecord({
        insemination_id: `AI-${Date.now()}`,
        swine_id: report.swine_id._id,
        swine_code: report.swine_id.swine_id,
        male_swine_id: maleSwineId,
        manager_id: req.user.id,
        farmer_id: report.farmer_id._id,
        heat_report_id: report._id,
        insemination_date: now,
        ai_confirmed: true,
        ai_confirmed_at: now,
        status: "Ongoing"
      });
      await newAIRecord.save({ session });

      report.status = "under_observation";
      report.ai_confirmed_at = now;
      
      const heatCheckDate = new Date();
      heatCheckDate.setDate(heatCheckDate.getDate() + 23);
      report.next_heat_check = heatCheckDate;
      
      await report.save({ session });

      // ✅ Updating specific cycle with Sire ID
      await Swine.updateOne(
        { _id: report.swine_id._id, "breeding_cycles.heat_report_id": report._id },
        { 
          $set: { 
            "breeding_cycles.$.ai_service_date": now,
            "breeding_cycles.$.ai_record_id": newAIRecord._id,
            "breeding_cycles.$.cycle_sire_id": maleSwineId,
            current_status: "Under Observation" 
          }
        },
        { session }
      );

      await session.commitTransaction();
      res.json({ success: true, message: "AI Record created and linked to breeding cycle." });
    } catch (err) {
      await session.abortTransaction();
      res.status(500).json({ success: false, message: err.message });
    } finally {
      session.endSession();
    }
});

/* ======================================================
    CONFIRM PREGNANCY (Updates Gestation Data)
====================================================== */
router.post("/:id/confirm-pregnancy", requireApiLogin, allowRoles("farmer", "farm_manager"), async (req, res) => {
  try {
    const report = await HeatReport.findById(req.params.id);
    report.status = "pregnant";
    
    const baseDate = report.ai_confirmed_at || new Date();
    const farrowingDate = new Date(baseDate);
    farrowingDate.setDate(farrowingDate.getDate() + 114); 
    
    report.expected_farrowing = farrowingDate;
    report.next_heat_check = null; 
    await report.save();

    await AIRecord.findOneAndUpdate({ heat_report_id: report._id }, { 
        pregnancy_confirmed: true, 
        status: "Success",
        farrowing_date: report.expected_farrowing
    });

    // ✅ Setting pregnancy flag and expected date
    await Swine.updateOne(
        { _id: report.swine_id, "breeding_cycles.heat_report_id": report._id },
        { 
          $set: { 
            "breeding_cycles.$.is_pregnant": true,
            "breeding_cycles.$.pregnancy_check_date": new Date(),
            "breeding_cycles.$.expected_farrowing_date": report.expected_farrowing,
            current_status: "Pregnant" 
          }
        }
    );

    res.json({ success: true, message: "Pregnancy confirmed. Expected farrowing date set." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ======================================================
    CONFIRM FARROWING (Increments Cycle & Sets Lactation)
====================================================== */
router.post("/:id/confirm-farrowing", requireApiLogin, allowRoles("farm_manager"), async (req, res) => {
    try {
        const report = await HeatReport.findById(req.params.id);
        if (!report) return res.status(404).json({ success: false, message: "Report not found" });

        const now = new Date();

        // 1. Update HeatReport status to 'lactating'
        report.status = "lactating"; 
        await report.save();

        // 2. Update AI Record
        await AIRecord.findOneAndUpdate(
            { heat_report_id: report._id },
            { status: "Success", farrowing_date: now }
        );

        // 3. Update Swine: Mark cycle complete, set status to Lactating, and increment parity
        await Swine.updateOne(
            { _id: report.swine_id, "breeding_cycles.heat_report_id": report._id },
            { 
              $set: { 
                "breeding_cycles.$.is_pregnant": false,
                "breeding_cycles.$.actual_farrowing_date": now,
                current_status: "Lactating" 
              },
              $inc: { parity: 1 } 
            }
        );

        res.json({ success: true, message: "Farrowing confirmed. Swine status updated to Lactating." });
    } catch (err) {
        console.error("Farrowing Error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

/* ======================================================
    STILL IN HEAT (Cycle Failed/Reset)
====================================================== */
router.post("/:id/still-heat", requireApiLogin, allowRoles("farmer", "farm_manager"), async (req, res) => {
  try {
    const report = await HeatReport.findById(req.params.id);
    report.status = "approved"; 
    report.next_heat_check = null;
    report.expected_farrowing = null;
    await report.save();

    await AIRecord.findOneAndUpdate({ heat_report_id: report._id, status: "Ongoing" }, { 
        still_in_heat: true, 
        status: "Failed" 
    });

    await Swine.findByIdAndUpdate(report.swine_id, { current_status: "In-Heat" });
    res.json({ success: true, message: "Cycle reset. Status returned to In-Heat." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ======================================================
    GET CALENDAR EVENTS (Now includes 30-day Weaning)
====================================================== */
router.get(
  "/calendar-events",
  requireApiLogin,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const farmerProfileId = req.user.farmerProfileId;

      const reports = await HeatReport.find({
        farmer_id: farmerProfileId,
        status: { $in: ["approved", "under_observation", "pregnant", "lactating"] }
      })
        .populate("swine_id", "swine_id");

      const events = [];

      reports.forEach(r => {
        if (r.status === "approved" && r.next_heat_check) {
          events.push({
            title: `💉 AI Due: ${r.swine_id?.swine_id}`,
            start: r.next_heat_check.toISOString().split("T")[0],
            backgroundColor: "#3498db",
            allDay: true
          });
        }

        if (r.status === "under_observation" && r.next_heat_check) {
          events.push({
            title: `🔍 Heat Re-Check: ${r.swine_id?.swine_id}`,
            start: r.next_heat_check.toISOString().split("T")[0],
            backgroundColor: "#f39c12",
            allDay: true
          });
        }

        if (r.status === "pregnant" && r.expected_farrowing) {
          events.push({
            title: `🐷 Farrowing: ${r.swine_id?.swine_id}`,
            start: r.expected_farrowing.toISOString().split("T")[0],
            backgroundColor: "#27ae60",
            allDay: true
          });
        }

        if (r.status === "lactating" && r.expected_farrowing) {
          const weaningDate = new Date(r.expected_farrowing);
          weaningDate.setDate(weaningDate.getDate() + 30);

          events.push({
            title: `🍼 Weaning: ${r.swine_id?.swine_id}`,
            start: weaningDate.toISOString().split("T")[0],
            backgroundColor: "#9b59b6",
            allDay: true
          });
        }
      });

      res.json({ success: true, events });
    } catch (err) {
      console.error("Calendar Data Error:", err);
      res.status(500).json({ success: false, message: "Failed to fetch calendar data" });
    }
  }
);


/* ======================================================
    REJECT REPORT
====================================================== */
router.post("/:id/reject", requireApiLogin, allowRoles("farm_manager"), async (req, res) => {
    try {
        const { reason } = req.body; 
        const report = await HeatReport.findById(req.params.id);
        if (!report) return res.status(404).json({ success: false, message: "Report not found" });

        report.status = "rejected";
        report.rejection_message = reason; 
        await report.save();

        res.json({ success: true, message: "Report rejected successfully." });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;