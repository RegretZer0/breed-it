const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const { JWT_SECRET } = require("../config/jwt");

const User = require("../models/UserModel");
const Farmer = require("../models/UserFarmer");

const attachUser = require("../middleware/attachUser");
const { requireSessionAndToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

/* ======================
   JWT HELPER
====================== */
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

    req.session.regenerate(() => {
      req.session.user = {
        id: user._id.toString(),
        role,
        email: user.email,
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        name: `${user.first_name || ""} ${user.last_name || ""}`.trim() || "User",
        managerId: user.managerId || null,
      };

      res.json({
        success: true,
        message: "Login successful",
        user: req.session.user,
        role,
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
router.post("/logout", (req, res) => {
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
   (SINGLE ROUTE – DUPLICATE REMOVED)
====================== */
router.post("/register", async (req, res) => {
  const { first_name, last_name, address, contact_info, email, password } = req.body;

  try {
    if (!first_name || !last_name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    if (await User.findOne({ email })) {
      return res.status(400).json({
        success: false,
        message: "Email already registered",
      });
    }

    const user = await User.create({
      first_name,
      last_name,
      address,
      contact_info,
      email,
      password: await bcrypt.hash(password, 10),
      role: "farm_manager",
    });

    res.status(201).json({
      success: true,
      message: "Farm Manager registered successfully",
      user,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/* ======================
   REGISTER FARMER (FIXED)
====================== */
router.post("/register-farmer", async (req, res) => {
  try {
    const {
      first_name,
      last_name,
      address,
      contact_info,
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

    if (await Farmer.findOne({ email })) {
      return res.status(400).json({
        success: false,
        message: "Farmer already exists",
      });
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
      contact_no: contact_info, // ✅ FIX
      email,
      password: await bcrypt.hash(password, 10),
      managerId,
      num_of_pens,
      pen_capacity,
      production_type,
      membership_date,
    });

    res.status(201).json({
      success: true,
      message: "Farmer registered successfully",
      farmer,
    });
  } catch (error) {
    console.error("Register farmer error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/* ======================
   GET FARMERS (NO PARAM)
   ✅ MATCHES FRONTEND
====================== */
router.get(
  "/farmers",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const user = req.user;
      const managerId =
        user.role === "farm_manager" ? user.id : user.managerId;

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
   ⚠️ KEPT FOR BACKWARD COMPAT
====================== */
router.get(
  "/farmers/:managerId",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const paramManagerId = req.params.managerId;
      const user = req.user;

      const managerId =
        user.role === "farm_manager"
          ? user.id
          : user.managerId;

      if (paramManagerId !== managerId) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized manager access",
        });
      }

      const farmers = await Farmer.find({ managerId });

      res.json({ success: true, farmers });
    } catch (error) {
      console.error("Fetch farmers error:", error);
      res.status(500).json({
        success: false,
        message: "Server error",
      });
    }
  }
);

/* ======================
   UPDATE FARMER
   ✅ MATCHES FRONTEND
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
        return res.status(404).json({
          success: false,
          message: "Farmer not found",
        });
      }

      [
        "first_name",
        "last_name",
        "address",
        "contact_no",
        "num_of_pens",
        "pen_capacity",
        "status",
      ].forEach((field) => {
        if (req.body[field] !== undefined) {
          farmer[field] = req.body[field];
        }
      });

      await farmer.save();

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
router.post("/register-encoder", async (req, res) => {
  const {
    first_name,
    last_name,
    address,
    contact_info,
    email,
    password,
    managerId,
  } = req.body;

  try {
    if (!first_name || !last_name || !email || !password || !managerId) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
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

    const encoder = await User.create({
      first_name,
      last_name,
      address,
      contact_info,
      email,
      password: await bcrypt.hash(password, 10),
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

/* ======================
   GET ENCODERS
   ✅ PROTECTED + MATCHES FRONTEND
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
      return res.status(404).json({
        success: false,
        message: "Encoder not found",
      });
    }

    res.json({ success: true, encoder });
  } catch (error) {
    console.error("Fetch single encoder error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
