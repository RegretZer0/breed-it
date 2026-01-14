const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const Swine = require("../models/Swine");
const Farmer = require("../models/UserFarmer");
const Counter = require("../models/Counter"); // ✅ ATOMIC COUNTER

const { requireSessionAndToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");

// ----------------------
// Add new swine
// ----------------------
router.post(
  "/add",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    const {
      farmer_id,
      sex,
      color,
      breed,
      birthDate,
      status,
      sireId,
      damId,
      inventoryStatus,
      dateTransfer,
      batch,
    } = req.body;

    try {
      if (!farmer_id || !sex || !batch) {
        return res.status(400).json({
          success: false,
          message: "Farmer ID, sex, and batch are required",
        });
      }

      const user = req.user;
      const managerId =
        user.role === "farm_manager" ? user.id : user.managerId;

      if (!managerId) {
        return res.status(403).json({
          success: false,
          message: "Manager account not linked",
        });
      }

      const farmer = await Farmer.findOne({
        _id: farmer_id,
        $or: [
          { managerId: managerId },
          { registered_by: managerId },
          { user_id: managerId } // optional if legacy
        ]
      });

      if (!farmer) {
        return res.status(400).json({
          success: false,
          message: "Farmer not found or not under this manager",
        });
      }

      /* =========================
         ATOMIC SWINE ID GENERATION
      ========================= */
      const counter = await Counter.findOneAndUpdate(
        { name: "swine" },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );

      // Global unique swine ID
      const swineId = `E-${String(counter.seq).padStart(6, "0")}`;

      /* =========================
         CREATE SWINE (FINAL)
      ========================= */
      const newSwine = new Swine({
        swine_id: swineId,
        batch,
        registered_by: managerId,
        farmer_id: farmer._id,
        sex,
        color,
        breed,
        birth_date: birthDate,
        status,
        sire_id: sireId,
        dam_id: damId,
        inventory_status: inventoryStatus,
        date_transfer: dateTransfer,
      });

      await newSwine.save();

      console.log(`[ADD SWINE] ${swineId} added under manager ${managerId}`);

      res.status(201).json({
        success: true,
        message: "Swine added successfully",
        swine: newSwine,
      });
    } catch (error) {
      console.error("[ADD SWINE ERROR]:", error);
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  }
);

// ----------------------
// Get all swine (manager / encoder / farmer)
// ----------------------
router.get(
  "/",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder", "farmer"),
  async (req, res) => {
    const user = req.user;

    try {
      let swine;

      if (user.role === "farm_manager") {
        const farmers = await Farmer.find({ registered_by: user.id });
        swine = await Swine.find({
          farmer_id: { $in: farmers.map((f) => mongoose.Types.ObjectId(f._id)) },
        }).populate("farmer_id", "first_name last_name");
      } else if (user.role === "encoder") {
        const farmers = await Farmer.find({
          registered_by: user.managerId,
        });
        swine = await Swine.find({
          farmer_id: { $in: farmers.map((f) => mongoose.Types.ObjectId(f._id)) },
        }).populate("farmer_id", "first_name last_name");
        } else if (user.role === "farmer") {
          // ✅ FIX: derive farmer profile
          const farmer = await Farmer.findOne({
            $or: [
              { user_id: new mongoose.Types.ObjectId(user.id) },
              { email: user.email },
            ],
          }).select("_id");

          if (!farmer) {
            return res.status(404).json({
              success: false,
              message: "Farmer profile not found",
            });
          }

          swine = await Swine.find({
            farmer_id: farmer._id,
          }).populate("farmer_id", "first_name last_name");
        }


      const swineData = swine.map((s) => ({
        _id: s._id,
        swine_id: s.swine_id,
        batch: s.batch,
        sex: s.sex,
        breed: s.breed,
        status: s.status,
        color: s.color,
        inventory_status: s.inventory_status,
        date_transfer: s.date_transfer,
        date_registered: s.date_registered,
        sire_id: s.sire_id,
        dam_id: s.dam_id,
        farmer_name: s.farmer_id
          ? `${s.farmer_id.first_name} ${s.farmer_id.last_name}`.trim()
          : "N/A",
      }));

      res.json({ success: true, swine: swineData });
    } catch (error) {
      console.error("[SWINE FETCH ERROR]:", error);
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  }
);

// ----------------------
// Update swine
// ----------------------
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
      if (!swine)
        return res
          .status(404)
          .json({ success: false, message: "Swine not found" });

      const farmer = await Farmer.findById(swine.farmer_id);

      if (
        user.role === "farmer" &&
        swine.farmer_id.toString() !== user.farmerProfileId
      )
        return res
          .status(403)
          .json({ success: false, message: "Access denied" });

      if (
        user.role === "encoder" &&
        farmer.registered_by.toString() !== user.managerId
      )
        return res
          .status(403)
          .json({ success: false, message: "Access denied" });

      if (
        user.role === "farm_manager" &&
        farmer.registered_by.toString() !== user.id
      )
        return res
          .status(403)
          .json({ success: false, message: "Access denied" });

      const allowedFields = [
        "sex",
        "color",
        "breed",
        "birth_date",
        "status",
        "sire_id",
        "dam_id",
        "inventory_status",
        "date_transfer",
        "batch",
      ];

      allowedFields.forEach((field) => {
        if (updates[field] !== undefined) {
          swine[field] = updates[field];
        }
      });

      await swine.save();

      res.json({
        success: true,
        message: "Swine updated successfully",
        swine,
      });
    } catch (error) {
      console.error("[UPDATE SWINE ERROR]:", error);
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  }
);

