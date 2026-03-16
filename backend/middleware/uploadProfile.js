const multer = require("multer");

/* =========================================================
   MODULE: Multer Configuration
   PURPOSE: Switch from Disk Storage to Memory Storage for 
            Cloud compatibility (Supabase).
========================================================= */

// Use memoryStorage so the file buffer can be uploaded to the cloud
const storage = multer.memoryStorage();

/**
 * Filter to ensure only specific image formats are accepted.
 */
const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    // Return a structured error for the controller to catch
    cb(new Error("Only images (JPG, PNG, WEBP) are allowed for profile pictures"), false);
  }
};

/**
 * Middleware instance for profile picture uploads.
 * Limits: 2MB file size.
 */
const uploadProfile = multer({
  storage,
  fileFilter,
  limits: { 
    fileSize: 2 * 1024 * 1024 // 2MB limit
  },
});

module.exports = uploadProfile;