// backend/controllers/dashboardController.js
const Swine = require("../models/Swine");
const Farmer = require("../models/UserFarmer");
const HeatReport = require("../models/HeatReports");
const SystemSettings = require("../models/SystemSettings"); // Time Warp support

/**
 * Dashboard stats for Farm Manager (and Encoder under a manager).
 * Merged: control-70 (manager_id scope + lactating via HeatReport) + mvp (Time Warp virtualNow).
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

    // 3) Find all farmers under this manager (including those registered by manager)
    const farmers = await Farmer.find({
      $or: [{ managerId }, { registered_by: managerId }],
    }).select("_id");

    const farmerIds = farmers.map((f) => f._id);

    // 4) Base scope query for Swine stats
    //    Includes manager_id (control-70) + Time Warp stats behavior (mvp)
    const baseQuery = {
      $or: [
        { registered_by: managerId },
        { manager_id: managerId }, // include manager_id scope
        { farmer_id: { $in: farmerIds } },
      ],
      current_status: { $ne: "Culled/Sold" },
    };

    // 5) Heat workflow scope (for lactating count via HeatReport)
    const heatScopeQuery = {
      $or: [{ manager_id: managerId }, { farmer_id: { $in: farmerIds } }],
    };

    // 6) Compute stats (Time Warp-aware where relevant)
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
      Swine.countDocuments(baseQuery),

      Swine.countDocuments({
        ...baseQuery,
        health_status: { $nin: ["Deceased", "Deceased (Before Weaning)"] },
      }),

      Swine.countDocuments({
        ...baseQuery,
        health_status: { $in: ["Deceased", "Deceased (Before Weaning)"] },
      }),

      Swine.countDocuments({
        ...baseQuery,
        current_status: "In-Heat",
      }),

      // Pregnant: expected farrowing is still in the future relative to virtualNow
      Swine.countDocuments({
        ...baseQuery,
        sex: "Female",
        current_status: "Pregnant",
        "breeding_cycles.expected_farrowing_date": { $gt: virtualNow },
      }),

      // Farrowing: farrowing-related statuses OR pregnant whose farrowing date is due/past in virtualNow
      Swine.countDocuments({
        ...baseQuery,
        $or: [
          {
            current_status: {
              $in: ["Farrowing", "farrowing_ready", "awaiting_farrowing", "Lactating"],
            },
          },
          {
            current_status: "Pregnant",
            "breeding_cycles.expected_farrowing_date": { $lte: virtualNow },
          },
        ],
      }),

      // Weaning: already weaned/weaning OR lactating past 30 days since actual farrowing in virtualNow
      Swine.countDocuments({
        ...baseQuery,
        $or: [
          { current_status: { $in: ["Weaned", "Weaning"] } },
          {
            current_status: "Lactating",
            "breeding_cycles.actual_farrowing_date": {
              $lte: new Date(virtualNow.getTime() - 30 * 24 * 60 * 60 * 1000),
            },
          },
        ],
      }),

      // Lactating: source of truth from heat workflow (control-70 behavior)
      HeatReport.countDocuments({
        ...heatScopeQuery,
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