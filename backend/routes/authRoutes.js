const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const validator = require("validator");
const dns = require("dns").promises;
const nodemailer = require("nodemailer");
const mongoose = require("mongoose");
const path = require("path");
const supabase = require("../utils/supabase");

const { JWT_SECRET } = require("../config/jwt");

const User = require("../models/UserModel");
const Farmer = require("../models/UserFarmer");
const AuditLog = require("../models/AuditLog");
const logAction = require("../middleware/logger");

const attachUser = require("../middleware/attachUser");
const { requireSessionAndToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

// NEW: Multer middleware for user profile photos
const uploadUserProfilePhoto = require("../middleware/uploadUserProfilePhoto");

const otpEmailTemplate = require("../emails/otpEmailTemplate");

// Temporary in-memory storage for OTPs
const otpStore = new Map();

const DEFAULT_AVATAR = "/images/default-avatar.png";

/* ======================
    HELPERS
====================== */

// Password Strength: Minimum 8 characters
function validatePassword(password) {
  if (!password || password.length < 8) {
    throw new Error("Password must be at least 8 characters long.");
  }
  return true;
}

// LEGITIMACY CHECK: Verify format and real-world domain existence
async function validateEmailLegitimacy(email) {
  if (!validator.isEmail(email)) {
    throw new Error("Invalid email format.");
  }

  const domain = email.split("@")[1];
  try {
    const mxRecords = await dns.resolveMx(domain);
    if (!mxRecords || mxRecords.length === 0) {
      throw new Error("Email domain does not exist or cannot receive mail.");
    }
  } catch (err) {
    throw new Error("Email provider domain is invalid or unreachable.");
  }
  return true;
}

function generateToken(user) {
  return jwt.sign(
    {
      id: user._id.toString(),
      role: user.role,
      email: user.email,
      first_name: user.first_name || "",
      last_name: user.last_name || "",
      name: `${user.first_name || ""} ${user.last_name || ""}`.trim() || "User",
      managerId: user.managerId || null,
      profile_photo: user.profile_photo || DEFAULT_AVATAR,
    },
    JWT_SECRET,
    { expiresIn: "1d" }
  );
}

async function getSignedProfileUrl(storagePath) {
  if (!storagePath) return DEFAULT_AVATAR;
  // If it's already a full URL or a local static path, return as is
  if (storagePath.startsWith("http") || storagePath.startsWith("/images/")) return storagePath;

  try {
    const { data, error } = await supabase.storage
      .from("profile-picture")
      .createSignedUrl(storagePath, 3600); // URL valid for 1 hour

    return (data && !error) ? data.signedUrl : DEFAULT_AVATAR;
  } catch (err) {
    return DEFAULT_AVATAR;
  }
}

/* ======================
    ENCODER ID GENERATOR
====================== */
async function generateEncoderId() {
  const latestEncoder = await User.findOne({
    role: "encoder",
    encoder_id: { $exists: true, $ne: null },
  })
    .sort({ createdAt: -1, _id: -1 })
    .select("encoder_id")
    .lean();

  if (!latestEncoder?.encoder_id) {
    return "Encoder-00001";
  }

  const match = String(latestEncoder.encoder_id).match(/(\d+)$/);
  const lastNumber = match ? parseInt(match[1], 10) : 0;
  const nextNumber = lastNumber + 1;

  return `Encoder-${String(nextNumber).padStart(5, "0")}`;
}

// Mail transporter (reuse across requests)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/* ======================
    OTP SYSTEM
====================== */

// 1. Send OTP Route
router.post("/send-otp", async (req, res) => {
  const { email } = req.body;

  try {
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required.",
      });
    }

    await validateEmailLegitimacy(email);

    // Check if email already exists
    const existing = (await User.findOne({ email })) || (await Farmer.findOne({ email }));

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Email already registered in the system.",
      });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Hash OTP before storing
    const hashedOtp = await bcrypt.hash(otp, 10);

    otpStore.set(email, {
      otp: hashedOtp,
      expires: Date.now() + 10 * 60 * 1000, // 10 minutes
    });

    // Send branded HTML email
    await transporter.sendMail({
      from: `"breedIT" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Your breedIT Verification Code",
      html: otpEmailTemplate({ otp }),
    });

    res.json({
      success: true,
      message: "OTP sent successfully to your email.",
    });
  } catch (error) {
    console.error("OTP Error:", error);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

// Helper to verify OTP inside registration routes
async function verifyOTPInternal(email, userOtp) {
  const record = otpStore.get(email);

  if (!record) {
    throw new Error("No OTP found for this email.");
  }

  if (Date.now() > record.expires) {
    otpStore.delete(email);
    throw new Error("OTP has expired.");
  }

  // Compare hashed OTP
  const isMatch = await bcrypt.compare(userOtp, record.otp);
  if (!isMatch) {
    throw new Error("Invalid OTP code.");
  }

  // OTP used successfully → remove it
  otpStore.delete(email);
  return true;
}

/* ======================
    LOGIN (FIXED FOR IAT & TIME WARP)
====================== */
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    let user = await User.findOne({ email });
    let role = user?.role;

    if (!user) {
      user = await Farmer.findOne({ email });
      role = "farmer";
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Invalid password",
      });
    }

    // SESSION REGENERATE: Prevents Session Fixation
    req.session.regenerate(async (err) => {
      if (err) {
        return res.status(500).json({ success: false, message: "Session regeneration failed" });
      }

      req.session.user = {
        id: user._id.toString(),
        role: role || user.role,
        email: user.email,
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        name: `${user.first_name || ""} ${user.last_name || ""}`.trim() || "User",
        managerId: user.managerId || null,
        profile_photo: user.profile_photo || DEFAULT_AVATAR,
      };

      req.session.save(async (saveErr) => {
        if (saveErr) {
          return res.status(500).json({ success: false, message: "Session save failed" });
        }

        // Audit Log: Login (Using virtual time for the log entry)
        await logAction(user._id, "LOGIN", "USER_AUTH", `User (${role}) successfully logged into the system`, req);

        /**
         * VIRTUAL TIME FIX:
         * We calculate the virtual timestamp in seconds.
         * To avoid the "iat is not allowed in options" error,
         * we put it directly in the payload.
         */
        const virtualTimestamp = Math.floor(global.getNow().getTime() / 1000);

        const payload = {
          id: user._id,
          role: role || user.role,
          iat: virtualTimestamp // Moving iat here fixes the crash
        };

        const token = jwt.sign(
          payload,
          process.env.JWT_SECRET || "fallback_secret",
          { expiresIn: "1d" }
        );

        res.json({
          success: true,
          message: "Login successful",
          user: req.session.user,
          role: role || user.role,
          token: token, // Using the time-synced token
        });
      });
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ======================
   FORGOT PASSWORD OTP
====================== */
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  try {
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required.",
      });
    }

    // Email MUST exist
    const user = (await User.findOne({ email })) || (await Farmer.findOne({ email }));

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No account found with this email.",
      });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedOtp = await bcrypt.hash(otp, 10);

    otpStore.set(email, {
      otp: hashedOtp,
      expires: Date.now() + 10 * 60 * 1000, // 10 min
    });

    await transporter.sendMail({
      from: `"breedIT" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "breedIT Password Reset Code",
      html: otpEmailTemplate({ otp }),
    });

    res.json({
      success: true,
      message: "Password reset OTP sent to your email.",
    });
  } catch (error) {
    console.error("Forgot Password OTP Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while sending OTP.",
    });
  }
});

