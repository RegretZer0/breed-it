// middleware/pageAuth.js

function requireAuthPage(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.redirect("/Login");
  }
  next();
}

function requireAdminPage(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.redirect("/Login");
  }

  if (req.session.user.role !== "admin") {
    return res.redirect("/Login");
  }

  next();
}

function requireFarmerPage(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.redirect("/Login");
  }

  if (req.session.user.role !== "farmer") {
    return res.redirect("/Login");
  }

  next();
}

module.exports = {
  requireAuthPage,
  requireAdminPage,
  requireFarmerPage,
};
