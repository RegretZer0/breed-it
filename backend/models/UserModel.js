const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  first_name: { type: String, required: true },
  last_name: { type: String, required: true },

  address: String,
  contact_info: String,

  profile_photo: { type: String, default: "" },

  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },

  role: {
    type: String,
    enum: ["system_admin", "farm_manager", "encoder", "farmer"],
    default: "farmer"
  },

  // Who this user belongs to
  managerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  
  // Indexed for faster session counting in the Admin Dashboard
  lastActive: { 
    type: Date, 
    default: Date.now,
    index: true 
  },

  status: {
    type: String,
    enum: ["active", "disabled"],
    default: "active"
  }
}, { 
  timestamps: true,
  // These options allow virtual fields like 'fullName' to be sent to the frontend
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

/**
 * VIRTUAL: fullName
 * This allows dashboard.js to use user.fullName without storing extra data in MongoDB.
 */
userSchema.virtual('fullName').get(function() {
  return `${this.first_name} ${this.last_name}`;
});

module.exports = mongoose.model("User", userSchema);