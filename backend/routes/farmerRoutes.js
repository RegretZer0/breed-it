const express = require("express");
const router = express.Router();
const Farmer = require("../models/UserFarmer");

// GET farmer profile by FARMER _ID
router.get("/profile/:id", async (req, res) => {
  try {
    const farmerId = req.params.id;
    const farmer = await Farmer.findById(farmerId) // <-- changed from findOne({ user_id: ... })
      .select("-password")
      .lean();

    if (!farmer) return res.status(404).json({ success: false, message: "Farmer not found" });

    res.json({ success: true, farmer });
  } catch (err) {
    console.error("Fetch farmer profile error:", err);
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
});

module.exports = router;