/* ======================
   RESET PASSWORD
====================== */
router.post("/reset-password", async (req, res) => {
  const { email, otp, password } = req.body;

  try {
    if (!email || !otp || !password) {
      return res.status(400).json({
        success: false,
        message: "Email, OTP, and new password are required.",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long.",
      });
    }

    // Verify OTP (shared logic)
    await verifyOTPInternal(email, otp);

    // Find user (User or Farmer)
    const user = (await User.findOne({ email })) || (await Farmer.findOne({ email }));

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;

    await user.save();

    res.json({
      success: true,
      message: "Password reset successful.",
    });
  } catch (error) {
    console.error("Reset Password Error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Password reset failed.",
    });
  }
});

/* ======================
    CHANGE PASSWORD - REQUEST OTP
====================== */
router.post("/change-password/request", requireSessionAndToken, async (req, res) => {
  try {
    const email = req.user?.email || req.session?.user?.email;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "User email not found.",
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedOtp = await bcrypt.hash(otp, 10);

    otpStore.set(email, {
      otp: hashedOtp,
      expires: Date.now() + 10 * 60 * 1000,
    });

    await transporter.sendMail({
      from: `"breedIT" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "breedIT Change Password Verification Code",
      html: otpEmailTemplate({ otp }),
    });

    res.json({
      success: true,
      message: "OTP sent to your email.",
    });
  } catch (error) {
    console.error("Change Password OTP Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send OTP.",
    });
  }
});

/* ======================
    CHANGE PASSWORD - CONFIRM
====================== */
router.post("/change-password/confirm", requireSessionAndToken, async (req, res) => {
  const { otp, newPassword } = req.body;

  try {
    if (!otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "OTP and new password are required.",
      });
    }

    validatePassword(newPassword);

    const email = req.user?.email || req.session?.user?.email;

    // Verify OTP
    await verifyOTPInternal(email, otp);

    // Find user (User or Farmer)
    const user = (await User.findById(req.user.id)) || (await Farmer.findById(req.user.id));

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    // Audit log
    await logAction(user._id, "CHANGE_PASSWORD", "USER_AUTH", "User changed password with OTP verification", req);

    res.json({
      success: true,
      message: "Password changed successfully.",
    });
  } catch (error) {
    console.error("Change Password Error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Password change failed.",
    });
  }
});

/* ======================
    LOGOUT
====================== */
router.post("/logout", async (req, res) => {
  const user = req.session?.user;
  if (user) {
    // Audit Log: Logout
    await logAction(user.id, "LOGOUT", "USER_AUTH", "User logged out", req);
  }

  req.session?.destroy((err) => {
    res.clearCookie("breedit.sid"); // Use your specific cookie name from index.js
    res.json({ success: true, message: "Logged out successfully" });
  });
});

/* ======================
    GET CURRENT USER (FIXED FOR REFRESH BUG + SUPABASE IMAGE FIX)
====================== */
router.get("/me", async (req, res) => {
  try {
    // Always prioritize the Session for EJS/Web apps
    if (req.session?.user) {
      const user = req.session.user;

      const resolvedPhoto = await getSignedProfileUrl(user.profile_photo);

      return res.json({
        success: true,
        source: "session",
        user: {
          ...user,
          profile_photo: resolvedPhoto,
        },
      });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        reason: "NO_SESSION_NO_TOKEN",
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const resolvedPhoto = await getSignedProfileUrl(decoded.profile_photo);

    return res.json({
      success: true,
      source: "jwt",
      user: {
        ...decoded,
        profile_photo: resolvedPhoto,
      },
    });

  } catch (err) {
    console.error("GET /me error:", err);

    return res.status(401).json({
      success: false,
      reason: "INVALID_TOKEN",
    });
  }
});

/* ======================
    UPDATE PROFILE (TEXT)
    - farm_manager + encoder
====================== */
router.put(
  "/update-profile",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found." });
      }

      const { first_name, last_name, address, contact_info } = req.body;

      if (first_name !== undefined) user.first_name = String(first_name).trim();
      if (last_name !== undefined) user.last_name = String(last_name).trim();
      if (address !== undefined) user.address = String(address).trim();
      if (contact_info !== undefined) user.contact_info = String(contact_info).trim();

      await user.save();

      // keep EJS session updated
      if (req.session?.user) {
        req.session.user.first_name = user.first_name || "";
        req.session.user.last_name = user.last_name || "";
        req.session.user.name = `${user.first_name || ""} ${user.last_name || ""}`.trim() || "User";
        req.session.user.address = user.address || "";
        req.session.user.contact_info = user.contact_info || "";
        req.session.user.profile_photo = user.profile_photo || DEFAULT_AVATAR;

        await new Promise((resolve) => req.session.save(() => resolve()));
      }

      await logAction(req.user.id, "UPDATE_PROFILE", "ACCOUNT_MANAGEMENT", "User updated profile information", req);

      return res.json({ success: true, message: "Profile updated.", user });
    } catch (err) {
      console.error("Update profile error:", err);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

/* ======================
    UPDATE PROFILE PHOTO (UPLOAD TO CLOUD)
    - multipart/form-data
    - field name: profile_photo
====================== */
router.put(
  "/update-profile-photo",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  uploadUserProfilePhoto.single("profile_photo"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: "No file uploaded." });
      }

      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found." });
      }

      // 1. Generate unique filename for Supabase
      const fileExt = path.extname(req.file.originalname).toLowerCase();
      const fileName = `user-${user._id}-${Date.now()}${fileExt}`;

      // 2. Optional: Delete old photo from Supabase if it exists to save space
      if (user.profile_photo && !user.profile_photo.startsWith('/images/')) {
        await supabase.storage
          .from("profile-picture")
          .remove([user.profile_photo]);
      }

      // 3. Upload buffer to Supabase 'profile-picture' bucket
      const { data, error } = await supabase.storage
        .from("profile-picture")
        .upload(fileName, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: true,
        });

      if (error) {
        console.error("Supabase Upload Error:", error);
        throw new Error("Failed to upload image to cloud storage.");
      }

      // 4. Update Database with the storage path (e.g., "profile-user-123.png")
      const storagePath = data.path;
      user.profile_photo = storagePath;
      await user.save();

      // 5. Keep EJS session updated 
      // Note: We use the storagePath; your frontend should resolve this via a Signed URL or Public URL
      if (req.session?.user) {
        req.session.user.profile_photo = storagePath;
        await new Promise((resolve) => req.session.save(() => resolve()));
      }

      await logAction(
        req.user.id, 
        "UPDATE_PROFILE_PHOTO", 
        "ACCOUNT_MANAGEMENT", 
        "User updated profile photo via Cloud", 
        req
      );

      const signedUrl = await getSignedProfileUrl(storagePath);

      return res.json({
        success: true,
        message: "Profile photo updated successfully.",
        profile_photo: signedUrl,
      });
      
    } catch (err) {
      console.error("Update profile photo error:", err);
      return res.status(500).json({ success: false, message: err.message || "Server error" });
    }
  }
);

/* ======================
    REGISTER FARM MANAGER
====================== */
router.post("/register", async (req, res) => {
  const { first_name, last_name, address, contact_no, email, password, otp } = req.body;

  try {
    if (!first_name || !last_name || !email || !password || !otp) {
      return res.status(400).json({ success: false, message: "Missing required fields (including OTP)" });
    }

    validatePassword(password);
    await verifyOTPInternal(email, otp);
    await validateEmailLegitimacy(email);

    const existing = (await User.findOne({ email })) || (await Farmer.findOne({ email }));
    if (existing) {
      return res.status(400).json({ success: false, message: "Email already registered" });
    }

    const user = await User.create({
      first_name,
      last_name,
      address,
      contact_info: contact_no,
      email,
      password: await bcrypt.hash(password, 10),
      role: "farm_manager",
    });

    await logAction(user._id, "REGISTER_SELF", "USER_AUTH", "New Farm Manager account created via registration", req);

    res.status(201).json({
      success: true,
      message: "Farm Manager registered successfully",
      user,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/* ======================
    REGISTER FARMER (FIXED)
====================== */
router.post("/register-farmer", requireSessionAndToken, allowRoles("farm_manager"), async (req, res) => {
  try {
    const {
      first_name,
      last_name,
      address,
      contact_no,
      email,
      password,
      managerId,
      num_of_pens = 0,
      pen_capacity = 0,
      production_type,
      membership_date,
    } = req.body;

    if (!email || !password || !managerId) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    validatePassword(password);
    await validateEmailLegitimacy(email);

    const existing = (await User.findOne({ email })) || (await Farmer.findOne({ email }));

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Email already in use",
      });
    }

    // CREATE USER ACCOUNT (CRITICAL)
    const user = await User.create({
      first_name,
      last_name,
      address,
      contact_info: contact_no,
      email,
      password: await bcrypt.hash(password, 10),
      role: "farmer",
      managerId,
    });

    // Generate farmer_id
    const lastFarmer = await Farmer.findOne().sort({ _id: -1 });
    const nextNum = lastFarmer ? parseInt(lastFarmer.farmer_id.split("-")[1]) + 1 : 1;

    const farmerId = `Farmer-${String(nextNum).padStart(5, "0")}`;

    // CREATE FARMER PROFILE LINKED TO USER
    const farmer = await Farmer.create({
      farmer_id: farmerId,
      first_name,
      last_name,
      address,
      contact_no,
      email,
      password: user.password,
      managerId,
      num_of_pens,
      pen_capacity,
      production_type,
      membership_date,
      user_id: user._id,
    });

    // Audit Log: Register Farmer
    await logAction(
      req.user.id,
      "REGISTER_FARMER",
      "ACCOUNT_MANAGEMENT",
      `Registered new Farmer: ${first_name} ${last_name} (${farmerId})`,
      req
    );

    res.status(201).json({
      success: true,
      message: "Farmer registered successfully",
      farmer,
    });
  } catch (error) {
    console.error("Register farmer error:", error);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

/* ======================
    GET FARMERS
====================== */
router.get("/farmers", requireSessionAndToken, allowRoles("farm_manager", "encoder"), async (req, res) => {
  try {
    const user = req.user;
    const managerId = user.role === "farm_manager" ? user.id : user.managerId;
    const farmers = await Farmer.find({ managerId }).lean();

    const farmersWithPhotos = await Promise.all(
      farmers.map(async (f) => ({
        ...f,
        profile_picture: await getSignedProfileUrl(f.profile_picture),
      }))
    );

    res.json({ success: true, farmers: farmersWithPhotos });
  } catch (err) {
    console.error("Fetch farmers error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ======================
    GET FARMERS (LEGACY PARAM ROUTE)
====================== */
router.get("/farmers/:managerId", requireSessionAndToken, allowRoles("farm_manager", "encoder"), async (req, res) => {
  try {
    const paramManagerId = req.params.managerId;
    const user = req.user;
    const managerId = user.role === "farm_manager" ? user.id : user.managerId;

    if (paramManagerId !== managerId) {
      return res.status(403).json({ success: false, message: "Unauthorized manager access" });
    }

    const farmers = await Farmer.find({ managerId }).lean();

    const farmersWithPhotos = await Promise.all(
      farmers.map(async (f) => ({
        ...f,
        profile_picture: await getSignedProfileUrl(f.profile_picture),
      }))
    );

    res.json({ success: true, farmers: farmersWithPhotos });
  } catch (error) {
    console.error("Fetch farmers error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ======================
    UPDATE FARMER
====================== */
router.put("/update-farmer/:farmerId", requireSessionAndToken, allowRoles("farm_manager"), async (req, res) => {
  try {
    const farmer = await Farmer.findOne({
      farmer_id: req.params.farmerId,
      managerId: req.user.id,
    });

    if (!farmer) {
      return res.status(404).json({ success: false, message: "Farmer not found" });
    }

    const fieldsToUpdate = ["first_name", "last_name", "address", "contact_no", "num_of_pens", "pen_capacity", "status"];

    fieldsToUpdate.forEach((field) => {
      if (req.body[field] !== undefined) {
        farmer[field] = req.body[field];
      }
    });

    await farmer.save();

    await logAction(req.user.id, "UPDATE_FARMER", "ACCOUNT_MANAGEMENT", `Updated details for Farmer: ${req.params.farmerId}`, req);

    res.json({ success: true, farmer });
  } catch (err) {
    console.error("Update farmer error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ======================
    REGISTER ENCODER
====================== */
router.post("/register-encoder", requireSessionAndToken, allowRoles("farm_manager"), async (req, res) => {
  const { first_name, last_name, address, contact_no, email, password, managerId } = req.body;

  try {
    if (!first_name || !last_name || !email || !password || !managerId) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    validatePassword(password);
    await validateEmailLegitimacy(email);

    const manager = await User.findById(managerId);
    if (!manager || manager.role !== "farm_manager") {
      return res.status(400).json({ success: false, message: "Invalid Farm Manager ID" });
    }

    const existing = (await User.findOne({ email })) || (await Farmer.findOne({ email }));
    if (existing) {
      return res.status(400).json({ success: false, message: "Email already registered" });
    }

    const encoderId = await generateEncoderId();

    const encoder = await User.create({
      first_name,
      last_name,
      address,
      contact_info: contact_no,
      email,
      password: await bcrypt.hash(password, 10),
      role: "encoder",
      managerId,
      status: "active",
      encoder_id: encoderId,
    });

    await logAction(
      req.user.id,
      "REGISTER_ENCODER",
      "ACCOUNT_MANAGEMENT",
      `Registered new Encoder: ${first_name} ${last_name} (${encoderId})`,
      req
    );

    res.status(201).json({
      success: true,
      message: "Encoder registered successfully",
      encoder,
    });
  } catch (error) {
    console.error("Register encoder error:", error);
    res.status(400).json({ success: false, message: error.message });
  }
});

/* ======================
    GET ENCODERS
====================== */
router.get("/encoders", requireSessionAndToken, allowRoles("farm_manager"), async (req, res) => {
  try {
    const encoders = await User.find({
      role: "encoder",
      managerId: req.user.id,
    })
      .select("-password -__v")
      .lean();

    const encodersWithPhotos = await Promise.all(
      encoders.map(async (e) => ({
        ...e,
        profile_photo: await getSignedProfileUrl(e.profile_photo),
      }))
    );

    res.json({ success: true, encoders: encodersWithPhotos });
  } catch (error) {
    console.error("Fetch encoders error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ======================
    UPDATE ENCODER
====================== */
router.put("/update-encoder/:id", requireSessionAndToken, allowRoles("farm_manager"), async (req, res) => {
  try {
    const encoder = await User.findById(req.params.id);
    if (!encoder || encoder.role !== "encoder") {
      return res.status(404).json({ success: false, message: "Encoder not found" });
    }

    // Security: Only Manager who created the encoder can update them
    if (encoder.managerId?.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: "Access Denied" });
    }

    Object.assign(encoder, req.body);
    await encoder.save();

    await logAction(req.user.id, "UPDATE_ENCODER", "ACCOUNT_MANAGEMENT", `Updated details for Encoder: ${encoder.email}`, req);

    res.json({
      success: true,
      message: "Encoder updated successfully",
      encoder,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/* ======================
    GET SINGLE ENCODER
====================== */
router.get("/encoders/single/:id", async (req, res) => {
  try {
    const encoder = await User.findOne({
      _id: req.params.id,
      role: "encoder",
    }).select("-password -__v");

    if (!encoder) {
      return res.status(404).json({ success: false, message: "Encoder not found" });
    }

    res.json({ success: true, encoder });
  } catch (error) {
    console.error("Fetch single encoder error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/* ======================
    AUDIT LOGS RETRIEVAL
====================== */
router.get("/audit-logs", requireSessionAndToken, allowRoles("farm_manager", "farmer", "encoder"), async (req, res) => {
  try {
    const { limit = 100, skip = 0 } = req.query;
    const user = req.user;

    const managerId = user.role === "farm_manager" ? user.id : user.managerId;

    if (!managerId && user.role !== "farm_manager") {
      return res.status(400).json({ success: false, message: "Manager context not found" });
    }

    const teamEncoders = await User.find({ managerId }).select("_id");
    const teamFarmers = await Farmer.find({ managerId }).select("_id");

    const teamIds = [
      ...teamEncoders.map((e) => e._id),
      ...teamFarmers.map((f) => f._id),
      new mongoose.Types.ObjectId(managerId),
    ];

    let logs = await AuditLog.find({ user_id: { $in: teamIds } })
      .populate("user_id", "first_name last_name role email")
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .lean();

    for (let log of logs) {
      if (!log.user_id) {
        const rawLog = await AuditLog.findById(log._id).select("user_id").lean();
        if (rawLog && rawLog.user_id) {
          const farmer = await Farmer.findById(rawLog.user_id).select("first_name last_name email").lean();
          if (farmer) {
            log.user_id = {
              _id: farmer._id,
              first_name: farmer.first_name,
              last_name: farmer.last_name,
              email: farmer.email,
              role: "farmer",
            };
          }
        }
      }
    }

    const total = await AuditLog.countDocuments({ user_id: { $in: teamIds } });

    res.json({ success: true, total, logs });
  } catch (error) {
    console.error("Fetch Audit Logs error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;