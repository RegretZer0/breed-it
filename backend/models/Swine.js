const mongoose = require("mongoose");

const swineSchema = new mongoose.Schema({
  swine_id: { type: String, required: true, unique: true },
  registered_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  farmer_id: { type: mongoose.Schema.Types.ObjectId, ref: "Farmer", required: true },
  sex: { type: String, required: true },
  color: { type: String },
  breed: { type: String },
  birth_date: { type: Date },
  status: { type: String },
  sire_id: { type: String },
  dam_id: { type: String },
  inventory_status: { type: String },
  date_transfer: { type: Date },
  date_registered: { type: Date, default: Date.now },
  batch: { type: String, required: true },
}, { timestamps: true });

module.exports = mongoose.model("Swine", swineSchema);
