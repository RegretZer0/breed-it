// backend/routes/swineRoutes.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const Swine = require("../models/Swine");
const Farmer = require("../models/UserFarmer");
const AIRecord = require("../models/AIRecord");
const HeatReport = require("../models/HeatReports");
const AuditLog = require("../models/AuditLog");
const Notification = require("../models/Notifications");
const logAction = require("../middleware/logger");
const timeHelper = require("../utils/timeHelper");

const { requireSessionAndToken } = require("../middleware/authMiddleware");
const { requireApiLogin } = require("../middleware/pageAuth.middleware");
const { allowRoles } = require("../middleware/roleMiddleware");

/* ======================================================
   UPLOAD: PIG PROFILE PHOTO (multer)
   Saves to: /backend/uploads/pig-profile
   Serves via: /uploads/... (already mapped in backend/index.js)
====================================================== */
const pigProfileDir = path.join(__dirname, "../uploads/pig-profile");
if (!fs.existsSync(pigProfileDir)) {
  fs.mkdirSync(pigProfileDir, { recursive: true });
}

const pigPhotoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, pigProfileDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeSwineId = String(req.params.swineId || "swine").replace(/[^a-z0-9_-]/gi, "_");
    cb(null, `${safeSwineId}-${Date.now()}${ext}`);
  }
});

const pigPhotoFilter = (req, file, cb) => {
  const ok = ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype);
  if (!ok) return cb(new Error("Only JPG/PNG/WebP images are allowed."), false);
  cb(null, true);
};

