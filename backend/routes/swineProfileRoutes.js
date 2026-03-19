// routes/swineProfileRoutes.js
const router = require("express").Router();
const upload = require("../middleware/uploadPigProfile");
const Swine = require("../models/Swine");
const { supabase } = require("../utils/supabaseClient"); // Ensure this utility is configured
const path = require("path");

// PUT /api/swine/profile/:swineId
router.put("/profile/:swineId", upload.single("profile_photo"), async (req, res) => {
  try {
    const { swineId } = req.params;

    const sw = await Swine.findOne({ swine_id: swineId });
    if (!sw) return res.status(404).json({ message: "Swine not found" });

    const { breed, sex, age_stage, health_status, birth_date, color, current_status } = req.body;

    // Update Text Fields
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

    // --- SUPABASE UPLOAD LOGIC ---
    if (req.file) {
      const fileExt = path.extname(req.file.originalname);
      const fileName = `${swineId}-${Date.now()}${fileExt}`;
      const filePath = `pig-profiles/${fileName}`;

      // 1. Upload to Supabase Bucket (assumes bucket name is 'swine_assets')
      const { data, error: uploadError } = await supabase.storage
        .from("swine_assets") 
        .upload(filePath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: true,
        });

      if (uploadError) throw new Error(`Supabase Upload Error: ${uploadError.message}`);

      // 2. Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from("swine_assets")
        .getPublicUrl(filePath);

      // 3. Save the full URL to MongoDB
      sw.profile_photo = publicUrl;
    }

    await sw.save();
    res.json({ message: "Pig info updated with Supabase storage", swine: sw });
  } catch (err) {
    console.error("Profile Update Error:", err);
    res.status(500).json({ message: err.message || "Server error" });
  }
});

module.exports = router;