const mongoose = require("mongoose");

const heatReportSchema = new mongoose.Schema(
  {
    // ---------------- BASIC RELATIONS ----------------
    swine_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Swine",
      required: true
    },

    farmer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Farmer",
      required: true
    },

    // farm_manager / admin who reviews
    manager_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false // allow creation before review
    },

    // ---------------- HEAT DETAILS ----------------
    signs: [
      {
        type: String,
        required: true
      }
    ],

    evidence_url: {
      type: String,
      required: true
    },

    heat_probability: {
      type: Number,
      default: null
    },

    approved_at: { 
      type: Date, 
      default: null 
    },
    approved_by: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      default: null 
    },
    admin_notes: {
      type: String,
      default: ""
    },

    // ---------------- WORKFLOW STATUS ----------------
    status: {
      type: String,
      enum: [
        "pending",              // submitted by farmer
        "accepted",             // heat confirmed
        "rejected",             // rejected
        "waiting_heat_check",   // AI done, waiting 23 days
        "pregnant"              // pregnancy confirmed
      ],
      default: "pending"
    },

    // ---------------- OVULATION / AI TRACKING ----------------
    ai_confirmed: {
      type: Boolean,
      default: false
    },

    ai_confirmed_at: {
      type: Date,
      default: null
    },

    // 23-day heat recheck
    next_heat_check: {
      type: Date,
      default: null
    },

    // ---------------- PREGNANCY / FARROWING ----------------
    pregnancy_confirmed_at: {
      type: Date,
      default: null
    },

    // 114–115 days countdown
    expected_farrowing: {
      type: Date,
      default: null
    },

    // ---------------- DATES ----------------
    date_reported: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("HeatReport", heatReportSchema);
