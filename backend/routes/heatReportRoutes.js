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
const supabase = require("../utils/supabase");

const { requireApiLogin } = require("../middleware/pageAuth.middleware");
const { allowRoles } = require("../middleware/roleMiddleware");

/* ======================================================
    HELPERS
====================================================== */
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { 
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|webp/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error("Error: Only images (jpeg, jpg, png, webp) are allowed!"));
  }
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

function formatActorName(user) {
  if (!user) return "Unknown User";

  const first = user.first_name || "";
  const last = user.last_name || "";
  const full = `${first} ${last}`.trim();

  return (
    full ||
    user.name ||
    user.full_name ||
    user.display_name ||
    user.email ||
    "Unknown User"
  );
}

function formatActorRole(user) {
  return String(user?.role || "unknown").replace(/_/g, " ");
}

function pushProgressHistory(report, {
  eventKey = "",
  title = "",
  description = "",
  fromStatus = "",
  toStatus = "",
  actor = null,
  actionAt = new Date(),
  meta = {}
} = {}) {
  if (!report.progress_history) report.progress_history = [];

  report.progress_history.push({
    event_key: eventKey,
    title,
    description,
    from_status: fromStatus || report.status || "",
    to_status: toStatus || report.status || "",
    actor_id: actor?._id || actor?.id || null,
    actor_name: formatActorName(actor),
    actor_role: formatActorRole(actor),
    action_at: actionAt,
    meta
  });
}

function ensureSubmittedHistory(report, actor = null) {
  if (!report.progress_history) report.progress_history = [];

  const hasSubmitted = report.progress_history.some(
    (item) => String(item?.event_key || "").toLowerCase() === "report_submitted"
  );

  if (hasSubmitted) return;

  pushProgressHistory(report, {
    eventKey: "report_submitted",
    title: "Report Submitted",
    description: `Heat report submitted for sow ${report.swine_id?.swine_id || ""}.`,
    fromStatus: "",
    toStatus: "pending",
    actor: actor || {
      _id: report.farmer_id?._id || report.farmer_id || null,
      first_name: report.farmer_id?.first_name || "",
      last_name: report.farmer_id?.last_name || "",
      role: "farmer"
    },
    actionAt: report.createdAt || new Date(),
    meta: {
      swine_code: report.swine_id?.swine_id || "",
      signs: Array.isArray(report.signs) ? report.signs : [],
      heat_probability: report.heat_probability ?? null
    }
  });
}

