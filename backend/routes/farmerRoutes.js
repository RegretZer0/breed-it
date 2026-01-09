const express = require("express");
const router = express.Router();
const Farmer = require("../models/UserFarmer");
const { requireSessionAndToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

// ----------------------
// GET farmer profile by FARMER _ID
// Access rules:
//  - farm_manager: can view only farmers they registered
//  - encoder: can view only farmers under their farm_manager
//  - farmer: can view only their own profile
// ----------------------
router.get("/profile/:id", requireSessionAndToken, allowRoles("farm_manager", "encoder", "farmer"), async (req, res) => {
  try {
    const farmerId = req.params.id;
    const user = req.user; // decoded JWT session user

    // Fetch the farmer
    const farmer = await Farmer.findById(farmerId).select("-password").lean();
    if (!farmer) return res.status(404).json({ success: false, message: "Farmer not found" });

    // Access control
    switch (user.role) {
      case "farm_manager":
        if (farmer.registered_by.toString() !== user.id) {
          return res.status(403).json({ success: false, message: "Access denied" });
        }
        break;
      case "encoder":
        if (!farmer.registered_by.equals(user.managerId)) {
          return res.status(403).json({ success: false, message: "Access denied" });
        }
        break;
      case "farmer":
        if (farmer.user_id.toString() !== user.id) {
          return res.status(403).json({ success: false, message: "Access denied" });
        }
        break;
    }

    res.json({ success: true, farmer });
  } catch (err) {
    console.error("Fetch farmer profile error:", err);
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
});

module.exports = router;
