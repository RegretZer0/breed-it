const Farmer = require("../models/UserFarmer");
const jwt = require("jsonwebtoken");


// ======================================================
// Require login for EJS pages
// ======================================================
function requireLogin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.redirect("/login");
  }
  next();
}

// ======================================================
// Require Farm Manager role
// ======================================================
function requireFarmManager(req, res, next) {
  if (!req.session?.user || req.session.user.role !== "farm_manager") {
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
  if (!req.session?.user || req.session.user.role !== "farmer") {
    return res.status(403).render("pages/auth/unauthorized", {
      page_title: "Unauthorized",
    });
  }
  next();
}

// ======================================================
// Require login for API routes (JSON)
// FIXED: supports id, _id, and email
// ======================================================
async function requireApiLogin(req, res, next) {
  try {
    let sessionUser = req.session?.user || null;

    // ✅ Allow JWT authentication
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

    if (!sessionUser) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    // Normalize user identity
    const userId = sessionUser.id || sessionUser._id || null;
    let farmerProfileId = null;

    if (sessionUser.role === "farmer") {
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

    // 🔑 Unified user object
    req.user = {
      id: userId,
      role: sessionUser.role,
      email: sessionUser.email,
      farmerProfileId,
      managerId: sessionUser.managerId || null,
    };

    next();
  } catch (err) {
    console.error("API Login Middleware Error:", err);
    res.status(500).json({
      success: false,
      message: "Authentication error",
    });
  }
}

module.exports = {
  requireLogin,
  requireApiLogin,
  requireFarmManager,
  requireFarmer,
};
