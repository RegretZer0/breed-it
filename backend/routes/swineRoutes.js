const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const Swine = require("../models/Swine");
const Farmer = require("../models/UserFarmer");
const AIRecord = require("../models/AIRecord");
const HeatReport = require("../models/HeatReports");
const AuditLog = require("../models/AuditLog"); // Added for retrieval route
const logAction = require("../middleware/logger"); // ✅ Utility referenced correctly

const { requireSessionAndToken } = require("../middleware/authMiddleware");
const { requireApiLogin } = require("../middleware/pageAuth.middleware");
const { allowRoles } = require("../middleware/roleMiddleware");

/* ======================================================
    ADD MASTER BOAR (Maintenance Page Only)
====================================================== */
router.post(
    "/add-master-boar",
    requireSessionAndToken,
    allowRoles("farm_manager", "encoder", "admin"),
    async (req, res) => {
        const {
            color, weight, bodyLength, heartGirth, 
            teethCount, date_transfer, health_status, current_status, breed,
            manager_id // Recieving manager_id from maintenance.js
        } = req.body;

        try {
            const user = req.user;
            
            // LOGIC: Determine who the "Owner/Manager" of this boar is.
            // 1. If manager_id is provided from frontend, use it.
            // 2. Otherwise, if the logged-in user is a manager, use their ID.
            // 3. If it's an encoder, use their linked managerId.
            const registeredBy = manager_id || (user.role === "farm_manager" ? user.id : user.managerId);

            const boarCount = await Swine.countDocuments({ 
                swine_id: { $regex: /^BOAR-/ } 
            });
            const nextNumber = boarCount + 1;
            const swineId = `BOAR-${String(nextNumber).padStart(4, "0")}`;

            const newBoar = new Swine({
                swine_id: swineId,
                registered_by: registeredBy, // Linked to the Farm Manager
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
                    recorded_by: user.id // The actual person who pressed "Submit"
                }]
            });

            await newBoar.save();

            // ✅ Audit Log: Master Boar Registration
            await logAction(user.id, "REGISTER_MASTER_BOAR", "SWINE_MANAGEMENT", `Registered Master Boar ${swineId} (${breed})`, req);

            res.status(201).json({ 
                success: true, 
                message: "Master Boar registered with ID: " + swineId, 
                swine: newBoar 
            });

        } catch (error) {
            console.error("[ADD MASTER BOAR ERROR]:", error);
            res.status(500).json({ success: false, message: "Server error", error: error.message });
        }
    }
);

/* ======================================================
    ADD NEW SWINE (Farmer/Transaction)
====================================================== */
router.post(
    "/add",
    requireSessionAndToken,
    allowRoles("farm_manager", "encoder"),
    async (req, res) => {
        const {
            farmer_id, sex, color, breed, birth_date, health_status,
            sire_id, dog_id, date_transfer, batch,
            age_stage, weight, bodyLength, heartGirth, teethCount,
            leg_conformation, deformities, teat_count, current_status,
            birth_cycle_number 
        } = req.body;

        try {
            if (!sex || !batch) {
                return res.status(400).json({ success: false, message: "Sex and batch are required" });
            }

            const user = req.user;
            const managerId = user.role === "farm_manager" ? user.id : user.managerId;

            if (farmer_id) {
                const farmer = await Farmer.findOne({
                    _id: farmer_id,
                    $or: [
                        { managerId: managerId },
                        { registered_by: managerId },
                        { user_id: managerId }
                    ]
                });
                if (!farmer) return res.status(400).json({ success: false, message: "Farmer not found or unauthorized" });
            }

            let swineId;
            if (batch === "BOAR" || (sex.toLowerCase() === "male" && age_stage === "adult")) {
                const boarCount = await Swine.countDocuments({ swine_id: { $regex: /^BOAR-/ } });
                swineId = `BOAR-${String(boarCount + 1).padStart(4, "0")}`;
            } else {
                const lastSwine = await Swine.find({ batch }).sort({ _id: -1 }).limit(1);
                let nextNumber = 1;
                if (lastSwine.length && lastSwine[0].swine_id) {
                    const parts = lastSwine[0].swine_id.split("-");
                    const lastNum = parseInt(parts[parts.length - 1]);
                    if (!isNaN(lastNum)) nextNumber = lastNum + 1;
                }
                swineId = `${batch}-${String(nextNumber).padStart(4, "0")}`;
            }

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
                sex,
                color,
                breed,
                birth_date,
                birth_cycle_number, 
                health_status: health_status || "Healthy",
                sire_id,
                dam_id,
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

            // ✅ Audit Log: Swine Registration
            await logAction(user.id, "REGISTER_SWINE", "SWINE_MANAGEMENT", `Added new swine ${swineId} to batch ${batch}`, req);

            res.status(201).json({ success: true, message: "Swine added successfully", swine: newSwine });

        } catch (error) {
            console.error("[ADD SWINE ERROR]:", error);
            res.status(500).json({ success: false, message: "Server error", error: error.message });
        }
    }
);

