const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const validator = require("validator");
const dns = require("dns").promises;
const nodemailer = require("nodemailer");
const mongoose = require("mongoose");

const { JWT_SECRET } = require("../config/jwt");

const User = require("../models/UserModel");
const Farmer = require("../models/UserFarmer");
const AuditLog = require("../models/AuditLog"); // ✅ AuditLog Model
const logAction = require("../middleware/logger"); // ✅ Logger utility

const attachUser = require("../middleware/attachUser");
const { requireSessionAndToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

const otpEmailTemplate = require("../emails/otpEmailTemplate");

// Temporary in-memory storage for OTPs
const otpStore = new Map();

/* ======================
    HELPERS
====================== */

// 🛡️ Password Strength: Minimum 8 characters
function validatePassword(password) {
  if (!password || password.length < 8) {
    throw new Error("Password must be at least 8 characters long.");
  }
  return true;
}

// 🛡️ LEGITIMACY CHECK: Verify format and real-world domain existence
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
    },
    JWT_SECRET,
    { expiresIn: "1d" }
  );
}

// 📧 Mail transporter (reuse across requests)
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
    const existing =
      (await User.findOne({ email })) ||
      (await Farmer.findOne({ email }));

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Email already registered in the system.",
      });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // 🔒 Hash OTP before storing
    const hashedOtp = await bcrypt.hash(otp, 10);

    otpStore.set(email, {
      otp: hashedOtp,
      expires: Date.now() + 10 * 60 * 1000, // 10 minutes
    });

    // 📧 Send branded HTML email
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

  // 🔐 Compare hashed OTP
  const isMatch = await bcrypt.compare(userOtp, record.otp);
  if (!isMatch) {
    throw new Error("Invalid OTP code.");
  }

  // OTP used successfully → remove it
  otpStore.delete(email);
  return true;
}

/* ======================
    LOGIN
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

    req.session.regenerate(async () => {
      req.session.user = {
        id: user._id.toString(),
        role: role || user.role, 
        email: user.email,
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        name: `${user.first_name || ""} ${user.last_name || ""}`.trim() || "User",
        managerId: user.managerId || null,
      };

      // ✅ Audit Log: Login
      await logAction(user._id, "LOGIN", "USER_AUTH", `User (${role}) successfully logged into the system`, req);

      res.json({
        success: true,
        message: "Login successful",
        user: req.session.user,
        role: role || user.role,
        token: generateToken(user),
      });
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ======================
    LOGOUT
====================== */
router.post("/logout", async (req, res) => {
  const user = req.session?.user;
  if (user) {
    // ✅ Audit Log: Logout
    await logAction(user.id, "LOGOUT", "USER_AUTH", "User logged out", req);
  }

  req.session?.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ success: true, message: "Logged out successfully" });
  });
});

/* ======================
    GET CURRENT USER
====================== */
router.get("/me", (req, res) => {
  if (req.session?.user) {
    return res.json({
      success: true,
      source: "session",
      user: req.session.user,
    });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      reason: "NO_SESSION_NO_TOKEN",
    });
  }

  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    res.json({
      success: true,
      source: "jwt",
      user: decoded,
    });
  } catch (err) {
    res.status(401).json({
      success: false,
      reason: "INVALID_TOKEN",
    });
  }
});

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
    verifyOTPInternal(email, otp);
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

    // ✅ Audit Log: Self-Registration
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
    REGISTER FARMER
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
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    validatePassword(password);
    await validateEmailLegitimacy(email);

    const existing = (await User.findOne({ email })) || (await Farmer.findOne({ email }));
    if (existing) {
      return res.status(400).json({ success: false, message: "Email already in use" });
    }

    const lastFarmer = await Farmer.findOne().sort({ _id: -1 });
    const nextNum = lastFarmer
      ? parseInt(lastFarmer.farmer_id.split("-")[1]) + 1
      : 1;

    const farmerId = `Farmer-${String(nextNum).padStart(5, "0")}`;

    const farmer = await Farmer.create({
      farmer_id: farmerId,
      first_name,
      last_name,
      address,
      contact_no: contact_no,
      email,
      password: await bcrypt.hash(password, 10),
      managerId,
      num_of_pens,
      pen_capacity,
      production_type,
      membership_date,
    });

    // ✅ Audit Log: Register Farmer
    await logAction(req.user.id, "REGISTER_FARMER", "ACCOUNT_MANAGEMENT", `Registered new Farmer: ${first_name} ${last_name} (${farmerId})`, req);

    res.status(201).json({
      success: true,
      message: "Farmer registered successfully",
      farmer,
    });
  } catch (error) {
    console.error("Register farmer error:", error);
    res.status(400).json({ success: false, message: error.message });
  }
});

