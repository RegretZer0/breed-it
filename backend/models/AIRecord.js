const mongoose = require("mongoose");

const aiRecordSchema = new mongoose.Schema(
  {
    insemination_id: {
      type: String,
      required: true,
      unique: true
    },
    swine_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Swine",
      required: true
    },

    manager_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    insemination_date: {
      type: Date,
      default: Date.now
    },

    male_swine_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Swine",
      required: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("AIRecord", aiRecordSchema);
