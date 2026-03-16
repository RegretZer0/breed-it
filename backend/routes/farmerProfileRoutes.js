const express = require("express");
const router = express.Router();
const path = require("path");
const multer = require("multer");
const supabase = require("../utils/supabase"); // Ensure this utility is initialized

const Farmer = require("../models/UserFarmer");
const { requireSessionAndToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const logAction = require("../middleware/logger");

/* ==========================
   MULTER CONFIGURATION (Cloud Migrated)
========================== */
// Using memoryStorage to bypass local disk
const storage = multer.memoryStorage();

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
      const farmer = await Farmer.findById(req.user.id).select("-password -__v");

      if (!farmer) {
        return res.status(404).json({
          success: false,
          message: "Farmer profile not found.",
        });
      }

      // Convert mongoose document to object to allow temporary fields
      const farmerData = farmer.toObject();

      // If farmer has a profile picture, generate a temporary Signed URL
      if (farmerData.profile_picture) {
        const { data, error } = await supabase.storage
          .from("user_profiles")
          .createSignedUrl(farmerData.profile_picture, 3600); // 1-hour access

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

      // Basic validation
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

      // If new image uploaded to memory, send to Supabase
      if (req.file) {
        const fileExt = path.extname(req.file.originalname);
        const fileName = `farmer-${farmer._id}-${Date.now()}${fileExt}`;

        const { data, error } = await supabase.storage
          .from("user_profiles")
          .upload(fileName, req.file.buffer, {
            contentType: req.file.mimetype,
            upsert: true,
          });

        if (error) throw error;

        // Store the path in DB (not the full URL)
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