// Require login for EJS pages
function requireLogin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.redirect("/login");
  }
  next();
}

// Require Farm Manager role
function requireFarmManager(req, res, next) {
  if (req.session.user.role !== "farm_manager") {
    return res.status(403).render("pages/auth/unauthorized", {
      page_title: "Unauthorized",
    });
  }
  next();
}

// Require Farmer role
function requireFarmer(req, res, next) {
  if (req.session.user.role !== "farmer") {
    return res.status(403).render("pages/auth/unauthorized", {
      page_title: "Unauthorized",
    });
  }
  next();
}

// ======================================================
// Require login for API routes (JSON response)
// ======================================================
function requireApiLogin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({
      success: false,
      message: "Not authenticated",
    });
  }

  // normalize like auth middleware
  req.user = req.session.user;
  next();
}

module.exports = {
  requireLogin,
  requireApiLogin, // 👈 ADDED
  requireFarmManager,
  requireFarmer,
};
