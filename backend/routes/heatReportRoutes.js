const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");

const HeatReport = require("../models/HeatReports");
const Swine = require("../models/Swine");
const Farmer = require("../models/UserFarmer");
const Notification = require("../models/Notifications");
const UserModel = require("../models/UserModel");
const AIRecord = require("../models/AIRecord");
const logAction = require("../middleware/logger");

const { requireApiLogin } = require("../middleware/pageAuth.middleware");
const { allowRoles } = require("../middleware/roleMiddleware");

/* ======================================================
    HELPERS
====================================================== */
const uploadDir = "uploads/";
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) =>
        cb(null, Date.now() + "-" + Math.round(Math.random() * 1E9) + path.extname(file.originalname))
});

const upload = multer({ 
    storage,
    limits: { fileSize: 10 * 1024 * 1024 } 
});

/**
 * UPDATED: logic to cap score at 100
 */
const calculateProbability = (signs) => {
    const weights = {
        "Reddened Vulva": 10,
        "Swollen Vulva": 60,
        "Mucous Discharge": 15,
        "Seeking the Boar": 20,
        "Perked/Twitching Ears": 40,
        "Standing Reflex": 50,
        "Back Pressure Test": 30
    };
    let score = 0;
    const parsedSigns = Array.isArray(signs) ? signs : [];
    
    parsedSigns.forEach(sign => {
        if (weights[sign]) score += weights[sign];
    });

    // Ensures it never exceeds 100
    return score > 100 ? 100 : score;
};

const notifyBreedingTeam = async (managerId, farmerUserId, title, message, type = "info") => {
    try {
        const staff = await UserModel.find({
            $or: [
                { _id: managerId },
                { manager_id: managerId, role: "encoder" }
            ]
        }).select("_id");

        const userIds = staff.map(u => u._id);
        
        if (farmerUserId && !userIds.some(id => id.equals(farmerUserId))) {
            userIds.push(farmerUserId);
        }

        const notifications = userIds.map(id => ({
            user_id: id,
            title,
            message,
            type
        }));

        if (notifications.length > 0) {
            await Notification.insertMany(notifications);
        }
    } catch (err) {
        console.error("Notification Helper Error:", err);
    }
};

