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
  // ✅ Runs every 5 minutes
  cron.schedule("*/5 * * * *", async () => {
    await runSwineTransitions();
  });
};

/**
 * Encapsulated logic to allow for both scheduled runs and manual triggers
 */
async function runSwineTransitions() {
  // ✅ Use Virtual Time for the Cron Job execution
  const now = global.getNow ? global.getNow() : new Date();

  console.log(
    `[${now.toLocaleString()}] Executing Swine transitions & AI reminders (5-min check)...`
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
    const tomorrow = new Date(now);
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
        const todayStart = new Date(now);
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

    // --- PART 2: AUTO-CONFIRM PREGNANCY ---
    // ✅ UPDATED: Added "AI Scheduled" to the search to catch your warped swine
    const reportsToConfirm = await HeatReport.find({
      status: { $in: ["under_observation", "AI Scheduled"] },
      next_heat_check: { $exists: true, $ne: null, $lte: now },
    });

    for (const report of reportsToConfirm) {
      report.status = "pregnant";

      const baseDate = toValidDate(report.ai_confirmed_at) || now;
      const farrowDate = new Date(baseDate);
      farrowDate.setDate(farrowDate.getDate() + 115);
      report.expected_farrowing = farrowDate;

      await report.save();

      await Swine.findByIdAndUpdate(report.swine_id, {
        current_status: "Pregnant",
      });

      console.log(`Swine ${report.swine_id} auto-confirmed as Pregnant (Virtual Time: ${now.toLocaleDateString()}).`);
    }

    // --- PART 3: FARROWING, LACTATING, & OPEN TRANSITIONS ---
    // ✅ UPDATED: Include "awaiting_farrowing" in the query
    const activePregnancies = await HeatReport.find({
      status: { $in: ["pregnant", "awaiting_farrowing"] },
      expected_farrowing: { $exists: true, $ne: null },
    }).populate("farmer_id");

    for (const report of activePregnancies) {
      const farrowDate = toValidDate(report.expected_farrowing);
      if (!farrowDate) continue;

      const diffTime = now - farrowDate;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      let newSwineStatus = null;
      let shouldNotifyWeaning = false;

      // Day 114/115: Swine is ready to give birth
      if (diffDays >= 0 && diffDays < 2) {
        newSwineStatus = "Farrowing";
        
        // ✅ NEW: Transition report to "awaiting_farrowing" so the button appears in UI
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

    // --- PART 4: AUTO-CULL FOR UNPRODUCTIVE "OPEN" SOWS (7-DAY WINDOW) ---
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const openSows = await Swine.find({ current_status: "Open" });

    for (const sow of openSows) {
      const lastCycle =
        sow.breeding_cycles && sow.breeding_cycles.length > 0
          ? sow.breeding_cycles[sow.breeding_cycles.length - 1]
          : null;

      const weaningDate = toValidDate(lastCycle?.weaning_date);
      if (!weaningDate) continue;

      if (weaningDate < sevenDaysAgo) {
        const recentReport = await HeatReport.findOne({
          swine_id: sow._id,
          createdAt: { $gt: weaningDate },
        });

        if (!recentReport) {
          sow.current_status = "Culled/Sold";
          await sow.save();

          console.log(`Swine ${sow.swine_id} auto-culled (Virtual Time Check).`);

          if (sow.manager_id) {
            await Notification.create({
              user_id: sow.manager_id,
              title: "Productivity Cull",
              message: `Swine ${sow.swine_id} has been automatically culled. It failed to show heat signs within 7 days post-weaning.`,
              type: "danger",
            });
          }
        }
      }
    }
  } catch (err) {
    console.error("Cron Job Error:", err);
  }
}

module.exports = { initHeatCron, runSwineTransitions };