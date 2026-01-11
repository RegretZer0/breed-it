// Generic role guard (for page routes)
function allowRoles(...roles) {
  return (req, res, next) => {
    // Not logged in
    if (!req.user || !req.user.role) {
      return res.redirect("/login");
    }

    // Role not allowed
    if (!roles.includes(req.user.role)) {
      return res.status(403).render("errors/403", {
        page_title: "Access Denied",
      });
    }

    next();
  };
}

// Role-specific helpers
const isSystemAdmin = allowRoles("system_admin");
const isFarmManager = allowRoles("farm_manager");
const isEncoder = allowRoles("encoder");
const isFarmer = allowRoles("farmer");

module.exports = {
  allowRoles,
  isSystemAdmin,
  isFarmManager,
  isEncoder,
  isFarmer,
};
