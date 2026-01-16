const cron = require("node-cron");
const HeatReport = require("../models/HeatReports");
const Swine = require("../models/Swine");
const Notification = require("../models/Notification");

/**
 * Updates Swine statuses based on the heat report cycle and biological timelines.
 * 1. AI Reminders (Day 2 of the 3-day rule)
 * 2. under_observation -> pregnant (after 23 days)
 * 3. pregnant -> farrowing (on day 114/115)
 * 4. farrowing -> lactating (2 days after farrowing)
 * 5. lactating -> open (30 days after farrowing)
 */
const initHeatCron = () => {
  // Run every hour to ensure timely status changes and notifications
  cron.schedule("0 * * * *", async () => {
    console.log("Checking for Swine status transitions and AI reminders...");

    try {
      const now = new Date();

      // --- PART 1: AI REMINDERS (New Logic) ---
      // Send a reminder to the farmer if the scheduled AI (next_heat_check) is tomorrow
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      const reportsNeedingReminder = await HeatReport.find({
        status: "approved",
        next_heat_check: { $exists: true }
      }).populate("swine_id").populate("farmer_id");

      for (const report of reportsNeedingReminder) {
        const aiDateStr = report.next_heat_check.toISOString().split('T')[0];
        
        // If the AI date is tomorrow, send a notification
        if (aiDateStr === tomorrowStr && report.farmer_id?.user_id) {
          // Check if we already sent a reminder today to avoid spam
          const existingNotif = await Notification.findOne({
            user_id: report.farmer_id.user_id,
            title: "Reminder: AI Scheduled Tomorrow",
            createdAt: { $gte: new Date(now.setHours(0,0,0,0)) }
          });

          if (!existingNotif) {
            await Notification.create({
              user_id: report.farmer_id.user_id,
              title: "Reminder: AI Scheduled Tomorrow",
              message: `Swine ${report.swine_id?.swine_id} is scheduled for insemination tomorrow. Please prepare the male swine or semen.`,
              type: "info"
            });
            console.log(`Reminder sent to Farmer for Swine ${report.swine_id?.swine_id}`);
          }
        }
      }

      // --- PART 2: AUTO-CONFIRM PREGNANCY (Original Logic) ---
      const reportsToConfirm = await HeatReport.find({
        status: "under_observation",
        next_heat_check: { $lte: now }
      });

      for (const report of reportsToConfirm) {
        report.status = "pregnant";
        
        // Calculate 115-day farrowing date from the original AI date
        const farrowDate = new Date(report.ai_confirmed_at || now);
        farrowDate.setDate(farrowDate.getDate() + 115);
        report.expected_farrowing = farrowDate;

        await report.save();

        // Update the Swine Model status
        await Swine.findByIdAndUpdate(report.swine_id, {
          current_status: "Pregnant"
        });

        console.log(`Swine ${report.swine_id} auto-confirmed as Pregnant.`);
      }

      // --- PART 3: FARROWING, LACTATING, & OPEN TRANSITIONS ---
      const activePregnancies = await HeatReport.find({
        status: "pregnant",
        expected_farrowing: { $exists: true }
      });

      for (const report of activePregnancies) {
        const farrowDate = new Date(report.expected_farrowing);
        
        const diffTime = now - farrowDate;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        let newSwineStatus = null;

        if (diffDays >= 0 && diffDays < 2) {
            newSwineStatus = "Farrowing";
        } 
        else if (diffDays >= 2 && diffDays < 30) {
            newSwineStatus = "Lactating";
        }
        else if (diffDays >= 30) {
            newSwineStatus = "Open";
            
            report.status = "completed";
            await report.save();
        }

        if (newSwineStatus) {
            const swine = await Swine.findById(report.swine_id);
            if (swine && swine.current_status !== newSwineStatus) {
                swine.current_status = newSwineStatus;
                await swine.save();
                console.log(`Swine ${swine.swine_id} transitioned to ${newSwineStatus}`);
            }
        }
      }

    } catch (err) {
      console.error("Cron Job Error:", err);
    }
  });
};

module.exports = initHeatCron;