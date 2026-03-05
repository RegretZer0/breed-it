const mongoose = require("mongoose");

const aiRecordSchema = new mongoose.Schema(
  {
    insemination_id: {
      type: String,
      required: true,
      unique: true
    },
    // References for Database Joins
    swine_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Swine",
      required: true
    },
    // Changed to String to support both Swine ObjectIds and External Boar/Batch codes
    male_swine_id: {
      type: String, 
      required: true
    },
    manager_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    farmer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Farmer",
      required: true
    },
    heat_report_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HeatReport",
      required: true
    },
    // Snapshot fields (helps with displaying reports faster)
    swine_code: { type: String },
    farmer_name: { type: String },

    // --- TIME PORTAL FIELDS ---
    insemination_date: {
      type: Date,
      default: Date.now
    },
    // When the pregnancy check actually occurred (Farmer observation)
    pregnancy_check_date: {
      type: Date
    },
    // When the weaning actually occurred (Manager action)
    weaning_date: {
      type: Date
    },
    // Captured during weaning to calculate growth performance
    weaning_weight: {
      type: Number,
      default: 0
    },

    ai_confirmed: {
      type: Boolean,
      default: false
    },
    ai_confirmed_at: {
      type: Date
    },
    still_in_heat: {
      type: Boolean,
      default: false
    },
    followup_evidence_url: {
      type: String,
      default: ""
    },
    pregnancy_confirmed: {
      type: Boolean,
      default: false
    },
    farrowing_date: {
      type: Date
    },
    remarks: {
      type: String,
      default: ""
    },
    // Added "Completed" to match weaning logic in routes
    status: {
      type: String,
      enum: ["Ongoing", "Success", "Failed", "Aborted", "Completed"],
      default: "Ongoing"
    }
  },
  { 
    timestamps: true,
    // Allows virtuals to be included when sending data to the frontend
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

/**
 * VIRTUAL: Expected Farrowing Date
 * Automatically calculates 114 days from the insemination_date.
 * This is the heart of the "Time Portal" logic.
 */
aiRecordSchema.virtual('expected_farrowing_date').get(function() {
  if (!this.insemination_date) return null;
  const date = new Date(this.insemination_date);
  date.setDate(date.getDate() + 114);
  return date;
});

module.exports = mongoose.model("AIRecord", aiRecordSchema);