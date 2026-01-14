const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const { JWT_SECRET } = require("../config/jwt");

const User = require("../models/UserModel");
const Farmer = require("../models/UserFarmer");
const attachUser = require("../middleware/attachUser");

// JWT helper
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
      role = user.role;
    } else {
      // If not found, check Farmers collection
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

    req.session.regenerate((err) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: "Session error",
        });
      }

      // ✅ Store user info with first_name & last_name
      req.session.user = {
        id: user._id.toString(),
        role,
        email: user.email,
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        name: `${user.first_name || ""} ${user.last_name || ""}`.trim() || "User",
        managerId: user.managerId || null,
      };

      const token = generateToken(user);

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
  const { first_name, last_name, address, contact_info, email, password } = req.body;

  try {
    if (!first_name || !last_name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "First name, last name, email, and password are required",
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
      first_name,
      last_name,
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


// =====================
// Register Farm Manager
// =====================
router.post("/register", async (req, res) => {
  const { first_name, last_name, address, contact_info, email, password } = req.body;

  if (await User.findOne({ email })) {
    return res.status(400).json({ success: false, message: "Email already registered" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await User.create({
    first_name,
    last_name,
    address,
    contact_info,
    email,
    password: hashedPassword,
    role: "farm_manager",
  });

  res.status(201).json({ success: true, message: "Farm Manager registered", user });
});

//=====================
// REGISTER FARMER
//=====================
router.post("/register-farmer", async (req, res) => {
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
    } = req.body;

    if (!email || !password || !managerId) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const manager = await User.findById(managerId);
    if (!manager || manager.role !== "farm_manager") {
      return res.status(400).json({ success: false, message: "Invalid manager" });
    }

    // Prevent duplicates
    if (await User.findOne({ email }) || await Farmer.findOne({ email })) {
      return res.status(400).json({ success: false, message: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // 1️⃣ Create USER (for authentication)
    const user = await User.create({
      first_name,
      last_name,
      email,
      password: hashedPassword,
      role: "farmer",
      managerId,
    });

    // 2️⃣ Generate farmer_id
    const lastFarmer = await Farmer.findOne().sort({ _id: -1 });
    const nextNum = lastFarmer
      ? parseInt(lastFarmer.farmer_id.split("-")[1]) + 1
      : 1;
    const farmerId = `Farmer-${String(nextNum).padStart(5, "0")}`;

    // 3️⃣ Create FARMER profile
    const farmer = await Farmer.create({
      user_id: user._id,
      farmer_id: farmerId,
      first_name,
      last_name,
      address,
      contact_no,
      email,
      password: hashedPassword,
      managerId,
      num_of_pens,
      pen_capacity,
    });

    res.status(201).json({
      success: true,
      message: "Farmer registered successfully",
      farmer,
    });
  } catch (error) {
    console.error("Register farmer error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get farmers by manager
router.get("/farmers/:managerId", async (req, res) => {
  try {
    const managerId = req.params.managerId;

    const farmers = await Farmer.find({
      $or: [
        { registered_by: managerId },
        { user_id: managerId },
        { managerId: managerId } // 🔹 include this
      ],
    }).select("-password -__v");

    res.json({ success: true, farmers });
  } catch (error) {
    console.error("Fetch farmers error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

//=====================
// GET FARMER PROFILE (new route using attachUser)
//=====================
router.get("/farmer/profile", attachUser, async (req, res) => {
  if (req.currentUser.role !== "farmer") {
    return res.status(403).json({ success: false, message: "Access denied" });
  }
  res.json({ success: true, farmer: req.currentUser });
});

//=====================
// UPDATE FARMER (use attachUser)
//=====================
router.put("/farmer/update", attachUser, async (req, res) => {
  try {
    if (req.currentUser.role !== "farmer") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const farmer = req.currentUser;

    // Only update allowed fields
    const updateFields = {};
    ["first_name", "last_name", "address", "contact_no", "num_of_pens", "pen_capacity"].forEach(field => {
      if (req.body[field] !== undefined) updateFields[field] = req.body[field];
    });

    Object.assign(farmer, updateFields);
    await farmer.save();

    res.json({
      success: true,
      message: "Farmer updated successfully",
      farmer,
    });
  } catch (error) {
    console.error("Update farmer error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Register Encoder
router.post("/register-encoder", async (req, res) => {
  const {
    first_name,
    last_name,
    address,
    contact_info,
    email,
    password,
    managerId
  } = req.body;

  try {
    if (!first_name || !last_name || !email || !password || !managerId) {
      return res.status(400).json({
        success: false,
        message: "First name, last name, email, password, and managerId are required",
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
      first_name,
      last_name,
      address,
      contact_info,
      email,
      password: hashedPassword,
      role: "encoder",
      managerId,
      status: "active",
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
