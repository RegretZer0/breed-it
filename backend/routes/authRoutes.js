const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const User = require("../models/UserModel");
const Farmer = require("../models/UserFarmer");

// ----------------------
// JWT helper
// ----------------------
const JWT_SECRET = process.env.JWT_SECRET || "super_secret_jwt_key";

function generateToken(user) {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      email: user.email,
      name: user.fullName || user.name || "User",
    },
    JWT_SECRET,
    { expiresIn: "1d" }
  );
}

// ----------------------
// Login with Session + JWT
// ----------------------
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Email and password are required" });
    }

    let user = await User.findOne({ email });
    let role = "farm_manager"; // default role

    if (!user) {
      user = await Farmer.findOne({ email });
      role = "farmer";
    }

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid password" });
    }

    // 🔐 REGENERATE SESSION ID
    req.session.regenerate(async (err) => {
      if (err)
        return res
          .status(500)
          .json({ success: false, message: "Session error" });

      // Store session user
      req.session.user = {
        id: user._id,
        role,
        email: user.email,
        name: user.fullName || user.name || "User",
      };

      // Create JWT token
      const token = generateToken({
        _id: user._id,
        role,
        email: user.email,
        fullName: user.fullName,
        name: user.name,
      });

      return res.json({
        success: true,
        message: "Login successful",
        user: req.session.user,
        role,
        token, // <-- FRONTEND will store this
      });
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ----------------------
// Logout
// ----------------------
router.post("/logout", (req, res) => {
  if (!req.session) {
    return res.json({ success: true, message: "Already logged out" });
  }

  req.session.destroy((err) => {
    if (err)
      return res
        .status(500)
        .json({ success: false, message: "Logout failed" });

    res.clearCookie("connect.sid", { path: "/" });
    res.json({ success: true, message: "Logged out successfully" });
  });
});

// ----------------------
// Get current user
// ----------------------
router.get("/me", (req, res) => {
  console.log("🔍 /me CHECK");
  console.log("Session ID:", req.sessionID);
  console.log("Session object:", req.session);
  console.log("Session user:", req.session?.user);
  console.log("Cookies:", req.headers.cookie);

  // ✅ Session check FIRST
  if (req.session && req.session.user) {
    console.log("✅ AUTH VIA SESSION");
    return res.json({
      success: true,
      source: "session",
      user: req.session.user,
    });
  }

  // 🔁 JWT fallback (debugged)
  const authHeader = req.headers.authorization;
  console.log("Authorization header:", authHeader);

  if (!authHeader) {
    console.warn("❌ No session, no token");
    return res
      .status(401)
      .json({ success: false, reason: "NO_SESSION_NO_TOKEN" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log("✅ AUTH VIA JWT", decoded);

    return res.json({
      success: true,
      source: "jwt",
      user: {
        id: decoded.id,
        role: decoded.role,
        email: decoded.email,
        name: decoded.name,
      },
    });
  } catch (err) {
    console.error("❌ JWT INVALID:", err.message);
    return res.status(401).json({
      success: false,
      reason: "INVALID_TOKEN",
    });
  }
});

router.get("/debug/session", (req, res) => {
  res.json({
    sessionID: req.sessionID,
    session: req.session,
    cookies: req.headers.cookie || null,
  });
});

// ----------------------
// Register Farm Manager
// ----------------------
router.post("/register", async (req, res) => {
  const { fullName, address, contact_info, email, password } = req.body;

  try {
    if (!fullName || !email || !password) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Full name, email, and password are required",
        });
    }

    const existing = await User.findOne({ email });
    if (existing)
      return res
        .status(400)
        .json({ success: false, message: "Email already registered" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      fullName,
      address,
      contact_info,
      email,
      password: hashedPassword,
      role: "farm_manager",
    });

    await newUser.save();
    res
      .status(201)
      .json({
        success: true,
        message: "Farm Manager registered successfully",
        user: newUser,
      });
  } catch (error) {
    console.error("Farm Manager registration error:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Server error",
        error: error.message,
      });
  }
});

// ----------------------
// Register Farmer
// ----------------------
router.post("/register-farmer", async (req, res) => {
  const {
    name,
    address,
    contact_no,
    email,
    password,
    num_of_pens,
    pen_capacity,
    managerId, // <-- updated from adminId
  } = req.body;

  try {
    if (!name || !email || !password || !managerId) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Name, email, password, and managerId are required",
        });
    }

    const manager = await User.findById(managerId);
    if (!manager || manager.role !== "farm_manager") {
      return res.status(400).json({ success: false, message: "Invalid Farm Manager ID" });
    }

    const existing = await Farmer.findOne({ email });
    if (existing)
      return res
        .status(400)
        .json({ success: false, message: "Email already registered" });

    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate farmer_id
    let nextNumber = 1;
    const lastFarmer = await Farmer.findOne().sort({ _id: -1 });
    if (lastFarmer?.farmer_id) {
      const parts = lastFarmer.farmer_id.split("-");
      const lastNum = parseInt(parts[1]);
      if (!isNaN(lastNum)) nextNumber = lastNum + 1;
    }
    const farmer_id = `Farmer-${String(nextNumber).padStart(5, "0")}`;

    const newFarmer = new Farmer({
      name,
      address,
      contact_no,
      email,
      password: hashedPassword,
      farmer_id,
      num_of_pens: num_of_pens || 0,
      pen_capacity: pen_capacity || 0,
      registered_by: managerId,
      user_id: managerId,
    });

    await newFarmer.save();
    res
      .status(201)
      .json({
        success: true,
        message: "Farmer registered successfully",
        farmer: newFarmer,
      });
  } catch (error) {
    console.error("Farmer registration error:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Server error",
        error: error.message,
      });
  }
});

// ----------------------
// Get farmers registered by Farm Manager
// ----------------------
router.get("/farmers/:managerId", async (req, res) => {
  const { managerId } = req.params;

  try {
    const farmers = await Farmer.find({ registered_by: managerId }).select("-password -__v");
    res.json({ success: true, farmers });
  } catch (error) {
    console.error("Fetch farmers error:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// ----------------------
// Update Farmer
// ----------------------
router.put("/update-farmer/:farmerId", async (req, res) => {
  const { farmerId } = req.params;
  const { name, address, contact_no, email, num_of_pens, pen_capacity } = req.body;

  try {
    const farmer = await Farmer.findOne({ farmer_id: farmerId });
    if (!farmer) return res.status(404).json({ success: false, message: "Farmer not found" });

    if (name) farmer.name = name;
    if (address) farmer.address = address;
    if (contact_no) farmer.contact_no = contact_no;
    if (email) farmer.email = email;
    if (num_of_pens !== undefined) farmer.num_of_pens = num_of_pens;
    if (pen_capacity !== undefined) farmer.pen_capacity = pen_capacity;

    await farmer.save();
    res.json({ success: true, message: "Farmer updated successfully", farmer });
  } catch (error) {
    console.error("Update farmer error:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

module.exports = router;
