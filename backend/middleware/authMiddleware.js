const jwt = require("jsonwebtoken");
const User = require("../models/UserModel.js");
const Farmer = require("../models/UserFarmer");

// 🔐 Middleware to handle both Session and Token authentication
async function requireSessionAndToken(req, res, next) {
  try {
    // 1) Get token from headers, cookies, or body
    const authHeader = req.headers["authorization"];
    const token =
      (authHeader && authHeader.startsWith("Bearer ") && authHeader.split(" ")[1]) ||
      req.cookies?.token ||
      req.body?.token ||
      null;

    // 2) Check if at least one auth method exists
    const hasSession = req.session && req.session.user;
    
    if (!token && !hasSession) {
      return res.status(401).json({
        success: false,
        message: "Session expired or missing token. Please log in again.",
      });
    }

    let userId;

    // 3) Process Token if present, otherwise use Session
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "fallback_secret");
        userId = decoded.id;
        
        // Safety check: If session exists, ensure it matches the token
        if (hasSession && decoded.id !== req.session.user.id.toString()) {
          return res.status(401).json({
            success: false,
            message: "Session/token mismatch. Please log in again.",
          });
        }
      } catch (jwtErr) {
        console.error("JWT verification failed:", jwtErr.message);
        // If token is invalid but session is valid, we can still proceed
        if (!hasSession) {
          return res.status(401).json({ success: false, message: "Invalid token." });
        }
        userId = req.session.user.id;
      }
    } else {
      // Use Session data if no token was provided
      userId = req.session.user.id;
    }

    // 4) LOAD FULL USER FROM DATABASE
    // We check both User and Farmer collections to find the base account
    let user = await User.findById(userId).lean();
    
    // Fallback: Check if the ID provided is actually a Farmer ID directly
    if (!user) {
        const directFarmer = await Farmer.findById(userId).lean();
        if (directFarmer) {
            // Reconstruct a user-like object from the farmer profile if needed
            user = {
                _id: directFarmer.user_id || directFarmer._id,
                role: "farmer",
                first_name: directFarmer.first_name,
                last_name: directFarmer.last_name,
                managerId: directFarmer.registered_by
            };
        }
    }

    if (!user) {
      return res.status(401).json({ success: false, message: "User account not found" });
    }

    // 5) Attach farmerProfileId if user is a farmer
    let farmerProfileId = null;
    if (user.role === "farmer") {
      // Look for the profile linked to this user account
      let farmerProfile = await Farmer.findOne({ user_id: user._id }).lean();
      
      // Fallback: check if the userId itself is the Farmer Profile entry
      if (!farmerProfile) {
          farmerProfile = await Farmer.findById(userId).lean();
      }

      if (!farmerProfile) {
        console.error(`❌ Auth Denied: No Farmer Profile found for User ${userId}`);
        return res.status(401).json({ 
            success: false, 
            message: "Farmer profile missing or account not linked." 
        });
      }
      farmerProfileId = farmerProfile._id.toString();
    }

    // ✅ 6) Attach COMPLETE user object to request
    req.user = {
      id: user._id.toString(),
      role: user.role,
      email: user.email || "",
      name: `${user.first_name || ""} ${user.last_name || ""}`.trim(),
      managerId: user.managerId ? user.managerId.toString() : null,
      farmerProfileId,
    };

    next();
  } catch (err) {
    console.error("Auth Middleware Error:", err.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error during authentication.",
    });
  }
}

// Simple authenticated check
function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ success: false, message: "Not authenticated" });
}

module.exports = {
  requireSessionAndToken,
  isAuthenticated,
};