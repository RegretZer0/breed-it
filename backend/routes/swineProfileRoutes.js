// routes/swineProfileRoutes.js
const router = require("express").Router();
const upload = require("../middleware/uploadPigProfile");
const Swine = require("../models/Swine");

// PUT /api/swine/profile/:swineId
router.put("/profile/:swineId", upload.single("profile_photo"), async (req, res) => {
  try {
    const { swineId } = req.params;

    const sw = await Swine.findOne({ swine_id: swineId });
    if (!sw) return res.status(404).json({ message: "Swine not found" });

    const { breed, sex, age_stage, health_status, birth_date, color, current_status } = req.body;

    if (breed !== undefined) sw.breed = breed;
    if (sex !== undefined) sw.sex = sex;
    if (age_stage !== undefined) sw.age_stage = age_stage;
    if (health_status !== undefined) sw.health_status = health_status;
    if (color !== undefined) sw.color = color;
    if (current_status !== undefined) sw.current_status = current_status;

    if (birth_date) {
      const dt = new Date(birth_date);
      if (!Number.isNaN(dt.getTime())) sw.birth_date = dt;
    }

    if (req.file) {
      sw.profile_photo = `/uploads/pig-profile/${req.file.filename}`;
    }

    await sw.save();
    res.json({ message: "Pig info updated", swine: sw });
  } catch (err) {
    res.status(500).json({ message: err.message || "Server error" });
  }
});

module.exports = router;