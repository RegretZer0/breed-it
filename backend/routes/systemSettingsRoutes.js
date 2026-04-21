const express = require("express");
const router = express.Router();
const SystemSettings = require("../models/SystemSettings");

// GET heat signs
router.get("/heat-signs", async (req, res) => {
  try {
    const settings = await SystemSettings.findOne();

    // 🔥 DEBUG: See what is actually coming from DB
    console.log("🔥 SETTINGS FROM DB:", JSON.stringify(settings, null, 2));

    // ❌ Case 1: No document at all
    if (!settings) {
      console.log("❌ No SystemSettings document found");
      return res.json({ success: true, data: [] });
    }

    // ❌ Case 2: Missing heat_detection field
    if (!settings.heat_detection) {
      console.log("❌ heat_detection field is missing in DB document");
      return res.json({ success: true, data: [] });
    }

    let signs = settings.heat_detection.signs || [];

    // 🔥 DEBUG: check raw signs structure
    console.log("🧪 RAW SIGNS:", signs);

    // 🔥 FIX: Convert object → array if needed
    if (!Array.isArray(signs)) {
      console.log("⚠️ Signs is NOT an array, converting using Object.values()");
      signs = Object.values(signs);
    }

    // 🔥 DEBUG: after conversion
    console.log("✅ FINAL SIGNS ARRAY:", signs);

    res.json({
      success: true,
      data: signs
    });

  } catch (err) {
    console.error("❌ ERROR FETCHING HEAT SIGNS:", err);
    res.status(500).json({ success: false });
  }
});

module.exports = router;