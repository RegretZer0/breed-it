const cron = require("node-cron");
const HeatReport = require("../models/HeatReports");
const Swine = require("../models/Swine");

/**
 * Updates Swine statuses based on the heat report cycle and biological timelines.
 * 1. waiting_heat_check -> pregnant (after 23 days)
 * 2. pregnant -> farrowing (on day 114/115)
 * 3. farrowing -> lactating (2 days after farrowing)
 * 4. lactating -> open (30 days after farrowing)
 */
const initHeatCron = () => {
  // Run every hour to ensure timely status changes
  cron.schedule("0 * * * *", async () => {
    console.log("Checking for Swine status transitions...");

    try {
      const now = new Date();

      // --- PART 1: AUTO-CONFIRM PREGNANCY (Your Original Logic) ---
      const reportsToConfirm = await HeatReport.find({
        status: "waiting_heat_check",
        next_heat_check: { $lte: now }
      });

      for (const report of reportsToConfirm) {
        report.status = "pregnant";
        
        // Calculate 115-day farrowing date from the original AI date
        const farrowDate = new Date(report.ai_service_date);
        farrowDate.setDate(farrowDate.getDate() + 115);
        report.expected_farrowing = farrowDate;

        await report.save();

        // Update the Swine Model status
        await Swine.findByIdAndUpdate(report.swine_id, {
          current_status: "Pregnant"
        });

        console.log(`Swine ${report.swine_id} auto-confirmed as Pregnant.`);
      }

      // --- PART 2: FARROWING, LACTATING, & OPEN TRANSITIONS ---
      // We look for any heat report that is currently in 'pregnant' status 
      // to determine the biological stage of the swine.
      const activePregnancies = await HeatReport.find({
        status: "pregnant",
        expected_farrowing: { $exists: true }
      });

      for (const report of activePregnancies) {
        const farrowDate = new Date(report.expected_farrowing);
        
        // Calculate difference in days relative to farrowing date
        const diffTime = now - farrowDate;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        let newSwineStatus = null;

        // A. Farrowing Stage (Starts on Expected Date, lasts ~2 days)
        if (diffDays >= 0 && diffDays < 2) {
            newSwineStatus = "Farrowing";
        } 
        // B. Lactating Stage (Day 2 to Day 30 post-farrowing)
        else if (diffDays >= 2 && diffDays < 30) {
            newSwineStatus = "Lactating";
        }
        // C. Back to Open (Day 30+ post-farrowing / Weaning)
        else if (diffDays >= 30) {
            newSwineStatus = "Open";
            
            // Also update the report status to 'completed' so it's not processed by cron again
            report.status = "completed";
            await report.save();
        }

        // Apply status update if a transition is needed
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