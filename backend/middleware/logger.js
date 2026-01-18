const AuditLog = require("../models/AuditLog");

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

    const log = new AuditLog({
      user_id: userId,
      action,
      module,
      details,
      ip_address: ip
    });

    await log.save();
  } catch (err) {
    // Fixed typo: changed .erroar to .error
    console.error("Audit Log Error:", err);
  }
};

module.exports = logAction;