const mongoose = require("mongoose");

const aiRecordSchema = new mongoose.Schema({
  insemination_id: { type: String, required: true, unique: true }, // PK
  swine_id: { type: mongoose.Schema.Types.ObjectId, ref: "Swine", required: true }, // FK (female)
  insemination_date: { type: Date, default: Date.now },
  male_swine_id: { type: mongoose.Schema.Types.ObjectId, ref: "Swine", required: true }, // FK (male)
}, { timestamps: true });

module.exports = mongoose.model("AIRecord", aiRecordSchema);
