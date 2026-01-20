const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema({
  user_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  user_name: { 
    type: String, 
    default: "Unknown" 
  }, // ✅ Added to store the Full Name (e.g., "Marc Malacas")
  role: { 
    type: String, 
    default: "Staff" 
  },      // ✅ Added to store the Role (e.g., "farmer", "farm_manager")
  action: { 
    type: String, 
    required: true 
  }, // e.g., "REGISTER_SWINE", "UPDATE_PERFORMANCE"
  module: { 
    type: String, 
    required: true 
  }, // e.g., "SWINE_MANAGEMENT", "USER_AUTH"
  details: { 
    type: String 
  },               // e.g., "Updated weight for Swine B127-4"
  ip_address: { 
    type: String 
  },
  timestamp: { 
    type: Date, 
    default: Date.now 
  }
});

// Create an index on timestamp for faster loading of the Audit Trail table
auditLogSchema.index({ timestamp: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);