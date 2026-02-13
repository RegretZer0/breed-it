const Farmer = require("../models/UserFarmer");
const jwt = require("jsonwebtoken");

// ======================================================
// Require login for EJS pages
// ======================================================
function requireLogin(req, res, next) {
  // Check session specifically
  if (!req.session || !req.session.user) {
    return res.redirect("/login");
  }
  // Sync session user to req.user so other features can use it
  req.user = req.session.user;
  next();
}

// ======================================================
// Require Farm Manager role - added encoder as allowed role
// ======================================================
function requireFarmManager(req, res, next) {
  const user = req.session?.user || req.user;
  if (
    !user ||
    !["farm_manager", "encoder"].includes(user.role)
  ) {
    return res.status(403).render("pages/auth/unauthorized", {
      page_title: "Unauthorized",
    });
  }
  next();
}

// ======================================================
// Require Farmer role
// ======================================================
function requireFarmer(req, res, next) {
  const user = req.session?.user || req.user;
  if (!user || user.role !== "farmer") {
    return res.status(403).render("pages/auth/unauthorized", {
      page_title: "Unauthorized",
    });
  }
  next();
}

function requireApiFarmer(req, res, next) {
  if (!req.user || req.user.role !== "farmer") {
    return res.status(403).json({
      success: false,
      message: "Farmer access required",
    });
  }
  next();
}

// ======================================================
// Require login for API routes (JSON)
// FIXED: added session persistence re-binding for rapid refresh
// ======================================================
async function requireApiLogin(req, res, next) {
  try {
    let sessionUser = req.session?.user || null;

    // 1. If no session, check for JWT (for Mobile/Postman)
    if (!sessionUser) {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.split(" ")[1];
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          sessionUser = decoded.user || decoded;
        } catch (err) {
          return res.status(401).json({
            success: false,
            message: "Invalid or expired token",
          });
        }
      }
    }

    // 2. Double-Check Security
    if (!sessionUser) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    // 3. Normalize user identity (Handle different ID field names)
    const userId = sessionUser.id || sessionUser._id || null;
    let farmerProfileId = sessionUser.farmerProfileId || null;

    // 4. Farmer Profile Logic (Cached to prevent DB spam on refresh)
    if (sessionUser.role === "farmer" && !farmerProfileId) {
      const farmer = await Farmer.findOne({
        $or: [
          userId ? { user_id: userId } : null,
          sessionUser.email ? { email: sessionUser.email } : null,
        ].filter(Boolean),
      }).lean();

      if (!farmer) {
        return res.status(401).json({
          success: false,
          message: "Farmer profile not linked",
        });
      }
      farmerProfileId = farmer._id.toString();
    }

    // 5. 🔑 Re-bind Unified User Object
    // This ensures that even if you refresh, req.user is always populated
    req.user = {
      id: userId,
      role: sessionUser.role,
      email: sessionUser.email,
      farmerProfileId,
      managerId: sessionUser.managerId || null,
    };

    // 6. Optional: Sync back to session to prevent repeated DB lookups on next F5
    if (req.session) {
        req.session.user = { ...sessionUser, farmerProfileId: req.user.farmerProfileId };
    }

    next();
  } catch (err) {
    console.error("API Login Middleware Error:", err);
    res.status(500).json({
      success: false,
      message: "Authentication error",
    });
  }
}

function requireFarmManagerOnly(req, res, next) {
  const user = req.session?.user || req.user;
  if (!user || user.role !== "farm_manager") {
    return res.status(403).render("pages/auth/unauthorized", {
      page_title: "Unauthorized",
    });
  }
  next();
}

module.exports = {
  requireLogin,
  requireApiLogin,
  requireFarmManager,
  requireFarmManagerOnly,
  requireFarmer,
  requireApiFarmer,
};