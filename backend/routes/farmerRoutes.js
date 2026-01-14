const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const Farmer = require("../models/UserFarmer");

const { requireSessionAndToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { requireApiLogin } = require("../middleware/pageAuth.middleware");

/* ======================================================
   GET LOGGED-IN FARMER PROFILE (SESSION-BASED)
====================================================== */
router.get("/profile", requireApiLogin, async (req, res) => {
  try {
    const user = req.user;

    if (!user || user.role !== "farmer") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    let userObjectId = null;
    if (mongoose.Types.ObjectId.isValid(user.id)) {
      userObjectId = new mongoose.Types.ObjectId(user.id);
    }

    const farmer = await Farmer.findOne({
      $or: [
        userObjectId ? { user_id: userObjectId } : null,
        user.email ? { email: user.email } : null,
      ].filter(Boolean),
    })
      .select("-password")
      .lean();

    if (!farmer) {
      return res.status(404).json({
        success: false,
        message: "Farmer profile not found",
      });
    }

    farmer.name = `${farmer.first_name || ""} ${farmer.last_name || ""}`.trim();

    res.json({ success: true, farmer });
  } catch (err) {
    console.error("Fetch logged-in farmer profile error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ======================================================
   GET FARMER PROFILE BY FARMER ID
====================================================== */
router.get(
  "/profile/:id",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const farmerId = req.params.id;
      const user = req.user;

      if (!mongoose.Types.ObjectId.isValid(farmerId)) {
        return res.status(400).json({ success: false, message: "Invalid farmer ID" });
      }

      const farmer = await Farmer.findById(farmerId)
        .select("-password")
        .lean();

      if (!farmer) {
        return res.status(404).json({ success: false, message: "Farmer not found" });
      }

      if (
        (user.role === "farm_manager" && farmer.managerId?.toString() !== user.id) ||
        (user.role === "encoder" && farmer.managerId?.toString() !== user.managerId)
      ) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }

      farmer.name = `${farmer.first_name || ""} ${farmer.last_name || ""}`.trim();

      res.json({ success: true, farmer });
    } catch (err) {
      console.error("Fetch farmer profile by ID error:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

/* ======================================================
   UPDATE LOGGED-IN FARMER PROFILE
====================================================== */
router.put("/profile", requireApiLogin, async (req, res) => {
  try {
    const user = req.user;

    if (!user || user.role !== "farmer") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    let userObjectId = null;
    if (mongoose.Types.ObjectId.isValid(user.id)) {
      userObjectId = new mongoose.Types.ObjectId(user.id);
    }

    const { name, email, contact_no, address } = req.body;

    const update = {};

    if (name) {
      const parts = name.trim().split(" ");
      update.first_name = parts.shift();
      update.last_name = parts.join(" ");
    }
    if (email) update.email = email;
    if (contact_no) update.contact_no = contact_no;
    if (address) update.address = address;

    const updatedFarmer = await Farmer.findOneAndUpdate(
      {
        $or: [
          userObjectId ? { user_id: userObjectId } : null,
          user.email ? { email: user.email } : null,
        ].filter(Boolean),
      },
      { $set: update },
      { new: true }
    ).lean();

    if (!updatedFarmer) {
      return res.status(404).json({
        success: false,
        message: "Farmer profile not found",
      });
    }

    updatedFarmer.name =
      `${updatedFarmer.first_name || ""} ${updatedFarmer.last_name || ""}`.trim();

    res.json({ success: true, farmer: updatedFarmer });
  } catch (err) {
    console.error("Update farmer profile error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
