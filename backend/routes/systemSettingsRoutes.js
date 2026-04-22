const express = require("express");
const router = express.Router();
const SystemSettings = require("../models/SystemSettings");

// GET heat signs
router.get("/heat-signs", async (req, res) => {
  try {
    const settings = await SystemSettings.findOne();

    if (!settings || !settings.heat_detection) {
      return res.json({ success: true, data: [] });
    }

    const signs = settings.heat_detection.signs || [];

    // 👇 CHECK QUERY PARAM
    const { activeOnly } = req.query;

    const result =
      activeOnly === "true"
        ? signs.filter(s => s.isActive !== false)
        : signs;

    res.json({
      success: true,
      data: result
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});
  
// =========================
// ADD THIS BLOCK HERE
// =========================
router.post("/heat-signs", async (req, res) => {
  try {
    const { signs } = req.body;

    if (!Array.isArray(signs)) {
      return res.status(400).json({ success: false, message: "Invalid data" });
    }

    let settings = await SystemSettings.findOne();

    if (!settings) {
      settings = new SystemSettings();
    }

    settings.heat_detection = {
      ...settings.heat_detection,
      signs
    };

    await settings.save();

    res.json({ success: true });

  } catch (err) {
    console.error("SAVE ERROR:", err);
    res.status(500).json({ success: false });
  }
});

module.exports = router;