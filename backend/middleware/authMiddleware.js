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
        /**
         * FIXED: Time Warp Resilience
         * We check if the virtual time is significantly different from real time.
         * If it is, we ignore the expiration check so users don't get kicked out 
         * when teleporting into the future.
         */
        const realNow = new Date().getTime();
        const virtualNow = global.getNow().getTime();
        const clockTimestamp = Math.floor(virtualNow / 1000);
        
        // If offset is greater than 1 minute, consider it a "Warp"
        const isTimeWarped = Math.abs(virtualNow - realNow) > 60000;

        const decoded = jwt.verify(token, process.env.JWT_SECRET || "fallback_secret", {
          clockTimestamp: clockTimestamp,
          ignoreExpiration: isTimeWarped // ✅ Bypass expiration ONLY during time warps
        });

        userId = decoded.id;
        
        // Safety check: If session exists, ensure it matches the token
        if (hasSession && decoded.id !== req.session.user.id.toString()) {
          return res.status(401).json({
            success: false,
            message: "Session/token mismatch. Please log in again.",
          });
        }
      } catch (jwtErr) {
        console.error(`❌ JWT Verification Failed [${jwtErr.name}]:`, jwtErr.message);
        
        // If token is invalid but session is valid, we can still proceed
        if (!hasSession) {
          const msg = jwtErr.name === "TokenExpiredError" 
            ? "Your session has expired in this timeline. Please log in again." 
            : "Invalid token.";
          return res.status(401).json({ success: false, message: msg });
        }
        userId = req.session.user.id;
      }
    } else {
      // Use Session data if no token was provided
      userId = req.session.user.id;
    }

    // 4) LOAD FULL USER FROM DATABASE & UPDATE LAST ACTIVE
    let user = await User.findById(userId);
    
    // Heartbeat Logic using Global Virtual Time
    if (user) {
      user.lastActive = global.getNow(); // Use virtual time for the heartbeat
      await user.save();
    }

    // Fallback: Check if the ID provided is actually a Farmer ID directly
    if (!user) {
        const directFarmer = await Farmer.findById(userId).lean();
        if (directFarmer) {
            user = {
                _id: directFarmer.user_id || directFarmer._id,
                role: "farmer",
                first_name: directFarmer.first_name,
                last_name: directFarmer.last_name,
                managerId: directFarmer.registered_by
            };
            
            if (directFarmer.user_id) {
              await User.findByIdAndUpdate(directFarmer.user_id, { lastActive: global.getNow() });
            }
        }
    }

    if (!user) {
      return res.status(401).json({ success: false, message: "User account not found" });
    }

    // 5) Attach farmerProfileId if user is a farmer
    let farmerProfileId = null;
    if (user.role === "farmer") {
      let farmerProfile = await Farmer.findOne({ user_id: user._id }).lean();
      
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
  protect: requireSessionAndToken,
  isAuthenticated,
};