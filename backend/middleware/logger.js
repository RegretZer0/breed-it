const AuditLog = require("../models/AuditLog");
const Farmer = require("../models/UserFarmer");
const User = require("../models/UserModel");

/**
 * Utility to log user actions for the Audit Trail.
 * Captures user identity, resolves "Unknown" names by checking both Farmer and User collections,
 * and captures metadata like IP address.
 */
const logAction = async (userId, action, module, details, req) => {
  try {
    // 1. Improved IP detection with safety check for the 'req' object
    let ip = "Internal System";
    if (req) {
      ip = req.ip || 
           (req.headers && req.headers['x-forwarded-for']) || 
           (req.connection && req.connection.remoteAddress) || 
           "Unknown IP";
    }

    let userName = "Unknown";
    let userRole = "Unknown";

    // 2. Resolve User Identity
    // First, check if the user is a Farmer (Profile exists in UserFarmer)
    const farmerProfile = await Farmer.findOne({ user_id: userId });
    
    if (farmerProfile) {
      userName = `${farmerProfile.first_name} ${farmerProfile.last_name}`.trim();
      userRole = "farmer";
    } else {
      // Second, check the general User model (Managers, Encoders, Admins)
      const userAccount = await User.findById(userId);
      if (userAccount) {
        // Priority: Full Name > Username > Role Name
        if (userAccount.first_name || userAccount.last_name) {
          userName = `${userAccount.first_name || ''} ${userAccount.last_name || ''}`.trim();
        } else {
          userName = userAccount.name || userAccount.username || "Staff";
        }
        userRole = userAccount.role || "staff";
      }
    }

    // 3. Create and Save the Log
    const log = new AuditLog({
      user_id: userId,
      user_name: userName, // Saves the string name so it's readable in the table
      role: userRole,      // Saves the role for easier filtering
      action,
      module,
      details,
      ip_address: ip,
      timestamp: new Date()
    });

    await log.save();
    
    // Optional: Log to console for development tracking
    console.log(`[Audit] ${userRole.toUpperCase()}: ${userName} performed ${action} on ${module}`);

  } catch (err) {
    // Error handling as requested
    console.error("Audit Log Error:", err);
  }
};

module.exports = logAction;