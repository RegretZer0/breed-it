const express = require("express");
const router = express.Router();
const Farmer = require("../models/UserFarmer");

// ✅ ADD: no-cache middleware
const noCache = require("../middleware/noCache");

// GET logged-in farmer profile (SESSION ONLY)
// GET logged-in farmer profile (SESSION ONLY)
router.get("/profile", async (req, res) => {
  try {
    if (!req.session?.user || req.session.user.role !== "farmer") {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const farmerId = req.session.user.id;

    const farmer = await Farmer.findById(farmerId)
      .select("-password")
      .lean();

    if (!farmer) {
      return res.status(404).json({ success: false, message: "Farmer not found" });
    }

    res.json({ success: true, farmer });
  } catch (err) {
    console.error("Fetch farmer profile error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
