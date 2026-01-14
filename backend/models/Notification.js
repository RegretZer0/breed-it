const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: "UserFarmer", required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, enum: ["info", "alert", "success", "error"], default: "info" },
  is_read: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
  expires_at: { type: Date } // optional, for notifications that auto-expire
});

module.exports = mongoose.model("Notification", notificationSchema);
