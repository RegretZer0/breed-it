const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const { JWT_SECRET } = require("../config/jwt");

const User = require("../models/UserModel");
const Farmer = require("../models/UserFarmer");

// JWT helper
function generateToken(user) {
  return jwt.sign(
    {
      id: user._id.toString(),
      role: user.role,
      email: user.email,
      name: user.fullName || user.name || "User",
    },
    JWT_SECRET,
    { expiresIn: "1d" }
  );
}

// Login with Session + JWT
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // Try to find user in Users collection first
    let user = await User.findOne({ email });
    let role;

    if (user) {
      role = user.role; // use DB role for User (including system_admin)
    } else {
      // If not found, check Farmers collection
      user = await Farmer.findOne({ email });
      role = "farmer"; // farmers always have 'farmer' role
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

    req.session.regenerate((err) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: "Session error",
        });
      }

      // ✅ store the correct role from DB
      req.session.user = {
        id: user._id.toString(),
        role,
        email: user.email,
        name: user.fullName || user.name || "User",
        managerId: user.managerId || null,
      };

      const token = generateToken({
        _id: user._id,
        role,
        email: user.email,
        fullName: user.fullName,
        name: user.name,
        managerId: user.managerId || null, // include managerId in JWT
      });

      res.json({
        success: true,
        message: "Login successful",
        user: req.session.user,
        role,
        token,
      });
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Logout
router.post("/logout", (req, res) => {
  req.session?.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ success: true, message: "Logged out successfully" });
  });
});

// Get current user
router.get("/me", (req, res) => {
  console.log("=== /me DEBUG ===");
  console.log("Session:", req.session?.user);
  console.log("Auth header:", req.headers.authorization);

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

    console.log("Decoded JWT:", decoded);

    res.json({
      success: true,
      source: "jwt",
      user: decoded,
    });
  } catch (err) {
    console.error("JWT error:", err);
    res.status(401).json({
      success: false,
      reason: "INVALID_TOKEN",
    });
  }
});

// Register Farm Manager
router.post("/register", async (req, res) => {
  const { fullName, address, contact_info, email, password } = req.body;

  try {
    if (!fullName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Full name, email, and password are required",
      });
    }

    if (await User.findOne({ email })) {
      return res.status(400).json({
        success: false,
        message: "Email already registered",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      fullName,
      address,
      contact_info,
      email,
      password: hashedPassword,
      role: "farm_manager",
    });

    res.status(201).json({
      success: true,
      message: "Farm Manager registered successfully",
      user: newUser,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Register Farmer
router.post("/register-farmer", async (req, res) => {
  const {
    name,
    address,
    contact_no,
    email,
    password,
    num_of_pens,
    pen_capacity,
    managerId,
  } = req.body;

  try {
    if (!name || !email || !password || !managerId) {
      return res.status(400).json({
        success: false,
        message: "Name, email, password, and managerId are required",
      });
    }

    const manager = await User.findById(managerId);
    if (!manager || manager.role !== "farm_manager") {
      return res.status(400).json({
        success: false,
        message: "Invalid Farm Manager ID",
      });
    }

    if (await Farmer.findOne({ email })) {
      return res.status(400).json({
        success: false,
        message: "Email already registered",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const lastFarmer = await Farmer.findOne().sort({ _id: -1 });
    const nextNum = lastFarmer
      ? parseInt(lastFarmer.farmer_id.split("-")[1]) + 1
      : 1;

    const farmer_id = `Farmer-${String(nextNum).padStart(5, "0")}`;

    const farmer = await Farmer.create({
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

    res.status(201).json({
      success: true,
      message: "Farmer registered successfully",
      farmer,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get farmers by manager
router.get("/farmers/:managerId", async (req, res) => {
  try {
    const managerId = req.params.managerId;

    console.log("=== FETCH FARMERS DEBUG ===");
    console.log("Requested managerId:", managerId);

    const farmers = await Farmer.find({
      $or: [{ registered_by: managerId }, { user_id: managerId }],
    }).select("-password -__v");

    console.log("Farmers found:", farmers.length);
    console.log("Farmers data:", farmers);

    res.json({ success: true, farmers });
  } catch (error) {
    console.error("Fetch farmers error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update Farmer
router.put("/update-farmer/:farmerId", async (req, res) => {
  try {
    const farmer = await Farmer.findOne({ farmer_id: req.params.farmerId });
    if (!farmer) {
      return res.status(404).json({
        success: false,
        message: "Farmer not found",
      });
    }

    Object.assign(farmer, req.body);
    await farmer.save();

    res.json({
      success: true,
      message: "Farmer updated successfully",
      farmer,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Register Encoder
router.post("/register-encoder", async (req, res) => {
  const {
    fullName,
    address,
    contact_info,
    email,
    password,
    managerId
  } = req.body;

  try {
    if (!fullName || !email || !password || !managerId) {
      return res.status(400).json({
        success: false,
        message: "Full name, email, password, and managerId are required",
      });
    }

    const manager = await User.findById(managerId);
    if (!manager || manager.role !== "farm_manager") {
      return res.status(400).json({
        success: false,
        message: "Invalid Farm Manager ID",
      });
    }

    if (await User.findOne({ email })) {
      return res.status(400).json({
        success: false,
        message: "Email already registered",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const encoder = await User.create({
      fullName,
      address,
      contact_info,
      email,
      password: hashedPassword,
      role: "encoder",
      managerId,
      status: "active"
    });

    res.status(201).json({
      success: true,
      message: "Encoder registered successfully",
      encoder,
    });
  } catch (error) {
    console.error("Register encoder error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get encoders by manager
router.get("/encoders/:managerId", async (req, res) => {
  try {
    const encoders = await User.find({
      role: "encoder",
      managerId: req.params.managerId
    }).select("-password -__v");

    res.json({ success: true, encoders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update Encoder
router.put("/update-encoder/:id", async (req, res) => {
  try {
    const encoder = await User.findById(req.params.id);
    if (!encoder || encoder.role !== "encoder") {
      return res.status(404).json({
        success: false,
        message: "Encoder not found",
      });
    }

    Object.assign(encoder, req.body);
    await encoder.save();

    res.json({
      success: true,
      message: "Encoder updated successfully",
      encoder,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get single encoder by ID
router.get("/encoders/single/:id", async (req, res) => {
  try {
    const encoder = await User.findOne({ _id: req.params.id, role: "encoder" }).select("-password -__v");
    if (!encoder) {
      return res.status(404).json({
        success: false,
        message: "Encoder not found",
      });
    }

    res.json({
      success: true,
      encoder, // ✅ frontend expects .encoder.managerId
    });
  } catch (error) {
    console.error("Fetch single encoder error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});


module.exports = router;
