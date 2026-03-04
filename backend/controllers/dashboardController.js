const Swine = require("../models/Swine");
const Farmer = require("../models/UserFarmer");
const SystemSettings = require("../models/SystemSettings"); // ✅ Added for Time Warp

exports.getFarmManagerStats = async (req, res) => {
  try {
    // 1. Get the current "Logical Time" (Real or Mocked)
    const systemSettings = await SystemSettings.findOne();
    const virtualNow = (systemSettings && systemSettings.mockDate) 
                ? new Date(systemSettings.mockDate) 
                : new Date();

    // ✅ SUPPORT FARM MANAGER + ENCODER
    const managerId =
      req.user.role === "farm_manager"
        ? req.user.id
        : req.user.managerId;

    if (!managerId) {
      return res.status(403).json({
        success: false,
        message: "No manager assigned",
      });
    }

    // 🔍 Get all farmers under this manager
    const farmers = await Farmer.find({
      $or: [
        { managerId },
        { registered_by: managerId }
      ]
    }).select("_id");

    const farmerIds = farmers.map(f => f._id);

    // 🔎 Base query used by all stats
    const baseQuery = {
      $or: [
        { registered_by: managerId },
        { farmer_id: { $in: farmerIds } }
      ],
      current_status: { $ne: "Culled/Sold" }
    };

    // 📊 Aggregate stats using virtualNow for time-sensitive logic
    const [
      totalPigs,
      alive,
      mortality,
      inHeat,
      pregnant,
      farrowing,
      weaning
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

    // ✅ SUCCESS RESPONSE
    res.json({
      success: true,
      stats: {
        totalPigs,
        alive,
        mortality,
        inHeat,
        pregnant, // Fixed: removed stray 'a'
        farrowing,
        weaning
      }
    });

  } catch (err) {
    console.error("[DASHBOARD STATS ERROR]:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};