const mongoose = require("mongoose");

const heatSignSchema = new mongoose.Schema({
  name: { type: String, required: true },
  weight: { type: Number, default: 0 },
  isCritical: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true }
}, { _id: false });

const systemSettingsSchema = new mongoose.Schema({
  // Time Warp
  mockDate: { 
    type: Date, 
    default: null 
  },

  lastCronRun: { 
    type: Date 
  },

  heat_detection: {
    signs: [heatSignSchema]
  }

}, { timestamps: true });

module.exports = mongoose.model("SystemSettings", systemSettingsSchema);