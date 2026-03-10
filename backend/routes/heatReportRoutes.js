// heatReportRoutes.js
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
const logAction = require("../middleware/logger");
const SystemSettings = require("../models/SystemSettings");
const timeHelper = require("../utils/timeHelper");

const { requireApiLogin } = require("../middleware/pageAuth.middleware");
const { allowRoles } = require("../middleware/roleMiddleware");

/* ======================================================
    HELPERS
====================================================== */
const uploadDir = "uploads/";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) =>
    cb(null, Date.now() + "-" + Math.round(Math.random() * 1e9) + path.extname(file.originalname))
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

const calculateProbability = (signs, swine) => {
  // 1. Check if the swine has an established "First Success Basis"
  const hasBasis =
    swine.first_success_basis && 
    swine.first_success_basis.signs && 
    swine.first_success_basis.signs.length > 0;

  if (hasBasis) {
    const basisSigns = swine.first_success_basis.signs;

    // Check if current signs are EXACTLY the same as the successful ones
    const isIdentical = 
      signs.length === basisSigns.length && 
      signs.every((s) => basisSigns.includes(s));

    if (isIdentical) {
      return 100; // Same signs = 100% Probability
    }
  }

  // 2. Default weighted calculation if no basis exists or signs don't match exactly
  const weights = {
    "Reddened Vulva": 20,
    "Swollen Vulva": 10,
    "Mucous Discharge": 5,
    "Tail raising": 2,
    "Perked/Twitching Ears": 5,
    "Standing Reflex": 50,
    "Restlessness or noticeable behavioral change": 2,
    "Increased vocalization": 2,
    "Decreased appetite": 2,
    "Increased alertness or irritability": 2
  };

  let score = 0;
  const parsedSigns = Array.isArray(signs) ? signs : [];
  parsedSigns.forEach((sign) => {
    if (weights[sign]) score += weights[sign];
  });

  return score > 100 ? 100 : score;
};

const notifyBreedingTeam = async (managerId, farmerUserId, title, message, type = "info") => {
  try {
    const staff = await UserModel.find({
      $or: [{ _id: managerId }, { manager_id: managerId, role: "encoder" }]
    }).select("_id");

    const userIds = staff.map((u) => u._id);

    if (farmerUserId && !userIds.some((id) => id.equals(farmerUserId))) {
      userIds.push(farmerUserId);
    }

    const notifications = userIds.map((id) => ({
      user_id: id,
      title,
      message,
      type
    }));

    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }
  } catch (err) {
    console.error("Notification Helper Error:", err);
  }
};

