const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const Swine = require("../models/Swine");
const Farmer = require("../models/UserFarmer");
const AIRecord = require("../models/AIRecord");
const HeatReport = require("../models/HeatReports");
const AuditLog = require("../models/AuditLog");
const Notification = require("../models/Notifications"); // ✅ Added Notification Model
const logAction = require("../middleware/logger");

const { requireSessionAndToken } = require("../middleware/authMiddleware");
const { requireApiLogin } = require("../middleware/pageAuth.middleware");
const { allowRoles } = require("../middleware/roleMiddleware");

/* ======================================================
    UTILITIES: ID GENERATORS
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
    PREVIEW ENDPOINTS: GET NEXT IDs (FOR FRONTEND)
====================================================== */

router.get("/preview/next-boar-id", requireSessionAndToken, async (req, res) => {
    try {
        const user = req.user;
        const managerId = user.role === "farm_manager" ? user.id : user.managerId;
        const prefix = getManagerPrefix(managerId);

        const count = await Swine.countDocuments({
            registered_by: managerId,
            swine_id: { $regex: new RegExp(`^${prefix}-BOAR-`) }
        });
        const nextId = `${prefix}-BOAR-${String(count + 1).padStart(4, "0")}`;
        res.json({ success: true, nextId });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get("/preview/next-batch-letter", requireSessionAndToken, async (req, res) => {
    try {
        const user = req.user;
        const managerId = user.role === "farm_manager" ? user.id : user.managerId;

        const existingBatches = await Swine.distinct("batch", {
            registered_by: managerId,
            batch: { $regex: /^[A-Z]+$/ }
        });

        const usedIndices = existingBatches.map(b => {
            let num = 0;
            for (let i = 0; i < b.length; i++) {
                num = num * 26 + (b.charCodeAt(i) - 64);
            }
            return num - 1;
        }).filter(n => !isNaN(n));

        let nextIndex = 0;
        while (usedIndices.includes(nextIndex)) nextIndex++;
        res.json({ success: true, nextLetter: getBatchLetter(nextIndex) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* ======================================================
    ADD MASTER BOAR
====================================================== */
router.post(
    "/add-master-boar",
    requireSessionAndToken,
    allowRoles("farm_manager", "encoder", "admin"),
    async (req, res) => {
        const {
            color, weight, bodyLength, heartGirth,
            teethCount, date_transfer, health_status, current_status, breed,
            manager_id
        } = req.body;

        try {
            const user = req.user;
            const registeredBy = manager_id || (user.role === "farm_manager" ? user.id : user.managerId);
            const prefix = getManagerPrefix(registeredBy);

            const boarCount = await Swine.countDocuments({
                registered_by: registeredBy,
                swine_id: { $regex: new RegExp(`^${prefix}-BOAR-`) }
            });

            const swineId = `${prefix}-BOAR-${String(boarCount + 1).padStart(4, "0")}`;

            const newBoar = new Swine({
                swine_id: swineId,
                registered_by: registeredBy,
                farmer_id: null,
                sex: "Male",
                breed: breed || "Native",
                color: color || "Unknown",
                age_stage: "adult",
                is_external_boar: true,
                date_transfer: date_transfer || new Date(),
                health_status: health_status || "Healthy",
                current_status: current_status || "Active",
                performance_records: [{
                    stage: "Maintenance Registration",
                    record_date: new Date(),
                    weight: Number(weight) || 0,
                    body_length: Number(bodyLength) || 0,
                    heart_girth: Number(heartGirth) || 0,
                    teeth_count: Number(teethCount) || 0,
                    recorded_by: user.id
                }]
            });

            await newBoar.save();
            await logAction(user.id, "REGISTER_MASTER_BOAR", "SWINE_MANAGEMENT", `Registered Master Boar ${swineId}`, req);

            res.status(201).json({ success: true, message: "Master Boar registered: " + swineId, swine: newBoar });
        } catch (error) {
            if (error.code === 11000) return res.status(400).json({ success: false, message: "Duplicate ID. Please refresh." });
            res.status(500).json({ success: false, message: "Server error", error: error.message });
        }
    }
);

/* ======================================================
    ADD NEW SWINE (UPDATED ID LOGIC + NOTIFICATION)
====================================================== */
router.post(
    "/add",
    requireSessionAndToken,
    allowRoles("farm_manager", "encoder"),
    async (req, res) => {
        let {
            farmer_id, sex, color, breed, birth_date, health_status,
            sire_id, dam_id, date_transfer, batch,
            age_stage, weight, bodyLength, heartGirth, teethCount,
            leg_conformation, deformities, teat_count, current_status,
            birth_cycle_number
        } = req.body;

        try {
            if (!sex) return res.status(400).json({ success: false, message: "Sex is required" });

            const user = req.user;
            const managerId = user.role === "farm_manager" ? user.id : user.managerId;
            const prefix = getManagerPrefix(managerId);

            // 1. Resolve Auto-batch letter if empty
            if (!batch || batch.trim() === "") {
                const existingBatches = await Swine.distinct("batch", {
                    registered_by: managerId,
                    batch: { $regex: /^[A-Z]+$/ }
                });
                const usedIndices = existingBatches.map(b => {
                    let num = 0;
                    for (let i = 0; i < b.length; i++) num = num * 26 + (b.charCodeAt(i) - 64);
                    return num - 1;
                }).filter(n => !isNaN(n));
                let nextIndex = 0;
                while (usedIndices.includes(nextIndex)) nextIndex++;
                batch = getBatchLetter(nextIndex);
            }

            // 2. Farmer authorization check
            let targetFarmer = null;
            if (farmer_id) {
                targetFarmer = await Farmer.findOne({
                    _id: farmer_id,
                    $or: [{ managerId: managerId }, { registered_by: managerId }, { user_id: managerId }]
                });
                if (!targetFarmer) return res.status(400).json({ success: false, message: "Farmer unauthorized" });
            }

            // 3. GENERATE ID
            let swineId;
            if (batch === "BOAR" || (sex.toLowerCase() === "male" && age_stage === "adult")) {
                const boarCount = await Swine.countDocuments({
                    registered_by: managerId,
                    swine_id: { $regex: new RegExp(`^${prefix}-BOAR-`) }
                });
                swineId = `${prefix}-BOAR-${String(boarCount + 1).padStart(4, "0")}`;
            } else {
                const lastSwineInBatch = await Swine.find({
                    batch: batch,
                    registered_by: managerId
                })
                .sort({ swine_id: -1 })
                .limit(1);

                let nextNumber = 1;
                if (lastSwineInBatch.length && lastSwineInBatch[0].swine_id) {
                    const parts = lastSwineInBatch[0].swine_id.split("-");
                    const lastNum = parseInt(parts[parts.length - 1]);
                    if (!isNaN(lastNum)) nextNumber = lastNum + 1;
                }
                swineId = `${prefix}-${batch}-${String(nextNumber).padStart(4, "0")}`;
            }

            // 4. Set Initial Status
            let initialStatus = current_status;
            let initialPerfStage = "Registration";

            if (!initialStatus) {
                if (age_stage === "piglet" || age_stage === "Monitoring (Day 1-30)") {
                    initialStatus = "Monitoring (Day 1-30)";
                    initialPerfStage = "Monitoring (Day 1-30)";
                } else {
                    initialStatus = (sex.toLowerCase() === "female") ? "Open" : "Market-Ready";
                    initialPerfStage = "Routine";
                }
            }

            const newSwine = new Swine({
                swine_id: swineId,
                batch,
                registered_by: managerId,
                farmer_id: farmer_id || null,
                sex, color, breed, birth_date, birth_cycle_number,
                health_status: health_status || "Healthy",
                sire_id, dam_id,
                age_stage: age_stage || "piglet",
                current_status: initialStatus,
                date_transfer,
                performance_records: [{
                    stage: initialPerfStage,
                    record_date: new Date(),
                    weight: Number(weight) || 0,
                    body_length: Number(bodyLength) || 0,
                    heart_girth: Number(heartGirth) || 0,
                    teeth_count: Number(teethCount) || 0,
                    leg_conformation: leg_conformation || "Normal",
                    teat_count: Number(teat_count) || 0,
                    deformities: Array.isArray(deformities) ? deformities : ["None"],
                    recorded_by: user.id
                }]
            });

            await newSwine.save();

            // ✅ NEW FEATURE: NOTIFY FARMER
            if (targetFarmer && targetFarmer.user_id) {
                await Notification.create({
                    user_id: targetFarmer.user_id,
                    title: "New Swine Registered",
                    message: `A new ${breed} ${sex} (ID: ${swineId}) has been assigned to your profile.`,
                    type: "success"
                });
            }

            await logAction(user.id, "REGISTER_SWINE", "SWINE_MANAGEMENT", `Registered Swine ${swineId}`, req);
            res.status(201).json({ success: true, message: "Swine added", swine: newSwine });

        } catch (error) {
            if (error.code === 11000) return res.status(400).json({ success: false, message: "Duplicate ID collision." });
            res.status(500).json({ success: false, message: error.message });
        }
    }
);

/* ======================================================
    ADD PERFORMANCE RECORD
====================================================== */
router.post(
    "/performance/add/:id",
    requireSessionAndToken,
    allowRoles("farm_manager", "encoder"),
    async (req, res) => {
        const { id } = req.params;
        const { weight, bodyLength, heartGirth, stage, remarks } = req.body;
        const user = req.user;

        try {
            const swine = await Swine.findById(id);
            if (!swine) return res.status(404).json({ success: false, message: "Swine not found" });

            const newRecord = {
                stage: stage || "Routine",
                record_date: new Date(),
                weight: Number(weight) || 0,
                body_length: Number(bodyLength) || 0,
                heart_girth: Number(heartGirth) || 0,
                remarks: remarks || "Manual update",
                recorded_by: user.id
            };

            swine.performance_records.push(newRecord);
            await swine.save();
            await logAction(user.id, "ADD_PERFORMANCE", "SWINE_MANAGEMENT", `Added record for ${swine.swine_id}`, req);

            res.json({ success: true, message: "Performance record added", swine });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }
);

/* ======================================================
    UPDATE SWINE
====================================================== */
router.put(
    "/update/:swineId",
    requireSessionAndToken,
    allowRoles("farm_manager", "encoder", "farmer"),
    async (req, res) => {
        const { swineId } = req.params;
        const user = req.user;
        const updates = req.body;

        try {
            const swine = await Swine.findOne({ swine_id: swineId });
            if (!swine) return res.status(404).json({ success: false, message: "Swine not found" });

            if (user.role === "farmer" && swine.farmer_id && swine.farmer_id.toString() !== user.farmerProfileId)
                return res.status(403).json({ success: false, message: "Access denied" });

            const allowedFields = [
                "sex", "color", "breed", "birth_date", "health_status",
                "sire_id", "dam_id", "date_transfer",
                "batch", "age_stage", "current_status", "performance_records",
                "birth_cycle_number"
            ];

            if (updates.performance_records) {
                const newPerfData = {
                    ...updates.performance_records,
                    record_date: new Date(),
                    recorded_by: user.id
                };

                if (updates.overwrite_monthly) {
                    const now = new Date();
                    const existingIndex = swine.performance_records.findIndex(rec => {
                        const d = new Date(rec.record_date);
                        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                    });

                    if (existingIndex !== -1) swine.performance_records[existingIndex] = newPerfData;
                    else swine.performance_records.push(newPerfData);
                } else {
                    swine.performance_records.push(newPerfData);
                }
            }

            allowedFields.forEach((field) => {
                if (updates[field] !== undefined && field !== "performance_records") {
                    swine[field] = updates[field];
                }
            });

            await swine.save();
            logAction(user.id, "UPDATE_SWINE", "SWINE_MANAGEMENT", `Updated ${swineId}`, req);
            res.json({ success: true, message: "Swine updated successfully", swine });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }
);

/* ======================================================
    REGISTER FARROWING
====================================================== */
router.post(
    "/:swineId/register-farrowing",
    requireSessionAndToken,
    allowRoles("farm_manager", "encoder", "farmer"),
    async (req, res) => {
        const { swineId } = req.params;
        const { total_live, mummified, stillborn, farrowing_date } = req.body;
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const sow = await Swine.findOne({ swine_id: swineId });
            if (!sow) throw new Error("Sow not found");

            const totalPiglets = Number(total_live || 0) + Number(mummified || 0) + Number(stillborn || 0);
            const actualFarrowingDate = farrowing_date || new Date();

            const updateResult = await Swine.updateOne(
                { _id: sow._id, "breeding_cycles.is_pregnant": true },
                {
                    $set: {
                        "breeding_cycles.$.farrowed": true,
                        "breeding_cycles.$.is_pregnant": false,
                        "breeding_cycles.$.actual_farrowing_date": actualFarrowingDate,
                        "breeding_cycles.$.farrowing_results": {
                            total_piglets: totalPiglets,
                            live_piglets: Number(total_live || 0),
                            mortality_count: Number(mummified || 0) + Number(stillborn || 0)
                        },
                        current_status: "Lactating"
                    }
                },
                { session }
            );

            if (updateResult.modifiedCount === 0) throw new Error("No active pregnant cycle found.");

            await HeatReport.findOneAndUpdate({ swine_id: sow._id, status: "pregnant" }, { status: "lactating" }, { session });
            await AIRecord.findOneAndUpdate({ swine_id: sow._id, status: "Success" }, { status: "Completed", actual_farrowing_date: actualFarrowingDate }, { session });

            await logAction(req.user.id, "REGISTER_FARROWING", "BREEDING", `Farrowing recorded for Sow ${swineId}`, req);

            await session.commitTransaction();
            res.json({ success: true, message: "Farrowing registered." });
        } catch (error) {
            await session.abortTransaction();
            res.status(500).json({ success: false, message: error.message });
        } finally {
            session.endSession();
        }
    }
);

/* ======================================================
    MANUAL WEANING
====================================================== */
router.patch(
    "/:swineId/manual-weaning",
    requireSessionAndToken,
    allowRoles("farm_manager", "encoder", "farmer"),
    async (req, res) => {
        const { swineId } = req.params;
        try {
            const swine = await Swine.findOne({ swine_id: swineId });
            if (!swine) return res.status(404).json({ success: false, message: "Swine not found" });
            if (swine.current_status !== "Lactating") return res.status(400).json({ success: false, message: "Not lactating." });

            swine.current_status = "Open";
            swine.performance_records.push({
                stage: "Manual Weaning",
                record_date: new Date(),
                recorded_by: req.user.id,
                remarks: "Manual override to Open."
            });

            await swine.save();
            await HeatReport.findOneAndUpdate({ swine_id: swine._id, status: "lactating" }, { status: "completed" });
            await logAction(req.user.id, "MANUAL_WEANING", "BREEDING", `Manually weaned Sow ${swineId}`, req);

            res.json({ success: true, message: `Swine ${swineId} has been manually weaned.` });
        } catch (error) {
            res.status(500).json({ success: false, message: "Server error." });
        }
    }
);

/* ======================================================
    MEDICAL RECORDS
====================================================== */
router.post("/:swineId/medical", requireSessionAndToken, allowRoles("farm_manager", "encoder", "farmer"), async (req, res) => {
    const { treatment_type, medicine_name, dosage, remarks } = req.body;
    try {
        const swine = await Swine.findOne({ swine_id: req.params.swineId });
        if (!swine) return res.status(404).json({ success: false, message: "Not found" });

        swine.medical_records.push({
            treatment_type, medicine_name, dosage, remarks, administered_by: req.user.id
        });
        await swine.save();
        await logAction(req.user.id, "MEDICAL_TREATMENT", "SWINE_MANAGEMENT", `Medical update for ${req.params.swineId}`, req);
        res.json({ success: true, message: "Medical record added" });
    } catch (e) { res.status(500).json({ success: false, message: "Server error" }); }
});

/* ======================================================
    GET ALL SWINE
====================================================== */
router.get(
    "/all",
    requireSessionAndToken,
    allowRoles("farm_manager", "encoder", "farmer"),
    async (req, res) => {
        try {
            const user = req.user;
            const managerId = user.role === "farm_manager" ? user.id : user.managerId;
            let query = {};

            if (user.role === "farmer") {
                query.farmer_id = user.farmerProfileId;
            } else {
                const farmers = await Farmer.find({
                    $or: [{ managerId: managerId }, { registered_by: managerId }]
                }).select("_id");

                const farmerIds = farmers.map((f) => f._id);
                const prefix = getManagerPrefix(managerId);

                query = {
                    $or: [
                        { farmer_id: { $in: farmerIds } },
                        { registered_by: managerId, farmer_id: null },
                        { swine_id: { $regex: new RegExp(`^${prefix}-BOAR-`) } }
                    ]
                };
            }

            if (req.query.sex) query.sex = { $regex: new RegExp(`^${req.query.sex}$`, "i") };
            if (req.query.age_stage) query.age_stage = { $regex: new RegExp(`^${req.query.age_stage}$`, "i") };
            if (req.query.farmer_id) query.farmer_id = req.query.farmer_id;

            const swine = await Swine.find(query).populate("farmer_id", "first_name last_name").lean();
            const swineData = swine.map(s => ({
                ...s,
                farmer_name: s.farmer_id ? `${s.farmer_id.first_name} ${s.farmer_id.last_name}` : "ADMIN/MASTER",
                total_piglets_count: s.breeding_cycles?.reduce((sum, c) => sum + (c.farrowing_results?.total_piglets || 0), 0) || 0,
                total_mortality_count: s.breeding_cycles?.reduce((sum, c) => sum + (c.farrowing_results?.mortality_count || 0), 0) || 0,
                latest_performance: s.performance_records?.[s.performance_records.length - 1] || {}
            }));

            res.json({ success: true, swine: swineData });
        } catch (err) {
            res.status(500).json({ success: false, message: "Server error" });
        }
    }
);

/* ======================================================
    GET BOAR HISTORY & ACTIVE BOARS
====================================================== */
router.get(
    "/history/boars/:swineId",
    requireSessionAndToken,
    allowRoles("farm_manager", "encoder"),
    async (req, res) => {
        try {
            const { swineId } = req.params;
            const user = req.user;
            const managerId = user.role === "farm_manager" ? user.id : user.managerId;

            const sow = await Swine.findOne({ swine_id: swineId });
            if (!sow) return res.status(404).json({ success: false, message: "Sow not found" });

            const aiHistory = await AIRecord.find({ swine_id: sow._id }).populate("male_swine_id", "swine_id breed").lean();
            const historicalBoars = aiHistory
                .map(record => record.male_swine_id)
                .filter((boar, index, self) =>
                    boar && self.findIndex(b => b.swine_id === boar.swine_id) === index
                );

            const farmers = await Farmer.find({ $or: [{ managerId: managerId }, { registered_by: managerId }] }).select("_id");
            const farmerIds = farmers.map(f => f._id);
            const prefix = getManagerPrefix(managerId);

            const allActiveBoars = await Swine.find({
                sex: { $regex: /^male$/i },
                age_stage: { $regex: /^adult$/i },
                current_status: { $ne: "Culled/Sold" },
                $or: [
                    { swine_id: { $regex: new RegExp(`^${prefix}-BOAR-`) } },
                    { registered_by: managerId },
                    { farmer_id: { $in: farmerIds } }
                ]
            }).select("swine_id breed").lean();

            res.json({ success: true, historicalBoars, allActiveBoars });
        } catch (err) {
            res.status(500).json({ success: false, message: "Error fetching history" });
        }
    }
);

/* ======================================================
    GET AUDIT LOGS
====================================================== */
router.get(
    "/logs/audit",
    requireSessionAndToken,
    allowRoles("farm_manager", "encoder"),
    async (req, res) => {
        try {
            const { module_name, action_type, limit = 50, skip = 0 } = req.query;
            let query = {};
            if (module_name) query.module = module_name;
            if (action_type) query.action = action_type;

            const logs = await AuditLog.find(query)
                .populate("user_id", "first_name last_name email role")
                .sort({ timestamp: -1 })
                .limit(parseInt(limit))
                .skip(parseInt(skip));

            const total = await AuditLog.countDocuments(query);
            res.json({ success: true, total, logs });
        } catch (error) {
            res.status(500).json({ success: false, message: "Audit retrieval error" });
        }
    }
);

/* ======================================================
    BATCH REGISTER PIGLETS (LITTER BIRTH) - UPDATED
====================================================== */
router.post("/batch-register-litter", requireSessionAndToken, async (req, res) => {
    const { 
        dam_id, 
        sire_id, 
        farrowing_date, 
        num_males, 
        num_females,
        num_stillborn,    // Added
        num_mummified,   // Added
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
        
        // 1. Resolve Batch Letter
        const existingBatches = await Swine.distinct("batch", { registered_by: managerId });
        let batchLetter = getBatchLetter(existingBatches.length);

        const totalLive = Number(num_males || 0) + Number(num_females || 0);
        const totalDead = Number(num_stillborn || 0) + Number(num_mummified || 0);
        const grandTotal = totalLive + totalDead;
        
        const piglets = [];

        // 2. Prepare Piglet Array (Loop through all categories)
        for (let i = 0; i < grandTotal; i++) {
            let sex = "Female"; 
            let health_status = "Healthy";
            let current_status = "Monitoring (Day 1-30)";

            // Determine Sex and Health Status based on index
            if (i < Number(num_males)) {
                sex = "Male";
            } else if (i < totalLive) {
                sex = "Female";
            } else if (i < (totalLive + Number(num_stillborn))) {
                // Stillborn category
                sex = (i % 2 === 0) ? "Male" : "Female"; // Alternating or default
                health_status = "Deceased (Before Weaning)";
                current_status = "Inactive"; 
            } else {
                // Mummified category
                sex = (i % 2 === 0) ? "Male" : "Female";
                health_status = "Deceased (Before Weaning)";
                current_status = "Inactive";
            }

            piglets.push({
                swine_id: `${prefix}-${batchLetter}-${String(i + 1).padStart(4, "0")}`,
                registered_by: managerId,
                farmer_id: farmer_id || null,
                sex: sex,
                breed: breed || "Native",
                age_stage: "piglet",
                current_status: current_status,
                health_status: health_status,
                birth_date: farrowing_date || new Date(),
                dam_id: dam_id,
                sire_id: sire_id,
                batch: batchLetter,
                performance_records: [{
                    stage: "Monitoring (Day 1-30)",
                    weight: Number(avg_weight) || 0,
                    recorded_by: user.id,
                    record_date: farrowing_date || new Date(),
                    remarks: health_status === "Healthy" ? "Initial Registration" : "Registered as Deceased (Farrowing)"
                }]
            });
        }

        // 3. DATABASE UPDATES
        // A. Bulk Insert Piglets
        if (piglets.length > 0) {
            await Swine.insertMany(piglets, { session });
        }

        // B. Update Sow's Breeding Cycle & Status
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

        // C. Update AI Record status
        if (ai_record_id) {
            await AIRecord.findByIdAndUpdate(ai_record_id, {
                status: "Completed",
                actual_farrowing_date: farrowing_date || new Date()
            }, { session });
        }

        await session.commitTransaction();
        res.status(201).json({ 
            success: true, 
            message: `Farrowing successful. Batch ${batchLetter} created with ${totalLive} live and ${totalDead} deceased records.` 
        });

    } catch (error) {
        if (session.inTransaction()) await session.abortTransaction();
        res.status(500).json({ success: false, message: error.message });
    } finally {
        session.endSession();
    }
});

/* ======================================================
    FARMER PROFILE SPECIFIC ROUTE
====================================================== */
router.get("/farmer", requireApiLogin, allowRoles("farmer"), async (req, res) => {
    try {
        const farmerId = req.user.farmerProfileId;
        const swine = await Swine.find({ farmer_id: farmerId }).populate("farmer_id", "first_name last_name").lean();
        res.json({ success: true, swine });
    } catch (e) { res.status(500).json({ success: false, message: "Server error" }); }
});

module.exports = router;