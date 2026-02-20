const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    // user_id is optional to allow Global broadcasts (is_global: true)
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", 
      required: false,
      index: true
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: {
      type: String,
      // 'maintenance' type included for system-wide alerts
      enum: ["info", "success", "alert", "error", "maintenance"],
      default: "info"
    },
    is_global: { 
      type: Boolean, 
      default: false 
    },

    scheduled_for: { 
      type: Date, 
      default: null 
    },
    ends_at: { 
      type: Date, 
      default: null 
    },

    read_by: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
  },
  {
    // Custom names for the timestamp fields
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" }
  }
);

module.exports = mongoose.model("Notification", notificationSchema);