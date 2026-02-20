const { requireSessionAndToken } = require("./authMiddleware");

/**
 * 🛡️ adminOnly Middleware
 * Ensures the user is authenticated (Session or Token) 
 * and possesses the 'system_admin' role.
 */
module.exports = (req, res, next) => {
  // 1) Execute the main authentication middleware first
  requireSessionAndToken(req, res, () => {
    
    // 2) Check if the user was successfully attached to the request
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: "Authentication failed. Please log in again." 
      });
    }

    // 3) Strict Role Authorization
    if (req.user.role !== "system_admin") {
      console.warn(`🚨 Access Denied: User ${req.user.email} (Role: ${req.user.role}) attempted to access Admin routes.`);
      
      return res.status(403).json({ 
        success: false, 
        message: "Access denied. System Administrator privileges required." 
      });
    }

    // 4) Proceed to the Admin Route
    next();
  });
};