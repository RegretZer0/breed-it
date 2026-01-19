const AuditLog = require("../models/AuditLog");
const Farmer = require("../models/UserFarmer"); // ✅ Added to fetch Farmer names
const User = require("../models/UserModel");    // ✅ Added to fetch Manager/Encoder names

/**
 * Utility to log user actions for the Audit Trail
 * Captures user identity, the specific action, and metadata like IP address.
 */
const logAction = async (userId, action, module, details, req) => {
  try {
    // Improved IP detection to handle proxies and various connection types
    const ip = req.ip || 
               (req.connection && req.connection.remoteAddress) || 
               (req.headers && req.headers['x-forwarded-for']) || 
               "Unknown IP";

    let userName = "Unknown";
    let userRole = "Unknown";

    // ✅ Logic to resolve "Unknown" names
    // 1. Try to find if this user is a Farmer
    const farmerProfile = await Farmer.findOne({ user_id: userId });
    
    if (farmerProfile) {
      userName = `${farmerProfile.first_name} ${farmerProfile.last_name}`;
      userRole = "farmer";
    } else {
      // 2. If not a farmer, find them in the general User model (Managers/Encoders)
      const userAccount = await User.findById(userId);
      if (userAccount) {
        userName = userAccount.name || userAccount.username || "Staff";
        userRole = userAccount.role;
      }
    }

    const log = new AuditLog({
      user_id: userId,
      user_name: userName, // ✅ Now saving the actual name string
      role: userRole,      // ✅ Now saving the role
      action,
      module,
      details,
      ip_address: ip
    });

    await log.save();
  } catch (err) {
    console.error("Audit Log Error:", err);
  }
};

module.exports = logAction;