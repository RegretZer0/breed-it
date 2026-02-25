const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const Notification = require("../models/Notifications");
const UserModel = require("../models/UserModel"); // Managers & encoders
const { requireSessionAndToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

// Debugging logs
console.log("Notification Model Status: Loaded");

/*======================================================
    NEW: NOTIFY ADMINS (Matches report.api.js call)
====================================================== */
router.post(
  "/admin",
  requireSessionAndToken,
  async (req, res) => {
    try {
      const { title, message, type } = req.body;

      // Find all system admins
      const admins = await UserModel.find({ role: "system_admin" });

      if (!admins || admins.length === 0) {
        return res.status(200).json({ success: true, message: "No admins to notify" });
      }

      // Create a notification for every admin found
      const notificationPromises = admins.map(admin => {
        return Notification.create({
          user_id: admin._id,
          title: title || "Admin Alert",
          message: message || "A new event requires attention",
          type: type || "info",
          is_global: false
        });
      });

      await Promise.all(notificationPromises);

      res.status(201).json({ success: true, message: "Admins notified successfully" });
    } catch (err) {
      console.error("Admin notification error:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

/*======================================================
    AUTO NOTIFY FARM MANAGER & ENCODERS
====================================================== */
router.post(
  "/",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder", "system_admin"),
  async (req, res) => {
    try {
      const { user_id, title, message, type, scheduled_for, ends_at } = req.body;

      if (!user_id || !title || !message) {
        return res.status(400).json({ success: false, message: "Missing fields" });
      }

      // 🔐 ENCODER RESTRICTION
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
        type: type || "info",
        scheduled_for,
        ends_at
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
====================================================== */
router.get(
  "/user/:userIds",
  requireSessionAndToken,
  allowRoles("farmer", "farm_manager", "encoder", "system_admin"),
  async (req, res) => {
    try {
      const { userIds } = req.params;
      if (!userIds) {
        return res.status(400).json({ success: false, message: "No user IDs provided" });
      }

      const idsArray = userIds
        .split(",")
        .map(id => id.trim())
        .filter(id => mongoose.Types.ObjectId.isValid(id))
        .map(id => new mongoose.Types.ObjectId(id));

      if (idsArray.length === 0) {
        return res.status(400).json({ success: false, message: "No valid user IDs provided" });
      }

      let notifications = await Notification.find({
        user_id: { $in: idsArray }
      })
        .sort({ created_at: -1 })
        .lean();

      const userIdStrs = idsArray.map(id => id.toString());

      notifications = notifications.map(n => ({
        ...n,
        is_read: n.read_by?.some(uid =>
          userIdStrs.includes(uid.toString())
        ) || false
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
  allowRoles("farmer", "farm_manager", "encoder", "system_admin"),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const notification = await Notification.findById(req.params.id);
      if (!notification) return res.status(404).json({ success: false, message: "Notification not found" });

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
    MARK ALL NOTIFICATIONS AS READ (supports multiple IDs)
====================================================== */
router.post(
  "/user/:userIds/read-all",
  requireSessionAndToken,
  allowRoles("farmer", "farm_manager", "encoder", "system_admin"),
  async (req, res) => {
    try {
      const { userIds } = req.params;

      if (!userIds) {
        return res.status(400).json({ success: false, message: "No user IDs provided" });
      }

      const idsArray = userIds
        .split(",")
        .map(id => id.trim())
        .filter(id => mongoose.Types.ObjectId.isValid(id))
        .map(id => new mongoose.Types.ObjectId(id));

      if (idsArray.length === 0) {
        return res.status(400).json({ success: false, message: "No valid user IDs provided" });
      }

      // 🔐 Restrict farmers/encoders to only mark their own notifications
      if ((req.user.role === "encoder" || req.user.role === "farmer") && userIds.includes(",")) {
        return res.status(403).json({
          success: false,
          message: "You can only mark notifications as read for your own account",
        });
      }

      if (req.user.role === "encoder" || req.user.role === "farmer") {
        const onlyId = idsArray[0]?.toString();
        if (onlyId !== req.user.id) {
          return res.status(403).json({
            success: false,
            message: "You can only mark notifications as read for your own account",
          });
        }
      }

      // Add current user's id into read_by for all matching notifications
      const result = await Notification.updateMany(
        { user_id: { $in: idsArray }, read_by: { $ne: req.user.id } },
        { $addToSet: { read_by: req.user.id } }
      );

      res.json({
        success: true,
        message: "All notifications marked as read",
        modified: result.modifiedCount ?? result.nModified ?? 0
      });
    } catch (err) {
      console.error("Mark all as read error:", err);
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
  allowRoles("farm_manager", "encoder", "farmer", "system_admin"),
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

/*======================================================
    ADMIN: BROADCAST SYSTEM MAINTENANCE
====================================================== */
router.post(
  "/broadcast-maintenance",
  requireSessionAndToken,
  async (req, res) => {
    try {
      if (req.user.role !== "system_admin") {
        return res.status(403).json({ success: false, message: "Unauthorized: Admins only" });
      }

      const { title, message, scheduled_for, ends_at } = req.body;

      if (!title || !message || !scheduled_for || !ends_at) {
        return res.status(400).json({ success: false, message: "Missing required schedule fields" });
      }

      const notification = await Notification.create({
        user_id: req.user.id, 
        title,
        message,
        type: "maintenance",
        is_global: true,
        scheduled_for: new Date(scheduled_for),
        ends_at: new Date(ends_at)
      });

      console.log("Broadcast success:", notification._id);
      res.status(201).json({ success: true, notification });
    } catch (err) {
      console.error("❌ Broadcast error details:", err);
      res.status(500).json({ success: false, message: "Server error", details: err.message });
    }
  }
);

/*======================================================
    GET ACTIVE GLOBAL ALERTS (For all users)
====================================================== */
router.get("/global", async (req, res) => {
  try {
    const alerts = await Notification.find({
      is_global: true,
      $or: [
        { ends_at: { $gt: new Date() } },
        { ends_at: null }
      ]
    }).sort({ created_at: -1 });

    res.json({ success: true, alerts });
  } catch (err) {
    console.error("Global fetch error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;