/* ======================================================
    ADD NEW HEAT REPORT (With Culling Logic)
====================================================== */
router.post(
  "/add",
  requireApiLogin,
  allowRoles("farm_manager", "encoder", "farmer"),
  upload.array("evidence", 5),
  async (req, res) => {
    try {
      const { swineId, signs, remarks } = req.body;
      const files = req.files;

      // sanitize remarks (optional field)
      const cleanRemarks = (remarks ?? "").toString().trim();

      // 1. Initial Validation
      if (!swineId || !signs || !files || files.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Swine ID, signs, and evidence are required"
        });
      }

      // 2. Safe JSON Parsing for Signs
      let parsedSigns;
      try {
        parsedSigns = Array.isArray(signs) ? signs : JSON.parse(signs);
      } catch (e) {
        return res.status(400).json({
          success: false,
          message: "Invalid format for signs. Expected an array."
        });
      }

      // 3. Find Farmer Profile
      let farmer = await Farmer.findOne({
        $or: [{ _id: req.user.farmerProfileId }, { user_id: req.user.id }]
      });
      if (!farmer) {
        return res.status(404).json({ success: false, message: "Farmer profile not found" });
      }

      // 4. Find Swine
      const swine = await Swine.findOne({ swine_id: swineId });
      if (!swine) {
        return res.status(404).json({ success: false, message: "Swine not found" });
      }

      const evidenceData = files.map((file) => `/uploads/${file.filename}`);

      // 5. --- CULLING CHECK (Auto-Cull Feature) ---
      const hasBasis =
        swine.first_success_basis && 
        swine.first_success_basis.signs && 
        swine.first_success_basis.signs.length > 0;

      if (hasBasis) {
        const basisSigns = swine.first_success_basis.signs;
        
        // REFINED LOGIC: Instead of a strict identical match, we check for core compatibility.
        // 1. If 'Standing Reflex' was present in the successful history, it MUST be present now.
        const historyHadStandingReflex = basisSigns.includes("Standing Reflex");
        const currentHasStandingReflex = parsedSigns.includes("Standing Reflex");
        
        // 2. Calculate overlap percentage (How many historical signs are present now?)
        const matchingSigns = basisSigns.filter(sign => parsedSigns.includes(sign));
        const overlapPercentage = (matchingSigns.length / basisSigns.length) * 100;

        // CULL CRITERIA: 
        // - Missing Standing Reflex if it was historically required
        // - OR Overlap is less than 50% (Too many different signs)
        const isCompatible = (!historyHadStandingReflex || currentHasStandingReflex) && overlapPercentage >= 50;

        if (!isCompatible) {
          swine.current_status = "Culled/Sold"; // Match Swine.js enum
          await swine.save();

          await logAction(
            req.user.id,
            "AUTO_CULL",
            "BREEDING",
            `Swine ${swineId} auto-culled: Current signs (${parsedSigns.join(", ")}) failed compatibility check against history (${basisSigns.join(", ")}).`,
            req
          );

          return res.status(403).json({
            success: false,
            message: `Report rejected: Swine ${swineId} has been auto-culled. The current heat signs deviate significantly from its successful breeding history.`
          });
        }
      }

      // 6. Create the Heat Report
      const newReport = new HeatReport({
        swine_id: swine._id,
        farmer_id: farmer._id,
        manager_id: farmer.managerId,
        signs: parsedSigns,
        standing_reflex: parsedSigns.includes("Standing Reflex"),
        back_pressure_test: parsedSigns.includes("Back Pressure Test"),
        evidence_url: evidenceData,
        heat_probability: calculateProbability(parsedSigns, swine),
        remarks: cleanRemarks,

        status: "pending"
      });

      await newReport.save();

      // 7. Logging & Notifications
      await logAction(
        req.user.id,
        "ADD_HEAT_REPORT",
        "BREEDING",
        `Farmer ${farmer.first_name} submitted a heat report for Swine ${swineId}.`,
        req
      );

      await notifyBreedingTeam(
        farmer.managerId,
        null,
        "New Heat Report",
        `Farmer ${farmer.first_name} submitted a heat report for Swine ${swine.swine_id}.`
      );

      res.status(201).json({ success: true, report: newReport });
    } catch (err) {
      console.error("Error in /api/heat/add:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

/* ======================================================
    GET ROUTES
====================================================== */
router.get("/all", requireApiLogin, allowRoles("farm_manager", "encoder"), async (req, res) => {
  try {
    const managerId = req.user.role === "farm_manager" ? req.user.id : req.user.managerId;
    const reports = await HeatReport.find({ manager_id: managerId })
      .populate("swine_id", "swine_id breed current_status")
      .populate("farmer_id", "first_name last_name farmer_id user_id")
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, reports });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch reports" });
  }
});

router.get("/:id/detail", requireApiLogin, async (req, res) => {
  try {
    const report = await HeatReport.findById(req.params.id)
      .populate("swine_id")
      .populate("farmer_id")
      .populate("approved_by", "first_name last_name role")
      .populate("rejected_by", "first_name last_name role")
      .populate("ai_confirmed_by", "first_name last_name role")
      .populate("pregnancy_confirmed_by", "first_name last_name role")
      .populate("farrowing_confirmed_by", "first_name last_name role")
      .populate("weaning_confirmed_by", "first_name last_name role")
      .populate("still_in_heat_by", "first_name last_name role")
      .lean();

    if (!report) {
      return res.status(404).json({ success: false, message: "Report not found" });
    }

    const aiRecord = await AIRecord.findOne({ heat_report_id: report._id }).lean();

    res.json({
      success: true,
      report: {
        ...report,
        ai_record: aiRecord || null
      }
    });
  } catch (err) {
    console.error("Error fetching report detail:", err);
    res.status(500).json({ success: false, message: "Error fetching report" });
  }
});

router.get("/farmer", requireApiLogin, allowRoles("farmer", "farm_manager", "encoder"), async (req, res) => {
  try {
    if (!req.user.farmerProfileId) return res.status(400).json({ success: false, message: "Farmer profile not linked" });
    const reports = await HeatReport.find({ farmer_id: req.user.farmerProfileId })
      .populate("swine_id", "swine_id breed current_status")
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, reports });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch reports" });
  }
});

