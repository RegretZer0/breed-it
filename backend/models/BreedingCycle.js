const mongoose = require("mongoose");

const breedingCycleSchema = new mongoose.Schema({
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

  manager_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  ai_date: {
    type: Date,
    required: true
  },

  heat_check_date: {
    type: Date,
    required: true
  },

  pregnancy_confirmed: {
    type: Boolean,
    default: false
  },

  expected_farrowing_date: {
    type: Date,
    default: null
  },

  status: {
    type: String,
    enum: [
      "WAITING_HEAT_CHECK",
      "HEAT_REPEAT",
      "PREGNANT_CONFIRMED",
      "FARROWING_DUE",
      "CLOSED"
    ],
    default: "WAITING_HEAT_CHECK"
  },

  cycle_number: {
    type: Number,
    default: 1
  }

}, { timestamps: true });

module.exports = mongoose.model("BreedingCycle", breedingCycleSchema);