/* ======================================================
    REGISTER FARROWING (CLOSES ACTIVE CYCLE)
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

            if (updateResult.modifiedCount === 0) {
                throw new Error("No active pregnant cycle found for this sow.");
            }

            await HeatReport.findOneAndUpdate(
                { swine_id: sow._id, status: "pregnant" },
                { status: "lactating" }, 
                { session }
            );

            await AIRecord.findOneAndUpdate(
                { swine_id: sow._id, status: "Success" },
                { status: "Completed", actual_farrowing_date: actualFarrowingDate },
                { session }
            );

            // ✅ Audit Log: Farrowing Registration
            await logAction(req.user.id, "REGISTER_FARROWING", "BREEDING", `Registered farrowing for Sow ${swineId}: ${total_live} live, ${totalPiglets - total_live} mortality`, req);

            await session.commitTransaction();
            res.json({ success: true, message: "Farrowing registered. Sow is now Lactating." });

        } catch (error) {
            await session.abortTransaction();
            res.status(500).json({ success: false, message: error.message });
        } finally {
            session.endSession();
        }
    }
);

/* ======================================================
    MANUAL WEANING (Override Route)
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

            if (swine.current_status !== "Lactating") {
                return res.status(400).json({ success: false, message: "Only lactating swine can be weaned." });
            }

            swine.current_status = "Open";
            
            swine.performance_records.push({
                stage: "Manual Weaning",
                record_date: new Date(),
                recorded_by: req.user.id,
                remarks: "Manual override used to set status to Open."
            });

            await swine.save();

            await HeatReport.findOneAndUpdate(
                { swine_id: swine._id, status: "lactating" },
                { status: "completed" }
            );

            // ✅ Audit Log: Manual Weaning
            await logAction(req.user.id, "MANUAL_WEANING", "BREEDING", `Manually weaned Sow ${swineId}. Status updated to Open.`, req);

            res.json({ 
                success: true, 
                message: `Swine ${swineId} has been manually weaned and is now Open.` 
            });
        } catch (error) {
            console.error("[MANUAL WEANING ERROR]:", error);
            res.status(500).json({ success: false, message: "Server error during weaning." });
        }
    }
);

/* ======================================================
    GET ALL SWINE (With Lean Optimization)
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
                query = {
                    $or: [
                        { farmer_id: { $in: farmerIds } },
                        { registered_by: managerId, farmer_id: null },
                        { swine_id: { $regex: /^BOAR-/ } }
                    ]
                };
            }

            if (req.query.sex) query.sex = { $regex: new RegExp(`^${req.query.sex}$`, "i") };
            if (req.query.age_stage) query.age_stage = { $regex: new RegExp(`^${req.query.age_stage}$`, "i") };
            if (req.query.farmer_id) query.farmer_id = req.query.farmer_id;

            const swine = await Swine.find(query)
                .populate("farmer_id", "first_name last_name")
                .lean();

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
    GET SWINE FOR LOGGED-IN FARMER
====================================================== */
router.get(
    "/farmer",
    requireApiLogin, 
    allowRoles("farmer"),
    async (req, res) => {
        try {
            const farmerId = req.user.farmerProfileId;
            if (!farmerId) return res.status(404).json({ success: false, message: "Farmer profile not linked" });

            const swine = await Swine.find({ farmer_id: farmerId })
                .populate("farmer_id", "first_name last_name")
                .lean();

            res.json({ success: true, swine });
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

            const aiHistory = await AIRecord.find({ swine_id: sow._id })
                .populate("male_swine_id", "swine_id breed")
                .lean();

            const historicalBoars = aiHistory
                .map(record => record.male_swine_id)
                .filter((boar, index, self) => 
                    boar && self.findIndex(b => b.swine_id === boar.swine_id) === index
                );

            const farmers = await Farmer.find({ 
                $or: [{ managerId: managerId }, { registered_by: managerId }] 
            }).select("_id");
            const farmerIds = farmers.map(f => f._id);

            const allActiveBoars = await Swine.find({
                sex: { $regex: /^male$/i },
                age_stage: { $regex: /^adult$/i },
                current_status: { $ne: "Culled/Sold" },
                $or: [
                        { registered_by: managerId },
                        { farmer_id: { $in: farmerIds } },
                        { farmer_id: null } 
                ]
            }).select("swine_id breed").lean();

            res.json({ success: true, historicalBoars, allActiveBoars });
        } catch (err) {
            res.status(500).json({ success: false, message: "Error fetching history" });
        }
    }
);

