const express = require("express");
const router = express.Router();
const adminOnly = require("../middleware/adminOnly");
const os = require("os");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const User = require("../models/UserModel");
const Farmer = require("../models/UserFarmer");
const Swine = require("../models/Swine");
const HeatReport = require("../models/HeatReports");
const Notification = require("../models/Notifications");
const SystemSettings = require("../models/SystemSettings");
const InfrastructureSnapshot = require("../models/InfrastructureSnapshot");
const { runSwineTransitions } = require("../utils/cronJobs");

router.use(adminOnly);

/* =========================================================
   MODULE: Helpers
   PURPOSE: Shared admin infrastructure utility helpers.
========================================================= */
function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizePercent(value) {
  return Math.max(0, Math.min(100, toNumber(value, 0)));
}

function getHealthLevel(percent) {
  const safe = normalizePercent(percent);
  if (safe >= 95) return "Critical";
  if (safe >= 85) return "Warning";
  return "Healthy";
}

function getSystemStatus({ cpuPercent = 0, memoryPercent = 0, dbConnected = true }) {
  if (!dbConnected) return "Critical";
  if (cpuPercent >= 95 || memoryPercent >= 95) return "Critical";
  if (cpuPercent >= 85 || memoryPercent >= 85) return "Warning";
  return "Healthy";
}

function getRuntimeEnvironment(req) {
  const explicit = process.env.APP_ENV || process.env.NODE_ENV;
  if (explicit) return String(explicit).toLowerCase();

  const host = String(req.hostname || "").toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") return "local";
  return "unknown";
}

