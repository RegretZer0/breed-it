const mongoose = require("mongoose");

const systemSettingsSchema = new mongoose.Schema({
  // This stores our "Virtual Date" for the Time Warp
  mockDate: { 
    type: Date, 
    default: null 
  },
  // You can add other global settings here later
  lastCronRun: { 
    type: Date 
  }
}, { timestamps: true });

module.exports = mongoose.model("SystemSettings", systemSettingsSchema);