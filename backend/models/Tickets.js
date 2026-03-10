const mongoose = require("mongoose");

const TicketSchema = new mongoose.Schema({
  ticket_id: { type: String, unique: true }, // e.g., TKT-12345
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  name: String,
  email: String,

  category: {
    type: String,
    enum: ["technical", "billing", "account", "other"],
    default: "other"
  },

  priority: {
    type: String,
    enum: ["low", "normal", "high", "urgent"],
    default: "normal"
  },

  subject: { type: String, required: true },
  message: { type: String, required: true },
  page_url: String,

  status: {
    type: String,
    enum: ["open", "in_progress", "resolved", "closed"],
    default: "open"
  },

  closedAt: {
    type: Date,
    default: null
  },

  archived: {
    type: Boolean,
    default: false,
    index: true
  },

  archivedAt: {
    type: Date,
    default: null
  },

  createdAt: { type: Date, default: Date.now }
});

// Auto-generate ticket ID before saving
TicketSchema.pre("save", async function(next) {
  if (!this.ticket_id) {
    this.ticket_id = `TKT-${Math.floor(100000 + Math.random() * 900000)}`;
  }

  if (this.isModified("status")) {
    if (this.status === "closed" && !this.closedAt) {
      this.closedAt = new Date();
    }

    if (this.status !== "closed") {
      this.closedAt = null;
      this.archived = false;
      this.archivedAt = null;
    }
  }

  next();
});

module.exports = mongoose.model("Ticket", TicketSchema);