function getCpuTimesSnapshot() {
  const cpus = os.cpus() || [];
  let idle = 0;
  let total = 0;

  cpus.forEach((cpu) => {
    const times = cpu.times || {};
    idle += times.idle || 0;
    total += Object.values(times).reduce((sum, value) => sum + value, 0);
  });

  return { idle, total };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getCpuUsagePercent() {
  const cpus = os.cpus() || [];
  if (!cpus.length) return null;

  const start = getCpuTimesSnapshot();
  await wait(250);
  const end = getCpuTimesSnapshot();

  const idleDiff = end.idle - start.idle;
  const totalDiff = end.total - start.total;

  if (totalDiff <= 0) return null;

  const usage = 100 - (idleDiff / totalDiff) * 100;
  return Math.max(0, Math.min(100, usage));
}

function getDirectorySize(targetPath) {
  try {
    if (!fs.existsSync(targetPath)) return 0;

    const stats = fs.statSync(targetPath);
    if (stats.isFile()) return stats.size;

    if (!stats.isDirectory()) return 0;

    return fs.readdirSync(targetPath).reduce((total, entry) => {
      return total + getDirectorySize(path.join(targetPath, entry));
    }, 0);
  } catch (err) {
    console.warn(`Failed to calculate directory size for ${targetPath}:`, err.message);
    return 0;
  }
}

async function getSessionCount() {
  try {
    if (!mongoose.connection?.db) return 0;
    const sessionsCollection = mongoose.connection.db.collection("sessions");
    return await sessionsCollection.countDocuments();
  } catch (err) {
    console.warn("Failed to count sessions:", err.message);
    return 0;
  }
}

async function getCollectionCounts() {
  try {
    const [users, farmers, swine, heatReports, notifications, sessions] = await Promise.all([
      User.countDocuments(),
      Farmer.countDocuments(),
      Swine.countDocuments(),
      HeatReport.countDocuments(),
      Notification.countDocuments(),
      getSessionCount(),
    ]);

    return {
      users,
      farmers,
      swine,
      heatReports,
      notifications,
      sessions,
    };
  } catch (err) {
    console.warn("Failed to load collection counts:", err.message);
    return {
      users: 0,
      farmers: 0,
      swine: 0,
      heatReports: 0,
      notifications: 0,
      sessions: 0,
    };
  }
}

async function recordInfrastructureSnapshot(snapshotPayload) {
  try {
    const latest = await InfrastructureSnapshot.findOne().sort({ capturedAt: -1 }).lean();

    const now = Date.now();
    const latestTime = latest?.capturedAt ? new Date(latest.capturedAt).getTime() : 0;

    if (latestTime && now - latestTime < 4 * 60 * 1000) {
      return;
    }

    await InfrastructureSnapshot.create(snapshotPayload);

    const oldSnapshots = await InfrastructureSnapshot.find({})
      .sort({ capturedAt: -1 })
      .skip(180)
      .select("_id")
      .lean();

    if (oldSnapshots.length) {
      await InfrastructureSnapshot.deleteMany({
        _id: { $in: oldSnapshots.map((item) => item._id) },
      });
    }
  } catch (err) {
    console.warn("Failed to save infrastructure snapshot:", err.message);
  }
}

/* =========================================================
   MODULE: Admin Stats API
   PURPOSE: Provide top-level admin dashboard summary metrics.
========================================================= */
router.get("/stats", async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const farmManagers = await User.countDocuments({ role: "farm_manager" });
    const farmers = await Farmer.countDocuments();
    const systemAdmins = await User.countDocuments({ role: "system_admin" });

    const virtualNow = global.getNow();
    const activityWindow = new Date(virtualNow.getTime() - 5 * 60 * 1000);

    const concurrentUsers = await User.countDocuments({
      lastActive: { $gte: activityWindow }
    });

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMemPercentage = totalMem > 0
      ? (((totalMem - freeMem) / totalMem) * 100).toFixed(2)
      : "0.00";

    const cpuLoad = os.loadavg()[0];
    const cpuCores = os.cpus().length || 1;
    const cpuUsageMeasured = await getCpuUsagePercent();
    const cpuPercent = cpuUsageMeasured == null ? null : cpuUsageMeasured.toFixed(2);

    res.json({
      success: true,
      stats: {
        totalUsers,
        farmManagers,
        farmers,
        systemAdmins,
        serverStatus: getSystemStatus({
          cpuPercent: toNumber(cpuPercent),
          memoryPercent: toNumber(usedMemPercentage),
          dbConnected: mongoose.connection.readyState === 1,
        }),
        memoryUsage: `${usedMemPercentage}%`,
        cpuLoad: process.platform === "win32" ? "N/A" : cpuLoad.toFixed(2),
        cpuUsagePercent: cpuPercent == null ? "N/A" : `${cpuPercent}%`,
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

/* =========================================================
   MODULE: Time Warp API
   PURPOSE: Shift or reset the server's virtual time.
========================================================= */
router.post("/set-system-time", async (req, res) => {
  try {
    const { targetDate } = req.body;

    if (!targetDate) {
      await SystemSettings.findOneAndUpdate({}, { mockDate: null }, { upsert: true });
      global.timeControl.offsetMS = 0;
      global.timeControl.isMocked = false;

      console.log("Time Warp: Reset to Real-Time in DB and Memory");
    } else {
      const targetParsed = new Date(targetDate);
      if (isNaN(targetParsed.getTime())) {
        return res.status(400).json({ success: false, message: "Invalid date format." });
      }

      await SystemSettings.findOneAndUpdate({}, { mockDate: targetParsed }, { upsert: true });

      const realNow = Date.now();
      global.timeControl.offsetMS = targetParsed.getTime() - realNow;
      global.timeControl.isMocked = true;

      console.log(`Time Warp Saved: ${targetParsed.toLocaleString()}`);
    }

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

/* =========================================================
   MODULE: Users API
   PURPOSE: Return all users for admin user management.
========================================================= */
router.get("/users", async (req, res) => {
  try {
    const users = await User.find().select("first_name last_name fullName email role status");
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* =========================================================
   MODULE: User Update API
   PURPOSE: Update admin-managed role and status fields.
========================================================= */
router.put("/user/:id", async (req, res) => {
  try {
    const { role, status } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (role) user.role = role;
    if (status) user.status = status;

    await user.save();

    res.json({
      success: true,
      message: "User updated successfully",
      user
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* =========================================================
   MODULE: Infrastructure Data API
   PURPOSE: Return live infrastructure, storage, database,
            activity, operations, and real trend insights.
========================================================= */
router.get("/data", async (req, res) => {
  try {
    const nodeVersion = process.version;
    const hostname = os.hostname();
    const platform = `${os.platform()} ${os.release()}`;
    const arch = os.arch();
    const uptimeSeconds = os.uptime();
    const runtimeEnvironment = getRuntimeEnvironment(req);

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memoryUsagePercent = totalMem > 0
      ? ((usedMem / totalMem) * 100).toFixed(2)
      : "0.00";

    const cpus = os.cpus() || [];
    const cpuModel = cpus[0]?.model || "--";
    const cpuCores = cpus.length || 0;
    const cpuLoadRaw = os.loadavg()[0] || 0;
    const cpuUsageMeasured = await getCpuUsagePercent();
    const cpuLoadPercent = cpuUsageMeasured == null
      ? null
      : cpuUsageMeasured.toFixed(2);

    const networkInterfaces = os.networkInterfaces();
    const networkList = [];

    Object.entries(networkInterfaces).forEach(([name, entries]) => {
      (entries || []).forEach((entry) => {
        if (!entry.internal && entry.family === "IPv4") {
          networkList.push({
            name,
            address: entry.address,
            mac: entry.mac || "--",
          });
        }
      });
    });

    const mongoReadyStateMap = {
      0: "Disconnected",
      1: "Connected",
      2: "Connecting",
      3: "Disconnecting",
    };

    const mongoState = mongoose.connection.readyState;
    const mongoStatus = mongoReadyStateMap[mongoState] || "Unknown";
    const dbConnected = mongoState === 1;

    let dbName = "--";
    let dbStats = {
      collections: 0,
      objects: 0,
      dataSize: 0,
      storageSize: 0,
      indexes: 0,
      indexSize: 0,
    };

    if (mongoose.connection?.db) {
      dbName = mongoose.connection.name || "--";

      try {
        const stats = await mongoose.connection.db.stats();
        dbStats = {
          collections: stats.collections || 0,
          objects: stats.objects || 0,
          dataSize: stats.dataSize || 0,
          storageSize: stats.storageSize || 0,
          indexes: stats.indexes || 0,
          indexSize: stats.indexSize || 0,
        };
      } catch (dbStatsErr) {
        console.warn("Database stats unavailable:", dbStatsErr.message);
      }
    }

    const virtualNow = global.getNow();
    const activityWindow = new Date(virtualNow.getTime() - 5 * 60 * 1000);

    const [
      totalUsers,
      farmManagers,
      encoders,
      farmers,
      concurrentUsers,
      activeSessions,
      collectionCounts,
      systemSettings,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "farm_manager" }),
      User.countDocuments({ role: "encoder" }),
      Farmer.countDocuments(),
      User.countDocuments({ lastActive: { $gte: activityWindow } }),
      getSessionCount(),
      getCollectionCounts(),
      SystemSettings.findOne().lean(),
    ]);

    const backendUploadsPath = path.join(__dirname, "..", "uploads");
    const pigUploadsPath = path.join(backendUploadsPath, "pigs");
    const userProfileUploadsPath = path.join(backendUploadsPath, "user_profiles");

    const uploadsTotalBytes = getDirectorySize(backendUploadsPath);
    const pigUploadsBytes = getDirectorySize(pigUploadsPath);
    const userProfileUploadsBytes = getDirectorySize(userProfileUploadsPath);

    const health = {
      apiStatus: "Online",
      databaseStatus: mongoStatus,
      serverStatus: getSystemStatus({
        cpuPercent: toNumber(cpuLoadPercent),
        memoryPercent: toNumber(memoryUsagePercent),
        dbConnected,
      }),
      cpuHealth: cpuLoadPercent == null ? "Unknown" : getHealthLevel(cpuLoadPercent),
      memoryHealth: getHealthLevel(memoryUsagePercent),
      timeMode: global.timeControl?.isMocked ? "Mocked" : "Real-Time",
    };

    await recordInfrastructureSnapshot({
      capturedAt: new Date(),
      cpuUsagePercent: cpuLoadPercent == null ? 0 : toNumber(cpuLoadPercent),
      memoryUsagePercent: toNumber(memoryUsagePercent),
      dbStorageSizeBytes: toNumber(dbStats.storageSize),
      dbDataSizeBytes: toNumber(dbStats.dataSize),
      concurrentUsers: toNumber(concurrentUsers),
      activeSessions: toNumber(activeSessions),
    });

    const snapshotRows = await InfrastructureSnapshot.find({})
      .sort({ capturedAt: -1 })
      .limit(240)
      .lean();

    const trends = snapshotRows
      .slice()
      .reverse()
      .map((row) => ({
        label: new Date(row.capturedAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        capturedAt: row.capturedAt,
        cpuUsagePercent: toNumber(row.cpuUsagePercent),
        memoryUsagePercent: toNumber(row.memoryUsagePercent),
        dbStorageSizeBytes: toNumber(row.dbStorageSizeBytes),
        dbDataSizeBytes: toNumber(row.dbDataSizeBytes),
        concurrentUsers: toNumber(row.concurrentUsers),
        activeSessions: toNumber(row.activeSessions),
      }));

    const systemInfo = {
      platform,
      uptime: `${(uptimeSeconds / 3600).toFixed(2)} hours`,
      cpuModel,
      totalMemory: `${(totalMem / 1024 / 1024 / 1024).toFixed(2)} GB`
    };

    const infrastructure = {
      app: {
        environment: runtimeEnvironment,
        hostname,
        nodeVersion,
        port: process.env.PORT || 5000,
        pid: process.pid,
        arch,
        serverTime: new Date().toISOString(),
        virtualTime: virtualNow.toISOString(),
        isTimeMocked: !!global.timeControl?.isMocked,
      },
      health,
      cpu: {
        model: cpuModel,
        cores: cpuCores,
        loadAverage: process.platform === "win32" ? "N/A" : cpuLoadRaw.toFixed(2),
        usagePercent: cpuLoadPercent == null ? "N/A" : cpuLoadPercent,
      },
      memory: {
        totalBytes: totalMem,
        freeBytes: freeMem,
        usedBytes: usedMem,
        usagePercent: memoryUsagePercent,
      },
      database: {
        name: dbName,
        status: mongoStatus,
        collections: dbStats.collections,
        objects: dbStats.objects,
        dataSizeBytes: dbStats.dataSize,
        storageSizeBytes: dbStats.storageSize,
        indexes: dbStats.indexes,
        indexSizeBytes: dbStats.indexSize,
      },
      uploads: {
        totalBytes: uploadsTotalBytes,
        pigsBytes: pigUploadsBytes,
        profilesBytes: userProfileUploadsBytes,
      },
      network: {
        hostname,
        interfaces: networkList,
        primaryAddress: networkList[0]?.address || "127.0.0.1",
      },
      users: {
        totalUsers,
        farmManagers,
        encoders,
        farmers,
      },
      activity: {
        concurrentUsers,
        activeSessions,
        activityWindowMinutes: 5,
      },
      collections: collectionCounts,
      operations: {
        cronStatus: systemSettings?.lastCronRun ? "Tracking" : "Unknown",
        lastCronRun: systemSettings?.lastCronRun || null,
        timeMode: health.timeMode,
      },
      trends,
    };

    res.json({
      success: true,
      data: {
        systemInfo,
        infrastructure
      }
    });
  } catch (err) {
    console.error("Infrastructure Data Error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to load infrastructure data."
    });
  }
});

module.exports = router;