const uploadPigPhoto = multer({
  storage: pigPhotoStorage,
  fileFilter: pigPhotoFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

/* ======================================================
   UTILITIES: ID GENERATORS
====================================================== */
function getBatchLetter(index) {
  let label = "";
  while (index >= 0) {
    label = String.fromCharCode((index % 26) + 65) + label;
    index = Math.floor(index / 26) - 1;
  }
  return label;
}

function getManagerPrefix(managerId) {
  const idStr = managerId.toString();
  return idStr.substring(idStr.length - 4).toUpperCase();
}

// Helper to get Year Letter (2022=A, 2023=B, 2024=C, 2025=D, 2026=E)
function getYearLetter(year) {
  const startYear = 2022;
  const alphabet = "ABCDEFGHJKLMNPRSTVWXYZ"; // Sequence skipping I, O, Q
  let index = year - startYear;
  if (index < 0) index = 0;
  return alphabet[index] || alphabet[alphabet.length - 1];
}

/* ======================================================
   PREVIEW ENDPOINTS: GET NEXT IDs (FOR FRONTEND)
====================================================== */
router.get("/preview/next-boar-id", requireSessionAndToken, async (req, res) => {
  try {
    const user = req.user;
    const managerId = user.role === "farm_manager" ? user.id : user.managerId;
    const prefix = getManagerPrefix(managerId);

    const count = await Swine.countDocuments({
      registered_by: managerId,
      swine_id: { $regex: new RegExp(`^${prefix}-BOAR-`) }
    });

    const nextId = `${prefix}-BOAR-${String(count + 1).padStart(4, "0")}`;
    res.json({ success: true, nextId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/preview/next-batch-letter", requireSessionAndToken, async (req, res) => {
  try {
    const user = req.user;
    const managerId = user.role === "farm_manager" ? user.id : user.managerId;

    const existingBatches = await Swine.distinct("batch", {
      registered_by: managerId,
      batch: { $regex: /^[A-Z]+$/ }
    });

    const usedIndices = existingBatches
      .map((b) => {
        let num = 0;
        for (let i = 0; i < b.length; i++) {
          num = num * 26 + (b.charCodeAt(i) - 64);
        }
        return num - 1;
      })
      .filter((n) => !isNaN(n));

    let nextIndex = 0;
    while (usedIndices.includes(nextIndex)) nextIndex++;
    res.json({ success: true, nextLetter: getBatchLetter(nextIndex) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ======================================================
    ADD MASTER BOAR (UNIFIED ID: A-1, A-2)
====================================================== */
router.post(
  "/add-master-boar",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder", "admin"),
  async (req, res) => {
    const {
      color,
      weight,
      bodyLength,
      heartGirth,
      teethCount,
      birth_date,
      date_transfer,
      health_status,
      current_status,
      breed,
      manager_id
    } = req.body;

    try {
      const user = req.user;
      const registeredBy = manager_id || (user.role === "farm_manager" ? user.id : user.managerId);
      
      const virtualNow = await timeHelper.getVirtualNow();
      const currentYear = virtualNow.getFullYear();

      // 1. CALCULATE YEAR BATCH (2022 = A, 2023 = B, 2024 = C, 2025 = D, 2026 = E)
      const startYear = 2022;
      const alphabet = "ABCDEFGHJKLMNPRSTVWXYZ"; // Robust lookup skipping confusing letters
      
      let yearIndex = currentYear - startYear;
      if (yearIndex < 0) yearIndex = 0; 
      
      // Use the string index to ensure 2026 (Index 4) is always 'E'
      const yearLetter = alphabet[yearIndex] || alphabet[alphabet.length - 1];

      // 2. GENERATE UNIFIED ID (Format: Letter-Number)
      // We look for the absolute last number used for this batch letter
      // across all swine types to maintain a single continuous sequence.
      const lastSwineInBatch = await Swine.findOne({
        swine_id: new RegExp(`^${yearLetter}-`)
      }).sort({ swine_id: -1 });

      let nextNumber = 1;
      if (lastSwineInBatch && lastSwineInBatch.swine_id) {
        const parts = lastSwineInBatch.swine_id.split("-");
        const lastNum = parseInt(parts[parts.length - 1]);
        if (!isNaN(lastNum)) nextNumber = lastNum + 1;
      }

      const swineId = `${yearLetter}-${nextNumber}`;

      const newBoar = new Swine({
        swine_id: swineId,
        batch: yearLetter, 
        registered_by: registeredBy,
        farmer_id: null,
        sex: "Male",
        breed: breed || "Native",
        color: color || "Unknown",
        age_stage: "adult",
        birth_date: birth_date || null,
        is_external_boar: true,
        date_transfer: date_transfer || virtualNow, 
        health_status: health_status || "Healthy",
        current_status: current_status || "Active",
        performance_records: [
          {
            stage: "Maintenance Registration",
            record_date: virtualNow, 
            weight: Number(weight) || 0,
            body_length: Number(bodyLength) || 0,
            heart_girth: Number(heartGirth) || 0,
            teeth_count: Number(teethCount) || 0,
            recorded_by: user.id
          }
        ]
      });

      await newBoar.save();
      
      await logAction(
        user.id,
        "REGISTER_MASTER_BOAR",
        "SWINE_MANAGEMENT",
        `Registered Master Boar ${swineId} for Year ${currentYear} (Batch ${yearLetter})`,
        req
      );

      res.status(201).json({
        success: true,
        message: "Master Boar registered: " + swineId,
        swine: newBoar
      });
    } catch (error) {
      if (error.code === 11000)
        return res.status(400).json({ success: false, message: "Duplicate ID collision." });
      res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
  }
);

/* ======================================================
    ADD NEW SWINE (UNIFIED ID LOGIC: A-1, A-2, etc.)
====================================================== */
router.post(
  "/add",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    let {
      farmer_id,
      sex,
      color,
      breed,
      birth_date,
      health_status,
      sire_id,
      dam_id,
      date_transfer,
      batch,
      age_stage,
      weight,
      bodyLength,
      heartGirth,
      teethCount,
      leg_conformation,
      deformities,
      teat_count,
      current_status,
      birth_cycle_number
    } = req.body;

    try {
      if (!sex) return res.status(400).json({ success: false, message: "Sex is required" });

      const user = req.user;
      const managerId = user.role === "farm_manager" ? user.id : user.managerId;
      const virtualNow = await timeHelper.getVirtualNow();

      // 1. Resolve Auto-batch letter based on Year (2022 = A, 2023 = B...)
      const currentYear = virtualNow.getFullYear();
      const startYear = 2022;
      const alphabet = "ABCDEFGHJKLMNPRSTVWXYZ"; // Robust lookup skipping confusing letters
      
      let yearIndex = currentYear - startYear;
      if (yearIndex < 0) yearIndex = 0;

      // Force the batch to be the Year Letter (Index 4 for 2026 is strictly 'E')
      const batchLetter = alphabet[yearIndex] || alphabet[alphabet.length - 1];

      // 2. GENERATE UNIFIED ID (Format: Letter-Number)
      // Search for the highest number currently assigned to this batch letter
      const lastSwineInBatch = await Swine.findOne({
        swine_id: new RegExp(`^${batchLetter}-`)
      }).sort({ swine_id: -1 });

      let nextNumber = 1;
      if (lastSwineInBatch && lastSwineInBatch.swine_id) {
        const parts = lastSwineInBatch.swine_id.split("-");
        // We take the last part of the ID as the number
        const lastNum = parseInt(parts[parts.length - 1]);
        if (!isNaN(lastNum)) nextNumber = lastNum + 1;
      }
      
      const swineId = `${batchLetter}-${nextNumber}`;

      // 3. Farmer authorization check
      let targetFarmer = null;
      if (farmer_id) {
        targetFarmer = await Farmer.findOne({
          _id: farmer_id,
          $or: [{ managerId: managerId }, { registered_by: managerId }, { user_id: managerId }]
        });
        if (!targetFarmer) return res.status(400).json({ success: false, message: "Farmer unauthorized" });
      }

      // 4. Set Initial Status
      let initialStatus = current_status;
      let initialPerfStage = "Registration";

      if (!initialStatus) {
        if (age_stage === "piglet" || age_stage === "Monitoring (Day 1-30)") {
          initialStatus = "Monitoring (Day 1-30)";
          initialPerfStage = "Monitoring (Day 1-30)";
        } else {
          initialStatus = sex.toLowerCase() === "female" ? "Open" : "Market-Ready";
          initialPerfStage = "Routine";
        }
      }

      const newSwine = new Swine({
        swine_id: swineId,
        batch: batchLetter,
        registered_by: managerId,
        farmer_id: farmer_id || null,
        sex,
        color,
        breed,
        birth_date,
        birth_cycle_number,
        health_status: health_status || "Healthy",
        sire_id,
        dam_id,
        age_stage: age_stage || "piglet",
        current_status: initialStatus,
        date_transfer: date_transfer || virtualNow, 
        performance_records: [
          {
            stage: initialPerfStage,
            record_date: virtualNow,
            weight: Number(weight) || 0,
            body_length: Number(bodyLength) || 0,
            heart_girth: Number(heartGirth) || 0,
            teeth_count: Number(teethCount) || 0,
            leg_conformation: leg_conformation || "Normal",
            teat_count: Number(teat_count) || 0,
            deformities: Array.isArray(deformities) ? deformities : ["None"],
            recorded_by: user.id
          }
        ]
      });

      await newSwine.save();

      // NOTIFY FARMER
      if (targetFarmer && targetFarmer.user_id) {
        await Notification.create({
          user_id: targetFarmer.user_id,
          title: "New Swine Registered",
          message: `A new ${breed} ${sex} (ID: ${swineId}) has been assigned to your profile.`,
          type: "success",
          created_at: virtualNow 
        });
      }

      await logAction(user.id, "REGISTER_SWINE", "SWINE_MANAGEMENT", `Registered Swine ${swineId} (Year: ${currentYear})`, req);
      
      res.status(201).json({ 
        success: true, 
        message: "Swine added", 
        swine: newSwine 
      });

    } catch (error) {
      if (error.code === 11000) return res.status(400).json({ success: false, message: "Duplicate ID collision." });
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

/* ======================================================
   UPDATE PIG INFO (WITH PROFILE PHOTO)
   PUT /api/swine/profile/:swineId
   form-data:
     - profile_photo (file)
     - breed, sex, age_stage, health_status, birth_date, color, current_status
====================================================== */
router.put(
  "/profile/:swineId",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder", "farmer"),
  uploadPigPhoto.single("profile_photo"),
  async (req, res) => {
    const { swineId } = req.params;
    const user = req.user;

    try {
      const swine = await Swine.findOne({ swine_id: swineId });
      if (!swine) return res.status(404).json({ success: false, message: "Swine not found" });

      // ✅ TIME WARP: Get virtual time for logging or status logic if needed
      const virtualNow = await timeHelper.getVirtualNow();

      // Farmer access control (same idea as /update)
      if (
        user.role === "farmer" &&
        swine.farmer_id &&
        swine.farmer_id.toString() !== user.farmerProfileId
      ) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }

      const allowedFields = [
        "breed",
        "sex",
        "age_stage",
        "health_status",
        "birth_date",
        "color",
        "current_status"
      ];

      // Body fields
      allowedFields.forEach((f) => {
        if (req.body[f] !== undefined) swine[f] = req.body[f];
      });

      // File (store public URL path)
      if (req.file) {
        swine.profile_photo = `/uploads/pig-profile/${req.file.filename}`;
      }

      swine.updatedAt = virtualNow; 

      await swine.save();

      await logAction(
        user.id,
        "UPDATE_PIG_INFO",
        "SWINE_MANAGEMENT",
        `Updated pig info for ${swineId}${req.file ? " (with photo)" : ""}`,
        req
      );

      res.json({ success: true, message: "Pig info updated successfully", swine });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
);

/* ======================================================
   ADD PERFORMANCE RECORD
====================================================== */
router.post(
  "/performance/add/:id",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    const { id } = req.params;
    const { weight, bodyLength, heartGirth, stage, remarks } = req.body;
    const user = req.user;

    try {
      const swine = await Swine.findById(id);
      if (!swine) return res.status(404).json({ success: false, message: "Swine not found" });

      const newRecord = {
        stage: stage || "Routine",
        record_date: new Date(),
        weight: Number(weight) || 0,
        body_length: Number(bodyLength) || 0,
        heart_girth: Number(heartGirth) || 0,
        remarks: remarks || "Manual update",
        recorded_by: user.id
      };

      swine.performance_records.push(newRecord);
      await swine.save();
      await logAction(user.id, "ADD_PERFORMANCE", "SWINE_MANAGEMENT", `Added record for ${swine.swine_id}`, req);

      res.json({ success: true, message: "Performance record added", swine });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

/* ======================================================
    UPDATE SWINE
====================================================== */
router.put(
  "/update/:swineId",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder", "farmer"),
  async (req, res) => {
    const { swineId } = req.params;
    const user = req.user;
    const updates = req.body;

    try {
      const swine = await Swine.findOne({ swine_id: swineId });
      if (!swine) return res.status(404).json({ success: false, message: "Swine not found" });

      const virtualNow = await timeHelper.getVirtualNow();

      if (user.role === "farmer" && swine.farmer_id && swine.farmer_id.toString() !== user.farmerProfileId)
        return res.status(403).json({ success: false, message: "Access denied" });

      const allowedFields = [
        "sex",
        "color",
        "breed",
        "birth_date",
        "health_status",
        "sire_id",
        "dam_id",
        "date_transfer",
        "batch",
        "age_stage",
        "current_status",
        "performance_records",
        "birth_cycle_number"
      ];

      // Handle Performance Records Update/Overwrite
      if (updates.performance_records) {
        const stageLabel = updates.performance_records.stage || "Monthly Update";
        
        const newPerfData = {
          ...updates.performance_records,
          stage: stageLabel,
          record_date: virtualNow,
          recorded_by: user.id
        };

        // Logic for Monthly Overwrite
        if (updates.overwrite_monthly) {
          const existingIndex = swine.performance_records.findIndex((rec) => {
            const d = new Date(rec.record_date);
            // ✅ Sync with Virtual Time Warp: check if record exists for this virtual month/year
            return (
              d.getMonth() === virtualNow.getMonth() && 
              d.getFullYear() === virtualNow.getFullYear() &&
              rec.stage === stageLabel
            );
          });

          if (existingIndex !== -1) {
            // Overwrite existing record for this month
            swine.performance_records[existingIndex] = {
              ...swine.performance_records[existingIndex].toObject(),
              ...newPerfData
            };
          } else {
            // No record found for this month yet, push new
            swine.performance_records.push(newPerfData);
          }
        } else {
          // Standard push if overwrite is not explicitly requested
          swine.performance_records.push(newPerfData);
        }
      }

      // Update basic fields
      allowedFields.forEach((field) => {
        if (updates[field] !== undefined && field !== "performance_records") {
          swine[field] = updates[field];
        }
      });

      await swine.save();
      
      // ✅ Log using the virtual date for a more accurate audit trail in 2026
      await logAction(
        user.id, 
        "UPDATE_SWINE", 
        "SWINE_MANAGEMENT", 
        `Updated ${swineId} at virtual time ${virtualNow.toDateString()}`, 
        req
      );
      
      res.json({ success: true, message: "Swine updated successfully", swine });
    } catch (error) {
      console.error("Update Swine Error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

/* ======================================================
   REGISTER FARROWING
====================================================== */
router.post(
  "/:swineId/register-farrowing",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder", "farmer"),
  async (req, res) => {
    const { swineId } = req.params;
    const { total_live, mummified, stillborn, farrowing_date } = req.body;
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const sow = await Swine.findOne({ swine_id: swineId });
      if (!sow) throw new Error("Sow not found");

      const totalPiglets = Number(total_live || 0) + Number(mummified || 0) + Number(stillborn || 0);
      const actualFarrowingDate = farrowing_date || new Date();

      const updateResult = await Swine.updateOne(
        { _id: sow._id, "breeding_cycles.is_pregnant": true },
        {
          $set: {
            "breeding_cycles.$.farrowed": true,
            "breeding_cycles.$.is_pregnant": false,
            "breeding_cycles.$.actual_farrowing_date": actualFarrowingDate,
            "breeding_cycles.$.farrowing_results": {
              total_piglets: totalPiglets,
              live_piglets: Number(total_live || 0),
              mortality_count: Number(mummified || 0) + Number(stillborn || 0)
            },
            current_status: "Lactating"
          }
        },
        { session }
      );

      if (updateResult.modifiedCount === 0) throw new Error("No active pregnant cycle found.");

      await HeatReport.findOneAndUpdate({ swine_id: sow._id, status: "pregnant" }, { status: "lactating" }, { session });
      await AIRecord.findOneAndUpdate(
        { swine_id: sow._id, status: "Success" },
        { status: "Completed", actual_farrowing_date: actualFarrowingDate },
        { session }
      );

      await logAction(req.user.id, "REGISTER_FARROWING", "BREEDING", `Farrowing recorded for Sow ${swineId}`, req);

      await session.commitTransaction();
      res.json({ success: true, message: "Farrowing registered." });
    } catch (error) {
      await session.abortTransaction();
      res.status(500).json({ success: false, message: error.message });
    } finally {
      session.endSession();
    }
  }
);

/* ======================================================
   MANUAL WEANING
====================================================== */
router.patch(
  "/:swineId/manual-weaning",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder", "farmer"),
  async (req, res) => {
    const { swineId } = req.params;
    try {
      const swine = await Swine.findOne({ swine_id: swineId });
      if (!swine) return res.status(404).json({ success: false, message: "Swine not found" });
      if (swine.current_status !== "Lactating") return res.status(400).json({ success: false, message: "Not lactating." });

      swine.current_status = "Open";
      swine.performance_records.push({
        stage: "Manual Weaning",
        record_date: new Date(),
        recorded_by: req.user.id,
        remarks: "Manual override to Open."
      });

      await swine.save();
      await HeatReport.findOneAndUpdate({ swine_id: swine._id, status: "lactating" }, { status: "completed" });
      await logAction(req.user.id, "MANUAL_WEANING", "BREEDING", `Manually weaned Sow ${swineId}`, req);

      res.json({ success: true, message: `Swine ${swineId} has been manually weaned.` });
    } catch (error) {
      res.status(500).json({ success: false, message: "Server error." });
    }
  }
);

/* ======================================================
   MEDICAL RECORDS
====================================================== */
router.post(
  "/:swineId/medical",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder", "farmer"),
  async (req, res) => {
    const { treatment_type, medicine_name, dosage, remarks } = req.body;
    try {
      const swine = await Swine.findOne({ swine_id: req.params.swineId });
      if (!swine) return res.status(404).json({ success: false, message: "Not found" });

      swine.medical_records.push({
        treatment_type,
        medicine_name,
        dosage,
        remarks,
        administered_by: req.user.id
      });
      await swine.save();
      await logAction(req.user.id, "MEDICAL_TREATMENT", "SWINE_MANAGEMENT", `Medical update for ${req.params.swineId}`, req);
      res.json({ success: true, message: "Medical record added" });
    } catch (e) {
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

/* ======================================================
   GET ALL SWINE
====================================================== */
router.get(
  "/all",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder", "farmer"),
  async (req, res) => {
    try {
      const user = req.user;
      const managerId = user.role === "farm_manager" ? user.id : user.managerId;
      let query = {};

      if (user.role === "farmer") {
        query.farmer_id = user.farmerProfileId;
      } else {
        const farmers = await Farmer.find({
          $or: [{ managerId: managerId }, { registered_by: managerId }]
        }).select("_id");

        const farmerIds = farmers.map((f) => f._id);
        const prefix = getManagerPrefix(managerId);

        query = {
          $or: [
            { farmer_id: { $in: farmerIds } },
            { registered_by: managerId, farmer_id: null },
            { swine_id: { $regex: new RegExp(`^${prefix}-BOAR-`) } }
          ]
        };
      }

      if (req.query.sex) {
        query.sex = { $regex: new RegExp(`^${req.query.sex}$`, "i") };
      }

      if (req.query.age_stage) {
        query.age_stage = { $regex: new RegExp(`^${req.query.age_stage}$`, "i") };
      }

      if (req.query.farmer_id) {
        query.farmer_id = req.query.farmer_id;
      }

      const swine = await Swine.find(query)
        .populate("farmer_id", "first_name last_name")
        .lean();

      const swineData = swine.map((s) => {
        const sortedPerf = [...(s.performance_records || [])].sort(
          (a, b) => new Date(b.record_date || 0) - new Date(a.record_date || 0)
        );

        const latestPerf = sortedPerf[0] || {};

        const latestWeightRecord = sortedPerf.find(
          (r) =>
            r.weight !== undefined &&
            r.weight !== null &&
            !Number.isNaN(Number(r.weight)) &&
            Number(r.weight) > 0
        );

        return {
          ...s,
          farmer_name: s.farmer_id
            ? `${s.farmer_id.first_name} ${s.farmer_id.last_name}`
            : "ADMIN/MASTER",
          total_piglets_count:
            s.breeding_cycles?.reduce(
              (sum, c) => sum + (c.farrowing_results?.total_piglets || 0),
              0
            ) || 0,
          total_mortality_count:
            s.breeding_cycles?.reduce(
              (sum, c) => sum + (c.farrowing_results?.mortality_count || 0),
              0
            ) || 0,
          latest_performance: latestPerf,
          latest_weight: latestWeightRecord ? Number(latestWeightRecord.weight) : 0
        };
      });

      res.json({ success: true, swine: swineData });
    } catch (err) {
      console.error("GET /all swine error:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

/* ======================================================
   GET BOAR HISTORY & ACTIVE BOARS
====================================================== */
router.get(
  "/history/boars/:swineId",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const { swineId } = req.params;
      const user = req.user;
      const managerId = user.role === "farm_manager" ? user.id : user.managerId;

      const sow = await Swine.findOne({ swine_id: swineId });
      if (!sow) return res.status(404).json({ success: false, message: "Sow not found" });

      const aiHistory = await AIRecord.find({ swine_id: sow._id }).populate("male_swine_id", "swine_id breed").lean();
      const historicalBoars = aiHistory
        .map((record) => record.male_swine_id)
        .filter((boar, index, self) => boar && self.findIndex((b) => b.swine_id === boar.swine_id) === index);

      const farmers = await Farmer.find({ $or: [{ managerId: managerId }, { registered_by: managerId }] }).select("_id");
      const farmerIds = farmers.map((f) => f._id);
      const prefix = getManagerPrefix(managerId);

      const allActiveBoars = await Swine.find({
        sex: { $regex: /^male$/i },
        age_stage: { $regex: /^adult$/i },
        current_status: { $ne: "Culled/Sold" },
        $or: [{ swine_id: { $regex: new RegExp(`^${prefix}-BOAR-`) } }, { registered_by: managerId }, { farmer_id: { $in: farmerIds } }]
      })
        .select("swine_id breed")
        .lean();

      res.json({ success: true, historicalBoars, allActiveBoars });
    } catch (err) {
      res.status(500).json({ success: false, message: "Error fetching history" });
    }
  }
);

/* ======================================================
   GET AUDIT LOGS
====================================================== */
router.get(
  "/logs/audit",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const { module_name, action_type, limit = 50, skip = 0 } = req.query;
      let query = {};
      if (module_name) query.module = module_name;
      if (action_type) query.action = action_type;

      const logs = await AuditLog.find(query)
        .populate("user_id", "first_name last_name email role")
        .sort({ timestamp: -1 })
        .limit(parseInt(limit))
        .skip(parseInt(skip));

      const total = await AuditLog.countDocuments(query);
      res.json({ success: true, total, logs });
    } catch (error) {
      res.status(500).json({ success: false, message: "Audit retrieval error" });
    }
  }
);

/* ======================================================
    BATCH REGISTER PIGLETS (LITTER BIRTH) - UNIFIED ID
====================================================== */
router.post("/batch-register-litter", requireSessionAndToken, async (req, res) => {
  const {
    dam_id,
    sire_id,
    farrowing_date,
    num_males,
    num_females,
    num_stillborn,
    num_mummified,
    breed,
    avg_weight,
    farmer_id,
    ai_record_id
  } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = req.user;
    const managerId = user.role === "farm_manager" ? user.id : user.managerId;
    
    const virtualNow = await timeHelper.getVirtualNow();
    const currentYear = virtualNow.getFullYear();

    // 1. Resolve Batch Letter based on Year (2022 = A, 2023 = B, 2024 = C, 2025 = D, 2026 = E)
    const startYear = 2022;
    const alphabet = "ABCDEFGHJKLMNPRSTVWXYZ"; // Robust lookup skipping confusing letters
    
    let yearIndex = currentYear - startYear;
    if (yearIndex < 0) yearIndex = 0;
    
    // Explicitly select the letter from the sequence to ensure 2026 (Index 4) is 'E'
    const batchLetter = alphabet[yearIndex] || alphabet[alphabet.length - 1];

    const totalLive = Number(num_males || 0) + Number(num_females || 0);
    const totalDead = Number(num_stillborn || 0) + Number(num_mummified || 0);
    const grandTotal = totalLive + totalDead;

    // 2. Find the last absolute number used for THIS batch letter to continue the sequence
    // This ensures no conflict with previously added Boars or individual pigs
    const lastSwineInBatch = await Swine.findOne({
      swine_id: new RegExp(`^${batchLetter}-`)
    })
      .sort({ swine_id: -1 })
      .session(session);

    let startingNumber = 1;
    if (lastSwineInBatch && lastSwineInBatch.swine_id) {
      const parts = lastSwineInBatch.swine_id.split("-");
      const lastNum = parseInt(parts[parts.length - 1]);
      if (!isNaN(lastNum)) startingNumber = lastNum + 1;
    }

    const piglets = [];

    // 3. Prepare Piglet Array
    for (let i = 0; i < grandTotal; i++) {
      let sex = "Female";
      let health_status = "Healthy";
      let current_status = "Monitoring (Day 1-30)";

      if (i < Number(num_males)) {
        sex = "Male";
      } else if (i < totalLive) {
        sex = "Female";
      } else {
        sex = i % 2 === 0 ? "Male" : "Female";
        health_status = "Deceased (Before Weaning)";
        current_status = "Inactive";
      }

      // Generate Unified ID (e.g., E-101, E-102)
      const currentPigletNum = startingNumber + i;
      const swineId = `${batchLetter}-${currentPigletNum}`;

      piglets.push({
        swine_id: swineId,
        batch: batchLetter,
        registered_by: managerId,
        farmer_id: farmer_id || null,
        sex: sex,
        breed: breed || "Native",
        age_stage: "piglet",
        current_status: current_status,
        health_status: health_status,
        birth_date: farrowing_date || virtualNow,
        dam_id: dam_id,
        sire_id: sire_id,
        performance_records: [
          {
            stage: "Monitoring (Day 1-30)",
            weight: Number(avg_weight) || 0,
            recorded_by: user.id,
            record_date: farrowing_date || virtualNow,
            remarks: health_status === "Healthy" ? "Litter Registration" : "Registered as Deceased (Farrowing)"
          }
        ]
      });
    }

    // 4. DATABASE UPDATES
    if (piglets.length > 0) {
      await Swine.insertMany(piglets, { session });
    }

    await Swine.updateOne(
      { swine_id: dam_id, "breeding_cycles.is_pregnant": true },
      {
        $set: {
          "breeding_cycles.$.farrowed": true,
          "breeding_cycles.$.is_pregnant": false,
          "breeding_cycles.$.actual_farrowing_date": farrowing_date || virtualNow,
          "breeding_cycles.$.farrowing_results": {
            total_piglets: grandTotal,
            live_piglets: totalLive,
            male_count: Number(num_males),
            female_count: Number(num_females),
            mortality_count: totalDead
          },
          current_status: "Lactating",
          last_updated: virtualNow
        },
        $inc: { parity: 1 }
      },
      { session }
    );

    if (ai_record_id) {
      await AIRecord.findByIdAndUpdate(
        ai_record_id,
        {
          status: "Completed",
          actual_farrowing_date: farrowing_date || virtualNow
        },
        { session }
      );
    }

    await logAction(
      user.id, 
      "BATCH_REGISTER_LITTER", 
      "SWINE_MANAGEMENT", 
      `Registered batch of ${grandTotal} piglets for Dam ${dam_id} (IDs: ${batchLetter}-${startingNumber} to ${batchLetter}-${startingNumber + grandTotal - 1})`, 
      req
    );

    await session.commitTransaction();
    res.status(201).json({
      success: true,
      message: `Farrowing successful. Batch ${batchLetter} updated with ${totalLive} live and ${totalDead} deceased records.`
    });
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    console.error("Batch Register Error:", error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});

/* ======================================================
   FARMER PROFILE SPECIFIC ROUTE
====================================================== */
router.get("/farmer", requireApiLogin, allowRoles("farmer"), async (req, res) => {
  try {
    const farmerId = req.user.farmerProfileId;
    const swine = await Swine.find({ farmer_id: farmerId }).populate("farmer_id", "first_name last_name").lean();
    res.json({ success: true, swine });
  } catch (e) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ======================================================
   GET SWINE BY MONGO ID (READ ONLY)
====================================================== */
router.get(
  "/by-mongo-id/:id",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder", "farmer"),
  async (req, res) => {
    try {
      const swine = await Swine.findById(req.params.id).select("swine_id sex age_stage breed").lean();

      if (!swine) {
        return res.status(404).json({ success: false, message: "Swine not found" });
      }

      res.json({ success: true, swine });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }
);

module.exports = router;