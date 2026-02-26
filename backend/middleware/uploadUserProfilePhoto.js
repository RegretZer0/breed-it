// backend/middleware/uploadUserProfilePhoto.js
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// ✅ Save to: /backend/uploads/user_profiles
const UPLOAD_DIR = path.join(__dirname, "..", "uploads", "user_profiles");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Allowed extensions (basic safety)
const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

// Storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const originalExt = path.extname(file.originalname || "").toLowerCase();
    const ext = ALLOWED_EXT.has(originalExt) ? originalExt : ".jpg";

    const userId = req.user?.id || req.session?.user?.id || "unknown";
    const safeUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, "");
    cb(null, `user_${safeUserId}_${Date.now()}${ext}`);
  },
});

// File filter: images only
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