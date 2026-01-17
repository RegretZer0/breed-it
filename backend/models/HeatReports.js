const mongoose = require("mongoose");

const heatReportSchema = new mongoose.Schema(
  {
    // ---------------- BASIC RELATIONS ----------------
    swine_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Swine",
      default: null
    },

    farmer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Farmer",
      required: true
    },

    manager_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false 
    },

    // ---------------- HEAT DETAILS ----------------
    signs: [
      {
        type: String,
        enum: [
          "Reddened Vulva",
          "Swollen Vulva",
          "Mucous Discharge",
          "Seeking the Boar",
          "Perked/Twitching Ears",
          "Standing Reflex",
          "Back Pressure Test"
        ],
        required: true
      }
    ],

    standing_reflex: {
      type: Boolean,
      default: false
    },
    back_pressure_test: {
      type: Boolean,
      default: false
    },

    evidence_url: [{
      type: String,
      required: true
    }],

    heat_probability: {
      type: Number,
      default: null
    },

    // ---------------- APPROVAL/REJECTION DETAILS ----------------
    approved_at: { 
      type: Date, 
      default: null 
    },
    approved_by: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      default: null 
    },
    
    // Fields for Rejection
    rejection_reason: {
      type: String,
      default: null
    },
    rejected_at: {
      type: Date,
      default: null
    },

    // Inside your HeatReportSchema
    rejection_message: { 
        type: String, 
        default: "" 
    },

    // ---------------- WORKFLOW STATUS ----------------
    status: {
      type: String,
      enum: [
        "pending",            // Submitted by farmer
        "approved",           // Manager confirmed (In-Heat)
        "rejected",           // Manager denied
        "ai_service",         // Artificial Insemination performed
        "under_observation", // 23-day observation period
        "pregnant",           // Passed 23-day check
        "farrowing_ready",    // Ready for farrowing
        "farrowed",           // Successfully farrowed
        "lactating",         // Currently lactating
        "completed"           // Cycle ended
      ],
      default: "pending"
    },

    // ---------------- TRACKING DATES ----------------
    ai_confirmed_at: {
      type: Date,
      default: null
    },

    // 23-day recheck date
    next_heat_check: {
      type: Date,
      default: null
    },

    // 114–115 days countdown
    expected_farrowing: {
      type: Date,
      default: null
    },

    pregnancy_confirmed_at: {
      type: Date,
      default: null
    },

    date_reported: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("HeatReport", heatReportSchema);