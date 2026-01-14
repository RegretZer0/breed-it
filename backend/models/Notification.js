const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "UserModel", // ✅ unified auth users
    required: true
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: {
    type: String,
    enum: ["info", "alert", "success", "error"],
    default: "info"
  },
  // Track which users have read this notification
  read_by: [{ type: mongoose.Schema.Types.ObjectId, ref: "UserModel" }],
  created_at: { type: Date, default: Date.now },
  expires_at: { type: Date }
});

module.exports = mongoose.model("Notification", notificationSchema);
