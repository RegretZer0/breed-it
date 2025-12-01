const express = require("express");
const router = express.Router();

const SwinePerformance = require("../models/SwinePerformance");
const AIRecord = require("../models/AIRecord");
const Swine = require("../models/Swine");

// -------------------
// Swine Performance CRUD
// -------------------

// Add new performance record
router.post("/performance/add", async (req, res) => {
  try {
    const recordData = {
      reproductionId: req.body.reproductionId,
      swine_id: req.body.swine_id,
      
      // FIXED: Always map frontend `parent_type` to schema `parentType`
      parentType: req.body.parentType || req.body.parent_type,

      recordDate: req.body.recordDate,
      weight: req.body.weight,
      bodyLength: req.body.bodyLength,
      heartGirth: req.body.heartGirth,
      color: req.body.color,
      teethCount: req.body.teethCount,
      teethAlignment: req.body.teethAlignment,
      legConformation: req.body.legConformation,
      hoofCondition: req.body.hoofCondition,
      bodySymmetryAndMuscling: req.body.bodySymmetryAndMuscling,
      noOfPiglets: req.body.noOfPiglets,
    };

    const record = new SwinePerformance(recordData);
    await record.save();
    res.status(201).json({ success: true, record });
  } catch (err) {
    console.error("Add performance error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get all performance records (populate swine info)
router.get("/performance/all", async (req, res) => {
  try {
    const records = await SwinePerformance.find()
      .populate("swine_id", "swine_id breed sex color")
      .lean();
    res.json({ success: true, records });
  } catch (err) {
    console.error("Fetch performance error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get single performance record by ID
router.get("/performance/:id", async (req, res) => {
  try {
    const record = await SwinePerformance.findById(req.params.id)
      .populate("swine_id", "swine_id breed sex color")
      .lean();
      
    if (!record)
      return res.status(404).json({ success: false, message: "Record not found" });

    res.json({ success: true, record });
  } catch (err) {
    console.error("Fetch performance error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update a performance record
router.put("/performance/:id", async (req, res) => {
  try {
    const updatedData = {
      swine_id: req.body.swine_id,

      // FIXED: map from frontend correctly
      parentType: req.body.parentType || req.body.parent_type,

      recordDate: req.body.recordDate,
      weight: req.body.weight,
      bodyLength: req.body.bodyLength,
      heartGirth: req.body.heartGirth,
      color: req.body.color,
      teethCount: req.body.teethCount,
      teethAlignment: req.body.teethAlignment,
      legConformation: req.body.legConformation,
      hoofCondition: req.body.hoofCondition,
      bodySymmetryAndMuscling: req.body.bodySymmetryAndMuscling,
      noOfPiglets: req.body.noOfPiglets,
    };

    const updated = await SwinePerformance.findByIdAndUpdate(
      req.params.id,
      updatedData,
      { new: true }
    );

    if (!updated)
      return res.status(404).json({ success: false, message: "Record not found" });

    res.json({ success: true, record: updated });
  } catch (err) {
    console.error("Update performance error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete a performance record
router.delete("/performance/:id", async (req, res) => {
  try {
    const deleted = await SwinePerformance.findByIdAndDelete(req.params.id);
    if (!deleted)
      return res
        .status(404)
        .json({ success: false, message: "Record not found" });

    res.json({ success: true, message: "Performance record deleted" });
  } catch (err) {
    console.error("Delete performance error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// -------------------
// AI Records CRUD
// -------------------

// Add new AI record
router.post("/ai/add", async (req, res) => {
  try {
    const record = new AIRecord(req.body);
    await record.save();
    res.status(201).json({ success: true, record });
  } catch (err) {
    console.error("Add AI record error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get all AI records (populate male/female swine info)
router.get("/ai/all", async (req, res) => {
  try {
    const records = await AIRecord.find()
      .populate("swine_id", "swine_id breed sex color")
      .populate("male_swine_id", "swine_id breed sex color")
      .lean();
    res.json({ success: true, records });
  } catch (err) {
    console.error("Fetch AI record error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get single AI record by ID
router.get("/ai/:id", async (req, res) => {
  try {
    const record = await AIRecord.findById(req.params.id)
      .populate("swine_id", "swine_id breed sex color")
      .populate("male_swine_id", "swine_id breed sex color")
      .lean();

    if (!record)
      return res.status(404).json({ success: false, message: "AI record not found" });

    res.json({ success: true, record });
  } catch (err) {
    console.error("Fetch AI record error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update AI record
router.put("/ai/:id", async (req, res) => {
  try {
    const updated = await AIRecord.findByIdAndUpdate(req.params.id, req.body, { new: true });

    if (!updated)
      return res.status(404).json({ success: false, message: "AI record not found" });

    res.json({ success: true, record: updated });
  } catch (err) {
    console.error("Update AI record error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete AI record
router.delete("/ai/:id", async (req, res) => {
  try {
    const deleted = await AIRecord.findByIdAndDelete(req.params.id);

    if (!deleted)
      return res.status(404).json({ success: false, message: "AI record not found" });

    res.json({ success: true, message: "AI record deleted" });
  } catch (err) {
    console.error("Delete AI record error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
