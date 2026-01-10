const express = require("express");
const router = express.Router();
const adminOnly = require("../middleware/adminOnly");

const User = require("../models/UserModel");
const Farmer = require("../models/UserFarmer");
const Swine = require("../models/Swine");
const Heat = require("../models/HeatReports");
const Breeding = require("../models/SwinePerformance");

router.use(adminOnly);

// Admin dashboard stats
router.get("/stats", async (req, res) => {
  try {
    const farmManagers = await User.countDocuments({ role: "farm_manager" });
    const farmers = await Farmer.countDocuments();
    const swine = await Swine.countDocuments();
    const heatReports = await Heat.countDocuments();
    const breedingRecords = await Breeding.countDocuments();

    res.json({
      success: true,
      stats: { farmManagers, farmers, swine, heatReports, breedingRecords }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// List all users
router.get("/users", async (req, res) => {
  try {
    const users = await User.find().select("-password -__v");
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update user role/status
router.put("/user/:id", async (req, res) => {
  try {
    const { role, status } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    if (role) user.role = role;
    if (status) user.status = status;

    await user.save();
    res.json({ success: true, message: "User updated successfully", user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Data Oversight
router.get("/data", async (req, res) => {
  try {
    // Get farm managers
    const farmManagers = await User.find({ role: "farm_manager" })
      .select("-password -__v");

    // Get farmers and populate 'registered_by'
    const farmers = await Farmer.find()
      .select("-password -__v")
      .populate("registered_by", "fullName");

    const swine = await Swine.find().select("-__v");
    const heatReports = await Heat.find().select("-__v");
    const breedingRecords = await Breeding.find().select("-__v");

    const data = { farmManagers, farmers, swine, heatReports, breedingRecords };

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
