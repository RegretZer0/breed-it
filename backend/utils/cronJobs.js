const cron = require("node-cron");
const HeatReport = require("../models/HeatReports");
const Swine = require("../models/Swine");

// Run every hour to check for completed observation periods
const initHeatCron = () => {
  cron.schedule("0 * * * *", async () => {
    console.log("Checking for completed 23-day heat observation cycles...");

    try {
      const now = new Date();

      // 1. Find reports where the 23-day window has expired
      const reportsToConfirm = await HeatReport.find({
        status: "waiting_heat_check",
        next_heat_check: { $lte: now }
      });

      for (const report of reportsToConfirm) {
        // 2. Automatically Move to Pregnant (Logic from your flowchart)
        report.status = "pregnant";
        
        // Calculate 115-day farrowing date from the original AI date
        const farrowDate = new Date(report.ai_service_date);
        farrowDate.setDate(farrowDate.getDate() + 115);
        report.expected_farrowing = farrowDate;

        await report.save();

        // 3. Update the Swine Model status
        await Swine.findByIdAndUpdate(report.swine_id, {
          current_status: "Pregnant"
        });

        console.log(`Swine ${report.swine_code} auto-confirmed as Pregnant.`);
      }
    } catch (err) {
      console.error("Cron Job Error:", err);
    }
  });
};

module.exports = initHeatCron;