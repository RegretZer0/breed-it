const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Swine = require("../models/Swine");
const Farmer = require("../models/UserFarmer");
const AIRecord = require("../models/AIRecord");

const { requireSessionAndToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

// ----------------------
// Add new swine
// ----------------------
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

// ----------------------
// Get all swine (Search/General query)
// ----------------------
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

      const swineData = swine.map(s => ({
        ...s,
        farmer_name: s.farmer_id ? `${s.farmer_id.first_name} ${s.farmer_id.last_name}` : "N/A",
        total_piglets_count: s.breeding_cycles?.reduce((sum, c) => sum + (c.farrowing_results?.total_piglets || 0), 0) || 0,
        total_mortality_count: s.breeding_cycles?.reduce((sum, c) => sum + (c.farrowing_results?.mortality_count || 0), 0) || 0,
        latest_performance: s.performance_records?.[s.performance_records.length - 1] || {}
      }));

      res.json({ success: true, swine: swineData });
    } catch (err) {
      console.error("[GET ALL SWINE ERROR]:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

// ----------------------
// Get Boar History for a specific Sow (Cascading Selection)
// ----------------------
router.get(
  "/history/boars/:swineId",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const { swineId } = req.params; 
      const user = req.user;
      const managerId = user.role === "farm_manager" ? user.id : user.managerId;

      // 1. Find the Sow document to get the ObjectId (_id)
      const sow = await Swine.findOne({ swine_id: swineId });
      if (!sow) return res.status(404).json({ success: false, message: "Sow not found" });

      // 2. Get Historical Boars used for this sow from AIRecords using ObjectId
      const aiHistory = await AIRecord.find({ swine_id: sow._id })
        .populate("male_swine_id", "swine_id breed")
        .lean();

      const historicalBoars = aiHistory
        .map(record => record.male_swine_id)
        .filter((boar, index, self) => 
          boar && self.findIndex(b => b.swine_id === boar.swine_id) === index
        );

      // 3. Get All Active Boars available under this manager's scope
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

      res.json({ 
        success: true, 
        historicalBoars: historicalBoars || [], 
        allActiveBoars: allActiveBoars || [] 
      });
    } catch (err) {
      console.error("[BOAR HISTORY ERROR]:", err);
      res.status(500).json({ success: false, message: "Error fetching history" });
    }
  }
);

// ----------------------
// Add Medical Record
// ----------------------
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

// ----------------------
// Update swine
// ----------------------
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

      if (user.role === "farmer" && swine.farmer_id.toString() !== user.farmerProfileId)
        return res.status(403).json({ success: false, message: "Access denied" });

      const allowedFields = [
        "sex", "color", "breed", "birth_date", "health_status", 
        "sire_id", "dam_id", "date_transfer", 
        "batch", "age_stage", "current_status"
      ];

      allowedFields.forEach((field) => {
        if (updates[field] !== undefined) swine[field] = updates[field];
      });

      await swine.save();
      res.json({ success: true, message: "Swine updated successfully", swine });
    } catch (error) {
      console.error("[UPDATE SWINE ERROR]:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

module.exports = router;