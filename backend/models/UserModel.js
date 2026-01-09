const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  fullName: String,
  address: String,
  contact_info: String,

  email: { type: String, unique: true },
  password: String,

  role: {
    type: String,
    enum: ["system_admin", "farm_manager", "encoder", "farmer"],
    default: "farmer"
  },

  // 🔑 Who this user belongs to
  managerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },

  status: {
    type: String,
    enum: ["active", "disabled"],
    default: "active"
  }
});

module.exports = mongoose.model("User", userSchema);
