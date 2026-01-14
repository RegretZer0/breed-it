const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const Notification = require("../models/Notification");
const UserFarmer = require("../models/UserFarmer"); // Farmer model
const UserModel = require("../models/UserModel");   // Managers & encoders
const { requireSessionAndToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

/*======================================================
   AUTO NOTIFY FARM MANAGER & ENCODERS
====================================================== */
router.post(
  "/",
  requireSessionAndToken,
  allowRoles("farmer", "farm_manager", "encoder", "admin"),
  async (req, res) => {
    try {
      const { farmerName, title, message, type, expires_at } = req.body;

      if (!farmerName || !title || !message) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
      }

      // ---------------- Find the farmer ----------------
      const farmer = await UserFarmer.findOne({ full_name: farmerName });
      if (!farmer) return res.status(404).json({ success: false, message: "Farmer not found" });

      // ---------------- Find the farm manager ----------------
      const farmManager = await UserModel.findOne({ _id: farmer.manager_id, role: "farm_manager" });
      if (!farmManager) return res.status(404).json({ success: false, message: "Farm manager not found" });

      // ---------------- Find encoders under this farm manager ----------------
      const encoders = await UserModel.find({ manager_id: farmManager._id, role: "encoder" });

      // ---------------- Build recipient list ----------------
      const recipients = [farmManager._id, ...encoders.map(e => e._id)];

      // ---------------- Create notifications for all recipients ----------------
      const notifications = recipients.map(user_id => ({
        user_id,
        title,
        message,
        type: type || "info",
        expires_at
      }));

      await Notification.insertMany(notifications);

      res.status(201).json({ success: true, message: "Notifications sent", notifications });
    } catch (err) {
      console.error("Create notification error:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

/* ======================================================
   GET USER NOTIFICATIONS
====================================================== */
router.get(
  "/user/:userId",
  requireSessionAndToken,
  allowRoles("farmer", "farm_manager", "encoder", "admin"),
  async (req, res) => {
    try {
      const { userId } = req.params;

      const notifications = await Notification.find({ user_id: userId })
        .sort({ created_at: -1 })
        .lean();

      res.json({ success: true, notifications });
    } catch (err) {
      console.error("Fetch notifications error:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

/* ======================================================
   MARK NOTIFICATION AS READ
====================================================== */
router.post(
  "/:id/read",
  requireSessionAndToken,
  allowRoles("farmer", "farm_manager", "encoder", "admin"),
  async (req, res) => {
    try {
      const notification = await Notification.findById(req.params.id);
      if (!notification) return res.status(404).json({ success: false, message: "Notification not found" });

      notification.is_read = true;
      await notification.save();

      res.json({ success: true, message: "Notification marked as read" });
    } catch (err) {
      console.error("Mark notification read error:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

/* ======================================================
   DELETE NOTIFICATION
====================================================== */
router.delete(
  "/:id",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder", "farmer", "admin"),
  async (req, res) => {
    try {
      const notification = await Notification.findByIdAndDelete(req.params.id);
      if (!notification) return res.status(404).json({ success: false, message: "Notification not found" });

      res.json({ success: true, message: "Notification deleted" });
    } catch (err) {
      console.error("Delete notification error:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

module.exports = router;
