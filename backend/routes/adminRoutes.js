const express = require("express");
const router = express.Router();
const adminOnly = require("../middleware/adminOnly");
const os = require("os"); 

const User = require("../models/UserModel");
const Farmer = require("../models/UserFarmer");

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
    // We use global.getNow() instead of Date.now() to check activity relative to mocked time
    const virtualNow = global.getNow();
    const activityWindow = new Date(virtualNow.getTime() - 5 * 60 * 1000);
    
    const concurrentUsers = await User.countDocuments({
      lastActive: { $gte: activityWindow }
    });

    // 3. Server Performance Data
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
        concurrentUsers: concurrentUsers || 0,
        // Added for debugging on dashboard
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
 * MVP Feature: Shift the server's perception of "Now"
 * UPDATED: Added robust parsing to prevent falling back to real-time
 */
router.post("/set-system-time", async (req, res) => {
  try {
    const { targetDate } = req.body;
    
    // 1. Reset Logic: If targetDate is null/empty, go back to reality
    if (!targetDate) {
      global.timeControl.offsetMS = 0;
      global.timeControl.isMocked = false;
      console.log("⏰ Time Warp: Reset to Real-Time");
      return res.json({ success: true, message: "System time reset to real-time." });
    }

    // 2. Parsing Logic: Convert the frontend string to a real timestamp
    const realNow = Date.now();
    const targetParsed = new Date(targetDate);
    const virtualNow = targetParsed.getTime();

    // 3. Error Handling: If the date is invalid, do NOT update the global offset
    if (isNaN(virtualNow)) {
      console.error("❌ Time Warp Error: Received invalid date string:", targetDate);
      return res.status(400).json({ success: false, message: "Invalid date format. Teleport failed." });
    }

    // 4. Calculate Offset: The difference between the "fake" time and "real" time
    global.timeControl.offsetMS = virtualNow - realNow;
    global.timeControl.isMocked = true;

    console.log(`🚀 Time Warp Active: Offset is ${global.timeControl.offsetMS}ms`);
    console.log(`📅 New Virtual Time: ${global.getNow().toLocaleString()}`);

    res.json({ 
      success: true, 
      message: "Time warp successful!",
      virtualTime: global.getNow().toLocaleString(),
      offsetHours: (global.timeControl.offsetMS / 3600000).toFixed(2)
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