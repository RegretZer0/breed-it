const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const Swine = require("../models/Swine");
const Farmer = require("../models/UserFarmer");
const AIRecord = require("../models/AIRecord");
const HeatReport = require("../models/HeatReports");

const { requireSessionAndToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

/* ======================================================
    ADD NEW SWINE
====================================================== */
router.post(
  "/add",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    const {
      farmer_id, sex, color, breed, birth_date, health_status,
      sire_id, dam_id, date_transfer, batch,
      age_stage, weight, bodyLength, heartGirth, teethCount,
      legConformation, deformities, teatCount, current_status
    } = req.body;

    try {
      if (!farmer_id || !sex || !batch) {
        return res.status(400).json({ success: false, message: "Farmer ID, sex, and batch are required" });
      }

      const user = req.user;
      const managerId = user.role === "farm_manager" ? user.id : user.managerId;

      const farmer = await Farmer.findOne({
        _id: farmer_id,
        $or: [
          { managerId: managerId },
          { registered_by: managerId },
          { user_id: managerId }
        ]
      });

      if (!farmer) return res.status(400).json({ success: false, message: "Farmer not found or unauthorized" });

      // Auto-generate Swine ID based on Batch
      const lastSwine = await Swine.find({ batch }).sort({ _id: -1 }).limit(1);
      let nextNumber = 1;
      if (lastSwine.length && lastSwine[0].swine_id) {
        const parts = lastSwine[0].swine_id.split("-");
        const lastNum = parseInt(parts[parts.length - 1]);
        if (!isNaN(lastNum)) nextNumber = lastNum + 1;
      }
      const swineId = `${batch}-${String(nextNumber).padStart(4, "0")}`;

      // Intelligent status assignment
      let initialStatus = current_status; 
      let initialPerfStage;

      if (!initialStatus) {
        if (age_stage === "piglet") {
          initialStatus = "1st Selection Ongoing";
          initialPerfStage = "1st Stage Selection"; 
        } else {
          initialStatus = (sex === "Female" || sex === "female") ? "Open" : "Market-Ready";
          initialPerfStage = "Routine"; 
        }
      } else {
        initialPerfStage = "Registration";
      }

      const newSwine = new Swine({
        swine_id: swineId,
        batch,
        registered_by: managerId,
        farmer_id: farmer._id,
        sex,
        color,
        breed,
        birth_date,
        health_status: health_status || "Healthy",
        sire_id,
        dam_id,
        age_stage: age_stage || "piglet",
        current_status: initialStatus,
        date_transfer,
        performance_records: [{
          stage: initialPerfStage,
          record_date: new Date(),
          weight: weight || 0,
          body_length: bodyLength || 0,
          heart_girth: heartGirth || 0,
          teeth_count: teethCount || 0,
          leg_conformation: legConformation || "Normal",
          teat_count: teatCount || 0,
          deformities: Array.isArray(deformities) ? deformities : ["None"],
          recorded_by: user.id
        }]
      });

      await newSwine.save();
      res.status(201).json({ success: true, message: "Swine added successfully", swine: newSwine });

    } catch (error) {
      console.error("[ADD SWINE ERROR]:", error);
      res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
  }
);

/* ======================================================
    REGISTER FARROWING (New Logic)
====================================================== */
router.post(
  "/:swineId/register-farrowing",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder", "farmer"),
  async (req, res) => {
    const { swineId } = req.params;
    const { total_live, mummified, stillborn, farrowing_date, remarks } = req.body;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const sow = await Swine.findOne({ swine_id: swineId });
      if (!sow) throw new Error("Sow not found");

      const totalPiglets = Number(total_live || 0) + Number(mummified || 0) + Number(stillborn || 0);

      // 1. Update the mother's active breeding cycle
      // We look for the cycle where is_pregnant is true but farrowing_results doesn't exist yet
      const updateResult = await Swine.updateOne(
        { _id: sow._id, "breeding_cycles.is_pregnant": true },
        { 
          $set: { 
            "breeding_cycles.$.farrowing_date": farrowing_date || new Date(),
            "breeding_cycles.$.farrowing_results": {
              total_piglets: totalPiglets,
              live_piglets: total_live || 0,
              mortality_count: Number(mummified || 0) + Number(stillborn || 0),
              remarks: remarks || ""
            },
            current_status: "Lactating", // Move from Pregnant to Lactating
            health_status: "Recovering"
          }
        },
        { session }
      );

      if (updateResult.modifiedCount === 0) {
        throw new Error("No active pregnant cycle found for this sow.");
      }

      // 2. Update the associated HeatReport status to completed
      await HeatReport.findOneAndUpdate(
        { swine_id: sow._id, status: "pregnant" },
        { status: "completed" },
        { session }
      );

      await session.commitTransaction();
      res.json({ success: true, message: "Farrowing registered successfully. Sow is now Lactating." });

    } catch (error) {
      await session.abortTransaction();
      console.error("[FARROWING ERROR]:", error);
      res.status(500).json({ success: false, message: error.message });
    } finally {
      session.endSession();
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
          query = {
            $or: [
              { farmer_id: { $in: farmerIds } },
              { registered_by: managerId }
            ]
          };
      }

      if (req.query.sex) query.sex = { $regex: new RegExp(`^${req.query.sex}$`, "i") };
      if (req.query.age_stage) query.age_stage = { $regex: new RegExp(`^${req.query.age_stage}$`, "i") };
      if (req.query.farmer_id) query.farmer_id = req.query.farmer_id;

      const swine = await Swine.find(query)
        .populate("farmer_id", "first_name last_name")
        .lean();

      const swineData = swine.map(s => ({
        ...s,
        farmer_name: s.farmer_id ? `${s.farmer_id.first_name} ${s.farmer_id.last_name}` : "N/A",
        // Calculated fields for dashboard usage
        total_piglets_count: s.breeding_cycles?.reduce((sum, c) => sum + (c.farrowing_results?.total_piglets || 0), 0) || 0,
        total_mortality_count: s.breeding_cycles?.reduce((sum, c) => sum + (c.farrowing_results?.mortality_count || 0), 0) || 0,
        latest_performance: s.performance_records?.[s.performance_records.length - 1] || {}
      }));

      res.json({ success: true, swine: swineData });
    } catch (err) {
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

/* ======================================================
    GET SWINE FOR LOGGED-IN FARMER (New Route)
====================================================== */
router.get(
  "/farmer",
  requireSessionAndToken,
  allowRoles("farmer"),
  async (req, res) => {
    try {
      // Find the farmer record linked to the logged-in user ID
      const farmer = await Farmer.findOne({ user_id: req.user.id });
      
      if (!farmer) {
        return res.status(404).json({ success: false, message: "Farmer profile not found" });
      }

      const swine = await Swine.find({ farmer_id: farmer._id })
        .populate("farmer_id", "first_name last_name")
        .lean();

      res.json({ success: true, swine });
    } catch (err) {
      console.error("[FETCH FARMER SWINE ERROR]:", err);
      res.status(500).json({ success: false, message: "Server error while fetching swine" });
    }
  }
);

/* ======================================================
    ADD NEW SWINE
====================================================== */
router.post(
  "/add",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    const {
      farmer_id, sex, color, breed, birth_date, health_status,
      sire_id, dam_id, date_transfer, batch,
      age_stage, weight, bodyLength, heartGirth, teethCount,
      legConformation, deformities, teatCount, current_status
    } = req.body;

    try {
      if (!farmer_id || !sex || !batch) {
        return res.status(400).json({ success: false, message: "Farmer ID, sex, and batch are required" });
      }

      const user = req.user;
      const managerId =
        user.role === "farm_manager" ? user.id : user.managerId;

      const farmer = await Farmer.findOne({
        _id: farmer_id,
        $or: [
          { managerId: managerId },
          { registered_by: managerId },
          { user_id: managerId }
        ]
      });

      if (!farmer) return res.status(400).json({ success: false, message: "Farmer not found or unauthorized" });

      const lastSwine = await Swine.find({ batch }).sort({ _id: -1 }).limit(1);
      let nextNumber = 1;
      if (lastSwine.length && lastSwine[0].swine_id) {
        const parts = lastSwine[0].swine_id.split("-");
        const lastNum = parseInt(parts[parts.length - 1]);
        if (!isNaN(lastNum)) nextNumber = lastNum + 1;
      }
      const swineId = `${batch}-${String(nextNumber).padStart(4, "0")}`;

      let initialStatus = current_status; 
      let initialPerfStage;

      if (!initialStatus) {
        if (age_stage === "piglet") {
          initialStatus = "1st Selection Ongoing";
          initialPerfStage = "1st Stage Selection"; 
        } else {
          initialStatus = (sex === "Female" || sex === "female") ? "Open" : "Market-Ready";
          initialPerfStage = "Routine"; 
        }
      } else {
        initialPerfStage = "Registration";
      }

      const newSwine = new Swine({
        swine_id: swineId,
        batch,
        registered_by: managerId,
        farmer_id: farmer._id,
        sex,
        color,
        breed,
        birth_date,
        health_status: health_status || "Healthy",
        sire_id,
        dam_id,
        age_stage: age_stage || "piglet",
        current_status: initialStatus,
        date_transfer,
        performance_records: [{
          stage: initialPerfStage,
          record_date: new Date(),
          weight: weight || 0,
          body_length: bodyLength || 0,
          heart_girth: heartGirth || 0,
          teeth_count: teethCount || 0,
          leg_conformation: legConformation || "Normal",
          teat_count: teatCount || 0,
          deformities: Array.isArray(deformities) ? deformities : ["None"],
          recorded_by: user.id
        }]
      });

      await newSwine.save();
      res.status(201).json({ success: true, message: "Swine added successfully", swine: newSwine });

    } catch (error) {
      console.error("[ADD SWINE ERROR]:", error);
      res.status(500).json({ success: false, message: "Server error", error: error.message });
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

      const aiHistory = await AIRecord.find({ swine_id: sow._id })
        .populate("male_swine_id", "swine_id breed")
        .lean();

      const historicalBoars = aiHistory
        .map(record => record.male_swine_id)
        .filter((boar, index, self) => 
          boar && self.findIndex(b => b.swine_id === boar.swine_id) === index
        );

      const farmers = await Farmer.find({ 
        $or: [{ managerId: managerId }, { registered_by: managerId }] 
      }).select("_id");
      const farmerIds = farmers.map(f => f._id);

      const allActiveBoars = await Swine.find({
        sex: { $regex: /^male$/i },
        age_stage: { $regex: /^adult$/i },
        current_status: { $ne: "Culled/Sold" },
        $or: [
            { registered_by: managerId },
            { manager_id: managerId },
            { farmer_id: { $in: farmerIds } }
        ]
      }).select("swine_id breed").lean();

      res.json({ success: true, historicalBoars, allActiveBoars });
    } catch (err) {
      res.status(500).json({ success: false, message: "Error fetching history" });
    }
  }
);

/* ======================================================
    ADD MEDICAL RECORD
====================================================== */
router.post(
  "/:swineId/medical",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder", "farmer"),
  async (req, res) => {
    const { treatment_type, medicine_name, dosage, remarks } = req.body;
    try {
      const swine = await Swine.findOne({ swine_id: req.params.swineId });
      if (!swine) return res.status(404).json({ success: false, message: "Swine not found" });

      swine.medical_records.push({
        treatment_type,
        medicine_name,
        dosage,
        remarks,
        administered_by: req.user.id
      });

      await swine.save();
      res.json({ success: true, message: "Medical record added", medical_records: swine.medical_records });
    } catch (error) {
      res.status(500).json({ success: false, message: "Server error" });
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
      if (!mongoose.Types.ObjectId.isValid(swineId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid swine ID"
        });
      }

      const swine = await Swine.findById(swineId);

      if (!swine) {
        return res.status(404).json({
          success: false,
          message: "Swine not found"
        });
      }

      // Farmer-level access control
      if (
        user.role === "farmer" &&
        swine.farmer_id.toString() !== user.farmerProfileId
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied"
        });
      }

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
        "current_status"
      ];

      allowedFields.forEach(field => {
        if (updates[field] !== undefined) {
          swine[field] = updates[field];
        }
      });

      await swine.save();

      res.json({
        success: true,
        message: "Swine updated successfully",
        swine
      });

    } catch (error) {
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

module.exports = router;