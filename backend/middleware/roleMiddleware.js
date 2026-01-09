// Generic role guard
function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ success: false, message: "User role not found" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Access denied for your role" });
    }

    next();
  };
}

// Optional individual guards
const isSystemAdmin = (req, res, next) => allowRoles("system_admin")(req, res, next);
const isFarmManager = (req, res, next) => allowRoles("farm_manager")(req, res, next);
const isEncoder = (req, res, next) => allowRoles("encoder")(req, res, next);
const isFarmer = (req, res, next) => allowRoles("farmer")(req, res, next);

module.exports = {
  allowRoles,
  isSystemAdmin,
  isFarmManager,
  isEncoder,
  isFarmer,
};
