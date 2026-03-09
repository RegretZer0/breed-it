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
  },
  role: { 
    type: String, 
    default: "Staff" 
  },     
  action: { 
    type: String, 
    required: true 
  },
  module: { 
    type: String, 
    required: true 
  },
  details: { 
    type: String 
  },              
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