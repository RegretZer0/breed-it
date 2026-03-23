const multer = require("multer");
const path = require("path");

/* =========================================================
    MODULE: Multer Configuration
    PURPOSE: Switch from Disk Storage to Memory Storage for 
             Cloud compatibility (Supabase bucket: profile-picture).
========================================================= */

// Use memoryStorage so the file buffer is available at req.file.buffer
const storage = multer.memoryStorage();

/**
 * Filter to ensure only specific image formats are accepted.
 * Validation matches the logic used in heatReportRoutes.
 */
const fileFilter = (req, file, cb) => {
  const filetypes = /jpeg|jpg|png|webp/;
  // Check extension
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  // Check mimetype
  const mimetype = filetypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    // structured error for the controller to catch in the error-handling middleware
    cb(new Error("Only images (JPG, PNG, WEBP) are allowed for profile pictures"), false);
  }
};

/**
 * Middleware instance for profile picture uploads.
 * Constraints:
 * - Storage: Memory (for Supabase)
 * - Limits: 2MB file size (optimized for profile avatars)
 */
const uploadProfile = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { 
    fileSize: 2 * 1024 * 1024 // 2MB limit
  },
});

module.exports = uploadProfile;