/* ======================================================
    ADD NEW HEAT REPORT (With Culling, Supabase & Reheat Check)
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

      // Sanitize remarks
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

      // NEW: REHEAT COUNTER CHECK
      // If the swine has already failed multiple times, we notify the manager
      // so they can decide whether to proceed or consider culling.
      if (swine.reheat_count >= 3) {
        await notifyBreedingTeam(
          farmer.managerId,
          null,
          "⚠️ Repeat Breeder Alert",
          `Swine ${swine.swine_id} has reached ${swine.reheat_count} reheat cycles. Management review suggested.`
        );
      }

      // --- SUPABASE CLOUD UPLOAD START ---
      const evidenceData = [];
      for (const file of files) {
        const fileName = `${Date.now()}-${file.originalname}`;
        const filePath = `evidence/${swineId}/${fileName}`;

        const { data, error } = await supabase.storage
          .from('heat-report-evidence')
          .upload(filePath, file.buffer, {
            contentType: file.mimetype,
            upsert: false
          });

        if (error) {
          console.error("Supabase Upload Error:", error);
          throw new Error("Failed to upload images to cloud storage.");
        }
        
        evidenceData.push(data.path);
      }
      // --- SUPABASE CLOUD UPLOAD END ---

      // 5. --- CULLING CHECK (Auto-Cull Feature) ---
      const hasBasis =
        swine.first_success_basis && 
        swine.first_success_basis.signs && 
        swine.first_success_basis.signs.length > 0;

      if (hasBasis) {
        const basisSigns = swine.first_success_basis.signs;
        
        const historyHadStandingReflex = basisSigns.includes("Standing Reflex");
        const currentHasStandingReflex = parsedSigns.includes("Standing Reflex");
        
        const matchingSigns = basisSigns.filter(sign => parsedSigns.includes(sign));
        const overlapPercentage = (matchingSigns.length / basisSigns.length) * 100;

        const isCompatible = (!historyHadStandingReflex || currentHasStandingReflex) && overlapPercentage >= 50;

        if (!isCompatible) {
          swine.current_status = "Culled/Sold"; 
          await swine.save();

          await logAction(
            req.user.id,
            "AUTO_CULL",
            "BREEDING",
            `Swine ${swineId} auto-culled: Current signs (${parsedSigns.join(", ")}) failed compatibility check.`,
            req
          );

          return res.status(403).json({
            success: false,
            message: `Report rejected: Swine ${swineId} has been auto-culled due to deviation from history.`
          });
        }
      }

      // 6. Create the Heat Report
      const computedProbability = calculateProbability(parsedSigns, swine);

      const newReport = new HeatReport({
        swine_id: swine._id,
        farmer_id: farmer._id,
        manager_id: farmer.managerId,
        signs: parsedSigns,
        standing_reflex: parsedSigns.includes("Standing Reflex"),
        back_pressure_test: parsedSigns.includes("Back Pressure Test"),
        evidence_url: evidenceData,
        heat_probability: computedProbability,
        remarks: cleanRemarks,
        status: "pending",
        progress_history: [
          {
            event_key: "report_submitted",
            title: "Report Submitted",
            description: `Heat report submitted for sow ${swine.swine_id}.`,
            from_status: "",
            to_status: "pending",
            actor_id: req.user.id,
            actor_name: req.user.name || `${farmer.first_name} ${farmer.last_name}`.trim(),
            actor_role: req.user.role || "farmer",
            action_at: new Date(),
            meta: {
              swine_code: swine.swine_id,
              signs: parsedSigns,
              heat_probability: computedProbability,
              reheat_cycle: swine.reheat_count // Log the cycle number in history
            }
          }
        ]
      });

      await newReport.save();

      // 7. Logging & Notifications
      await logAction(
        req.user.id,
        "ADD_HEAT_REPORT",
        "BREEDING",
        `Farmer ${farmer.first_name} submitted a heat report for Swine ${swineId}. Cycle: ${swine.reheat_count}`,
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
    GET ROUTES (Updated for Supabase Signed URLs)
====================================================== */

/**
 * HELPER: Converts an array of Supabase paths into temporary Signed URLs.
 * This is necessary because your bucket is PRIVATE.
 */
const generateEvidenceLinks = async (evidencePaths) => {
  if (!evidencePaths || !Array.isArray(evidencePaths) || evidencePaths.length === 0) {
    return [];
  }

  const links = await Promise.all(
    evidencePaths.map(async (path) => {
      try {
        const { data, error } = await supabase.storage
          .from('heat-report-evidence')
          .createSignedUrl(path, 3600); // URL valid for 1 hour

        if (error) throw error;
        return data.signedUrl;
      } catch (err) {
        console.error("Error signing URL for path:", path, err.message);
        return null; // Skip broken paths
      }
    })
  );

  return links.filter(url => url !== null);
};

// 1. GET ALL REPORTS (For Managers/Encoders)
router.get("/all", requireApiLogin, allowRoles("farm_manager", "encoder"), async (req, res) => {
  try {
    const managerId = req.user.role === "farm_manager" ? req.user.id : req.user.managerId;
    const reports = await HeatReport.find({ manager_id: managerId })
      .populate("swine_id", "swine_id breed current_status reheat_count breeding_cycles")
      .populate("farmer_id", "first_name last_name farmer_id user_id")
      .sort({ createdAt: -1 })
      .lean();

    // Generate links for each report in the list
    const reportsWithLinks = await Promise.all(
      reports.map(async (report) => ({
        ...report,
        evidence_url: await generateEvidenceLinks(report.evidence_url)
      }))
    );

    res.json({ success: true, reports: reportsWithLinks });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch reports" });
  }
});

// 2. GET REPORT DETAIL (Individual View)
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

    // Convert private paths to viewable links
    const signedLinks = await generateEvidenceLinks(report.evidence_url);

    res.json({
      success: true,
      report: {
        ...report,
        evidence_url: signedLinks, // Replace paths with temporary links
        ai_record: aiRecord || null
      }
    });
  } catch (err) {
    console.error("Error fetching report detail:", err);
    res.status(500).json({ success: false, message: "Error fetching report" });
  }
});

