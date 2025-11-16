const mongoose = require("mongoose");

const heatReportSchema = new mongoose.Schema({
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

  signs: [{ 
    type: String, 
    required: true 
  }],

  evidence_url: { 
    type: String, 
    required: true 
  },

  heat_probability: { 
    type: Number, 
    default: null 
  },

  admin_notes: { 
    type: String, 
    default: "" 
  },

  date_reported: { 
    type: Date, 
    default: Date.now 
  }

}, { timestamps: true });

module.exports = mongoose.model("HeatReport", heatReportSchema);
