const express = require("express");
const router = express.Router();

const SwinePerformance = require("../models/SwinePerformance");
const AIRecord = require("../models/AIRecord");
const Swine = require("../models/Swine");

// Swine Performance CRUD
// Add new performance record (ADMIN-SCOPED)
router.post("/performance/add", async (req, res) => {
  try {
    const { adminId, swine_id } = req.body;
    if (!adminId || !swine_id) {
      return res.status(400).json({ success: false, message: "adminId and swine_id are required" });
    }

    const swine = await Swine.findOne({ _id: swine_id, registered_by: adminId });
    if (!swine) return res.status(403).json({ success: false, message: "Swine not found or does not belong to this admin" });

    const record = new SwinePerformance({ ...req.body, admin_id: adminId });
    await record.save();

    console.log(`[ADD PERFORMANCE] Admin: ${adminId}, Swine: ${swine_id}, Record: ${record._id}`);
    res.status(201).json({ success: true, record });
  } catch (err) {
    console.error("[ADD PERFORMANCE ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get all performance records (ADMIN-SCOPED)
router.get("/performance/all", async (req, res) => {
  try {
    const { adminId } = req.query;
    if (!adminId) return res.status(400).json({ success: false, message: "adminId is required" });

    const records = await SwinePerformance.find({ admin_id: adminId })
      .populate("swine_id", "swine_id breed sex color")
      .lean();

    res.json({ success: true, records });
  } catch (err) {
    console.error("[FETCH PERFORMANCE ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get single performance record (ADMIN-SCOPED)
router.get("/performance/:id", async (req, res) => {
  try {
    const { adminId } = req.query;
    if (!adminId) return res.status(400).json({ success: false, message: "adminId is required" });

    const record = await SwinePerformance.findOne({ _id: req.params.id, admin_id: adminId })
      .populate("swine_id", "swine_id breed sex color")
      .lean();

    if (!record) return res.status(404).json({ success: false, message: "Record not found" });

    res.json({ success: true, record });
  } catch (err) {
    console.error("[FETCH SINGLE PERFORMANCE ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update performance record (ADMIN-SCOPED)
router.put("/performance/:id", async (req, res) => {
  try {
    const { adminId, swine_id } = req.body;
    if (!adminId) return res.status(400).json({ success: false, message: "adminId is required" });

    if (swine_id) {
      const swine = await Swine.findOne({ _id: swine_id, registered_by: adminId });
      if (!swine) return res.status(403).json({ success: false, message: "Swine does not belong to this admin" });
    }

    const updated = await SwinePerformance.findOneAndUpdate(
      { _id: req.params.id, admin_id: adminId },
      req.body,
      { new: true }
    );

    if (!updated) return res.status(404).json({ success: false, message: "Record not found" });

    console.log(`[UPDATE PERFORMANCE] Admin: ${adminId}, Record: ${updated._id}`);
    res.json({ success: true, record: updated });
  } catch (err) {
    console.error("[UPDATE PERFORMANCE ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete performance record (ADMIN-SCOPED)
router.delete("/performance/:id", async (req, res) => {
  try {
    const { adminId } = req.query;
    if (!adminId) return res.status(400).json({ success: false, message: "adminId is required" });

    const deleted = await SwinePerformance.findOneAndDelete({ _id: req.params.id, admin_id: adminId });

    if (!deleted) return res.status(404).json({ success: false, message: "Record not found" });

    console.log(`[DELETE PERFORMANCE] Admin: ${adminId}, Record: ${deleted._id}`);
    res.json({ success: true, message: "Performance record deleted" });
  } catch (err) {
    console.error("[DELETE PERFORMANCE ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// AI Records CRUD
// Add AI record (ADMIN-SCOPED)
router.post("/ai/add", async (req, res) => {
  try {
    const { adminId, swine_id, male_swine_id } = req.body;
    if (!adminId || !swine_id || !male_swine_id) {
      return res.status(400).json({ success: false, message: "adminId, swine_id, and male_swine_id are required" });
    }

    const swines = await Swine.find({ _id: { $in: [swine_id, male_swine_id] }, registered_by: adminId });
    if (swines.length !== 2) return res.status(403).json({ success: false, message: "One or more swines do not belong to this admin" });

    const record = new AIRecord({ ...req.body, admin_id: adminId });
    await record.save();

    console.log(`[ADD AI] Admin: ${adminId}, Record: ${record._id}`);
    res.status(201).json({ success: true, record });
  } catch (err) {
    console.error("[ADD AI ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get all AI records (ADMIN-SCOPED)
router.get("/ai/all", async (req, res) => {
  try {
    const { adminId } = req.query;
    if (!adminId) return res.status(400).json({ success: false, message: "adminId is required" });

    const records = await AIRecord.find({ admin_id: adminId })
      .populate("swine_id", "swine_id breed sex color")
      .populate("male_swine_id", "swine_id breed sex color")
      .lean();

    res.json({ success: true, records });
  } catch (err) {
    console.error("[FETCH AI ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get single AI record (ADMIN-SCOPED)
router.get("/ai/:id", async (req, res) => {
  try {
    const { adminId } = req.query;
    if (!adminId) return res.status(400).json({ success: false, message: "adminId is required" });

    const record = await AIRecord.findOne({ _id: req.params.id, admin_id: adminId })
      .populate("swine_id", "swine_id breed sex color")
      .populate("male_swine_id", "swine_id breed sex color")
      .lean();

    if (!record) return res.status(404).json({ success: false, message: "AI record not found" });

    res.json({ success: true, record });
  } catch (err) {
    console.error("[FETCH SINGLE AI ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update AI record (ADMIN-SCOPED)
router.put("/ai/:id", async (req, res) => {
  try {
    const { adminId, swine_id, male_swine_id } = req.body;
    if (!adminId) return res.status(400).json({ success: false, message: "adminId is required" });

    const swineIdsToCheck = [];
    if (swine_id) swineIdsToCheck.push(swine_id);
    if (male_swine_id) swineIdsToCheck.push(male_swine_id);
    if (swineIdsToCheck.length > 0) {
      const swines = await Swine.find({ _id: { $in: swineIdsToCheck }, registered_by: adminId });
      if (swines.length !== swineIdsToCheck.length) return res.status(403).json({ success: false, message: "One or more swines do not belong to this admin" });
    }

    const updated = await AIRecord.findOneAndUpdate(
      { _id: req.params.id, admin_id: adminId },
      req.body,
      { new: true }
    );

    if (!updated) return res.status(404).json({ success: false, message: "AI record not found" });

    console.log(`[UPDATE AI] Admin: ${adminId}, Record: ${updated._id}`);
    res.json({ success: true, record: updated });
  } catch (err) {
    console.error("[UPDATE AI ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete AI record (ADMIN-SCOPED)
router.delete("/ai/:id", async (req, res) => {
  try {
    const { adminId } = req.query;
    if (!adminId) return res.status(400).json({ success: false, message: "adminId is required" });

    const deleted = await AIRecord.findOneAndDelete({ _id: req.params.id, admin_id: adminId });

    if (!deleted) return res.status(404).json({ success: false, message: "AI record not found" });

    console.log(`[DELETE AI] Admin: ${adminId}, Record: ${deleted._id}`);
    res.json({ success: true, message: "AI record deleted" });
  } catch (err) {
    console.error("[DELETE AI ERROR]:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
