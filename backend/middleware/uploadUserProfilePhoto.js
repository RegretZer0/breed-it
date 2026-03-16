// backend/middleware/uploadUserProfilePhoto.js
const multer = require("multer");
const path = require("path");

/* =========================================================
   MODULE: Multer Configuration (Cloud Migrated)
   PURPOSE: Switch from Disk Storage to Memory Storage to 
            support Supabase Cloud uploads.
========================================================= */

// Allowed extensions (basic safety)
const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

/**
 * Storage config: Using memoryStorage so the file buffer 
 * is available for Supabase upload in the controller.
 */
const storage = multer.memoryStorage();

/**
 * File filter: images only.
 * Validates both MimeType and Extension for security.
 */
function fileFilter(req, file, cb) {
  if (!file?.mimetype?.startsWith("image/")) {
    return cb(new Error("Only image uploads are allowed."), false);
  }

  const ext = path.extname(file.originalname || "").toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    return cb(new Error("Invalid image format. Use JPG, PNG, or WEBP."), false);
  }

  cb(null, true);
}

module.exports = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB
  },
});