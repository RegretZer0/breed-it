// backend/middleware/uploadUserProfilePhoto.js
const multer = require("multer");
const path = require("path");

/* =========================================================
    MODULE: Multer Configuration (Cloud Migrated)
    PURPOSE: Switch from Disk Storage to Memory Storage to 
             support Supabase Cloud uploads (Bucket: profile-picture).
========================================================= */

/**
 * Storage config: Using memoryStorage so the file buffer 
 * is available for Supabase upload in the controller.
 */
const storage = multer.memoryStorage();

/**
 * File filter: images only.
 * Validates both MimeType and Extension for security, 
 * matching the standard set in heatReportRoutes.
 */
const fileFilter = (req, file, cb) => {
  const filetypes = /jpeg|jpg|png|webp/;
  
  // 1. Check Extension
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  
  // 2. Check Mimetype
  const mimetype = filetypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    // Return a structured error for the controller/error-handler to catch
    cb(new Error("Invalid image format. Only JPG, JPEG, PNG, and WEBP are allowed."), false);
  }
};

/**
 * Middleware instance for user profile photo uploads.
 * Constraints:
 * - 2MB limit (Optimized for user avatars)
 * - Memory Storage (Required for Supabase .upload() method)
 */
module.exports = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB limit
  },
});