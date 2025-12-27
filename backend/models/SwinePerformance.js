const mongoose = require("mongoose");

const swinePerformanceSchema = new mongoose.Schema(
  {
    reproductionId: {
      type: String,
      required: true,
      unique: true
    },

    swine_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Swine",
      required: true
    },

    admin_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    parentType: {
      type: String,
      required: true
    },

    recordDate: {
      type: Date,
      default: Date.now
    },

    weight: { type: Number },
    bodyLength: { type: Number },
    heartGirth: { type: Number },
    color: { type: String },

    teethCount: { type: Number },
    teethAlignment: { type: String },
    legConformation: { type: String },
    hoofCondition: { type: String },
    bodySymmetryAndMuscling: { type: String },

    noOfPiglets: { type: Number }
  },
  { timestamps: true }
);

module.exports = mongoose.model("SwinePerformance", swinePerformanceSchema);
