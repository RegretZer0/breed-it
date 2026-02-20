const express = require("express");
const router = express.Router();
const adminOnly = require("../middleware/adminOnly");
const os = require("os"); // For server health metrics

const User = require("../models/UserModel");
const Farmer = require("../models/UserFarmer");

router.use(adminOnly);

/**
 * GET /api/admin/stats
 * Replaced biological counts with User Growth & Server Health
 */
router.get("/stats", async (req, res) => {
  try {
    // 1. User Infrastructure Stats
    const totalUsers = await User.countDocuments();
    const farmManagers = await User.countDocuments({ role: "farm_manager" });
    const farmers = await Farmer.countDocuments();
    const systemAdmins = await User.countDocuments({ role: "system_admin" });

    // 2. Server Performance Data
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMemPercentage = (((totalMem - freeMem) / totalMem) * 100).toFixed(2);
    
    // CPU Load (1 min avg) and Capacity Check
    const cpuLoad = os.loadavg()[0];
    const cpuCores = os.cpus().length;
    const isHandlingLoad = cpuLoad < cpuCores;

    res.json({
      success: true,
      stats: {
        totalUsers,
        farmManagers,
        farmers,
        systemAdmins,
        serverStatus: isHandlingLoad ? "Stable" : "Strained",
        memoryUsage: `${usedMemPercentage}%`,
        cpuLoad: cpuLoad.toFixed(2),
        concurrentUsers: 1 // Placeholder: Integrate with Socket.io/Sessions for real-time
      }
    });
  } catch (err) {
    console.error("Stats Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * GET /api/admin/users
 * Lists all users for Access Control
 */
router.get("/users", async (req, res) => {
  try {
    const users = await User.find().select("first_name last_name fullName email role status");
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PUT /api/admin/user/:id
 * Update user role/status (Security Management)
 */
router.put("/user/:id", async (req, res) => {
  try {
    const { role, status } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    if (role) user.role = role;
    if (status) user.status = status;

    await user.save();
    res.json({ success: true, message: "User updated successfully", user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/admin/data
 * Refocused on User Oversight and System Load details
 */
router.get("/data", async (req, res) => {
  try {
    // 1. Get farm managers
    const farmManagers = await User.find({ role: "farm_manager" })
      .select("first_name last_name fullName email status");

    // 2. Get farmers and populate 'managerId'
    const farmers = await Farmer.find()
      .populate("managerId", "first_name last_name fullName email");

    // 3. System Environment Info
    const systemInfo = {
      platform: os.platform(),
      uptime: `${(os.uptime() / 3600).toFixed(2)} hours`,
      cpuModel: os.cpus()[0].model,
      totalMemory: `${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB`
    };

    res.json({ 
      success: true, 
      data: { 
        farmManagers, 
        farmers,
        systemInfo 
      } 
    });
  } catch (err) {
    console.error("Data Oversight Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;