/* ======================
    GET FARMERS
====================== */
router.get(
  "/farmers",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const user = req.user;
      const managerId = user.role === "farm_manager" ? user.id : user.managerId;
      const farmers = await Farmer.find({ managerId });
      res.json({ success: true, farmers });
    } catch (err) {
      console.error("Fetch farmers error:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

/* ======================
    GET FARMERS (LEGACY PARAM ROUTE)
====================== */
router.get(
  "/farmers/:managerId",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const paramManagerId = req.params.managerId;
      const user = req.user;
      const managerId = user.role === "farm_manager" ? user.id : user.managerId;

      if (paramManagerId !== managerId) {
        return res.status(403).json({ success: false, message: "Unauthorized manager access" });
      }

      const farmers = await Farmer.find({ managerId });
      res.json({ success: true, farmers });
    } catch (error) {
      console.error("Fetch farmers error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

/* ======================
    UPDATE FARMER
====================== */
router.put(
  "/update-farmer/:farmerId",
  requireSessionAndToken,
  allowRoles("farm_manager"),
  async (req, res) => {
    try {
      const farmer = await Farmer.findOne({
        farmer_id: req.params.farmerId,
        managerId: req.user.id,
      });

      if (!farmer) {
        return res.status(404).json({ success: false, message: "Farmer not found" });
      }

      const fieldsToUpdate = [
        "first_name",
        "last_name",
        "address",
        "contact_no",
        "num_of_pens",
        "pen_capacity",
        "status",
      ];

      fieldsToUpdate.forEach((field) => {
        if (req.body[field] !== undefined) {
          farmer[field] = req.body[field];
        }
      });

      await farmer.save();

      // ✅ Audit Log: Update Farmer
      await logAction(req.user.id, "UPDATE_FARMER", "ACCOUNT_MANAGEMENT", `Updated details for Farmer: ${req.params.farmerId}`, req);

      res.json({ success: true, farmer });
    } catch (err) {
      console.error("Update farmer error:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

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

    const encoder = await User.create({
      first_name,
      last_name,
      address,
      contact_no,
      email,
      password: await bcrypt.hash(password, 10),
      role: "encoder",
      managerId,
      status: "active",
    });

    // ✅ Audit Log: Register Encoder
    await logAction(req.user.id, "REGISTER_ENCODER", "ACCOUNT_MANAGEMENT", `Registered new Encoder: ${first_name} ${last_name}`, req);

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
router.get(
  "/encoders",
  requireSessionAndToken,
  allowRoles("farm_manager"),
  async (req, res) => {
    try {
      const encoders = await User.find({
        role: "encoder",
        managerId: req.user.id,
      }).select("-password -__v");

      res.json({ success: true, encoders });
    } catch (error) {
      console.error("Fetch encoders error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

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
    if(encoder.managerId?.toString() !== req.user.id) {
        return res.status(403).json({ success: false, message: "Access Denied" });
    }

    Object.assign(encoder, req.body);
    await encoder.save();

    // ✅ Audit Log: Update Encoder (Added)
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
router.get(
  "/audit-logs",
  requireSessionAndToken,
  allowRoles("farm_manager", "farmer", "encoder"),
  async (req, res) => {
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
          ...teamEncoders.map(e => e._id),
          ...teamFarmers.map(f => f._id),
          new mongoose.Types.ObjectId(managerId)
      ];

      let logs = await AuditLog.find({ user_id: { $in: teamIds } })
        .populate("user_id", "first_name last_name role email")
        .sort({ timestamp: -1 })
        .limit(parseInt(limit))
        .skip(parseInt(skip))
        .lean(); 

      // ✅ REFINED LOGIC: Re-check Farmer collection for any logs that didn't populate from 'User'
      for (let log of logs) {
        if (!log.user_id) {
            // Fetch the raw user_id since populate failed
            const rawLog = await AuditLog.findById(log._id).select("user_id").lean();
            if (rawLog && rawLog.user_id) {
                const farmer = await Farmer.findById(rawLog.user_id).select("first_name last_name email").lean();
                if (farmer) {
                    log.user_id = {
                        _id: farmer._id,
                        first_name: farmer.first_name,
                        last_name: farmer.last_name,
                        email: farmer.email,
                        role: "farmer"
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
  }
);

module.exports = router;