// backend/routes/reproductionRoutes.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

// --- MODELS ---
const AIRecord = require("../models/AIRecord");
const Swine = require("../models/Swine");
const User = require("../models/UserModel");
const Farmer = require("../models/UserFarmer");
const HeatReport = require("../models/HeatReports");

const { requireSessionAndToken } = require("../middleware/authMiddleware");

// Helper to format names consistently across different collections
const formatName = (userObj) => {
  if (!userObj) return null;
  const first = userObj.first_name || userObj.full_name || "";
  const last = userObj.last_name || "";
  return `${first} ${last}`.trim();
};

/* ======================================================
   SWINE ID HELPERS (needed by /batch-register-litter)
====================================================== */
function getBatchLetter(index) {
  let label = "";
  while (index >= 0) {
    label = String.fromCharCode((index % 26) + 65) + label;
    index = Math.floor(index / 26) - 1;
  }
  return label;
}

function getManagerPrefix(managerId) {
  const idStr = managerId.toString();
  return idStr.substring(idStr.length - 4).toUpperCase();
}

/* ======================================================
   PIGLETS BY BREEDING CYCLE (NEW)
   GET /api/reproduction/piglets/by-cycle?dam_id=SOWTAG&cycle_number=1
   - Used by: Piglets Growth Records + Health & Defects tabs
====================================================== */
router.get("/piglets/by-cycle", requireSessionAndToken, async (req, res) => {
  try {
    const { role, id: userId, managerId, farmerProfileId } = req.user;

    const dam_id = String(req.query.dam_id || "").trim();
    const cycle_number = Number(req.query.cycle_number);

    if (!dam_id) {
      return res.status(400).json({ success: false, message: "dam_id is required" });
    }
    if (!Number.isFinite(cycle_number) || cycle_number <= 0) {
      return res.status(400).json({ success: false, message: "cycle_number must be a positive number" });
    }

    const query = {
      dam_id,
      birth_cycle_number: cycle_number,
      age_stage: "piglet"
    };

    // Access control
    if (role === "farmer") {
      if (!farmerProfileId) {
        return res.status(400).json({ success: false, message: "Farmer profile not linked" });
      }
      query.farmer_id = new mongoose.Types.ObjectId(farmerProfileId);
    } else {
      const effectiveManagerId = role === "farm_manager" || role === "admin" ? userId : managerId;
      if (!effectiveManagerId) {
        return res.status(400).json({ success: false, message: "Farm context not found" });
      }
      query.registered_by = new mongoose.Types.ObjectId(effectiveManagerId);
    }

    const piglets = await Swine.find(query)
      .select(
        "swine_id sex breed profile_photo health_status current_status dam_id sire_id birth_date birth_cycle_number performance_records medical_records"
      )
      .sort({ swine_id: 1 })
      .lean();

    const data = piglets.map((p) => {
      const perf = Array.isArray(p.performance_records) ? p.performance_records : [];
      const latestPerf = perf.length ? perf[perf.length - 1] : null;

      const deformitiesRaw = latestPerf?.deformities || ["None"];
      const deformities = Array.isArray(deformitiesRaw)
        ? deformitiesRaw.filter(
            (d) =>
              d &&
              String(d).trim() !== "" &&
              String(d).toLowerCase() !== "none"
          )
        : [];

      const med = Array.isArray(p.medical_records) ? p.medical_records : [];
      const lastMedical = med.length ? med[med.length - 1] : null;

      return {
        id: p._id,
        swine_tag: p.swine_id,
        sex: p.sex,
        breed: p.breed,
        profile_photo: p.profile_photo || "",
        birth_date: p.birth_date || null,
        dam_id: p.dam_id || "N/A",
        sire_id: p.sire_id || "N/A",
        birth_cycle_number: p.birth_cycle_number || cycle_number,

        // Growth
        latest_growth: latestPerf
          ? {
              record_date: latestPerf.record_date || null,
              stage: latestPerf.stage || "Monitoring (Day 1-30)",
              weight: latestPerf.weight ?? 0,
              body_length: latestPerf.body_length ?? 0,
              heart_girth: latestPerf.heart_girth ?? 0
            }
          : {
              record_date: null,
              stage: "Monitoring (Day 1-30)",
              weight: 0,
              body_length: 0,
              heart_girth: 0
            },

        // Health + defects
        health_status: p.health_status || "Healthy",
        current_status: p.current_status || "",
        deformities,
        last_medical: lastMedical
          ? {
              admin_date: lastMedical.admin_date || null,
              treatment_type: lastMedical.treatment_type || "",
              medicine_name: lastMedical.medicine_name || "",
              dosage: lastMedical.dosage || "",
              remarks: lastMedical.remarks || ""
            }
          : null
      };
    });

    res.json({ success: true, dam_id, cycle_number, count: data.length, data });
  } catch (err) {
    console.error("Piglets by cycle error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------------------------------------------------------
// 1. FETCH AI HISTORY (FIXED FOR STRING-BASED MALE_SWINE_ID)
// ---------------------------------------------------------
router.get("/ai-history", requireSessionAndToken, async (req, res) => {
  try {
    const { id: userId, role, farmerProfileId, managerId } = req.user;
    let query = {};

    if (role === "farmer") {
      if (!farmerProfileId) return res.status(400).json({ success: false, message: "Farmer profile not linked" });
      query = { farmer_id: new mongoose.Types.ObjectId(farmerProfileId) };
    } else {
      const targetManagerId = (role === "farm_manager" || role === "admin") ? userId : managerId;
      if (!targetManagerId) return res.status(400).json({ success: false, message: "Farm context not found" });
      query = { manager_id: new mongoose.Types.ObjectId(targetManagerId) };
    }

    const records = await AIRecord.find(query)
      .populate("swine_id", "swine_id")
      .sort({ insemination_date: -1 })
      .lean();

    const formatted = await Promise.all(
      records.map(async (r) => {
        let name = "Unknown Farmer";
        let farmerInfo = await Farmer.findById(r.farmer_id).select("first_name last_name");

        if (!farmerInfo) {
          farmerInfo = await User.findById(r.farmer_id).select("full_name first_name last_name");
        }

        if (farmerInfo) {
          name = formatName(farmerInfo);
        } else if (r.farmer_name) {
          name = r.farmer_name;
        }

        // Improved boar tag resolution for string male_swine_id
        let boarTag = r.male_swine_id || "N/A";
        if (mongoose.Types.ObjectId.isValid(r.male_swine_id)) {
          const boarSwine = await Swine.findById(r.male_swine_id).select("swine_id");
          if (boarSwine) boarTag = boarSwine.swine_id;
        }

        return {
          id: r._id,
          farmer_id: r.farmer_id,
          farmer_name: name,
          sow_tag: r.swine_id?.swine_id || r.swine_code || "N/A",
          boar_tag: boarTag,
          date: r.insemination_date,
          status: r.status
        };
      })
    );

    res.json({ success: true, data: formatted });
  } catch (err) {
    console.error("AI History Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------------------------------------------------------
// 2. FETCH PERFORMANCE ANALYTICS
// ---------------------------------------------------------
router.get("/performance-analytics", requireSessionAndToken, async (req, res) => {
  try {
    const { id: userId, role, farmerProfileId, managerId } = req.user;
    let query = {};

    if (role === "farmer") {
      if (!farmerProfileId) return res.status(400).json({ success: false, message: "Farmer profile not linked" });
      query = { farmer_id: new mongoose.Types.ObjectId(farmerProfileId) };
    } else {
      const effectiveManagerId = (role === "farm_manager" || role === "admin") ? userId : managerId;
      const managedFarmers = await Farmer.find({ registered_by: effectiveManagerId }).select("_id");
      const farmerIds = managedFarmers.map((f) => f._id);

      query = {
        $or: [
          { farmer_id: { $in: farmerIds } },
          { registered_by: new mongoose.Types.ObjectId(effectiveManagerId) }
        ]
      };
    }

    const swines = await Swine.find(query)
      .populate({
        path: "farmer_id",
        model: "Farmer",
        select: "first_name last_name"
      })
      .lean();

    let morphologyRecords = [];
    let deformityMonitoring = [];

    swines.forEach((swine) => {
      const displayFarmerName = formatName(swine.farmer_id) || "Unknown User";

      if (swine.performance_records && swine.performance_records.length > 0) {
        swine.performance_records.forEach((perf) => {
          let cleanTeeth = perf.teeth_count ?? "0";
          if (perf.teeth_alignment && perf.teeth_alignment.toLowerCase() !== "n/a") {
            cleanTeeth += ` (${perf.teeth_alignment})`;
          }

          morphologyRecords.push({
            farmer_id: swine.farmer_id,
            farmer_name: displayFarmerName,
            swine_tag: swine.swine_id,
            swine_sex: swine.sex || "Unknown",
            morphology: {
              stage: perf.stage || "Routine",
              date: perf.record_date,
              weight: perf.weight ?? 0,
              body_length: perf.body_length ?? 0,
              heart_girth: perf.heart_girth ?? 0,
              teat_count: perf.teat_count ?? null,
              teeth: cleanTeeth
            }
          });

          if (perf.deformities && perf.deformities.length > 0) {
            const realDeformities = perf.deformities.filter((d) => d && d.toLowerCase() !== "none");
            if (realDeformities.length > 0) {
              deformityMonitoring.push({
                farmer_id: swine.farmer_id,
                farmer_name: displayFarmerName,
                swine_tag: swine.swine_id,
                deformity_types: realDeformities.join(", "),
                date_detected: perf.record_date
              });
            }
          }
        });
      }
    });

    res.json({ success: true, morphology: morphologyRecords, deformities: deformityMonitoring });
  } catch (err) {
    console.error("Performance Analytics Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------------------------------------------------------
// 3. PIGLET MONITORING & LIFECYCLE (NEW)
// ---------------------------------------------------------
router.get("/piglet-monitoring", requireSessionAndToken, async (req, res) => {
  try {
    const { role, farmerProfileId } = req.user;
    let query = { age_stage: "piglet" };

    if (role === "farmer") {
      query.farmer_id = new mongoose.Types.ObjectId(farmerProfileId);
    }

    const piglets = await Swine.find(query);

    const data = piglets.map((p) => {
      const phaseInfo = p.lifecycle_phase; // virtual from Swine.js
      const latestPerf = p.performance_records?.[p.performance_records.length - 1] || {};

      const canAction =
        phaseInfo.phase === "Final Selection" &&
        latestPerf.weight >= 15 &&
        latestPerf.weight <= 25;

      return {
        id: p._id,
        swine_tag: p.swine_id,
        dam_id: p.dam_id || "N/A",
        current_status: phaseInfo.phase,
        days_remaining: phaseInfo.daysLeft,
        status_color: phaseInfo.status,
        can_action: canAction,
        latest_weight: latestPerf.weight || 0,
        deformities: latestPerf.deformities || ["None"]
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------------------------------------------------------
// 4. PIGLET FINAL DECISION (NEW)
// ---------------------------------------------------------
router.post("/piglet-action", requireSessionAndToken, async (req, res) => {
  try {
    const { swineId, action } = req.body; // action: 'breeding' or 'sell'
    const swine = await Swine.findById(swineId);

    if (!swine) return res.status(404).json({ success: false, message: "Swine not found" });

    if (action === "breeding") {
      swine.age_stage = "adult";
      swine.current_status = "Active Breeder";
    } else {
      swine.current_status = "Culled/Sold";
    }

    await swine.save();
    res.json({ success: true, message: `Piglet ${swine.swine_id} has been updated.` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------------------------------------------------------
// 5. SELECTION PROCESS CANDIDATES (OLD LOGIC KEPT)
// ---------------------------------------------------------
router.get("/selection-candidates", requireSessionAndToken, async (req, res) => {
  try {
    const { id: userId, role, farmerProfileId, managerId } = req.user;
    let query = { current_status: { $in: ["1st Selection Ongoing", "2nd Selection Ongoing"] } };

    if (role === "farmer") {
      if (!farmerProfileId) return res.status(400).json({ success: false, message: "Farmer profile not linked" });
      query.farmer_id = new mongoose.Types.ObjectId(farmerProfileId);
    } else {
      const effectiveManagerId = (role === "farm_manager" || role === "admin") ? userId : managerId;
      const managedFarmers = await Farmer.find({ registered_by: effectiveManagerId }).select("_id");
      const farmerIds = managedFarmers.map((f) => f._id);

      query.$or = [
        { farmer_id: { $in: farmerIds } },
        { registered_by: new mongoose.Types.ObjectId(effectiveManagerId) }
      ];
    }

    const candidates = await Swine.find(query)
      .populate({
        path: "farmer_id",
        model: "Farmer",
        select: "first_name last_name"
      })
      .lean();

    const formatted = candidates.map((c) => {
      const latestPerf =
        c.performance_records && c.performance_records.length > 0
          ? c.performance_records[c.performance_records.length - 1]
          : null;

      return {
        id: c._id,
        swine_tag: c.swine_id,
        farmer_id: c.farmer_id,
        farmer_name: formatName(c.farmer_id) || "Unknown Farmer",
        current_stage: c.current_status,
        can_promote: latestPerf ? latestPerf.passed_selection : false,
        recommendation: latestPerf && latestPerf.passed_selection ? "Retain for Breeding" : "Mark for Sale"
      };
    });

    res.json({ success: true, data: formatted });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------------------------------------------------------
// 6. PROCESS SELECTION (OLD LOGIC KEPT)
// ---------------------------------------------------------
router.put("/process-selection", requireSessionAndToken, async (req, res) => {
  try {
    const { swineId, isApproved } = req.body;
    const { role, farmerProfileId } = req.user;

    const swine = await Swine.findById(swineId);
    if (!swine) return res.status(404).json({ success: false, message: "Swine not found" });

    if (role === "farmer" && swine.farmer_id.toString() !== farmerProfileId.toString()) {
      return res.status(403).json({ success: false, message: "Access denied: Not your swine" });
    }

    let newStatus = isApproved
      ? swine.current_status === "1st Selection Ongoing"
        ? "2nd Selection Ongoing"
        : "Active Breeder"
      : "Marked for Sale";

    swine.current_status = newStatus;
    await swine.save();

    res.json({ success: true, message: `Swine updated to ${newStatus}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------------------------------------------------------
// 7. FETCH PREGNANT SOWS (READY FOR FARROWING)
// ---------------------------------------------------------
router.get("/due-for-farrowing", requireSessionAndToken, async (req, res) => {
  try {
    const { id: userId, role, managerId, farmerProfileId } = req.user;
    let query = {
      current_status: "Pregnant",
      "breeding_cycles.is_pregnant": true,
      "breeding_cycles.farrowed": false
    };

    if (role === "farmer") {
      query.farmer_id = new mongoose.Types.ObjectId(farmerProfileId);
    } else {
      const targetManagerId = role === "farm_manager" || role === "admin" ? userId : managerId;
      query.registered_by = new mongoose.Types.ObjectId(targetManagerId);
    }

    const pregnantSows = await Swine.find(query).lean();

    const formatted = pregnantSows.map((sow) => {
      const activeCycle = sow.breeding_cycles.find((c) => c.is_pregnant && !c.farrowed) || {};
      return {
        id: sow._id,
        swine_tag: sow.swine_id,
        breed: sow.breed,
        parity: sow.parity,
        expected_date: activeCycle.expected_farrowing_date,
        ai_record_id: activeCycle.ai_record_id,
        sire_id: activeCycle.cycle_sire_id || "N/A"
      };
    });

    res.json({ success: true, data: formatted });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------------------------------------------------------
// 8. COMPLETE BREEDING CYCLE (FARROWING)
// ---------------------------------------------------------
router.post("/complete-cycle", requireSessionAndToken, async (req, res) => {
  const { ai_record_id, farrowing_date } = req.body;

  try {
    if (!ai_record_id) return res.status(400).json({ success: false, message: "AI Record ID is required" });

    const aiRecord = await AIRecord.findById(ai_record_id);

    if (!aiRecord) {
      return res.status(404).json({ success: false, message: "No active record found." });
    }

    aiRecord.status = "Success";
    aiRecord.farrowing_date = farrowing_date;

    await aiRecord.save();

    res.json({ success: true, message: "Reproduction record updated." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ======================================================
   BATCH REGISTER PIGLETS (LITTER BIRTH) - UPDATED
   - Now sets birth_cycle_number on each piglet
   - So piglets can be queried per cycle in the UI
====================================================== */
router.post("/batch-register-litter", requireSessionAndToken, async (req, res) => {
  const {
    dam_id,
    sire_id,
    farrowing_date,
    num_males,
    num_females,
    num_stillborn,
    num_mummified,
    breed,
    avg_weight,
    farmer_id,
    ai_record_id
  } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = req.user;
    const managerId = user.role === "farm_manager" ? user.id : user.managerId;
    const prefix = getManagerPrefix(managerId);

    if (!dam_id) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: "dam_id is required" });
    }

    // Load dam sow in-session to get active cycle number
    const damSow = await Swine.findOne({ swine_id: dam_id }).session(session);
    if (!damSow) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: "Dam (sow) not found" });
    }

    const cycles = Array.isArray(damSow.breeding_cycles) ? damSow.breeding_cycles : [];
    const activeCycle = cycles.find((c) => c && c.is_pregnant === true && c.farrowed !== true) || null;
    const latestCycle = cycles.length ? cycles[cycles.length - 1] : null;

    const cycleNumber =
      Number(activeCycle?.cycle_number) ||
      Number(latestCycle?.cycle_number) ||
      Number((damSow.parity || 0) + 1);

    // Resolve Batch Letter (keeps your existing approach)
    const existingBatches = await Swine.distinct("batch", { registered_by: managerId }).session(session);
    let batchLetter = getBatchLetter(existingBatches.length);

    const totalLive = Number(num_males || 0) + Number(num_females || 0);
    const totalDead = Number(num_stillborn || 0) + Number(num_mummified || 0);
    const grandTotal = totalLive + totalDead;

    const piglets = [];

    for (let i = 0; i < grandTotal; i++) {
      let sex = "Female";
      let health_status = "Healthy";
      let current_status = "Monitoring (Day 1-30)";

      if (i < Number(num_males)) {
        sex = "Male";
      } else if (i < totalLive) {
        sex = "Female";
      } else if (i < totalLive + Number(num_stillborn)) {
        sex = i % 2 === 0 ? "Male" : "Female";
        health_status = "Deceased (Before Weaning)";
        current_status = "Inactive";
      } else {
        sex = i % 2 === 0 ? "Male" : "Female";
        health_status = "Deceased (Before Weaning)";
        current_status = "Inactive";
      }

      piglets.push({
        swine_id: `${prefix}-${batchLetter}-${String(i + 1).padStart(4, "0")}`,
        registered_by: managerId,
        farmer_id: farmer_id || null,
        sex,
        breed: breed || "Native",
        age_stage: "piglet",
        current_status,
        health_status,
        birth_date: farrowing_date || new Date(),
        dam_id: dam_id,
        sire_id: sire_id,
        batch: batchLetter,

        // Link piglet to dam cycle
        birth_cycle_number: cycleNumber,

        performance_records: [
          {
            stage: "Monitoring (Day 1-30)",
            weight: Number(avg_weight) || 0,
            recorded_by: user.id,
            record_date: farrowing_date || new Date(),
            remarks: health_status === "Healthy" ? "Initial Registration" : "Registered as Deceased (Farrowing)"
          }
        ]
      });
    }

    if (piglets.length > 0) {
      await Swine.insertMany(piglets, { session });
    }

    await Swine.updateOne(
      { swine_id: dam_id, "breeding_cycles.is_pregnant": true },
      {
        $set: {
          "breeding_cycles.$.farrowed": true,
          "breeding_cycles.$.is_pregnant": false,
          "breeding_cycles.$.actual_farrowing_date": farrowing_date || new Date(),
          "breeding_cycles.$.farrowing_results": {
            total_piglets: grandTotal,
            live_piglets: totalLive,
            male_count: Number(num_males),
            female_count: Number(num_females),
            mortality_count: totalDead
          },
          current_status: "Lactating"
        },
        $inc: { parity: 1 }
      },
      { session }
    );

    if (ai_record_id) {
      await AIRecord.findByIdAndUpdate(
        ai_record_id,
        {
          status: "Completed",
          actual_farrowing_date: farrowing_date || new Date()
        },
        { session }
      );
    }

    await session.commitTransaction();
    res.status(201).json({
      success: true,
      message: `Farrowing successful. Batch ${batchLetter} created with ${totalLive} live and ${totalDead} deceased records.`,
      meta: {
        dam_id,
        birth_cycle_number: cycleNumber,
        total_created: piglets.length
      }
    });
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    res.status(500).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});

module.exports = router;