// backend/models/HeatReports.js
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

    // Tracking which cycle this report belongs to for the Sow
    breeding_cycle_number: {
      type: Number,
      default: 1
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
          "Tail raising",
          "Perked/Twitching Ears",
          "Standing Reflex",
          "Back Pressure Test",
          "Restlessness or noticeable behavioral change",
          "Increased vocalization",
          "Decreased appetite",
          "Increased alertness or irritability"
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

    remarks: {
      type: String,
      default: ""
    },

    evidence_url: [
      {
        type: String,
        required: true
      }
    ],

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

    rejected_by: {
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

    rejection_message: {
      type: String,
      default: ""
    },

    // ---------------- WORKFLOW STATUS ----------------
    status: {
      type: String,
      enum: [
        "pending", 
        "approved", 
        "rejected", 
        "ai_service", 
        "under_observation", 
        "pregnant", 
        'awaiting_farrowing',
        "farrowing_ready", 
        "farrowed", 
        "lactating", 
        "completed" 
      ],
      default: "pending"
    },

    // ---------------- TRACKING DATES (Supports Time Warp) ----------------
    ai_confirmed_at: {
      type: Date,
      default: null
    },

    // 23-day recheck date (Calculated from ai_confirmed_at)
    next_heat_check: {
      type: Date,
      default: null
    },

    // 114–115 days countdown (Bio-Standard)
    expected_farrowing: {
      type: Date,
      default: null
    },

    // Actual date farrowing occurred
    actual_farrowing_date: {
      type: Date,
      default: null
    },

    // Date the piglets were weaned
    weaning_date: {
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
    },

    ai_confirmed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    pregnancy_confirmed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    farrowing_confirmed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    weaning_confirmed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    still_in_heat_at: {
      type: Date,
      default: null
    },

    still_in_heat_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

        still_in_heat_reason: {
      type: String,
      default: ""
    },

    progress_history: [
      {
        event_key: {
          type: String,
          default: ""
        },

        title: {
          type: String,
          default: ""
        },

        description: {
          type: String,
          default: ""
        },

        from_status: {
          type: String,
          default: ""
        },

        to_status: {
          type: String,
          default: ""
        },

        actor_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          default: null
        },

        actor_name: {
          type: String,
          default: ""
        },

        actor_role: {
          type: String,
          default: ""
        },

        action_at: {
          type: Date,
          default: Date.now
        },

        meta: {
          type: mongoose.Schema.Types.Mixed,
          default: {}
        }
      }
    ]
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);


// ------------------- LOGIC / HELPERS -------------------

// Virtual to calculate days remaining until farrowing
heatReportSchema.virtual('days_until_farrowing').get(function() {
  if (!this.expected_farrowing || this.status === 'farrowed' || this.status === 'completed') return 0;
  
  const now = new Date();
  const diffTime = this.expected_farrowing - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays > 0 ? diffDays : 0;
});

// Virtual to see if the 23-day heat check is overdue
heatReportSchema.virtual('is_heat_check_overdue').get(function() {
  if (this.status !== 'under_observation' || !this.next_heat_check) return false;
  return new Date() > this.next_heat_check;
});

module.exports = mongoose.model("HeatReport", heatReportSchema);