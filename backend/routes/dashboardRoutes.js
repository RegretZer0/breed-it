const express = require("express");
const router = express.Router();

const { requireSessionAndToken } = require("../middleware/authMiddleware");
const { allowRoles } = require("../middleware/roleMiddleware");
const { getFarmManagerStats } = require("../controllers/dashboardController");

router.get(
  "/farm-manager/stats",
  requireSessionAndToken,
  allowRoles("farm_manager", "encoder"),
  getFarmManagerStats
);

module.exports = router;
