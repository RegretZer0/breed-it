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

module.exports = {
  requireLogin,
  requireFarmManager,
  requireFarmer,
};
