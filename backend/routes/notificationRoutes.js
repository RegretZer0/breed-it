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
  allowRoles("farm_manager", "encoder", "admin"),
  async (req, res) => {
    try {
      const { user_id, title, message, type, expires_at } = req.body;

      if (!user_id || !title || !message) {
        return res.status(400).json({ success: false, message: "Missing fields" });
      }

      const notification = await Notification.create({
        user_id,
        title,
        message,
        type,
        expires_at
      });

      res.status(201).json({ success: true, notification });
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
