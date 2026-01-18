const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, required: true }, // e.g., "REGISTER_SWINE", "UPDATE_PERFORMANCE"
  module: { type: String, required: true }, // e.g., "SWINE_MANAGEMENT", "USER_AUTH"
  details: { type: String },               // e.g., "Updated weight for Swine B127-4"
  ip_address: { type: String },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model("AuditLog", auditLogSchema);