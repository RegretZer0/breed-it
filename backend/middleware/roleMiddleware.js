/**
 * Generic role guard
 * Updated to handle both standard Page renders and API JSON responses.
 * This prevents 403 crashes when the frontend expects JSON but receives HTML.
 */
function allowRoles(...roles) {
  return (req, res, next) => {
    // 1. Check if user is logged in and has a role attached by authMiddleware
    if (!req.user || !req.user.role) {
      // If it's an API request or AJAX, return JSON so the frontend can handle it
      if (req.xhr || req.path.startsWith('/api')) {
        return res.status(401).json({ 
          success: false, 
          message: "Session expired or not authenticated." 
        });
      }
      // Otherwise, redirect to login page
      return res.redirect("/login");
    }

    // 2. Check if the user's role is included in the allowed roles
    // The ...roles rest operator collects arguments into an array.
    if (!roles.includes(req.user.role)) {
      // If it's an API request, return a clean JSON error
      if (req.xhr || req.path.startsWith('/api')) {
        return res.status(403).json({ 
          success: false, 
          message: `Permission Denied: ${req.user.role} is not authorized for this action.` 
        });
      }

      // Otherwise, render the custom 403 error page
      return res.status(403).render("errors/403", {
        page_title: "Access Denied",
      });
    }

    // User is authorized, proceed to the next middleware or controller
    next();
  };
}

// Role-specific helpers (remains unchanged to preserve your features)
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