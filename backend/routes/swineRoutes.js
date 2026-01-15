const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const Swine = require("../models/Swine");
const Farmer = require("../models/UserFarmer");
const Counter = require("../models/Counter"); // ✅ ATOMIC COUNTER

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
    // Standardized destructuring to match the payload from manage_swine.js
    const {
      farmer_id, sex, color, breed, birth_date, health_status,
      sire_id, dam_id, date_transfer, batch,
      age_stage, weight, bodyLength, heartGirth, teethCount,
      legConformation, deformities, teatCount
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

      // Auto-generate Swine ID based on Batch
      const lastSwine = await Swine.find({ batch }).sort({ _id: -1 }).limit(1);
      let nextNumber = 1;
      if (lastSwine.length && lastSwine[0].swine_id) {
        const parts = lastSwine[0].swine_id.split("-");
        const lastNum = parseInt(parts[parts.length - 1]);
        if (!isNaN(lastNum)) nextNumber = lastNum + 1;
      }
      const swineId = `${batch}-${String(nextNumber).padStart(4, "0")}`;

      let initialStatus;
      let initialPerfStage;

      if (age_stage === "piglet") {
        initialStatus = "1st Selection Ongoing";
        initialPerfStage = "1st Stage Selection"; 
      } else {
        initialStatus = (sex === "Female") ? "Open" : "Market-Ready";
        initialPerfStage = "Routine"; 
      }

      const newSwine = new Swine({
        swine_id: swineId,
        batch,
        registered_by: managerId,
        farmer_id: farmer._id,
        sex,
        color,
        breed,
        birth_date: birth_date,
        health_status: health_status || "Healthy",
        sire_id: sire_id,
        dam_id: dam_id,
        age_stage: age_stage || "piglet",
        current_status: initialStatus,
        date_transfer: date_transfer,
        
        performance_records: [{
          stage: initialPerfStage,
          record_date: new Date(),
          weight: weight,
          body_length: bodyLength,
          heart_girth: heartGirth,
          teeth_count: teethCount,
          leg_conformation: legConformation,
          teat_count: teatCount, // Assigned to teat_count to match Swine.js Schema
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
// Add Medical Record (Injections/Vaccines)
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
// Get all swine (Search/General query)
// ----------------------
router.get(
  "/",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder", "farmer"),
  async (req, res) => {
    const user = req.user;
    try {
      let query = {};
      if (user.role === "farmer") {
        query.farmer_id = new mongoose.Types.ObjectId(user.farmerProfileId);
      } else {
        const managerId = user.role === "farm_manager" ? user.id : user.managerId;
        const farmers = await Farmer.find({ registered_by: managerId });
        query.farmer_id = { $in: farmers.map(f => f._id) };
      }

      const swine = await Swine.find(query).populate("farmer_id", "first_name last_name");
      
      const swineData = swine.map(s => ({
        ...s.toObject(),
        farmer_name: s.farmer_id ? `${s.farmer_id.first_name} ${s.farmer_id.last_name}` : "N/A",
        total_piglets_count: s.breeding_cycles?.reduce((sum, c) => sum + (c.farrowing_results?.total_piglets || 0), 0) || 0,
        total_mortality_count: s.breeding_cycles?.reduce((sum, c) => sum + (c.farrowing_results?.mortality_count || 0), 0) || 0
      }));

      res.json({ success: true, swine: swineData });
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
      if (!swine)
        return res
          .status(404)
          .json({ success: false, message: "Swine not found" });

      if (user.role === "farmer" && swine.farmer_id.toString() !== user.farmerProfileId)
        return res.status(403).json({ success: false, message: "Access denied" });

      const allowedFields = [
        "sex", "color", "breed", "birth_date", "health_status", 
        "sire_id", "dam_id", "date_transfer", 
        "batch", "age_stage", "current_status"
      ];

      allowedFields.forEach((field) => {
        if (updates[field] !== undefined) {
          swine[field] = updates[field];
        }
      });

      await swine.save();
      res.json({ success: true, message: "Swine updated successfully", swine });
    } catch (error) {
      console.error("[UPDATE SWINE ERROR]:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

// ----------------------
// Get all swine for manager/encoder (DETAILED LIST)
// ----------------------
router.get(
  "/all",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const user = req.user;
      const managerId =
        user.role === "farm_manager" ? user.id : user.managerId;

      const farmers = await Farmer.find({ registered_by: managerId }).select("_id");
      const farmerIds = farmers.map((f) => f._id);

      const swine = await Swine.find({
        $or: [
          { farmer_id: { $in: farmerIds } },
          { registered_by: managerId }
        ]
      })
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
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

// ----------------------
// Get swine assigned to the logged-in farmer (DETAILED)
// ----------------------
const { requireApiLogin } = require("../middleware/pageAuth.middleware");

router.get(
  "/farmer",
  requireApiLogin,
  allowRoles("farmer"),
  async (req, res) => {
    try {
      const user = req.user;
      if (!user.farmerProfileId) return res.status(400).json({ success: false, message: "Farmer profile not linked" });

      const swine = await Swine.find({
        farmer_id: new mongoose.Types.ObjectId(user.farmerProfileId),
      })
      .populate("farmer_id", "first_name last_name")
      .lean();

      const swineData = swine.map((s) => ({
        ...s,
        farmer_name: s.farmer_id ? `${s.farmer_id.first_name} ${s.farmer_id.last_name}`.trim() : "N/A",
        total_piglets_count: s.breeding_cycles?.reduce((sum, c) => sum + (c.farrowing_results?.total_piglets || 0), 0) || 0,
        total_mortality_count: s.breeding_cycles?.reduce((sum, c) => sum + (c.farrowing_results?.mortality_count || 0), 0) || 0
      }));

      res.json({ success: true, swine: swineData });
    } catch (err) {
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);


// ----------------------
// Get only male swine 
// ----------------------
router.get("/males", requireSessionAndToken, allowRoles("farm_manager", "encoder"), async (req, res) => {
  try {
    const user = req.user;
    const managerId = user.role === "farm_manager" ? user.id : user.managerId;

    const males = await Swine.find({ 
      sex: "Male",
      $or: [
        { registered_by: managerId },
        { managerId: managerId },
        { manager_id: managerId }
      ]
    }).select("_id swine_id breed health_status");

    res.json({ success: true, males });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error fetching male swine" });
  }
});

module.exports = router;