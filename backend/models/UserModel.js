const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  fullName: String,
  address: String,
  contact_info: String,
  email: { type: String, unique: true },
  password: String,
  role: { type: String, enum: ["admin", "farmer"], default: "farmer" },
});

module.exports = mongoose.model("User", userSchema);
