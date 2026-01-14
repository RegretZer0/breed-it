const jwt = require("jsonwebtoken");
const User = require("../models/UserModel.js");
const Farmer = require("../models/UserFarmer"); 

// 🔐 Require BOTH session + token
async function requireSessionAndToken(req, res, next) {
  // 1) Check session
  if (!req.session || !req.session.user) {
    return res.status(401).json({
      success: false,
      message: "Session expired. Please log in again.",
    });
  }

  // 2) Get token from headers or cookies
  const authHeader = req.headers["authorization"];
  const token =
    (authHeader && authHeader.startsWith("Bearer ") && authHeader.split(" ")[1]) ||
    req.cookies?.token ||
    req.body?.token ||
    null;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "No token provided. Please log in again.",
    });
  }

  try {
    // 3) Verify JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "fallback_secret");

    // 4) Compare token user with session user
    if (decoded.id !== req.session.user.id.toString()) {
      return res.status(401).json({
        success: false,
        message: "Session/token mismatch. Please log in again.",
      });
    }

    // 🔥 5) LOAD FULL USER FROM DATABASE
    const user = await User.findById(decoded.id).lean();

    if (!user) {
      return res.status(401).json({ success: false, message: "User not found" });
    }

    // 🔑 Attach farmerProfileId if farmer
    let farmerProfileId = null;
    if (user.role === "farmer") {
      const farmerProfile = await Farmer.findOne({ user_id: user._id }).lean();
      if (!farmerProfile) {
        return res.status(401).json({ success: false, message: "Farmer profile missing" });
      }
      farmerProfileId = farmerProfile._id.toString();
    }


    // ✅ 6) Attach COMPLETE user object
    req.user = {
      id: user._id.toString(),
      role: user.role,
      email: user.email,
      name: `${user.first_name || ""} ${user.last_name || ""}`.trim(),
      managerId: user.managerId ? user.managerId.toString() : null,
      farmerProfileId,
    };

    next();
  } catch (err) {
    console.error("JWT verification failed:", err.message);
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token.",
    });
  }
}

// Simple authenticated check (no change)
function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ success: false, message: "Not authenticated" });
}

module.exports = {
  requireSessionAndToken,
  isAuthenticated,
};
