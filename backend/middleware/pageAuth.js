function requireAuthPage(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.redirect("/login");
  }
  next();
}

function requireAdminPage(req, res, next) {
  if (
    !req.session ||
    !req.session.user ||
    req.session.user.role !== "admin"
  ) {
    return res.redirect("/login");
  }
  next();
}

function requireFarmerPage(req, res, next) {
  console.log("🛂 requireFarmerPage HIT");
  console.log("Session ID:", req.sessionID);
  console.log("Session:", req.session);
  console.log("Session user:", req.session?.user);

  if (
    !req.session ||
    !req.session.user ||
    req.session.user.role !== "farmer"
  ) {
    console.log("❌ BLOCKED — redirecting to /login");
    return res.redirect("/login");
  }

  console.log("✅ ACCESS GRANTED");
  next();
}


module.exports = {
  requireAuthPage,
  requireAdminPage,
  requireFarmerPage,
};