// ----------------------
// Get all swine for manager/encoder
// ----------------------
router.get(
  "/all",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const user = req.user;
      const managerId =
        user.role === "farm_manager" ? user.id : user.managerId;

      if (!managerId) {
        return res
          .status(403)
          .json({ success: false, message: "Manager not linked" });
      }

      const farmers = await Farmer.find({ registered_by: managerId }).select(
        "_id"
      );
      const farmerIds = farmers.map((f) => f._id);

      const swine = await Swine.find({
        $or: [
          { farmer_id: { $in: farmerIds } },
          { registered_by: managerId }
        ]
      })
        .populate("farmer_id", "first_name last_name")
        .lean();

      res.json({ success: true, swine });
    } catch (err) {
      console.error("[SWINE FETCH ALL ERROR]:", err);
      res.status(500).json({
        success: false,
        message: "Server error",
        error: err.message,
      });
    }
  }
);

// ----------------------
// Get swine assigned to the logged-in farmer (FINAL FIX)
// ----------------------
const { requireApiLogin } = require("../middleware/pageAuth.middleware");

router.get(
  "/farmer",
  requireApiLogin,
  allowRoles("farmer"),
  async (req, res) => {
    try {
      const user = req.user;
      const userId = user.id || user._id;

      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid session user ID",
        });
      }

      const farmer = await Farmer.findOne({
        $or: [
          { user_id: new mongoose.Types.ObjectId(userId) },
          { email: user.email },
        ],
      }).select("_id");

      if (!farmer) {
        return res.status(404).json({
          success: false,
          message: "Farmer profile not found",
        });
      }

      const swine = await Swine.find({
        farmer_id: farmer._id,
      }).lean();

      return res.json({
        success: true,
        swine,
      });
    } catch (err) {
      console.error("[SWINE FETCH FOR FARMER ERROR]:", err);
      return res.status(500).json({
        success: false,
        message: "Server error",
        error: err.message,
      });
    }
  }
);


// ----------------------
// Get only male swine
// ----------------------
router.get(
  "/males",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  async (req, res) => {
    try {
      const user = req.user;
      const managerId =
        user.role === "farm_manager" ? user.id : user.managerId;

      const farmers = await Farmer.find({ registered_by: managerId }).select(
        "_id"
      );
      const farmerIds = farmers.map((f) => mongoose.Types.ObjectId(f._id));

      const males = await Swine.find({
        sex: "Male",
        farmer_id: { $in: farmerIds },
      })
        .populate("farmer_id", "first_name last_name")
        .lean();

      res.json({ success: true, males });
    } catch (err) {
      console.error("[SWINE FETCH MALES ERROR]:", err);
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }
);

module.exports = router;
