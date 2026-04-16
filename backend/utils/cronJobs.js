// backend/utils/cronJobs.js
const cron = require("node-cron");
const HeatReport = require("../models/HeatReports");
const Swine = require("../models/Swine");
const Notification = require("../models/Notifications");

/**
 * Updates Swine statuses based on the heat report cycle and biological timelines.
 * Integrated with Global Virtual Time for Time Warp support.
 */
const initHeatCron = () => {
  // Runs every 5 minutes
  cron.schedule("*/5 * * * *", async () => {
    await runSwineTransitions();
  });
};

/**
 * Encapsulated logic to allow for both scheduled runs and manual triggers
 */
async function runSwineTransitions() {

  const now = global.getNow ? global.getNow() : new Date();

  console.log(
    `[${now.toLocaleString()}] ⏲️ Cron Check: Executing Swine transitions (Warp Active: ${global.timeControl?.isMocked || false})`
  );

  try {
    // =========================
    // Helper: safe date parsing
    // =========================
    const toValidDate = (value) => {
      if (!value) return null;
      const d = value instanceof Date ? value : new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    };

    // --- PART 1: AI REMINDERS ---
    const tomorrow = new Date(now.getTime()); 
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    const reportsNeedingReminder = await HeatReport.find({
      status: "approved",
      next_heat_check: { $exists: true, $ne: null },
    })
      .populate("swine_id")
      .populate("farmer_id");

    for (const report of reportsNeedingReminder) {
      const aiDate = toValidDate(report.next_heat_check);
      if (!aiDate) continue;

      const aiDateStr = aiDate.toISOString().split("T")[0];

      if (aiDateStr === tomorrowStr && report.farmer_id?.user_id) {

        const todayStart = new Date(now.getTime());
        todayStart.setHours(0, 0, 0, 0);

        const existingNotif = await Notification.findOne({
          user_id: report.farmer_id.user_id,
          title: "Reminder: AI Scheduled Tomorrow",
          created_at: { $gte: todayStart },
        });

        if (!existingNotif) {
          await Notification.create({
            user_id: report.farmer_id.user_id,
            title: "Reminder: AI Scheduled Tomorrow",
            message: `Swine ${report.swine_id?.swine_id} is scheduled for insemination tomorrow. Please prepare the male swine or semen.`,
            type: "info",
          });
          console.log(
            `Reminder sent to Farmer for Swine ${report.swine_id?.swine_id}`
          );
        }
      }
    }

    // --- PART 2: FARROWING, LACTATING, & OPEN TRANSITIONS ---
    const activePregnancies = await HeatReport.find({
      status: { $in: ["pregnant", "awaiting_farrowing"] },
      expected_farrowing: { $exists: true, $ne: null },
    }).populate("farmer_id");

    for (const report of activePregnancies) {
      const farrowDate = toValidDate(report.expected_farrowing);
      if (!farrowDate) continue;

      const diffTime = now.getTime() - farrowDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      let newSwineStatus = null;
      let shouldNotifyWeaning = false;

      if (diffDays >= 0 && diffDays < 2) {
        newSwineStatus = "Farrowing";
        if (report.status !== "awaiting_farrowing") {
          report.status = "awaiting_farrowing";
          await report.save();
        }
      } else if (diffDays >= 2 && diffDays < 30) {
        newSwineStatus = "Lactating";
      } else if (diffDays >= 30) {
        newSwineStatus = "Open";
        if (report.status !== "completed") {
          report.status = "completed";
          await report.save();
          shouldNotifyWeaning = true;
        }
      }

      if (newSwineStatus) {
        const swine = await Swine.findById(report.swine_id);
        if (swine && swine.current_status !== newSwineStatus) {
          swine.current_status = newSwineStatus;
          await swine.save();
          console.log(
            `Swine ${swine.swine_id} transitioned to ${newSwineStatus}`
          );

          if (shouldNotifyWeaning && report.farmer_id?.user_id) {
            await Notification.create({
              user_id: report.farmer_id.user_id,
              title: "Weaning Complete",
              message: `Swine ${swine.swine_id} has completed the 30-day lactation period. Status is now 'Open' and ready for a new heat report.`,
              type: "success",
            });
          }
        }
      }
    }

    // --- PART 3: REMINDER FOR OVERDUE "OPEN" SOWS (Updated: Notification Only) ---
    const sevenDaysAgo = new Date(now.getTime());
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Look for sows stuck in 'Open' status
    const openSows = await Swine.find({ current_status: "Open" });

    for (const sow of openSows) {
      const lastCycle =
        sow.breeding_cycles && sow.breeding_cycles.length > 0
          ? sow.breeding_cycles[sow.breeding_cycles.length - 1]
          : null;

      const weaningDate = toValidDate(lastCycle?.weaning_date);
      if (!weaningDate) continue;

      // If it's been more than 7 days since weaning
      if (weaningDate < sevenDaysAgo) {
        // Check if a heat report was already created after weaning
        const recentReport = await HeatReport.findOne({
          swine_id: sow._id,
          createdAt: { $gt: weaningDate },
        });

        // If no heat report is found, trigger alerts instead of Auto-Culling
        if (!recentReport) {
          const managerId = sow.registered_by || sow.manager_id;
          const farmerUserId = sow.farmer_id?.user_id; 

          // Anti-Spam Check: Don't notify if a warning was already sent today
          const todayStart = new Date(now.getTime());
          todayStart.setHours(0, 0, 0, 0);

          const existingNotif = await Notification.findOne({
            user_id: managerId,
            title: "Productivity Warning",
            createdAt: { $gte: todayStart },
            message: new RegExp(sow.swine_id) 
          });

          if (!existingNotif) {
            const alertTitle = "Productivity Warning";
            const alertMessage = `Swine ${sow.swine_id} has been 'Open' for 7+ days post-weaning without a new Heat Report. Please evaluate for heat signs or manual culling.`;

            // Notify Manager
            if (managerId) {
              await Notification.create({
                user_id: managerId,
                title: alertTitle,
                message: alertMessage,
                type: "alert",
                createdAt: now
              });
            }

            // Notify Farmer (if applicable)
            if (farmerUserId) {
              await Notification.create({
                user_id: farmerUserId,
                title: alertTitle,
                message: alertMessage,
                type: "alert",
                createdAt: now
              });
            }

            console.log(`[Productivity Warning] Alert sent for Swine ${sow.swine_id} (7 days post-weaning).`);
          }
        }
      }
    } // End of for-loop
  } catch (err) {
    console.error("Cron Job Error:", err);
  }
};

module.exports = { initHeatCron, runSwineTransitions };