// 3. GET FARMER'S REPORTS
router.get("/farmer", requireApiLogin, allowRoles("farmer", "farm_manager", "encoder"), async (req, res) => {
  try {
    if (!req.user.farmerProfileId) return res.status(400).json({ success: false, message: "Farmer profile not linked" });
    
    const reports = await HeatReport.find({ farmer_id: req.user.farmerProfileId })
      .populate("swine_id", "swine_id breed current_status")
      .sort({ createdAt: -1 })
      .lean();

    // Generate links for the farmer's list
    const reportsWithLinks = await Promise.all(
      reports.map(async (report) => ({
        ...report,
        evidence_url: await generateEvidenceLinks(report.evidence_url)
      }))
    );

    res.json({ success: true, reports: reportsWithLinks });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch reports" });
  }
});

/* ======================================================
   GET RE-HEAT MONITOR DATA
====================================================== */
router.get(
  "/reheat-monitor",
  requireApiLogin,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const managerId =
        req.user.role === "farm_manager"
          ? req.user.id
          : req.user.managerId;

      // Logic: find reports that are STILL IN HEAT / NEED RECHECK
      const reports = await HeatReport.find({
        manager_id: managerId,
        status: "approved", // only approved cycles
      })
        .populate("swine_id", "swine_id breed current_status reheat_count breeding_cycles")
        .populate("farmer_id", "first_name last_name")
        .sort({ createdAt: -1 })
        .lean();

      // ✅ FILTER ONLY TRUE REHEATS
      const filtered = reports.filter(r => {
        return (r.swine_id?.reheat_count || 0) > 0;
      });

    
      res.json({
        success: true,
        data: filtered
      });
    } catch (err) {
      console.error("Reheat fetch error:", err);
      res.status(500).json({
        success: false,
        message: "Failed to fetch reheat data"
      });
    }
  }
);

