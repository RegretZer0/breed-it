// backend/controllers/dashboardController.js
const Swine = require("../models/Swine");
const Farmer = require("../models/UserFarmer");
const HeatReport = require("../models/HeatReports");
const SystemSettings = require("../models/SystemSettings"); // Time Warp support
const mongoose = require("mongoose");

/**
 * Dashboard stats for Farm Manager (and Encoder under a manager).
 * Merged: control-70 (managerId scope + lactating via HeatReport) + mvp (Time Warp virtualNow).
 * FIXED: Replaced loose spreads with strict $and wraps to force 0 on empty accounts.
 */
async function getFarmManagerStats(req, res) {
  try {
    // 1) Resolve "Logical Time" (Time Warp)
    const systemSettings = await SystemSettings.findOne();
    const virtualNow =
      systemSettings && systemSettings.mockDate
        ? new Date(systemSettings.mockDate)
        : global.getNow
          ? global.getNow()
          : new Date();

    // 2) Support farm_manager and encoder (encoder has managerId)
    const managerId =
      req.user.role === "farm_manager" ? req.user.id : req.user.managerId;

    if (!managerId) {
      return res.status(403).json({
        success: false,
        message: "No manager assigned",
      });
    }

    const mId = new mongoose.Types.ObjectId(managerId);

    // 3) Find all farmers under this manager
    const farmers = await Farmer.find({
      $or: [{ managerId: mId }, { registered_by: mId }],
    }).select("_id");

    const farmerIds = farmers.map((f) => f._id);

    // 4) Unified Scope: Pigs belong to this manager or their farmers
    const scopeQuery = {
      $or: [
        { registered_by: mId },
        { managerId: mId }, 
        { farmer_id: { $in: farmerIds } },
      ],
    };

    // 5) Active pigs only (Alive and not sold)
    const activeQuery = {
      ...scopeQuery,
      current_status: { $nin: ["Culled", "Culled/Sold"] },
      health_status: { $nin: ["Deceased", "Deceased (Before Weaning)", "Dead", "Death"] },
    };

    // 6) Compute stats
    const [
      totalPigs,
      alive,
      mortality,
      inHeat,
      pregnant,
      farrowing,
      weaning,
      lactating,
    ] = await Promise.all([
      // Total pigs
      Swine.countDocuments(scopeQuery),

      // Alive pigs
      Swine.countDocuments(activeQuery),

      // Mortality: FIXED with strict $and wrap
      Swine.countDocuments({
        $and: [
          scopeQuery,
          {
            $or: [
              { health_status: { $in: ["Deceased", "Deceased (Before Weaning)", "Dead", "Death"] } },
              { current_status: { $in: ["Culled", "Culled/Sold"] } },
            ],
          },
        ],
      }),

      // In-heat
      Swine.countDocuments({
        ...activeQuery,
        current_status: "In-Heat",
      }),

      // Pregnant
      Swine.countDocuments({
        ...activeQuery,
        sex: "Female",
        current_status: "Pregnant",
        "breeding_cycles.expected_farrowing_date": { $gt: virtualNow },
      }),

      // Farrowing: FIXED with strict $and wrap
      Swine.countDocuments({
        $and: [
          activeQuery,
          {
            $or: [
              { current_status: { $in: ["Farrowing", "farrowing_ready", "awaiting_farrowing"] } },
              { 
                current_status: "Pregnant", 
                "breeding_cycles.expected_farrowing_date": { $lte: virtualNow } 
              },
            ],
          },
        ],
      }),

      // Weaning: FIXED with strict $and wrap
      Swine.countDocuments({
        $and: [
          activeQuery,
          {
            $or: [
              { current_status: { $in: ["Weaned", "Weaning"] } },
              {
                current_status: "Lactating",
                "breeding_cycles.actual_farrowing_date": {
                  $lte: new Date(virtualNow.getTime() - 30 * 24 * 60 * 60 * 1000),
                },
              },
            ],
          },
        ],
      }),

      // Lactating: source of truth from heat workflow
      HeatReport.countDocuments({
        $or: [{ managerId: mId }, { farmer_id: { $in: farmerIds } }],
        status: "lactating",
      }),
    ]);

    return res.json({
      success: true,
      virtualDateUsed: virtualNow.toISOString(),
      isMocked: !!(systemSettings && systemSettings.mockDate),
      stats: {
        totalPigs,
        alive,
        mortality,
        inHeat,
        pregnant,
        farrowing,
        weaning,
        lactating,
      },
    });
  } catch (err) {
    console.error("[DASHBOARD STATS ERROR]:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
}

module.exports = { getFarmManagerStats };