const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const Notification = require("../models/Notifications");
const UserModel = require("../models/UserModel"); // Managers & encoders
const { requireSessionAndToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

console.log("Notification typeof:", typeof Notification);
console.log("Notification keys:", Object.keys(Notification || {}));


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

      // 🔐 ENCODER RESTRICTION (INSERT HERE)
      if (req.user.role === "encoder" && user_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: "Encoders can only create notifications for themselves",
        });
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
   GET USER NOTIFICATIONS (supports multiple IDs)
   Example: /user/123,456
====================================================== */
router.get(
  "/user/:userIds",
  requireSessionAndToken,
  allowRoles("farmer", "farm_manager", "encoder", "admin"),
  async (req, res) => {
    try {
      const { userIds } = req.params;
      if (!userIds) return res.status(400).json({ success: false, message: "No user IDs provided" });

      const idsArray = userIds
        .split(",")
        .map(id => id.trim())
        .filter(id => mongoose.Types.ObjectId.isValid(id))
        .map(id => new mongoose.Types.ObjectId(id));

      if (idsArray.length === 0) {
        return res.status(400).json({ success: false, message: "No valid user IDs provided" });
      }

      let notifications = await Notification.find({ user_id: { $in: idsArray } })
        .sort({ created_at: -1 })
        .lean();

      // Map read status per user
      notifications = notifications.map(n => ({
        ...n,
        is_read: n.read_by?.some(uid => idsArray.includes(uid.toString())) || false
      }));

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
      const userId = req.user.id; // ID of logged-in user
      const notification = await Notification.findById(req.params.id);
      if (!notification) return res.status(404).json({ success: false, message: "Notification not found" });

      // Add userId to read_by array if not already present
      if (!notification.read_by.includes(userId)) {
        notification.read_by.push(userId);
        await notification.save();
      }

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
