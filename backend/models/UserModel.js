const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  first_name: { type: String, required: true },
  last_name: { type: String, required: true },

  address: String,
  contact_info: String,

  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },

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
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
