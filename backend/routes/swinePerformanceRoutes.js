const express = require("express");
const router = express.Router();

const SwinePerformance = require("../models/SwinePerformance");
const AIRecord = require("../models/AIRecord");
const Swine = require("../models/Swine");

const { requireSessionAndToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

// ----------------------
// Swine Performance CRUD
// ----------------------

// Add new performance record
router.post(
  "/performance/add",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const { managerId, swine_id } = req.body;
      if (!managerId || !swine_id) {
        return res.status(400).json({ success: false, message: "managerId and swine_id are required" });
      }

      const user = req.user;

      // Access control
      if (
        user.role === "farm_manager" && managerId !== user.id ||
        user.role === "encoder" && managerId !== user.managerId
      ) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }

      const swine = await Swine.findOne({ _id: swine_id, registered_by: managerId });
      if (!swine) return res.status(403).json({ success: false, message: "Swine not found or does not belong to this manager" });

      const record = new SwinePerformance({ ...req.body, manager_id: managerId });
      await record.save();

      console.log(`[ADD PERFORMANCE] Manager: ${managerId}, Swine: ${swine_id}, Record: ${record._id}`);
      res.status(201).json({ success: true, record });
    } catch (err) {
      console.error("[ADD PERFORMANCE ERROR]:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// Get all performance records
router.get(
  "/performance/all",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const user = req.user;
      let filter = {};

      if (user.role === "farm_manager") filter = { manager_id: user.id };
      else if (user.role === "encoder") filter = { manager_id: user.managerId };

      const records = await SwinePerformance.find(filter)
        .populate("swine_id", "swine_id breed sex color")
        .lean();

      res.json({ success: true, records });
    } catch (err) {
      console.error("[FETCH PERFORMANCE ERROR]:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// Get single performance record
router.get(
  "/performance/:id",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const user = req.user;
      const record = await SwinePerformance.findById(req.params.id)
        .populate("swine_id", "swine_id breed sex color")
        .lean();

      if (!record) return res.status(404).json({ success: false, message: "Record not found" });

      // Access control
      if (
        user.role === "farm_manager" && record.manager_id.toString() !== user.id ||
        user.role === "encoder" && record.manager_id.toString() !== user.managerId
      ) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }

      res.json({ success: true, record });
    } catch (err) {
      console.error("[FETCH SINGLE PERFORMANCE ERROR]:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// Update performance record
router.put(
  "/performance/:id",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const { managerId, swine_id } = req.body;
      const user = req.user;

      if (!managerId) return res.status(400).json({ success: false, message: "managerId is required" });

      // Access control
      if (
        user.role === "farm_manager" && managerId !== user.id ||
        user.role === "encoder" && managerId !== user.managerId
      ) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }

      if (swine_id) {
        const swine = await Swine.findOne({ _id: swine_id, registered_by: managerId });
        if (!swine) return res.status(403).json({ success: false, message: "Swine does not belong to this manager" });
      }

      const updated = await SwinePerformance.findOneAndUpdate(
        { _id: req.params.id, manager_id: managerId },
        req.body,
        { new: true }
      );

      if (!updated) return res.status(404).json({ success: false, message: "Record not found" });

      console.log(`[UPDATE PERFORMANCE] Manager: ${managerId}, Record: ${updated._id}`);
      res.json({ success: true, record: updated });
    } catch (err) {
      console.error("[UPDATE PERFORMANCE ERROR]:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// Delete performance record
router.delete(
  "/performance/:id",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const { managerId } = req.query;
      const user = req.user;

      if (!managerId) return res.status(400).json({ success: false, message: "managerId is required" });

      // Access control
      if (
        user.role === "farm_manager" && managerId !== user.id ||
        user.role === "encoder" && managerId !== user.managerId
      ) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }

      const deleted = await SwinePerformance.findOneAndDelete({ _id: req.params.id, manager_id: managerId });
      if (!deleted) return res.status(404).json({ success: false, message: "Record not found" });

      console.log(`[DELETE PERFORMANCE] Manager: ${managerId}, Record: ${deleted._id}`);
      res.json({ success: true, message: "Performance record deleted" });
    } catch (err) {
      console.error("[DELETE PERFORMANCE ERROR]:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// ----------------------
// AI Records CRUD
// ----------------------

// Add AI record
router.post(
  "/ai/add",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const { managerId, swine_id, male_swine_id } = req.body;
      const user = req.user;

      if (!managerId || !swine_id || !male_swine_id) {
        return res.status(400).json({ success: false, message: "managerId, swine_id, and male_swine_id are required" });
      }

      // Access control
      if (
        user.role === "farm_manager" && managerId !== user.id ||
        user.role === "encoder" && managerId !== user.managerId
      ) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }

      const swines = await Swine.find({ _id: { $in: [swine_id, male_swine_id] }, registered_by: managerId });
      if (swines.length !== 2) return res.status(403).json({ success: false, message: "One or more swines do not belong to this manager" });

      const record = new AIRecord({ ...req.body, manager_id: managerId });
      await record.save();

      console.log(`[ADD AI] Manager: ${managerId}, Record: ${record._id}`);
      res.status(201).json({ success: true, record });
    } catch (err) {
      console.error("[ADD AI ERROR]:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// Get all AI records
router.get(
  "/ai/all",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const user = req.user;
      let filter = {};

      if (user.role === "farm_manager") filter = { manager_id: user.id };
      else if (user.role === "encoder") filter = { manager_id: user.managerId };

      const records = await AIRecord.find(filter)
        .populate("swine_id", "swine_id breed sex color")
        .populate("male_swine_id", "swine_id breed sex color")
        .lean();

      res.json({ success: true, records });
    } catch (err) {
      console.error("[FETCH AI ERROR]:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// Get single AI record
router.get(
  "/ai/:id",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const user = req.user;
      const record = await AIRecord.findById(req.params.id)
        .populate("swine_id", "swine_id breed sex color")
        .populate("male_swine_id", "swine_id breed sex color")
        .lean();

      if (!record) return res.status(404).json({ success: false, message: "AI record not found" });

      if (
        user.role === "farm_manager" && record.manager_id.toString() !== user.id ||
        user.role === "encoder" && record.manager_id.toString() !== user.managerId
      ) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }

      res.json({ success: true, record });
    } catch (err) {
      console.error("[FETCH SINGLE AI ERROR]:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// Update AI record
router.put(
  "/ai/:id",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const { managerId, swine_id, male_swine_id } = req.body;
      const user = req.user;

      if (!managerId) return res.status(400).json({ success: false, message: "managerId is required" });

      const swineIdsToCheck = [];
      if (swine_id) swineIdsToCheck.push(swine_id);
      if (male_swine_id) swineIdsToCheck.push(male_swine_id);

      if (swineIdsToCheck.length > 0) {
        const swines = await Swine.find({ _id: { $in: swineIdsToCheck }, registered_by: managerId });
        if (swines.length !== swineIdsToCheck.length) return res.status(403).json({ success: false, message: "One or more swines do not belong to this manager" });
      }

      if (
        user.role === "farm_manager" && managerId !== user.id ||
        user.role === "encoder" && managerId !== user.managerId
      ) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }

      const updated = await AIRecord.findOneAndUpdate(
        { _id: req.params.id, manager_id: managerId },
        req.body,
        { new: true }
      );

      if (!updated) return res.status(404).json({ success: false, message: "AI record not found" });

      console.log(`[UPDATE AI] Manager: ${managerId}, Record: ${updated._id}`);
      res.json({ success: true, record: updated });
    } catch (err) {
      console.error("[UPDATE AI ERROR]:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// Delete AI record
router.delete(
  "/ai/:id",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const { managerId } = req.query;
      const user = req.user;

      if (!managerId) return res.status(400).json({ success: false, message: "managerId is required" });

      if (
        user.role === "farm_manager" && managerId !== user.id ||
        user.role === "encoder" && managerId !== user.managerId
      ) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }

      const deleted = await AIRecord.findOneAndDelete({ _id: req.params.id, manager_id: managerId });
      if (!deleted) return res.status(404).json({ success: false, message: "AI record not found" });

      console.log(`[DELETE AI] Manager: ${managerId}, Record: ${deleted._id}`);
      res.json({ success: true, message: "AI record deleted" });
    } catch (err) {
      console.error("[DELETE AI ERROR]:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

module.exports = router;