/* ======================================================
    ADD NEW HEAT REPORT
====================================================== */
router.post(
    "/add",
    requireApiLogin,
    allowRoles("farm_manager", "encoder", "farmer"),
    upload.array("evidence", 5),
    async (req, res) => {
        try {
            const { swineId, signs } = req.body;
            const files = req.files;

            if (!swineId || !signs || !files || files.length === 0) {
                return res.status(400).json({ success: false, message: "Swine ID, signs, and evidence are required" });
            }

            let farmer = await Farmer.findOne({
                $or: [{ _id: req.user.farmerProfileId }, { user_id: req.user.id }]
            });

            if (!farmer) return res.status(404).json({ success: false, message: "Farmer profile not found" });

            const swine = await Swine.findOne({ swine_id: swineId });
            if (!swine) return res.status(404).json({ success: false, message: "Swine not found" });

            const evidenceData = files.map(file => `/uploads/${file.filename}`);
            const parsedSigns = Array.isArray(signs) ? signs : JSON.parse(signs);

            const newReport = new HeatReport({
                swine_id: swine._id,
                farmer_id: farmer._id,
                manager_id: farmer.managerId,
                signs: parsedSigns,
                standing_reflex: parsedSigns.includes("Standing Reflex"),
                back_pressure_test: parsedSigns.includes("Back Pressure Test"),
                evidence_url: evidenceData,
                heat_probability: calculateProbability(parsedSigns),
                status: "pending"
            });

            await newReport.save();
            await logAction(req.user.id, "ADD_HEAT_REPORT", "BREEDING", `Farmer ${farmer.first_name} submitted a heat report for Swine ${swineId}.`, req);

            await notifyBreedingTeam(
                farmer.managerId, 
                null, 
                "New Heat Report", 
                `Farmer ${farmer.first_name} submitted a heat report for Swine ${swine.swine_id}.`
            );

            res.status(201).json({ success: true, report: newReport });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

/* ======================================================
    GET ROUTES
====================================================== */
router.get("/all", requireApiLogin, allowRoles("farm_manager", "encoder"), async (req, res) => {
    try {
        const managerId = req.user.role === "farm_manager" ? req.user.id : req.user.managerId;
        const reports = await HeatReport.find({ manager_id: managerId })
            .populate("swine_id", "swine_id breed current_status")
            .populate("farmer_id", "first_name last_name farmer_id user_id")
            .sort({ createdAt: -1 }).lean();
        res.json({ success: true, reports });
    } catch (err) {
        res.status(500).json({ success: false, message: "Failed to fetch reports" });
    }
});

router.get("/:id/detail", requireApiLogin, async (req, res) => {
    try {
        const report = await HeatReport.findById(req.params.id).populate("swine_id").populate("farmer_id").lean();
        if (!report) return res.status(404).json({ success: false, message: "Report not found" });
        res.json({ success: true, report });
    } catch (err) {
        res.status(500).json({ success: false, message: "Error fetching report" });
    }
});

router.get("/farmer", requireApiLogin, allowRoles("farmer", "farm_manager", "encoder"), async (req, res) => {
    try {
        if (!req.user.farmerProfileId) return res.status(400).json({ success: false, message: "Farmer profile not linked" });
        const reports = await HeatReport.find({ farmer_id: req.user.farmerProfileId })
            .populate("swine_id", "swine_id breed current_status")
            .sort({ createdAt: -1 }).lean();
        res.json({ success: true, reports });
    } catch (err) {
        res.status(500).json({ success: false, message: "Failed to fetch reports" });
    }
});

/* ======================================================
    APPROVE HEAT REPORT
====================================================== */
router.post("/:id/approve", requireApiLogin, allowRoles("farm_manager"), async (req, res) => {
    try {
        const report = await HeatReport.findById(req.params.id).populate("swine_id").populate("farmer_id");
        if (!report) return res.status(404).json({ success: false, message: "Report not found" });

        const now = new Date();
        const scheduledInsemination = new Date(now);
        scheduledInsemination.setDate(now.getDate() + 2);

        report.status = "approved";
        report.approved_at = now;
        report.approved_by = req.user.id;
        report.next_heat_check = scheduledInsemination; 
        await report.save();

        const swine = await Swine.findById(report.swine_id);
        const nextCycleNumber = (swine.breeding_cycles?.length || 0) + 1;

        await Swine.findByIdAndUpdate(report.swine_id, { 
            current_status: "In-Heat",
            $push: {
                breeding_cycles: {
                    cycle_number: nextCycleNumber,
                    heat_report_id: report._id,
                    estrus_date: report.approved_at,
                    is_pregnant: false
                }
            }
        });

        await logAction(req.user.id, "APPROVE_HEAT_REPORT", "BREEDING", `Approved heat for Swine ${swine.swine_id}.`, req);

        await notifyBreedingTeam(
            req.user.id, 
            report.farmer_id.user_id, 
            "Heat Approved", 
            `Swine ${swine.swine_id} is approved for AI on ${scheduledInsemination.toLocaleDateString()}.`,
            "success"
        );
        
        res.json({ success: true, message: "Report approved." });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* ======================================================
    CONFIRM AI
====================================================== */
router.post("/:id/confirm-ai", requireApiLogin, allowRoles("farm_manager"), async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { maleSwineId } = req.body;
        if(!maleSwineId) throw new Error("Male Swine ID is required.");

        const report = await HeatReport.findById(req.params.id).populate("swine_id").populate("farmer_id");
        if (!report) throw new Error("Report not found");
        
        const now = new Date();
        const newAIRecord = new AIRecord({
            insemination_id: `AI-${Date.now()}`,
            swine_id: report.swine_id._id,
            swine_code: report.swine_id.swine_id,
            male_swine_id: maleSwineId,
            manager_id: req.user.id,
            farmer_id: report.farmer_id._id,
            heat_report_id: report._id,
            insemination_date: now,
            ai_confirmed: true,
            ai_confirmed_at: now,
            status: "Ongoing"
        });
        await newAIRecord.save({ session });

        report.status = "under_observation";
        report.ai_confirmed_at = now;
        const heatCheckDate = new Date();
        heatCheckDate.setDate(heatCheckDate.getDate() + 21);    
        report.next_heat_check = heatCheckDate;
        await report.save({ session });

        await Swine.updateOne(
            { _id: report.swine_id._id, "breeding_cycles.heat_report_id": report._id },
            { 
                $set: { 
                    "breeding_cycles.$.ai_service_date": now,
                    "breeding_cycles.$.ai_record_id": newAIRecord._id,
                    "breeding_cycles.$.cycle_sire_id": maleSwineId,
                    current_status: "Under Observation" 
                }
            },
            { session }
        );

        await logAction(req.user.id, "CONFIRM_AI", "BREEDING", `AI Confirmed for Swine ${report.swine_id.swine_id}.`, req);

        await notifyBreedingTeam(
            req.user.id, 
            report.farmer_id.user_id, 
            "AI Confirmed", 
            `AI completed for Swine ${report.swine_id.swine_id}. Now under observation.`,
            "info"
        );

        await session.commitTransaction();
        res.json({ success: true, message: "AI Record created." });
    } catch (err) {
        await session.abortTransaction();
        res.status(500).json({ success: false, message: err.message });
    } finally {
        session.endSession();
    }
});

/* ======================================================
    CONFIRM PREGNANCY
====================================================== */
router.post("/:id/confirm-pregnancy", requireApiLogin, allowRoles("farmer", "farm_manager"), async (req, res) => {
    try {
        const report = await HeatReport.findById(req.params.id).populate("swine_id").populate("farmer_id");
        if (!report) return res.status(404).json({ success: false, message: "Report not found" });

        const confirmationDate = new Date(); 
        const farrowingDate = new Date(confirmationDate);
        farrowingDate.setDate(confirmationDate.getDate() + 10);

        report.status = "pregnant";
        report.expected_farrowing = farrowingDate;
        report.pregnancy_confirmed_at = confirmationDate;
        await report.save();

        await AIRecord.findOneAndUpdate({ heat_report_id: report._id }, { 
            pregnancy_confirmed: true,
            status: "Success",
            farrowing_date: farrowingDate
        });

        await Swine.updateOne(
            { _id: report.swine_id._id, "breeding_cycles.heat_report_id": report._id },
            { 
                $set: { 
                    "breeding_cycles.$.is_pregnant": true,
                    "breeding_cycles.$.pregnancy_check_date": confirmationDate,
                    "breeding_cycles.$.expected_farrowing_date": farrowingDate,
                    current_status: "Pregnant"
                }
            }
        );

        await logAction(req.user.id, "CONFIRM_PREGNANCY", "BREEDING", `Pregnancy confirmed for Swine ${report.swine_id.swine_id}.`, req);

        await notifyBreedingTeam(
            report.manager_id, 
            report.farmer_id.user_id, 
            "Pregnancy Confirmed", 
            `Swine ${report.swine_id.swine_id} is pregnant! Expected farrowing: ${farrowingDate.toLocaleDateString()}.`,
            "success"
        );

        res.json({ success: true, expected_farrowing: report.expected_farrowing });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error confirming pregnancy" });
    }
});

/* ======================================================
    UPGRADED CONFIRM FARROWING
====================================================== */
router.post("/:id/confirm-farrowing", requireApiLogin, allowRoles("farm_manager"), async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { total_live, mummified, stillborn, farrowing_date } = req.body;
        const report = await HeatReport.findById(req.params.id).populate("swine_id").populate("farmer_id");
        
        if (!report) return res.status(404).json({ success: false, message: "Report not found" });

        const aiRecord = await AIRecord.findOne({ heat_report_id: report._id });
        const farrowDate = farrowing_date ? new Date(farrowing_date) : new Date();
        const sow = await Swine.findById(report.swine_id._id);
        const sire_id = aiRecord ? aiRecord.male_swine_id : "Unknown Boar"; 

        // 1. Update Heat Report
        report.status = "lactating"; 
        report.actual_farrowing_date = farrowDate;
        await report.save({ session });

        // 2. Update AI Record
        if (aiRecord) {
            aiRecord.status = "Success";
            aiRecord.farrowing_date = farrowDate;
            await aiRecord.save({ session });
        }

        // 3. Update the Sow & Increment Parity
        const currentParity = (sow.parity || 0) + 1;
        await Swine.updateOne(
            { _id: sow._id, "breeding_cycles.heat_report_id": report._id },
            { 
                $set: { 
                    "breeding_cycles.$.is_pregnant": false,
                    "breeding_cycles.$.farrowed": true,
                    "breeding_cycles.$.actual_farrowing_date": farrowDate,
                    "breeding_cycles.$.farrowing_results": {
                        total_piglets: Number(total_live) + Number(stillborn) + Number(mummified),
                        live_piglets: Number(total_live),
                        mortality_count: Number(stillborn) + Number(mummified)
                    },
                    current_status: "Lactating" 
                },
                $inc: { parity: 1 } 
            },
            { session }
        );

        // 4. GENERATE LIVE PIGLETS
        const liveCount = Number(total_live);
        for (let i = 1; i <= liveCount; i++) {
            const pigletId = `PIG-${sow.swine_id}-${farrowDate.getFullYear()}${(farrowDate.getMonth()+1)}${farrowDate.getDate()}-${i}`;
            
            const newPiglet = new Swine({
                swine_id: pigletId,
                registered_by: req.user.id,
                farmer_id: report.farmer_id._id,
                manager_id: report.manager_id, // Inherit manager
                sex: i % 2 === 0 ? "Female" : "Male",
                breed: sow.breed,
                birth_date: farrowDate,
                sire_id: sire_id, 
                dam_id: sow.swine_id, 
                birth_cycle_number: currentParity, // Correctly linked to the current parity
                current_status: "Monitoring (Day 1-30)",
                age_stage: "Monitoring (Day 1-30)",
                performance_records: [{
                    stage: "Registration",
                    record_date: farrowDate,
                    remarks: "Auto-registered from farrowing report",
                    recorded_by: req.user.id
                }]
            });
            await newPiglet.save({ session });
        }

        await logAction(req.user.id, "CONFIRM_FARROWING", "BREEDING", `Farrowing confirmed for Swine ${sow.swine_id}. ${liveCount} piglets added.`, req);

        await notifyBreedingTeam(
            report.manager_id, 
            report.farmer_id.user_id, 
            "Farrowing Confirmed", 
            `Swine ${sow.swine_id} has farrowed ${liveCount} live piglets.`,
            "success"
        );

        await session.commitTransaction();
        res.json({ success: true, message: `Farrowing confirmed. ${liveCount} piglets registered.` });
    } catch (err) {
        await session.abortTransaction();
        res.status(500).json({ success: false, message: err.message });
    } finally {
        session.endSession();
    }
});

/* ======================================================
    CONFIRM WEANING
====================================================== */
router.post("/:id/confirm-weaning", requireApiLogin, allowRoles("farmer", "farm_manager"), async (req, res) => {
    try {
        const report = await HeatReport.findById(req.params.id).populate("swine_id").populate("farmer_id");
        if (!report) return res.status(404).json({ success: false, message: "Report not found" });
        if (report.status !== "lactating") return res.status(400).json({ success: false, message: "Only lactating sows can be weaned." });

        const now = new Date();
        report.status = "completed"; 
        report.weaning_date = now;
        await report.save();

        await AIRecord.findOneAndUpdate({ heat_report_id: report._id }, { status: "Completed" });

        await Swine.updateOne(
            { _id: report.swine_id._id, "breeding_cycles.heat_report_id": report._id },
            { $set: { "breeding_cycles.$.weaning_date": now, current_status: "Open" } }
        );

        await logAction(req.user.id, "CONFIRM_WEANING", "BREEDING", `Weaning confirmed for Swine ${report.swine_id.swine_id}.`, req);

        await notifyBreedingTeam(
            report.manager_id, 
            report.farmer_id.user_id, 
            "Sow Weaned", 
            `Swine ${report.swine_id.swine_id} has been weaned and is now Open.`,
            "info"
        );

        res.json({ success: true, message: "Weaning confirmed. Swine is now Open." });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* ======================================================
    STILL IN HEAT (Cycle Reset)
====================================================== */
router.post("/:id/still-heat", requireApiLogin, allowRoles("farmer", "farm_manager"), async (req, res) => {
    try {
        const report = await HeatReport.findById(req.params.id).populate("swine_id").populate("farmer_id");
        if(!report) return res.status(404).json({ success: false, message: "Report not found" });

        report.status = "approved"; 
        report.next_heat_check = null;
        report.expected_farrowing = null;
        await report.save();

        await AIRecord.findOneAndUpdate({ heat_report_id: report._id, status: "Ongoing" }, { 
            still_in_heat: true, 
            status: "Failed" 
        });

        await Swine.findByIdAndUpdate(report.swine_id._id, { current_status: "In-Heat" });

        await logAction(req.user.id, "STILL_IN_HEAT", "BREEDING", `Still In Heat for Swine ${report.swine_id.swine_id}.`, req);

        await notifyBreedingTeam(
            report.manager_id, 
            report.farmer_id.user_id, 
            "Breeding Cycle Reset", 
            `Swine ${report.swine_id.swine_id} is still in heat. Cycle reset.`,
            "warning"
        );

        res.json({ success: true, message: "Cycle reset." });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/* ======================================================
    CALENDAR EVENTS
====================================================== */
router.get("/calendar-events", requireApiLogin, allowRoles("farm_manager", "encoder", "farmer"), async (req, res) => {
    try {
        const user = req.user;
        let query = { status: { $in: ["approved", "under_observation", "pregnant", "lactating"] } };

        if (user.role === "farmer") {
            if (!user.farmerProfileId) return res.status(400).json({ success: false, message: "Farmer profile not linked" });
            query.farmer_id = user.farmerProfileId;
        } else {
            query.manager_id = user.role === "farm_manager" ? user.id : user.managerId;
        }

        const reports = await HeatReport.find(query).populate("swine_id", "swine_id").lean();
        const events = [];

        reports.forEach(r => {
            const swineCode = r.swine_id?.swine_id || 'Unknown';
            if (r.status === "approved" && r.next_heat_check) {
                events.push({ id: r._id, title: `💉 AI Due: ${swineCode}`, start: r.next_heat_check.toISOString().split("T")[0], backgroundColor: "#3498db", allDay: true });
            }
            if (r.status === "under_observation" && r.next_heat_check) {
                events.push({ id: r._id, title: `🔍 Heat Re-check: ${swineCode}`, start: r.next_heat_check.toISOString().split("T")[0], backgroundColor: "#f39c12", allDay: true });
            }
            if (r.status === "pregnant" && r.expected_farrowing) {
                events.push({ id: r._id, title: `🐷 Farrowing: ${swineCode}`, start: r.expected_farrowing.toISOString().split("T")[0], backgroundColor: "#27ae60", allDay: true });
            }
            const farrowDate = r.actual_farrowing_date || r.expected_farrowing;
            if (r.status === "lactating" && farrowDate) {
                const weaningDate = new Date(farrowDate);
                weaningDate.setDate(weaningDate.getDate() + 30);
                events.push({ id: r._id, title: `🍼 Weaning Due: ${swineCode}`, start: weaningDate.toISOString().split("T")[0], backgroundColor: "#9b59b6", allDay: true });
            }
        });
        res.json({ success: true, events });
    } catch (err) {
        res.status(500).json({ success: false, message: "Failed to fetch calendar" });
    }
});

/* ======================================================
    REJECT HEAT REPORT
====================================================== */
router.post("/:id/reject", requireApiLogin, allowRoles("farm_manager"), async (req, res) => {
    try {
        const { reason } = req.body; 
        const report = await HeatReport.findById(req.params.id).populate("swine_id").populate("farmer_id");
        if (!report) return res.status(404).json({ success: false, message: "Report not found" });

        report.status = "rejected";
        report.rejection_message = reason; 
        report.rejected_at = new Date();
        await report.save();

        await logAction(req.user.id, "REJECT_HEAT_REPORT", "BREEDING", `Rejected heat report for Swine ${report.swine_id.swine_id}.`, req);

        await Notification.create({
            user_id: report.farmer_id.user_id,
            title: "Heat Report Rejected",
            message: `Your report for Swine ${report.swine_id.swine_id} was rejected. Reason: ${reason}`,
            type: "danger"
        });

        res.json({ success: true, message: "Report rejected." });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;