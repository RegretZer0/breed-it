const Swine = require("../models/Swine");
const Farmer = require("../models/UserFarmer");

exports.getFarmManagerStats = async (req, res) => {
  try {
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

    // 📊 Aggregate stats
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
      Swine.countDocuments({
        ...baseQuery,
        sex: "Female",
        current_status: "Pregnant"
      }),
      Swine.countDocuments({
        ...baseQuery,
        current_status: "Farrowing"
      }),
      Swine.countDocuments({
        ...baseQuery,
        current_status: "Weaned"
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
        pregnant,
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
