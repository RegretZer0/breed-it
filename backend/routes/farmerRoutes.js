const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");

const router = express.Router();

const Farmer = require("../models/UserFarmer");
const Swine = require("../models/Swine");
const logAction = require("../middleware/logger");

const { requireSessionAndToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { requireApiLogin } = require("../middleware/pageAuth.middleware");

/* ======================================================
   MULTER CONFIGURATION
====================================================== */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/profiles");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

/* ======================================================
   GET LOGGED-IN FARMER PROFILE
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

    farmer.name =
      `${farmer.first_name || ""} ${farmer.last_name || ""}`.trim();

    res.json({ success: true, farmer });

  } catch (err) {
    console.error("Fetch logged-in farmer profile error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ======================================================
   GET FARMER SWINE
====================================================== */
router.get(
  "/farmer",
  requireApiLogin,
  allowRoles("farmer"),
  async (req, res) => {
    try {
      const farmerId = req.user.farmerProfileId;

      if (!farmerId) {
        return res.status(404).json({
          success: false,
          message: "Farmer profile not linked",
        });
      }

      const swine = await Swine.find({ farmer_id: farmerId })
        .populate("farmer_id", "first_name last_name")
        .lean();

      res.json({ success: true, swine });

    } catch (err) {
      console.error("[FETCH FARMER SWINE ERROR]:", err);
      res.status(500).json({
        success: false,
        message: "Server error while fetching swine",
      });
    }
  }
);

/* ======================================================
   UPDATE LOGGED-IN FARMER PROFILE
====================================================== */
router.put(
  "/profile",
  requireApiLogin,
  upload.single("profile_picture"),
  async (req, res) => {
    try {
      const user = req.user;

      if (!user || user.role !== "farmer") {
        return res.status(403).json({ success: false, message: "Access denied" });
      }

      let userObjectId = null;
      if (mongoose.Types.ObjectId.isValid(user.id)) {
        userObjectId = new mongoose.Types.ObjectId(user.id);
      }

      const {
        name,
        email,
        contact_no,
        address,
        num_of_pens,
        pen_capacity,
      } = req.body || {}; // ✅ SAFE destructure

      const update = {};

      if (name) {
        const parts = name.trim().split(" ");
        update.first_name = parts.shift();
        update.last_name = parts.join(" ");
      }

      if (email) update.email = email;
      if (contact_no) update.contact_no = contact_no;
      if (address) update.address = address;

      if (typeof num_of_pens !== "undefined")
        update.num_of_pens = Number(num_of_pens);

      if (typeof pen_capacity !== "undefined")
        update.pen_capacity = Number(pen_capacity);

      // ✅ HANDLE PROFILE PICTURE
      if (req.file) {
        update.profile_picture = `/uploads/profiles/${req.file.filename}`;
      }

      const updatedFarmerDoc = await Farmer.findOneAndUpdate(
        {
          $or: [
            userObjectId ? { user_id: userObjectId } : null,
            user.email ? { email: user.email } : null,
          ].filter(Boolean),
        },
        { $set: update },
        { new: true, runValidators: true }
      ).select("-password");

      if (!updatedFarmerDoc) {
        return res.status(404).json({
          success: false,
          message: "Farmer profile not found",
        });
      }

      const updatedFarmer = updatedFarmerDoc.toObject();

      updatedFarmer.name =
        `${updatedFarmer.first_name || ""} ${updatedFarmer.last_name || ""}`.trim();

      await logAction(
        user.id,
        "UPDATE_USER",
        "USER_AUTH",
        "Farmer updated profile",
        req
      );

      res.json({ success: true, farmer: updatedFarmer });

    } catch (err) {
      console.error("Update farmer profile error:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

/* ======================================================
   GET ALL PIGS UNDER SPECIFIC FARMER (Manager/Encoder)
====================================================== */
router.get(
  "/:id/pigs",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const farmerId = req.params.id;

      if (!mongoose.Types.ObjectId.isValid(farmerId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid farmer ID",
        });
      }

      const pigs = await Swine.find({ farmer_id: farmerId })
        .sort({ createdAt: -1 })
        .lean();

      res.json({
        success: true,
        pigs
      });

    } catch (err) {
      console.error("Fetch farmer pigs error:", err);
      res.status(500).json({
        success: false,
        message: "Server error while fetching pigs"
      });
    }
  }
);

module.exports = router;
