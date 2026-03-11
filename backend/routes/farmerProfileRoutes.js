const express = require("express");
const router = express.Router();
const path = require("path");
const multer = require("multer");

const Farmer = require("../models/UserFarmer");
const { requireSessionAndToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const logAction = require("../middleware/logger");

/* ==========================
   MULTER CONFIGURATION
========================== */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueName =
      Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueName + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  },
});

/* ==========================
   GET FARMER PROFILE
========================== */
router.get(
  "/profile",
  requireSessionAndToken,
  allowRoles("farmer"),
  async (req, res) => {
    try {
      const farmer = await Farmer.findById(req.user.id)
        .select("-password -__v");

      if (!farmer) {
        return res.status(404).json({
          success: false,
          message: "Farmer profile not found.",
        });
      }

      res.json({
        success: true,
        farmer,
      });

    } catch (error) {
      console.error("Fetch Farmer Profile Error:", error);
      res.status(500).json({
        success: false,
        message: "Server error while fetching profile.",
      });
    }
  }
);

/* ==========================
   UPDATE FARMER PROFILE
========================== */
router.put(
  "/profile",
  requireSessionAndToken,
  allowRoles("farmer"),
  upload.single("profile_picture"), // IMPORTANT
  async (req, res) => {
    try {
      const farmer = await Farmer.findById(req.user.id);

      if (!farmer) {
        return res.status(404).json({
          success: false,
          message: "Farmer profile not found.",
        });
      }

      // FormData fields come as strings
      const contact_no = req.body.contact_no;
      const address = req.body.address;
      const num_of_pens = Number(req.body.num_of_pens);
      const pen_capacity = Number(req.body.pen_capacity);

      // Basic validation
      if (num_of_pens < 0 || pen_capacity < 0) {
        return res.status(400).json({
          success: false,
          message: "Pens and capacity cannot be negative.",
        });
      }

      // Update fields
      farmer.contact_no = contact_no;
      farmer.address = address;
      farmer.num_of_pens = num_of_pens;
      farmer.pen_capacity = pen_capacity;

      // If new image uploaded
      if (req.file) {
        farmer.profile_picture = "/uploads/" + req.file.filename;
      }

      await farmer.save();

      // Audit log
      await logAction(
        farmer._id,
        "UPDATE_PROFILE",
        "ACCOUNT_MANAGEMENT",
        "Farmer updated their own profile",
        req
      );

      res.json({
        success: true,
        message: "Profile updated successfully.",
        farmer,
      });

    } catch (error) {
      console.error("Update Farmer Profile Error:", error);
      res.status(500).json({
        success: false,
        message: "Server error while updating profile.",
      });
    }
  }
);

module.exports = router;