/* ======================================================
    ADD MEDICAL RECORD
====================================================== */
router.post(
    "/:swineId/medical",
    requireSessionAndToken,
    allowRoles("farm_manager", "encoder", "farmer"),
    async (req, res) => {
        const { treatment_type, medicine_name, dosage, remarks } = req.body;
        try {
            const swine = await Swine.findOne({ swine_id: req.params.swineId });
            if (!swine) return res.status(404).json({ success: false, message: "Swine not found" });

            swine.medical_records.push({
                treatment_type,
                medicine_name,
                dosage,
                remarks,
                administered_by: req.user.id
            });

            await swine.save();

            // ✅ Audit Log: Medical Record
            await logAction(req.user.id, "ADD_MEDICAL_RECORD", "HEALTH_MANAGEMENT", `Added ${treatment_type} record (${medicine_name}) for Swine ${req.params.swineId}`, req);

            res.json({ success: true, message: "Medical record added", medical_records: swine.medical_records });
        } catch (error) {
            res.status(500).json({ success: false, message: "Server error" });
        }
    }
);

/* ======================================================
    UPDATE SWINE (MODIFIED FOR MONTHLY OVERWRITE)
====================================================== */
router.put(
    "/update/:swineId",
    requireSessionAndToken,
    allowRoles("farm_manager", "encoder", "farmer"),
    async (req, res) => {
        const { swineId } = req.params;
        const user = req.user || req.session?.user;
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "User not authenticated"
            });
        }
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

            // --- Performance Record Logic (Overwrite vs Push) ---
            if (updates.performance_records) {
                const newPerfData = {
                    ...updates.performance_records,
                    record_date: new Date(),
                    recorded_by: user.id
                };

                // Logic: If overwrite_monthly is true, find existing record for this month/year and replace it
                if (updates.overwrite_monthly) {
                    const now = new Date();
                    const currentMonth = now.getMonth();
                    const currentYear = now.getFullYear();

                    const existingIndex = swine.performance_records.findIndex(rec => {
                        const d = new Date(rec.record_date);
                        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
                    });

                    if (existingIndex !== -1) {
                        swine.performance_records[existingIndex] = newPerfData;
                    } else {
                        swine.performance_records.push(newPerfData);
                    }
                } else {
                    // Standard Push behavior
                    swine.performance_records.push(newPerfData);
                }
            }

            // --- Update other fields ---
            allowedFields.forEach((field) => {
                // performance_records is handled above
                if (updates[field] !== undefined && field !== "performance_records") {
                    swine[field] = updates[field];
                }
            });

            await swine.save();

            // ✅ Audit Log: Swine Update
            await logAction(user.id, "UPDATE_SWINE", "SWINE_MANAGEMENT", `Updated profile/performance data for Swine ${swineId}`, req);

            res.json({ success: true, message: "Swine updated successfully", swine });
        } catch (error) {
            console.error("[UPDATE SWINE ERROR]:", error);
            res.status(500).json({ success: false, message: "Server error" });
        }
    }
);

/* ======================================================
    GET AUDIT LOGS (Fetch History)
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

            res.json({ 
                success: true, 
                total,
                logs 
            });
        } catch (error) {
            console.error("[FETCH LOGS ERROR]:", error);
            res.status(500).json({ success: false, message: "Error retrieving audit logs" });
        }
    }
);

module.exports = router;