/* ======================================================
    APPROVE HEAT REPORT (Updated with Reheat Counter)
====================================================== */
router.post("/:id/approve", requireApiLogin, allowRoles("farm_manager"), async (req, res) => {
  try {
    const report = await HeatReport.findById(req.params.id).populate("swine_id").populate("farmer_id");
    if (!report) return res.status(404).json({ success: false, message: "Report not found" });

    ensureSubmittedHistory(report);
    const previousStatus = report.status;

    const virtualNow = await timeHelper.getVirtualNow(); 
    
    // Calculate scheduled insemination based on virtual time (2 days window)
    const scheduledInsemination = new Date(virtualNow);
    scheduledInsemination.setDate(virtualNow.getDate() + 2);

    report.status = "approved";
    
    // ✅ FIX: Save the scheduled date to next_heat_check so the UI and Calendar can display it
    report.next_heat_check = scheduledInsemination; 
    
    report.expected_farrowing = null;
    report.approved_at = virtualNow;
    report.approved_by = req.user.id;

    pushProgressHistory(report, {
      eventKey: "report_approved",
      title: "Report Approved",
      description: `Heat report approved and sow scheduled for AI.`,
      fromStatus: previousStatus,
      toStatus: "approved",
      actor: req.user,
      actionAt: virtualNow,
      meta: {
        swine_code: report.swine_id?.swine_id || "",
        breeding_cycle_number: report.breeding_cycle_number || null
      }
    });

    report.updatedAt = virtualNow;
    await report.save();

    const swine = await Swine.findById(report.swine_id);
    const nextCycleNumber = (swine.breeding_cycles?.length || 0) + 1;

    // Logic to check if current signs match the established "First Success Basis"
    const hasBasis = swine.first_success_basis && swine.first_success_basis.signs.length > 0;
    const matchesBasis = hasBasis ? report.signs.every((sign) => swine.first_success_basis.signs.includes(sign)) : false;

    // ✅ UPDATED: Added $inc for reheat_count and cycle_reheat_count
    // ✅ CHECK if this is NOT the first cycle
    const isFirstCycle = (swine.breeding_cycles?.length || 0) === 0;

    await Swine.findByIdAndUpdate(report.swine_id, {
      current_status: "In-Heat",
      ...(isFirstCycle ? {} : { $inc: { reheat_count: 1 } }), // ✅ ONLY increment if NOT first cycle
      $push: {
        breeding_cycles: {
          cycle_number: nextCycleNumber,
          heat_report_id: report._id,
          estrus_date: report.approved_at,
          observed_signs: report.signs,
          is_pregnant: false,
          cycle_reheat_count: 1
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

    res.json({ 
      success: true, 
      message: "Report approved. AI scheduled for " + scheduledInsemination.toLocaleDateString() 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/heat-reports/
 * Fetches all active heat reports and calculates real-time statuses like 'Overheat'
 */
router.get("/", requireApiLogin, async (req, res) => {
  try {
    const virtualNow = await timeHelper.getNow();
    const managerId = req.user.managerId || req.user.id;

    // Fetch reports belonging to this manager/farm
    const reports = await HeatReport.find({ manager_id: managerId })
      .populate("swine_id") // Populations include the new reheat_count field from Swine.js
      .populate("farmer_id")
      .sort({ createdAt: -1 }) // Newest first
      .lean();

    // Map through reports to add dynamic "Overheat" flagging and Reheat Counter
    const formatted = reports.map(r => {
      const reportDate = new Date(r.createdAt);
      const hoursInHeat = Math.floor((virtualNow - reportDate) / (1000 * 60 * 60));
      
      return {
        ...r,
        // If 'in-heat' for > 72 hours (3 days), flag as overheat
        is_overheat: r.status === "in-heat" && hoursInHeat > 72,
        hours_active: hoursInHeat,

        // Pass the reheat count from the populated swine model to the frontend
        // This allows ui-actions.js to display it on the card
        reheat_count: r.swine_id?.reheat_count || 0
      };
    });

    res.json({ 
      success: true, 
      count: formatted.length, 
      data: formatted 
    });
  } catch (err) {
    console.error("Error fetching heat reports:", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

/* ======================================================
    MONITORING LOGIC (Combined Overdue & Overheat)
====================================================== */

router.get("/monitoring-stats", requireApiLogin, async (req, res) => {
  try {
    const virtualNow = await timeHelper.getNow();
    const managerId = req.user.managerId || req.user.id;

    // --- 1. LOGIC FOR OVERDUE HEAT (21+ Days) ---
    const potentialSows = await Swine.find({
      manager_id: managerId,
      sex: "Female",
      current_status: { $in: ["Open", "Monitoring (Day 1-30)", "Under Observation"] }
    }).lean();

    const overdueSows = potentialSows.filter(sow => {
      const referenceDate = sow.status_date || sow.updatedAt || sow.createdAt;
      const daysSince = Math.floor((virtualNow - new Date(referenceDate)) / (1000 * 60 * 60 * 24));
      return daysSince > 21; 
    });

    // --- 2. LOGIC FOR OVERHEAT (3+ Days / 72 Hours) ---
    const activeHeatReports = await HeatReport.find({
      status: "in-heat"
    }).populate("swine_id").lean();

    const overheatReports = activeHeatReports.filter(report => {
      const reportDate = new Date(report.createdAt);
      const hoursInHeat = Math.floor((virtualNow - reportDate) / (1000 * 60 * 60));
      return hoursInHeat > 72;
    });

    res.json({
      success: true,
      overdueCount: overdueSows.length,
      overheatCount: overheatReports.length,
      overdueData: overdueSows.map(s => ({
        id: s._id,
        swine_tag: s.swine_id,
        days_overdue: Math.floor((virtualNow - new Date(s.status_date || s.updatedAt)) / (1000 * 60 * 60 * 24)) - 21
      })),
      overheatData: overheatReports.map(r => ({
        reportId: r._id,
        swine_tag: r.swine_id?.swine_id,
        hoursActive: Math.floor((virtualNow - new Date(r.createdAt)) / (1000 * 60 * 60))
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ======================================================
    CONFIRM AI (With Time Warp & Updated Double-Entry Protection)
====================================================== */
router.post("/:id/confirm-ai", requireApiLogin, allowRoles("farm_manager"), async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { maleSwineId, ai_date } = req.body; 
    if (!maleSwineId) throw new Error("Male Swine ID is required.");

    const report = await HeatReport.findById(req.params.id).populate("swine_id").populate("farmer_id");
    if (!report) throw new Error("Report not found");

    ensureSubmittedHistory(report);
    const previousStatus = report.status;

    // UPDATED PROTECTION: Only block if there is an active 'Ongoing' AI record.
    // This allows a new AI record to be created if the previous one was marked 'Failed' via the Still-in-Heat route.
    const ongoingAI = await AIRecord.findOne({ 
      heat_report_id: report._id, 
      status: "Ongoing" 
    });
    
    if (ongoingAI) {
      throw new Error("An active AI record is already ongoing for this heat report.");
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

    pushProgressHistory(report, {
      eventKey: "ai_confirmed",
      title: "Artificial Insemination Confirmed",
      description: `AI procedure recorded for sow ${report.swine_id?.swine_id || ""}.`,
      fromStatus: previousStatus,
      toStatus: "under_observation",
      actor: req.user,
      actionAt: finalAiDate,
      meta: {
        swine_code: report.swine_id?.swine_id || "",
        male_swine_id: maleSwineId,
        ai_date: finalAiDate
      }
    });

    await report.save({ session });

    // Update Swine lifecycle and breeding cycle history with the NEW AI record ID
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

    ensureSubmittedHistory(report);
    const previousStatus = report.status;

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

    pushProgressHistory(report, {
      eventKey: "pregnancy_confirmed",
      title: "Pregnancy Confirmed",
      description: `Pregnancy confirmed for sow ${report.swine_id?.swine_id || ""}.`,
      fromStatus: previousStatus,
      toStatus: "pregnant",
      actor: req.user,
      actionAt: confirmationDate,
      meta: {
        swine_code: report.swine_id?.swine_id || "",
        expected_farrowing: farrowingDate
      }
    });

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
    UPGRADED CONFIRM FARROWING (GLOBAL ID POOL)
====================================================== */
router.post("/:id/confirm-farrowing", requireApiLogin, allowRoles("farmer"), async (req, res) => {
  const initialCheck = await HeatReport.findById(req.params.id).select("status");
  if (initialCheck && initialCheck.status === "lactating") {
    return res.status(400).json({ 
      success: false, 
      message: "Farrowing already registered for this report." 
    });
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
        
    const aliveMaleNum = Number(alive_male || 0);
    const aliveFemaleNum = Number(alive_female || 0);
    const deadMaleNum = Number(dead_male || 0);
    const deadFemaleNum = Number(dead_female || 0);

    const totalLiveNum = Number(total_live != null ? total_live : aliveMaleNum + aliveFemaleNum);
    const mortalityNum = Number(mortality != null ? mortality : deadMaleNum + deadFemaleNum);

    if (Number.isNaN(totalLiveNum) || totalLiveNum < 0 || Number.isNaN(mortalityNum) || mortalityNum < 0) {
      return res.status(400).json({ success: false, message: "Invalid piglet counts." });
    }

    const report = await HeatReport.findById(req.params.id).populate("swine_id").populate("farmer_id");
    if (!report) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: "Report not found" });
    }

    if (typeof ensureSubmittedHistory === 'function') ensureSubmittedHistory(report);
    const previousStatus = report.status;
    const virtualNow = await timeHelper.getVirtualNow();
    
    const realTodayStr = new Date().toISOString().split('T')[0];
    const inputDateStr = farrowing_date ? new Date(farrowing_date).toISOString().split('T')[0] : null;
    let farrowDate = (!farrowing_date || inputDateStr === realTodayStr) ? virtualNow : new Date(farrowing_date);
    
    const sow = await Swine.findById(report.swine_id._id);
    const aiRecord = await AIRecord.findOne({ heat_report_id: report._id });
    const sire_id = aiRecord ? aiRecord.male_swine_id : "Unknown Boar";

    // --- GLOBAL INCREMENTAL ID GENERATION ---
    const idParts = sow.swine_id.split('-');
    const prefix = idParts.length > 1 ? idParts[0] : "PIG";

    // Find ALL swine with this prefix across ALL managers to find the absolute max
    const allSwineWithPrefix = await Swine.find({ 
      swine_id: new RegExp(`^${prefix}-`) 
    }).session(session).select("swine_id").lean();

    let maxNumber = 0;
    allSwineWithPrefix.forEach(s => {
      const parts = s.swine_id.split('-');
      const num = parseInt(parts[parts.length - 1]);
      if (!isNaN(num) && num > maxNumber) maxNumber = num;
    });

    let nextIdToUse = maxNumber + 1;
    // -------------------------------------------

    report.status = "lactating";
    report.actual_farrowing_date = farrowDate;
    report.farrowing_confirmed_by = req.user.id;

    if (typeof pushProgressHistory === 'function') {
      pushProgressHistory(report, {
        eventKey: "farrowing_confirmed",
        title: "Farrowing Confirmed",
        description: `Farrowing recorded with ${totalLiveNum} live and ${mortalityNum} mortality.`,
        fromStatus: previousStatus,
        toStatus: "lactating",
        actor: req.user,
        actionAt: farrowDate,
        meta: { swine_code: sow.swine_id, total_live: totalLiveNum, mortality: mortalityNum }
      });
    }
    await report.save({ session });

    if (aiRecord) {
      aiRecord.status = "Success";
      aiRecord.farrowing_date = farrowDate;
      await aiRecord.save({ session });
    }

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
            male_count: aliveMaleNum,
            female_count: aliveFemaleNum,
            mortality_count: mortalityNum
          },
          current_status: "Lactating"
        },
        $inc: { parity: 1 }
      },
      { session }
    );

    const pigletsToInsert = [];
    const generatedIds = [];

    // --- REGISTER LIVE PIGLETS ---
    for (let i = 0; i < totalLiveNum; i++) {
      const pigletId = `${prefix}-${nextIdToUse}`;
      generatedIds.push(pigletId);
      let assignedSex = (i < aliveMaleNum) ? "Male" : "Female";

      pigletsToInsert.push({
        swine_id: pigletId,
        registered_by: req.user.id,
        farmer_id: report.farmer_id._id,
        manager_id: report.farmer_id.managerId || report.manager_id,
        sex: assignedSex,
        breed: sow.breed,
        birth_date: farrowDate,
        sire_id: sire_id,
        dam_id: sow.swine_id,
        birth_cycle_number: currentParity,
        current_status: "Monitoring (Day 1-30)",
        health_status: "Healthy",
        age_stage: "piglet",
        performance_records: [{
          stage: "Registration",
          record_date: farrowDate,
          remarks: "Auto-registered (Live) from farrowing report",
          recorded_by: req.user.id
        }]
      });
      nextIdToUse++;
    }

    // --- REGISTER DEAD PIGLETS ---
    for (let j = 0; j < mortalityNum; j++) {
      const pigletId = `${prefix}-${nextIdToUse}`;
      generatedIds.push(pigletId);
      let assignedSex = (j < deadMaleNum) ? "Male" : "Female";

      pigletsToInsert.push({
        swine_id: pigletId,
        registered_by: req.user.id,
        farmer_id: report.farmer_id._id,
        manager_id: report.farmer_id.managerId || report.manager_id,
        sex: assignedSex,
        breed: sow.breed,
        birth_date: farrowDate,
        sire_id: sire_id,
        dam_id: sow.swine_id,
        birth_cycle_number: currentParity,
        current_status: "To be Culled/Sold (Deformity)",
        health_status: "Deceased (Before Weaning)",
        age_stage: "piglet",
        performance_records: [{
          stage: "Registration",
          record_date: farrowDate,
          remarks: "Recorded as Stillborn during farrowing",
          recorded_by: req.user.id
        }]
      });
      nextIdToUse++;
    }

    // Double check that we aren't about to insert something already in the DB
    const collisionCheck = await Swine.countDocuments({ 
      swine_id: { $in: generatedIds } 
    }).session(session);

    if (collisionCheck > 0) {
      throw new Error("ID collision detected. This ID pool has been updated by another user. Please refresh and try again.");
    }

    if (pigletsToInsert.length > 0) {
      await Swine.insertMany(pigletsToInsert, { session });
    }

    await logAction(req.user.id, "CONFIRM_FARROWING", "BREEDING", `Farrowing confirmed for Swine ${sow.swine_id}.`, req);

    if (report.farmer_id && report.farmer_id.user_id) {
        await Notification.create([{
            user_id: report.farmer_id.user_id,
            title: "Farrowing Confirmed 🐷",
            message: `Swine ${sow.swine_id} farrowed ${totalLiveNum} live and ${mortalityNum} dead piglets.`,
            type: "success",
            createdAt: virtualNow
          }], { session });
    }

    await session.commitTransaction();
    res.json({ success: true, message: `Farrowing confirmed. ${pigletsToInsert.length} piglets registered.` });

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
    // FIX: Added fallback to empty object to prevent "req.body is undefined" crash
    const { heat_signs, notes } = req.body || {}; 

    const report = await HeatReport.findById(req.params.id)
      .populate("swine_id")
      .populate("farmer_id");

    if (!report) {
      return res.status(404).json({ success: false, message: "Report not found" });
    }

    ensureSubmittedHistory(report);
    const previousStatus = report.status;
    
    // Get virtual time for consistent status logging (Timewarp Sync)
    const virtualNow = await timeHelper.getVirtualNow();

    // CALCULATION: Set next heat check to 3 days from the current virtual date
    const threeDaysFromNow = new Date(virtualNow);
    threeDaysFromNow.setDate(virtualNow.getDate() + 3);

    // 1. Update Heat Report
    report.status = "approved";
    report.expected_farrowing = null; // Clear failed pregnancy projections
    
    // Set the new check date for the calendar/task list
    report.next_heat_check = threeDaysFromNow; 
    
    report.still_in_heat_at = virtualNow;
    report.still_in_heat_by = req.user.id;
    report.still_in_heat_reason = notes || "Returned to heat / pregnancy failed";
    
    pushProgressHistory(report, {
      eventKey: "cycle_reset_still_in_heat",
      title: "Cycle Reset to In-Heat",
      description: `Sow returned to heat after AI/observation. Previous progress preserved and a new heat cycle was recorded.`,
      fromStatus: previousStatus,
      toStatus: "approved",
      actor: req.user,
      actionAt: virtualNow,
      meta: {
        swine_code: report.swine_id?.swine_id || "",
        next_heat_check: threeDaysFromNow,
        notes: notes || "",
        heat_signs: Array.isArray(heat_signs) ? heat_signs : []
      }
    });

    // Store selected signs if provided
    if (heat_signs && Array.isArray(heat_signs)) {
      report.heat_signs = heat_signs; 
    }

    report.updatedAt = virtualNow;
    await report.save();

    // 2. Fail the linked AI Record (Stop ongoing breeding tracking)
    await AIRecord.findOneAndUpdate(
      { heat_report_id: report._id, status: "Ongoing" }, 
      {
        still_in_heat: true,
        status: "Failed",
        // Record exactly when the failure was noted in the warp timeline
        failed_at: virtualNow 
      }
    );

    // 3. Revert Swine Status to In-Heat for immediate UI visibility
    await Swine.findByIdAndUpdate(report.swine_id._id, { 
        current_status: "In-Heat",
        last_updated: virtualNow 
    });

    // 4. Log the action with specific signs
    const signsText = heat_signs ? ` (Signs: ${heat_signs.join(", ")})` : "";
    await logAction(
        req.user.id, 
        "STILL_IN_HEAT", 
        "BREEDING", 
        `Still In Heat for Swine ${report.swine_id.swine_id} recorded on ${virtualNow.toDateString()}.${signsText}`, 
        req
    );

    // 5. Notify the Breeding Team
    // FIXED: Using "alert" to match your Notification.js schema enum: ["info", "success", "alert", "error", "maintenance"]
    await notifyBreedingTeam(
      report.manager_id,
      report.farmer_id.user_id,
      "Breeding Cycle Reset",
      `Swine ${report.swine_id.swine_id} is still in heat${signsText}. Cycle reset. Next check scheduled for ${threeDaysFromNow.toLocaleDateString()}.`,
      "alert" 
    );

    res.json({ 
      success: true, 
      message: "Cycle reset. Next heat check scheduled in 3 days." 
    });

  } catch (err) {
    console.error("Still-Heat Error:", err);
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

    ensureSubmittedHistory(report);
    const previousStatus = report.status;

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

    pushProgressHistory(report, {
      eventKey: "weaning_confirmed",
      title: "Weaning Confirmed",
      description: `Weaning completed and breeding cycle closed.`,
      fromStatus: previousStatus,
      toStatus: "completed",
      actor: req.user,
      actionAt: finalWeaningDate,
      meta: {
        swine_code: report.swine_id?.swine_id || "",
        weaning_date: finalWeaningDate,
        weight: finalWeight,
        remarks: remarks || "Standard weaning"
      }
    });

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

    ensureSubmittedHistory(report);
    const previousStatus = report.status;
    const virtualNow = await timeHelper.getVirtualNow();

    // Update Report Status
    report.status = "rejected";
    report.rejection_message = reason || "No reason provided";
    report.rejected_at = virtualNow;
    report.rejected_by = req.user.id;

    pushProgressHistory(report, {
      eventKey: "report_rejected",
      title: "Report Rejected",
      description: `Heat report was rejected. Reason: ${reason || "No reason provided"}`,
      fromStatus: previousStatus,
      toStatus: "rejected",
      actor: req.user,
      actionAt: virtualNow,
      meta: {
        swine_code: report.swine_id?.swine_id || "",
        reason: reason || "No reason provided"
      }
    });

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
      type: "error", // Red alert in UI
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