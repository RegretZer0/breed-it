const express = require("express");
const router = express.Router();
const Swine = require("../models/Swine");
const User = require("../models/UserModel");
const Farmer = require("../models/UserFarmer");

// Add new swine
router.post("/add", async (req, res) => {
  const {
    farmer_id,
    sex,
    color,
    breed,
    birthDate,
    status,
    sireId,
    damId,
    inventoryStatus,
    dateTransfer,
    batch,
    adminId,
  } = req.body;

  try {
    if (!farmer_id || !sex || !adminId || !batch) {
      return res.status(400).json({
        success: false,
        message: "Farmer ID, sex, batch, and admin ID are required"
      });
    }

    const admin = await User.findById(adminId);
    if (!admin || admin.role !== "admin") {
      return res.status(400).json({ success: false, message: "Invalid admin" });
    }

    const farmer = await Farmer.findOne({ _id: farmer_id, registered_by: adminId });
    if (!farmer) {
      return res.status(400).json({ success: false, message: "Farmer not found or not registered by this admin" });
    }

    // Generate SwineID based on batch
    const lastSwine = await Swine.find({ batch }).sort({ _id: -1 }).limit(1);
    let nextNumber = 1;
    if (lastSwine.length > 0 && lastSwine[0].swine_id) {
      const lastNum = parseInt(lastSwine[0].swine_id.split("-")[1]);
      if (!isNaN(lastNum)) nextNumber = lastNum + 1;
    }
    const swineId = `${batch}-${String(nextNumber).padStart(4, "0")}`;

    const newSwine = new Swine({
      swine_id: swineId,
      batch,
      registered_by: adminId,
      farmer_id: farmer._id,
      sex,
      color,
      breed,
      birth_date: birthDate,
      status,
      sire_id: sireId,
      dam_id: damId,
      inventory_status: inventoryStatus,
      date_transfer: dateTransfer,
      date_registered: new Date(),
    });

    await newSwine.save();
    console.log(`[ADD SWINE] New swine added: ${swineId} by admin: ${adminId}`);
    res.status(201).json({ success: true, message: "Swine added successfully", swine: newSwine });

  } catch (error) {
    console.error("[ADD SWINE ERROR]:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// Get swine
router.get("/", async (req, res) => {
  const { userId, role } = req.query;

  try {
    let swine;

    if (role === "admin") {
      const farmers = await Farmer.find({ registered_by: userId });
      const farmerIds = farmers.map(f => f._id);

      swine = await Swine.find({ farmer_id: { $in: farmerIds } })
                         .populate("farmer_id", "name");
    } else if (role === "farmer") {
      const farmer = await Farmer.findById(userId);
      if (!farmer) {
        console.log(`[SWINE FETCH] Farmer profile not found for userId: ${userId}`);
        return res.status(404).json({ success: false, message: "Farmer profile not found" });
      }

      swine = await Swine.find({ farmer_id: farmer._id })
                         .populate("farmer_id", "name");
    } else {
      console.log(`[SWINE FETCH] Access denied for role: ${role}`);
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    console.log(`[SWINE FETCH] Role: ${role}, UserId: ${userId}, Swines found: ${swine.length}`);

    const swineData = swine.map(s => ({
      _id: s._id,
      swine_id: s.swine_id,
      batch: s.batch,
      sex: s.sex,
      breed: s.breed,
      status: s.status,
      color: s.color,
      inventory_status: s.inventory_status,
      date_transfer: s.date_transfer,
      date_registered: s.date_registered,
      sire_id: s.sire_id,
      dam_id: s.dam_id,
      farmer_name: s.farmer_id?.name || "N/A",
    }));

    res.json({ success: true, swine: swineData });

  } catch (error) {
    console.error("[SWINE FETCH ERROR]:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// Update swine
router.put("/update/:swineId", async (req, res) => {
  const { swineId } = req.params;
  const { userId, role, ...updates } = req.body;

  try {
    const swine = await Swine.findOne({ swine_id: swineId });
    if (!swine) return res.status(404).json({ success: false, message: "Swine not found" });

    const farmer = await Farmer.findById(swine.farmer_id);
    if (role === "farmer" && swine.farmer_id.toString() !== userId) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    if (role === "admin" && farmer.registered_by.toString() !== userId) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const allowedFields = [
      "sex", "color", "breed", "birth_date", "status",
      "sire_id", "dam_id", "inventory_status", "date_transfer", "batch"
    ];

    allowedFields.forEach(field => {
      if (updates[field] !== undefined) swine[field] = updates[field];
    });

    await swine.save();
    console.log(`[UPDATE SWINE] Swine updated: ${swineId} by ${role}: ${userId}`);
    res.json({ success: true, message: "Swine updated successfully", swine });
  } catch (error) {
    console.error("[UPDATE SWINE ERROR]:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// Get all swines for dropdowns
router.get("/all", async (req, res) => {
  try {
    const swine = await Swine.find()
      .populate("farmer_id", "name")
      .lean();

    console.log(`[SWINE FETCH ALL] Total swines: ${swine.length}`);

    const swineData = swine.map(s => ({
      _id: s._id,
      swine_id: s.swine_id,
      sex: s.sex,
      breed: s.breed,
      color: s.color,
      farmer_name: s.farmer_id?.name || "N/A"
    }));

    res.json({ success: true, swine: swineData });
  } catch (err) {
    console.error("[SWINE FETCH ALL ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get only male swines
router.get("/males", async (req, res) => {
  try {
    const males = await Swine.find({ sex: "Male" })
      .populate("farmer_id", "name")
      .lean();

    console.log(`[SWINE FETCH MALES] Total males: ${males.length}`);

    const maleData = males.map(s => ({
      _id: s._id,
      swine_id: s.swine_id,
      breed: s.breed,
      color: s.color,
      farmer_name: s.farmer_id?.name || "N/A"
    }));

    res.json({ success: true, males: maleData });
  } catch (err) {
    console.error("[SWINE FETCH MALES ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
