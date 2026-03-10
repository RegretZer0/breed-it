const mongoose = require("mongoose");

const infrastructureSnapshotSchema = new mongoose.Schema(
  {
    capturedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    cpuUsagePercent: {
      type: Number,
      default: 0,
    },
    memoryUsagePercent: {
      type: Number,
      default: 0,
    },
    dbStorageSizeBytes: {
      type: Number,
      default: 0,
    },
    dbDataSizeBytes: {
      type: Number,
      default: 0,
    },
    concurrentUsers: {
      type: Number,
      default: 0,
    },
    activeSessions: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

infrastructureSnapshotSchema.index({ capturedAt: -1 });

module.exports = mongoose.model("InfrastructureSnapshot", infrastructureSnapshotSchema);