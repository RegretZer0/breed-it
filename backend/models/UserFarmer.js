const mongoose = require("mongoose");

const farmerSchema = new mongoose.Schema(
  {
    first_name: { type: String, required: true },
    last_name: { type: String, required: true },
    address: { type: String },
    contact_no: { type: String },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    farmer_id: { type: String, required: true, unique: true },
    num_of_pens: { type: Number, default: 0 },
    pen_capacity: { type: Number, default: 0 },

    //  ADD THESE TWO FIELDS
    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active"
    },

    profile_picture: {
      type: String,
      default: "/images/default-avatar.png"
    },

    role: { type: String, default: "farmer", immutable: true },

    user_id: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User"
    },

    managerId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true 
    },
  },
  { timestamps: true }
);


module.exports = mongoose.model("Farmer", farmerSchema);
