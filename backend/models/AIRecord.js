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
    male_swine_id: {
      type: mongoose.Schema.Types.ObjectId, // Usually the Boar or Semen Batch ID
      ref: "Swine",
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

    insemination_date: {
      type: Date,
      default: Date.now
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
    // Status can help filter "Successful" vs "Failed" inseminations
    status: {
      type: String,
      enum: ["Ongoing", "Success", "Failed", "Aborted"],
      default: "Ongoing"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("AIRecord", aiRecordSchema);