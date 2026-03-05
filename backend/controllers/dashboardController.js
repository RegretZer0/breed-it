// backend/controllers/dashboardController.js
const Swine = require("../models/Swine");
const Farmer = require("../models/UserFarmer");
const HeatReport = require("../models/HeatReports");
const SystemSettings = require("../models/SystemSettings"); // ✅ Added for Time Warp

async function getFarmManagerStats(req, res) {
  try {
    // 1. Get the current "Logical Time" (Real or Mocked)
    const systemSettings = await SystemSettings.findOne();
    const virtualNow = (systemSettings && systemSettings.mockDate) 
                ? new Date(systemSettings.mockDate) 
                : new Date();

    // ✅ SUPPORT FARM MANAGER + ENCODER
    const managerId =
      req.user.role === "farm_manager" ? req.user.id : req.user.managerId;

    if (!managerId) {
      return res.status(403).json({ success: false, message: "No manager assigned" });
    }

    const farmers = await Farmer.find({
      $or: [{ managerId }, { registered_by: managerId }]
    }).select("_id");

    const farmerIds = farmers.map(f => f._id);

    const baseQuery = {
      $or: [
        { registered_by: managerId },
        { manager_id: managerId }, // ✅ include manager_id
        { farmer_id: { $in: farmerIds } }
      ],
      current_status: { $ne: "Culled/Sold" }
    };

    const heatScopeQuery = {
      $or: [
        { manager_id: managerId },
        { farmer_id: { $in: farmerIds } }
      ]
    };

    const [
      totalPigs,
      alive,
      mortality,
      inHeat,
      pregnant,
      farrowing,
      weaning,
      lactating
    ] = await Promise.all([
      Swine.countDocuments(baseQuery),
      Swine.countDocuments({
        ...baseQuery,
        health_status: { $nin: ["Deceased", "Deceased (Before Weaning)"] }
      }),
      Swine.countDocuments({
        ...baseQuery,
        health_status: { $in: ["Deceased", "Deceased (Before Weaning)"] }
      }),
      Swine.countDocuments({
        ...baseQuery,
        current_status: "In-Heat"
      }),
      // ✅ Updated Pregnant: Females who are pregnant but NOT ready to farrow yet
      Swine.countDocuments({
        ...baseQuery,
        sex: "Female",
        current_status: "Pregnant",
        "breeding_cycles.expected_farrowing_date": { $gt: virtualNow }
      }),
      // ✅ Updated Farrowing: Pigs in farrowing stage OR pregnant pigs whose date has arrived in 2026
      Swine.countDocuments({
        ...baseQuery,
        $or: [
          { current_status: { $in: ["Farrowing", "farrowing_ready", "awaiting_farrowing"] } },
          { 
            current_status: "Pregnant", 
            "breeding_cycles.expected_farrowing_date": { $lte: virtualNow } 
          }
        ]
      }),
      Swine.countDocuments({
        ...baseQuery,
        current_status: { $in: ["Weaned", "Weaning"] }
      })
    ]);

    return res.json({
      success: true,
      stats: {
        totalPigs,
        alive,
        mortality,
        inHeat,
        pregnant, // Fixed: removed stray 'a'
        farrowing,
        weaning,
        lactating
      }
    });
  } catch (err) {
    console.error("[DASHBOARD STATS ERROR]:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

module.exports = { getFarmManagerStats };
