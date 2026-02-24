// backend/utils/cronJobs.js
const cron = require("node-cron");
const HeatReport = require("../models/HeatReports");
const Swine = require("../models/Swine");
const Notification = require("../models/Notifications");

/**
 * Updates Swine statuses based on the heat report cycle and biological timelines.
 * 1. AI Reminders (Day 2 of the 3-day rule)
 * 2. under_observation -> pregnant (after 23 days)
 * 3. pregnant -> farrowing (on day 114/115)
 * 4. farrowing -> lactating (2 days after farrowing)
 * 5. lactating -> open (30 days after farrowing)
 * 6. NEW: Auto-Cull (7 days post-weaning without heat report)
 *
 * Fixes:
 * - Prevent null/invalid date crashes (.toISOString on null)
 * - Harden date conversions for next_heat_check / expected_farrowing / weaning_date
 * - Keep behavior the same for existing valid data
 */
const initHeatCron = () => {
  // Run every hour (minute 0)
  cron.schedule("0 * * * *", async () => {
    console.log(
      "Checking for Swine status transitions, AI reminders, and productivity windows..."
    );

    try {
      const now = new Date();

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

      // $exists:true includes null, so add $ne:null
      const reportsNeedingReminder = await HeatReport.find({
        status: "approved",
        next_heat_check: { $exists: true, $ne: null },
      })
        .populate("swine_id")
        .populate("farmer_id");

      for (const report of reportsNeedingReminder) {
        const aiDate = toValidDate(report.next_heat_check);
        if (!aiDate) continue; // skip bad data safely

        const aiDateStr = aiDate.toISOString().split("T")[0];

        if (aiDateStr === tomorrowStr && report.farmer_id?.user_id) {
          const existingNotif = await Notification.findOne({
            user_id: report.farmer_id.user_id,
            title: "Reminder: AI Scheduled Tomorrow",
            // NOTE: keep your field name as-is (created_at) so we don't break your schema
            created_at: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
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
      // Ensure next_heat_check isn't null/invalid by filtering + re-checking
      const reportsToConfirm = await HeatReport.find({
        status: "under_observation",
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

        console.log(`Swine ${report.swine_id} auto-confirmed as Pregnant.`);
      }

      // --- PART 3: FARROWING, LACTATING, & OPEN TRANSITIONS ---
      const activePregnancies = await HeatReport.find({
        status: "pregnant",
        expected_farrowing: { $exists: true, $ne: null },
      }).populate("farmer_id");

      for (const report of activePregnancies) {
        const farrowDate = toValidDate(report.expected_farrowing);
        if (!farrowDate) continue; // skip bad data safely

        const diffTime = now - farrowDate;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        let newSwineStatus = null;
        let shouldNotifyWeaning = false;

        if (diffDays >= 0 && diffDays < 2) {
          newSwineStatus = "Farrowing";
        } else if (diffDays >= 2 && diffDays < 30) {
          newSwineStatus = "Lactating";
        } else if (diffDays >= 30) {
          newSwineStatus = "Open";

          // keep your original behavior: mark report completed once open after lactation
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
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const openSows = await Swine.find({ current_status: "Open" });

      for (const sow of openSows) {
        // Find the weaning date from the latest breeding cycle
        const lastCycle =
          sow.breeding_cycles && sow.breeding_cycles.length > 0
            ? sow.breeding_cycles[sow.breeding_cycles.length - 1]
            : null;

        const weaningDate = toValidDate(lastCycle?.weaning_date);
        if (!weaningDate) continue; // if none/invalid, nothing to evaluate

        if (weaningDate < sevenDaysAgo) {
          // Check if a heat report was created AFTER the weaning date
          const recentReport = await HeatReport.findOne({
            swine_id: sow._id,
            // keep your original field name (createdAt) to avoid breaking your schema
            createdAt: { $gt: weaningDate },
          });

          // If no heat report found, the sow failed to return to heat within 7 days
          if (!recentReport) {
            sow.current_status = "Culled/Sold";
            await sow.save();

            console.log(
              `Swine ${sow.swine_id} auto-culled due to 7-day unproductive window.`
            );

            // Notify the manager/farmer
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
  });
};

module.exports = initHeatCron;