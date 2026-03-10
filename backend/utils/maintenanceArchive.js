const Notification = require("../models/Notifications");

async function archiveOldMaintenanceRecords(months = 6) {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);

  await Notification.updateMany(
    {
      type: "maintenance",
      is_archived: false,
      status: { $in: ["completed", "cancelled"] },
      ends_at: { $lt: cutoff }
    },
    {
      $set: {
        is_archived: true,
        archived_at: new Date()
      }
    }
  );
}

async function syncMaintenanceStatuses() {
  const now = new Date();

  await Notification.updateMany(
    {
      type: "maintenance",
      is_archived: false,
      status: "scheduled",
      scheduled_for: { $lte: now },
      ends_at: { $gte: now }
    },
    { $set: { status: "active" } }
  );

  await Notification.updateMany(
    {
      type: "maintenance",
      is_archived: false,
      status: { $in: ["scheduled", "active"] },
      ends_at: { $lt: now }
    },
    { $set: { status: "completed" } }
  );
}

module.exports = { archiveOldMaintenanceRecords };