/* ======================================================
    APPROVE HEAT REPORT (Updated with Time Warp & First Success Logic)
====================================================== */
router.post("/:id/approve", requireApiLogin, allowRoles("farm_manager"), async (req, res) => {
  try {
    const report = await HeatReport.findById(req.params.id).populate("swine_id").populate("farmer_id");
    if (!report) return res.status(404).json({ success: false, message: "Report not found" });

    const virtualNow = await timeHelper.getVirtualNow(); 
    
    // Calculate scheduled insemination based on virtual time
    const scheduledInsemination = new Date(virtualNow);
    scheduledInsemination.setDate(virtualNow.getDate() + 2);

    report.status = "approved";
    report.next_heat_check = null;
    report.expected_farrowing = null;
    report.still_in_heat_at = virtualNow;
    report.still_in_heat_by = req.user.id;
    report.still_in_heat_reason = "Returned to heat / pregnancy failed";
    report.updatedAt = virtualNow;
    await report.save();

    const swine = await Swine.findById(report.swine_id);
    const nextCycleNumber = (swine.breeding_cycles?.length || 0) + 1;

    // Logic to check if current signs match the established "First Success Basis"
    const hasBasis = swine.first_success_basis && swine.first_success_basis.signs.length > 0;
    const matchesBasis = hasBasis ? report.signs.every((sign) => swine.first_success_basis.signs.includes(sign)) : false;

    await Swine.findByIdAndUpdate(report.swine_id, {
      current_status: "In-Heat",
      $push: {
        breeding_cycles: {
          cycle_number: nextCycleNumber,
          heat_report_id: report._id,
          estrus_date: report.approved_at,
          observed_signs: report.signs,
          is_pregnant: false
        }
      }
    });

    await logAction(req.user.id, "APPROVE_HEAT_REPORT", "BREEDING", `Approved heat for Swine ${swine.swine_id}.`, req);

    let matchNote = hasBasis ? (matchesBasis ? " (Matches First Success Profile)" : " (Varies from First Success Profile)") : "";

    await notifyBreedingTeam(
      req.user.id,
      report.farmer_id.user_id,
      "Heat Approved",
      `Swine ${swine.swine_id} is approved for AI on ${scheduledInsemination.toLocaleDateString()}.${matchNote}`,
      "success"
    );

    res.json({ success: true, message: "Report approved and cycle signs recorded." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ======================================================
    CONFIRM AI (With Time Warp & Double-Entry Protection)
====================================================== */
router.post("/:id/confirm-ai", requireApiLogin, allowRoles("farm_manager"), async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { maleSwineId, ai_date } = req.body; 
    if (!maleSwineId) throw new Error("Male Swine ID is required.");

    const report = await HeatReport.findById(req.params.id).populate("swine_id").populate("farmer_id");
    if (!report) throw new Error("Report not found");

    // Ensures an AI record isn't already linked to this specific heat report
    const existingAI = await AIRecord.findOne({ heat_report_id: report._id });
    if (existingAI) {
      throw new Error("An AI record has already been submitted for this heat report.");
    }

    const virtualNow = await timeHelper.getVirtualNow();
    
    // If ai_date is provided by user, use it; otherwise, use the Virtual "Today"
    const finalAiDate = ai_date ? new Date(ai_date) : virtualNow;
    
    // Use actual system time for the administrative confirmation timestamp (Audit trail)
    const actualConfirmationTime = new Date();

    const newAIRecord = new AIRecord({
      insemination_id: `AI-${Date.now()}`,
      swine_id: report.swine_id._id,
      swine_code: report.swine_id.swine_id,
      male_swine_id: maleSwineId,
      manager_id: req.user.id,
      farmer_id: report.farmer_id._id,
      heat_report_id: report._id,
      
      // Data-driven fields for your updated model
      insemination_date: finalAiDate,
      ai_confirmed: true,
      ai_confirmed_at: actualConfirmationTime, 
      status: "Ongoing"
    });
    await newAIRecord.save({ session });

    // Update Heat Report status and anchor dates
    report.status = "under_observation";
    report.ai_confirmed_at = finalAiDate;
    report.ai_confirmed_by = req.user.id;

    // Calculate 23-day check based on the Warped date
    const heatCheckDate = new Date(finalAiDate);
    heatCheckDate.setDate(heatCheckDate.getDate() + 23);
    report.next_heat_check = heatCheckDate;
    await report.save({ session });

    // Update Swine lifecycle and breeding cycle history
    await Swine.updateOne(
      { _id: report.swine_id._id, "breeding_cycles.heat_report_id": report._id },
      {
        $set: {
          "breeding_cycles.$.ai_service_date": finalAiDate, 
          "breeding_cycles.$.ai_record_id": newAIRecord._id,
          "breeding_cycles.$.cycle_sire_id": maleSwineId,
          current_status: "Under Observation"
        }
      },
      { session }
    );

    // Logging the action with the warped date for clarity in audit logs
    await logAction(
      req.user.id, 
      "CONFIRM_AI", 
      "BREEDING", 
      `AI Confirmed for Swine ${report.swine_id.swine_id} on ${finalAiDate.toDateString()}.`, 
      req
    );
    
    // Notify the team including the recorded date to verify the Time Warp was successful
    await notifyBreedingTeam(
      req.user.id, 
      report.farmer_id.user_id, 
      "AI Confirmed", 
      `AI completed for Swine ${report.swine_id.swine_id} (Recorded Date: ${finalAiDate.toLocaleDateString()}). Now under observation.`, 
      "info"
    );

    await session.commitTransaction();
    res.json({ 
      success: true, 
      message: `AI Record created for ${finalAiDate.toLocaleDateString()}.` 
    });
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    console.error("AI Confirmation Error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    session.endSession();
  }
});

/* ======================================================
    CONFIRM PREGNANCY (REFINED LOGIC & DATA CONSISTENCY)
====================================================== */
router.post("/:id/confirm-pregnancy", requireApiLogin, allowRoles("farmer", "farm_manager"), async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { check_date } = req.body; // Supports Time Warp for the check-up date
    const report = await HeatReport.findById(req.params.id).populate("swine_id").populate("farmer_id");
    
    if (!report) {
      return res.status(404).json({ success: false, message: "Report not found" });
    }

    // Use your timeHelper utility
    const virtualNow = await timeHelper.getVirtualNow();

    // 1. Use manual check date or default to the Virtual Now (2026)
    const confirmationDate = check_date ? new Date(check_date) : virtualNow;

    // 2. UPDATED CALCULATION: Farrowing starts at the date when the pregnancy is confirmed
    // Instead of counting from report.ai_confirmed_at, it starts at confirmationDate
    const baseDate = confirmationDate; 
    const farrowingDate = new Date(baseDate);
    farrowingDate.setDate(farrowingDate.getDate() + 114); 

    // 3. Update Heat Report
    report.status = "pregnant";
    report.expected_farrowing = farrowingDate;
    report.pregnancy_confirmed_at = confirmationDate;
    report.pregnancy_confirmed_by = req.user.id;
    await report.save({ session });

    // 4. Update AIRecord with the new model fields
    await AIRecord.findOneAndUpdate(
      { heat_report_id: report._id }, 
      {
        pregnancy_confirmed: true,
        status: "Ongoing", 
        pregnancy_check_date: confirmationDate,
        farrowing_date: farrowingDate // Sets the anchor for the virtual calculation
      },
      { session }
    );

    // 5. Update Swine Lifecycle and the specific breeding cycle entry
    await Swine.updateOne(
      { _id: report.swine_id._id, "breeding_cycles.heat_report_id": report._id },
      {
        $set: {
          "breeding_cycles.$.is_pregnant": true,
          "breeding_cycles.$.pregnancy_check_date": confirmationDate,
          "breeding_cycles.$.expected_farrowing_date": farrowingDate,
          current_status: "Pregnant"
        }
      },
      { session }
    );

    // 6. Logging & Notifications
    await logAction(
      req.user.id, 
      "CONFIRM_PREGNANCY", 
      "BREEDING", 
      `Pregnancy confirmed for Swine ${report.swine_id.swine_id}. Expected farrowing (114 days from confirmation): ${farrowingDate.toDateString()}`, 
      req
    );

    await notifyBreedingTeam(
      report.manager_id,
      report.farmer_id.user_id,
      "Pregnancy Confirmed",
      `Swine ${report.swine_id.swine_id} is pregnant! Expected farrowing: ${farrowingDate.toLocaleDateString()}.`,
      "success"
    );

    await session.commitTransaction();
    res.json({ 
      success: true, 
      message: "Pregnancy confirmed and farrowing date scheduled.",
      expected_farrowing: report.expected_farrowing 
    });
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    console.error("Pregnancy Confirmation Error:", error);
    res.status(500).json({ success: false, message: "Error confirming pregnancy" });
  } finally {
    session.endSession();
  }
});

/* ======================================================
    UPGRADED CONFIRM FARROWING (CLEANED & OPTIMIZED)
====================================================== */
router.post("/:id/confirm-farrowing", requireApiLogin, allowRoles("farmer"), async (req, res) => {
// 1. Multi-click protection: Pre-check status before starting transaction
  const initialCheck = await HeatReport.findById(req.params.id).select("status");
  if (initialCheck && initialCheck.status === "lactating") {
    return res.status(400).json({ success: false, message: "Farrowing already registered for this report." });
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const {
      total_live,
      mortality,
      farrowing_date,
      alive_male,
      alive_female,
      dead_male,
      dead_female
    } = req.body;
        
    // UPDATE: Removed farrowing_date from the strict null check.
    // If it's missing or null, the logic below will apply the Virtual Date.
    const aliveMaleNum = Number(alive_male || 0);
    const aliveFemaleNum = Number(alive_female || 0);
    const deadMaleNum = Number(dead_male || 0);
    const deadFemaleNum = Number(dead_female || 0);

    const totalLiveNum = Number(
      total_live != null ? total_live : aliveMaleNum + aliveFemaleNum
    );

    const mortalityNum = Number(
      mortality != null ? mortality : deadMaleNum + deadFemaleNum
    );

    if (Number.isNaN(totalLiveNum) || totalLiveNum < 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid alive piglet count."
      });
    }

    if (Number.isNaN(mortalityNum) || mortalityNum < 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid mortality count."
      });
    }

    const report = await HeatReport.findById(req.params.id).populate("swine_id").populate("farmer_id");
    if (!report) return res.status(404).json({ success: false, message: "Report not found" });

    // Get the virtual "Today"
    const virtualNow = await timeHelper.getVirtualNow();
    
    // SMART DATE LOGIC:
    // 1. If date is null/empty -> Use Virtual Now.
    // 2. If date matches real-world 'today' -> User probably didn't change the default input, use Virtual Now.
    // 3. Otherwise -> Use the manually selected date.
    const realTodayStr = new Date().toISOString().split('T')[0];
    const inputDateStr = farrowing_date ? new Date(farrowing_date).toISOString().split('T')[0] : null;

    let farrowDate;
    if (!farrowing_date || inputDateStr === realTodayStr) {
      farrowDate = virtualNow;
    } else {
      farrowDate = new Date(farrowing_date); // Use manual user choice
    }
    
    const sow = await Swine.findById(report.swine_id._id);
    const aiRecord = await AIRecord.findOne({ heat_report_id: report._id });
    const sire_id = aiRecord ? aiRecord.male_swine_id : "Unknown Boar";

    // 2. Update Heat Report Status
    report.status = "lactating";
    report.actual_farrowing_date = farrowDate;
    report.farrowing_confirmed_by = req.user.id;
    await report.save({ session });

    // 3. Update AI Record Status
    if (aiRecord) {
      aiRecord.status = "Success";
      aiRecord.farrowing_date = farrowDate;
      await aiRecord.save({ session });
    }

    // 4. Update Sow (Dam) Status, Parity, and Breeding Cycle
    const currentParity = (sow.parity || 0) + 1;
    await Swine.updateOne(
      { _id: sow._id, "breeding_cycles.heat_report_id": report._id },
      {
        $set: {
          "breeding_cycles.$.is_pregnant": false,
          "breeding_cycles.$.farrowed": true,
          "breeding_cycles.$.actual_farrowing_date": farrowDate,
          "breeding_cycles.$.farrowing_results": {
            total_piglets: totalLiveNum + mortalityNum,
            live_piglets: totalLiveNum,
            alive_male: aliveMaleNum,
            alive_female: aliveFemaleNum,
            dead_male: deadMaleNum,
            dead_female: deadFemaleNum
          },
          current_status: "Lactating"
        },
        $inc: { parity: 1 }
      },
      { session }
    );

    // 5. Auto-Register Piglets
    const liveCount = totalLiveNum;
    const pigletsToInsert = [];
    const generatedIds = [];

    // Formatted date string for consistent ID generation (YYYYMMDD) using the determined farrowDate
    const dateStr = `${farrowDate.getFullYear()}${String(farrowDate.getMonth() + 1).padStart(2, '0')}${String(farrowDate.getDate()).padStart(2, '0')}`;

    for (let i = 1; i <= liveCount; i++) {
      const pigletId = `PIG-${sow.swine_id}-${dateStr}-${i}`;
      generatedIds.push(pigletId);

      pigletsToInsert.push({
        swine_id: pigletId,
        registered_by: req.user.id,
        farmer_id: report.farmer_id._id,
        manager_id: report.manager_id,
        sex: i % 2 === 0 ? "Female" : "Male",
        breed: sow.breed,
        birth_date: farrowDate, // AGE SYNC: Age is calculated from the warped farrowDate
        sire_id: sire_id,
        dam_id: sow.swine_id,
        birth_cycle_number: currentParity,
        current_status: "Monitoring (Day 1-30)",
        age_stage: "piglet",
        performance_records: [
          {
            stage: "Registration",
            record_date: farrowDate, // DATE SYNC: Record is stamped in 2026
            remarks: "Auto-registered from farrowing report",
            recorded_by: req.user.id
          }
        ]
      });
    }

    // FEATURE: Duplicate Swine ID check
    const existingSwine = await Swine.find({
      swine_id: { $in: generatedIds }
    }).select("swine_id");

    if (existingSwine.length > 0) {
      const duplicateIds = existingSwine.map((s) => s.swine_id);
      throw new Error(
        `Duplicate Swine IDs detected: ${duplicateIds.join(", ")}. Farrowing may have already been recorded.`
      );
    }

    if (pigletsToInsert.length > 0) {
      await Swine.insertMany(pigletsToInsert, { session });
    }

    // 6. Logging and Notifications
    await logAction(
      req.user.id,
      "CONFIRM_FARROWING",
      "BREEDING",
      `Farrowing confirmed for Swine ${sow.swine_id}. ${liveCount} piglets added.`,
      req
    );

    await Notification.create({
      user_id: report.farmer_id.user_id,
      title: "Farrowing Confirmed",
      message: `Swine ${sow.swine_id} has farrowed ${liveCount} live piglets on ${farrowDate.toLocaleDateString()}.`,
      type: "success"
    });

    await session.commitTransaction();
    res.json({ success: true, message: `Farrowing confirmed. ${liveCount} piglets registered.` });
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    console.error("Farrowing Error:", err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    session.endSession();
  }
});

