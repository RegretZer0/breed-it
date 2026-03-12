const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
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
      enum: ["info", "success", "alert", "error", "warning", "maintenance"],
      default: "info",
      index: true
    },

    is_global: {
      type: Boolean,
      default: false
    },

    scheduled_for: {
      type: Date,
      default: null,
      index: true
    },

    ends_at: {
      type: Date,
      default: null,
      index: true
    },

    status: {
      type: String,
      enum: ["scheduled", "active", "completed", "cancelled"],
      default: "scheduled",
      index: true
    },

    is_archived: {
      type: Boolean,
      default: false,
      index: true
    },

    archived_at: {
      type: Date,
      default: null
    },

    cancelled_at: {
      type: Date,
      default: null
    },

    cancelled_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    read_by: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" }
  }
);

module.exports = mongoose.model("Notification", notificationSchema);