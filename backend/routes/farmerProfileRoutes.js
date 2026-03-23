const express = require("express");
const router = express.Router();
const path = require("path");
const multer = require("multer");
const supabase = require("../utils/supabase"); 

const Farmer = require("../models/UserFarmer");
const { requireSessionAndToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const logAction = require("../middleware/logger");

/* ==========================
    MULTER CONFIGURATION
========================== */
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|webp/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Only images (JPG, PNG, WEBP) are allowed."));
    }
  },
});

/* ==========================
    GET FARMER PROFILE
========================= */
router.get(
  "/profile",
  requireSessionAndToken,
  allowRoles("farmer"),
  async (req, res) => {
    try {
      const farmer = await Farmer.findById(req.user.id).select("-password -__v");

      if (!farmer) {
        return res.status(404).json({
          success: false,
          message: "Farmer profile not found.",
        });
      }

      const farmerData = farmer.toObject();

      // Use the 'profile-picture' bucket
      if (farmerData.profile_picture) {
        const { data, error } = await supabase.storage
          .from("profile-picture")
          .createSignedUrl(farmerData.profile_picture, 3600); 

        if (!error && data) {
          farmerData.profile_picture_url = data.signedUrl;
        }
      }

      res.json({
        success: true,
        farmer: farmerData,
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
  upload.single("profile_picture"),
  async (req, res) => {
    try {
      const farmer = await Farmer.findById(req.user.id);

      if (!farmer) {
        return res.status(404).json({
          success: false,
          message: "Farmer profile not found.",
        });
      }

      const { contact_no, address } = req.body;
      const num_of_pens = Number(req.body.num_of_pens);
      const pen_capacity = Number(req.body.pen_capacity);

      if (num_of_pens < 0 || pen_capacity < 0) {
        return res.status(400).json({
          success: false,
          message: "Pens and capacity cannot be negative.",
        });
      }

      // Update basic fields
      farmer.contact_no = contact_no || farmer.contact_no;
      farmer.address = address || farmer.address;
      farmer.num_of_pens = isNaN(num_of_pens) ? farmer.num_of_pens : num_of_pens;
      farmer.pen_capacity = isNaN(pen_capacity) ? farmer.pen_capacity : pen_capacity;

      // Handle Profile Picture Upload to Supabase
      if (req.file) {
        const fileExt = path.extname(req.file.originalname).toLowerCase();
        const fileName = `farmer-${farmer._id}-${Date.now()}${fileExt}`;

        // 1. Delete old image from bucket if it exists to save space
        if (farmer.profile_picture) {
          await supabase.storage
            .from("profile-picture")
            .remove([farmer.profile_picture]);
        }

        // 2. Upload new image
        const { data, error } = await supabase.storage
          .from("profile-picture")
          .upload(fileName, req.file.buffer, {
            contentType: req.file.mimetype,
            upsert: true,
          });

        if (error) throw error;

        // Store new path in DB
        farmer.profile_picture = data.path;
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
        message: error.message || "Server error while updating profile.",
      });
    }
  }
);

module.exports = router;