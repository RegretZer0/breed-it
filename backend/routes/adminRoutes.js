const express = require("express");
const router = express.Router();
const adminOnly = require("../middleware/adminOnly");
const os = require("os"); 

const User = require("../models/UserModel");
const Farmer = require("../models/UserFarmer");
const SystemSettings = require("../models/SystemSettings"); // ✅ Added for persistence
const { runSwineTransitions } = require("../utils/cronJobs"); // ✅ Added to trigger logic immediately

router.use(adminOnly);

/**
 * GET /api/admin/stats
 * Updated to use Global Virtual Time for concurrent user calculation
 */
router.get("/stats", async (req, res) => {
  try {
    // 1. User Infrastructure Stats
    const totalUsers = await User.countDocuments();
    const farmManagers = await User.countDocuments({ role: "farm_manager" });
    const farmers = await Farmer.countDocuments();
    const systemAdmins = await User.countDocuments({ role: "system_admin" });

    // 2. REAL-TIME CONCURRENT USERS LOGIC (Virtual Time Sensitive)
    const virtualNow = global.getNow();
    const activityWindow = new Date(virtualNow.getTime() - 5 * 60 * 1000);
    
    const concurrentUsers = await User.countDocuments({
      lastActive: { $gte: activityWindow }
    });

    // 3. Server Performance Data
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMemPercentage = (((totalMem - freeMem) / totalMem) * 100).toFixed(2);
    
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
        concurrentUsers: concurrentUsers || 0,
        isTimeMocked: global.timeControl.isMocked,
        virtualTime: virtualNow.toLocaleString()
      }
    });
  } catch (err) {
    console.error("Stats Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * POST /api/admin/set-system-time
 * MVP Feature: Shift the server's perception of "Now" and save to DB
 */
router.post("/set-system-time", async (req, res) => {
  try {
    const { targetDate } = req.body;
    
    // 1. Database Persistence & Global Logic
    if (!targetDate) {
      // RESET LOGIC
      await SystemSettings.findOneAndUpdate({}, { mockDate: null }, { upsert: true });
      global.timeControl.offsetMS = 0;
      global.timeControl.isMocked = false;
      
      console.log("⏰ Time Warp: Reset to Real-Time in DB and Memory");
    } else {
      // TELEPORT LOGIC
      const targetParsed = new Date(targetDate);
      if (isNaN(targetParsed.getTime())) {
        return res.status(400).json({ success: false, message: "Invalid date format." });
      }

      // Save to MongoDB so it persists after refresh/restart
      await SystemSettings.findOneAndUpdate({}, { mockDate: targetParsed }, { upsert: true });

      // Update Memory
      const realNow = Date.now();
      global.timeControl.offsetMS = targetParsed.getTime() - realNow;
      global.timeControl.isMocked = true;

      console.log(`🚀 Time Warp Saved: ${targetParsed.toLocaleString()}`);
    }

    // 2. IMMEDIATE ACTION: Run transitions now so user doesn't wait for cron
    // This makes the dashboard update instantly after warping
    await runSwineTransitions();

    res.json({ 
      success: true, 
      message: targetDate ? "Time warp successful!" : "System time reset.",
      virtualTime: global.getNow().toLocaleString(),
      isMocked: global.timeControl.isMocked
    });
  } catch (err) {
    console.error("Time Warp Route Error:", err);
    res.status(500).json({ success: false, message: "Failed to warp time." });
  }
});

/**
 * GET /api/admin/users
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
 */
router.get("/data", async (req, res) => {
  try {
    const farmManagers = await User.find({ role: "farm_manager" })
      .select("first_name last_name fullName email status");

    const farmers = await Farmer.find()
      .populate("managerId", "first_name last_name fullName email");

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