/* ======================================================
    STILL IN HEAT (Cycle Reset)
====================================================== */
router.post("/:id/still-heat", requireApiLogin, allowRoles("farmer", "farm_manager"), async (req, res) => {
  try {
    const report = await HeatReport.findById(req.params.id).populate("swine_id").populate("farmer_id");
    if (!report) return res.status(404).json({ success: false, message: "Report not found" });

    // Get virtual time for consistent status logging
    const virtualNow = await timeHelper.getVirtualNow();

    report.status = "approved";
    report.next_heat_check = null;
    report.expected_farrowing = null;
    report.still_in_heat_at = virtualNow;
    report.still_in_heat_by = req.user.id;
    report.still_in_heat_reason = "Returned to heat / pregnancy failed";
    report.updatedAt = virtualNow;
    await report.save();

    await AIRecord.findOneAndUpdate({ heat_report_id: report._id, status: "Ongoing" }, {
      still_in_heat: true,
      status: "Failed",
      // Record exactly when the failure was noted in the warp timeline
      failed_at: virtualNow 
    });

    await Swine.findByIdAndUpdate(report.swine_id._id, { 
        current_status: "In-Heat",
        last_updated: virtualNow 
    });

    await logAction(
        req.user.id, 
        "STILL_IN_HEAT", 
        "BREEDING", 
        `Still In Heat for Swine ${report.swine_id.swine_id} recorded on ${virtualNow.toDateString()}.`, 
        req
    );

    await notifyBreedingTeam(
      report.manager_id,
      report.farmer_id.user_id,
      "Breeding Cycle Reset",
      `Swine ${report.swine_id.swine_id} is still in heat. Cycle reset as of ${virtualNow.toLocaleDateString()}.`,
      "warning"
    );

    res.json({ success: true, message: "Cycle reset." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ======================================================
    GET WEANING DATE & DAYS REMAINING (With Time Warp)
====================================================== */
router.get("/weaning-date/:reportId", async (req, res) => {
    try {
        const report = await HeatReport.findById(req.params.reportId);

        // UPDATED: Check for actual_farrowing_date to match your MongoDB document
        if (!report || !report.actual_farrowing_date) {
            return res.status(404).json({ 
                success: false, 
                message: "Farrowing date (actual_farrowing_date) not found in database" 
            });
        }

        // 2. Fetch the Virtual Time (Time Warp)
        const systemSettings = await SystemSettings.findOne();
        const virtualNow = (systemSettings && systemSettings.mockDate) 
                    ? new Date(systemSettings.mockDate) 
                    : new Date();

        // 3. Calculate Weaning Date (30 days after the actual farrowing)
        const farrowingDate = new Date(report.actual_farrowing_date);
        const weaningDate = new Date(farrowingDate);
        weaningDate.setDate(farrowingDate.getDate() + 30);

        // 4. Calculate Days Remaining relative to the WARPED date
        // Example: July 28 (Weaning) - June 28 (Virtual Now) = 30 Days
        const diffTime = weaningDate - virtualNow;
        const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        res.json({
            success: true,
            weaningDate: weaningDate.toISOString(),
            daysRemaining: daysRemaining, 
            virtualNow: virtualNow.toISOString() 
        });
    } catch (err) {
        console.error("Error in weaning-date route:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

/* ======================================================
    CONFIRM WEANING (Closing the Breeding Cycle)
====================================================== */
router.post("/:id/confirm-weaning", requireApiLogin, allowRoles("farmer", "farm_manager"), async (req, res) => {  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { weaning_date, remarks, weight } = req.body;
    const report = await HeatReport.findById(req.params.id).populate("swine_id").populate("farmer_id");

    if (!report) return res.status(404).json({ success: false, message: "Report not found" });
    
    // Safety check: Can only wean if the sow is currently lactating
    if (report.status !== "lactating") {
      return res.status(400).json({ success: false, message: "Report must be in 'lactating' status to confirm weaning." });
    }

    // Fetch the Virtual/Mock date from your utility
    const virtualNow = await timeHelper.getVirtualNow();

    // Default to virtualNow instead of new Date()
    const finalWeaningDate = weaning_date ? new Date(weaning_date) : virtualNow;
    const finalWeight = Number(weight) || 0;

    // 1. Update Heat Report Status to Completed
    report.status = "completed";
    report.weaning_date = finalWeaningDate;
    report.weaning_confirmed_by = req.user.id;
    await report.save({ session });

    // 2. UPDATE THE AI RECORD (Crucial for Time Portal & History)
    await AIRecord.findOneAndUpdate(
      { heat_report_id: report._id },
      {
        weaning_date: finalWeaningDate,
        weaning_weight: finalWeight,
        status: "Completed",
        remarks: remarks || "Standard weaning"
      },
      { session }
    );

    // 3. Update Sow Status back to "Open" for the next cycle
    await Swine.updateOne(
      { _id: report.swine_id._id, "breeding_cycles.heat_report_id": report._id },
      {
        $set: {
          "breeding_cycles.$.weaning_date": finalWeaningDate,
          "breeding_cycles.$.weaning_remarks": remarks || "Standard weaning",
          "breeding_cycles.$.weaning_weight": finalWeight,
          current_status: "Open" 
        }
      },
      { session }
    );

    const sow = await Swine.findById(report.swine_id._id);

    // 4. Update Offspring (Piglets) status and age stage based on Swine.js Schema
    await Swine.updateMany(
      { 
        dam_id: sow.swine_id, 
        birth_cycle_number: sow.parity,
        age_stage: "piglet" 
      },
      { 
        $set: { 
          current_status: "Weaning", 
        },
        $push: {
          performance_records: {
            stage: "Weaning",
            record_date: finalWeaningDate,
            weight: finalWeight,
            remarks: remarks || "Auto-updated during weaning confirmation",
            recorded_by: req.user.id
          }
        }
      },
      { session }
    );

    // 5. Logging and Notifications
    await logAction(
      req.user.id,
      "CONFIRM_WEANING",
      "BREEDING",
      `Weaning confirmed for Swine ${sow.swine_id} on ${finalWeaningDate.toDateString()}. Weight: ${finalWeight}kg recorded.`,
      req
    );

    await notifyBreedingTeam(
      report.manager_id,
      report.farmer_id.user_id,
      "Weaning Completed",
      `Swine ${sow.swine_id} has been weaned (Recorded Date: ${finalWeaningDate.toLocaleDateString()}). She is now back in the 'Open' pool.`,
      "info"
    );

    await session.commitTransaction();
    res.json({ success: true, message: "Weaning confirmed. Sow is now Open and piglets moved to Growing stage." });
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    console.error("Weaning Error:", err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    session.endSession();
  }
});

/* ======================================================
    CALENDAR EVENTS – LIFECYCLE & HEAT WINDOWS (Warp Aware)
====================================================== */
router.get(
  "/calendar-events",
  requireApiLogin,
  allowRoles("farm_manager", "encoder", "farmer"),
  async (req, res) => {
    try {
      const user = req.user;
      let query = {};

      if (user.role === "farmer") {
        if (!user.farmerProfileId) {
          return res.status(400).json({
            success: false,
            message: "Farmer profile not linked"
          });
        }
        query.farmer_id = user.farmerProfileId;
      } else {
        query.manager_id = user.role === "farm_manager" ? user.id : user.managerId;
      }

      // TIME WARP: Get the virtual "Today" from your helper
      const virtualNow = await timeHelper.getVirtualNow();

      const reports = await HeatReport.find(query).populate("swine_id", "swine_id").lean();

      const openSwine = await Swine.find({
        ...query,
        current_status: "Open",
        sex: "Female"
      }).lean();

      const events = [];

      reports.forEach((r) => {
        const swineCode = r.swine_id?.swine_id || "Unknown";

        // 1. AI DUE
        if (r.status === "approved" && r.next_heat_check) {
          events.push({
            id: `${r._id}-ai-due`,
            title: `AI Due – ${swineCode}`,
            start: r.next_heat_check.toISOString().split("T")[0],
            allDay: true,
            extendedProps: {
              status: "in-heat",
              type: "ai_due",
              reportId: r._id
            }
          });
        }

        // 2. PREGNANCY CHECK
        if (r.status === "under_observation" && r.next_heat_check) {
          events.push({
            id: `${r._id}-preg-check`,
            title: `Pregnancy Check – ${swineCode}`,
            start: r.next_heat_check.toISOString().split("T")[0],
            allDay: true,
            extendedProps: {
              status: "under observation",
              type: "pregnancy_check",
              reportId: r._id
            }
          });
        }

        // 3. EXPECTED FARROWING
        if (r.status === "pregnant" && r.expected_farrowing) {
          events.push({
            id: `${r._id}-expected-farrow`,
            title: `Expected Farrowing – ${swineCode}`,
            start: r.expected_farrowing.toISOString().split("T")[0],
            allDay: true,
            extendedProps: {
              status: "pregnant",
              type: "expected_farrowing",
              reportId: r._id
            }
          });
        }

        // 4. ACTUAL FARROWING (LACTATING)
        if (r.status === "lactating" && r.actual_farrowing_date) {
          events.push({
            id: `${r._id}-actual-farrow`,
            title: `Farrowed – ${swineCode}`,
            start: r.actual_farrowing_date.toISOString().split("T")[0],
            allDay: true,
            extendedProps: {
              status: "farrowing",
              type: "actual_farrowing",
              reportId: r._id
            }
          });
        }

        // 5. WEANING DUE CALCULATION
        const farrowDate = r.actual_farrowing_date || r.expected_farrowing;
        if (r.status === "lactating" && farrowDate) {
          const weaningDate = new Date(farrowDate);
          weaningDate.setDate(weaningDate.getDate() + 30);
          events.push({
            id: `${r._id}-weaning`,
            title: `Weaning Due – ${swineCode}`,
            start: weaningDate.toISOString().split("T")[0],
            allDay: true,
            extendedProps: {
              status: "lactating",
              type: "weaning_due",
              reportId: r._id
            }
          });
        }

        // 6. WEANED (COMPLETED)
        if (r.status === "completed" && r.weaning_date) {
          events.push({
            id: `${r._id}-weaned`,
            title: `Weaned – ${swineCode}`,
            start: r.weaning_date.toISOString().split("T")[0],
            allDay: true,
            extendedProps: {
              status: "completed",
              type: "weaning_completed",
              reportId: r._id
            }
          });
        }
      });

      // 7. HEAT DETECTION WINDOWS (OPEN SWINE)
      openSwine.forEach((s) => {
        const lastCycle =
          s.breeding_cycles && s.breeding_cycles.length > 0 ? s.breeding_cycles[s.breeding_cycles.length - 1] : null;

        if (lastCycle && lastCycle.weaning_date) {
          const startWindow = new Date(lastCycle.weaning_date);
          const cullDeadline = new Date(lastCycle.weaning_date);
          cullDeadline.setDate(cullDeadline.getDate() + 7);

          events.push({
            id: `${s._id}-heat-detect-window`,
            title: `Heat Detection Window – ${s.swine_id}`,
            start: startWindow.toISOString().split("T")[0],
            end: cullDeadline.toISOString().split("T")[0],
            display: "background",
            color: "#fff3cd",
            extendedProps: {
              type: "heat_window_range",
              swineId: s._id
            }
          });

          events.push({
            id: `${s._id}-cull-warning`,
            title: `CRITICAL: Heat Report Due – ${s.swine_id}`,
            start: cullDeadline.toISOString().split("T")[0],
            allDay: true,
            backgroundColor: "#dc3545",
            borderColor: "#bd2130",
            extendedProps: {
              type: "cull_deadline",
              swineId: s._id,
              status: "Open"
            }
          });
        }
      });

      res.json({ 
        success: true, 
        events,
        virtualNow: virtualNow.toISOString() 
      });
    } catch (err) {
      console.error("Calendar Error:", err);
      res.status(500).json({
        success: false,
        message: "Failed to fetch calendar"
      });
    }
  }
);

/* ======================================================
    REJECT HEAT REPORT
====================================================== */
router.post("/:id/reject", requireApiLogin, allowRoles("farm_manager"), async (req, res) => {
  try {
    const { reason } = req.body;
    
    // Populate swine_id and farmer_id to get the tag and the user reference for notification
    const report = await HeatReport.findById(req.params.id)
      .populate("swine_id")
      .populate("farmer_id");

    if (!report) {
      return res.status(404).json({ success: false, message: "Report not found" });
    }

    const virtualNow = await timeHelper.getVirtualNow();

    // Update Report Status
    report.status = "rejected";
    report.rejection_message = reason || "No reason provided";
    report.rejected_at = virtualNow;
    report.rejected_by = req.user.id;
    await report.save();

    // Log the action for audit purposes
    await logAction(
      req.user.id, 
      "REJECT_HEAT_REPORT", 
      "BREEDING", 
      `Rejected heat report for Swine ${report.swine_id.swine_id} on ${virtualNow.toDateString()}.`, 
      req
    );

    // NOTIFICATION: Notify the farmer immediately
    await Notification.create({
      user_id: report.farmer_id.user_id,
      title: "Heat Report Rejected ❌",
      message: `Your heat report for Swine ${report.swine_id.swine_id} was rejected. Reason: ${reason}`,
      type: "danger", // Red alert in UI
      createdAt: virtualNow
    });

    res.json({ 
      success: true, 
      message: "Report rejected and farmer notified.",
      rejectedAt: virtualNow 
    });

  } catch (err) {  
    console.error("Error in Reject Heat Report:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;