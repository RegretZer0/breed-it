// backend/controllers/dashboardController.js
const Swine = require("../models/Swine");
const Farmer = require("../models/UserFarmer");
const HeatReport = require("../models/HeatReports");
const SystemSettings = require("../models/SystemSettings"); // Time Warp (mock date)

async function getFarmManagerStats(req, res) {
  try {
    // 1) Get the current "Logical Time" (Real or Mocked)
    const systemSettings = await SystemSettings.findOne();
    const virtualNow =
      systemSettings && systemSettings.mockDate
        ? new Date(systemSettings.mockDate)
        : new Date();

    // 2) Support Farm Manager + Encoder
    const managerId =
      req.user.role === "farm_manager" ? req.user.id : req.user.managerId;

    if (!managerId) {
      return res
        .status(403)
        .json({ success: false, message: "No manager assigned" });
    }

    // 3) Get all farmers under this manager
    const farmers = await Farmer.find({
      $or: [{ managerId }, { registered_by: managerId }],
    }).select("_id");

    const farmerIds = farmers.map((f) => f._id);

    // 4) Base query used by all stats
    const baseQuery = {
      $or: [
        { registered_by: managerId },
        { manager_id: managerId }, // include manager_id (control-70)
        { farmer_id: { $in: farmerIds } },
      ],
      current_status: { $ne: "Culled/Sold" },
    };

    // 5) Heat workflow scope (for lactating)
    const heatScopeQuery = {
      $or: [{ manager_id: managerId }, { farmer_id: { $in: farmerIds } }],
    };

    // 6) Aggregate stats using virtualNow for time-sensitive logic
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

      // Pregnant: Females who are pregnant but NOT ready to farrow yet
      Swine.countDocuments({
        ...baseQuery,
        sex: "Female",
        current_status: "Pregnant",
        "breeding_cycles.expected_farrowing_date": { $gt: virtualNow },
      }),

      // Farrowing: Farrowing statuses OR pregnant pigs whose expected date has arrived
      Swine.countDocuments({
        ...baseQuery,
        $or: [
          {
            current_status: {
              $in: ["Farrowing", "farrowing_ready", "awaiting_farrowing"],
            },
          },
          {
            current_status: "Pregnant",
            "breeding_cycles.expected_farrowing_date": { $lte: virtualNow },
          },
        ],
      }),

      Swine.countDocuments({
        ...baseQuery,
        current_status: { $in: ["Weaned", "Weaning"] },
      }),

      // Lactating from heat workflow
      HeatReport.countDocuments({ ...heatScopeQuery, status: "lactating" }),
    ]);

    return res.json({
      success: true,
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
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

module.exports = { getFarmManagerStats };