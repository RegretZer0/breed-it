const express = require("express");
const router = express.Router();

const {
  requireLogin,
  requireFarmManager,
  requireFarmer,
} = require("../middleware/pageAuth.middleware");

/* =========================
   AUTH / PUBLIC PAGES
========================= */

// Landing Page
router.get("/", (req, res) => {
  res.render("pages/auth/landing_page", {
    page_title: "Landing Page",
    current_page: "landing",
  });
});

// Login
router.get("/login", (req, res) => {
  res.render("pages/auth/login", {
    page_title: "Login",
    current_page: "login",
  });
});

// Register
router.get("/register", (req, res) => {
  res.render("pages/auth/register", {
    page_title: "Register",
    current_page: "register",
  });
});


/* =========================
   FARM MANAGER PAGES
========================= */

// Dashboard
router.get(
  "/farm-manager/dashboard",
  requireLogin,
  requireFarmManager,
  (req, res) => {
    res.render("pages/farm-manager/dashboard", {
      page_title: "Farm Manager Dashboard",
      current_section: "dashboard",
      current_page: "dashboard",
    });
  }
);

// Reproduction Monitoring
router.get(
  "/farm-manager/reproduction-monitoring",
  requireLogin,
  requireFarmManager,
  (req, res) => {
    res.render("pages/farm-manager/reproduction_monitoring", {
      page_title: "Reproduction Monitoring",
      current_section: "reproduction_monitoring",
      current_page: "reproduction_monitoring",
    });
  }
);

/* =========================
   FARM MANAGER – BREED QUALITY ANALYTICS
========================= */

// Breed Quality Analysis
router.get(
  "/farm-manager/breed-quality-analytics/swine-analysis",
  requireLogin,
  requireFarmManager,
  (req, res) => {
    res.render("pages/farm-manager/breed-quality-analytics/swine_analysis", {
      page_title: "Swine Analysis",
      current_section: "analysis",
      current_page: "swine_analysis",
    });
  }
);

// Heat & Breeding Analytics
router.get(
  "/farm-manager/breed-quality-analytics/HBE-analysis",
  requireLogin,
  requireFarmManager,
  (req, res) => {
    res.render("pages/farm-manager/breed-quality-analytics/HBE_analysis", {
      page_title: "HBE Analysis",
      current_section: "HBE analysis",
      current_page: "HBE_analysis",
    });
  }
);

// Reports
router.get(
  "/farm-manager/reports",
  requireLogin,
  requireFarmManager,
  (req, res) => {
    res.render("pages/farm-manager/reports", {
      page_title: "Reports",
      current_section: "reports",
      current_page: "reports",
    });
  }
);

/* =========================
   FARM MANAGER – USER MANAGEMENT
========================= */

// Create Account
router.get(
  "/farm-manager/user-management/create",
  requireLogin,
  requireFarmManager,
  (req, res) => {
    res.render("pages/farm-manager/user-management/create_account", {
      page_title: "Create Account",
      current_section: "user_management",
      current_page: "create_account",
    });
  }
);

// Manage Account
router.get(
  "/farm-manager/user-management/manage",
  requireLogin,
  requireFarmManager,
  (req, res) => {
    res.render("pages/farm-manager/user-management/manage_account", {
      page_title: "Manage Account",
      current_section: "user_management",
      current_page: "manage_account",
    });
  }
);

/* =========================
   FARM MANAGER – SWINE MANAGEMENT
========================= */

// Pig Management Overview
router.get(
  "/farm-manager/pig-management",
  requireLogin,
  requireFarmManager,
  (req, res) => {
    res.render("pages/farm-manager/pig-management/overview", {
      page_title: "Pig Management Overview",
      current_section: "pig_management",
      current_page: "overview",
    });
  }
);

// Register Pig
router.get(
  "/farm-manager/pig-management/register",
  requireLogin,
  requireFarmManager,
  (req, res) => {
    res.render("pages/farm-manager/pig-management/register_pig", {
      page_title: "Register Pig",
      current_section: "pig_management",
      current_page: "register_pig",
    });
  }
);

// Master Boar
router.get(
  "/farm-manager/pig-management/master-boars",
  requireLogin,
  requireFarmManager,
  (req, res) => {
    res.render("pages/farm-manager/pig-management/master_boars", {
      page_title: "Master Boars",
      current_section: "pig_management",
      current_page: "master_boars",
    });
  }
);

// Register Boar
router.get(
  "/farm-manager/pig-management/register-boar",
  requireLogin,
  requireFarmManager,
  (req, res) => {
    res.render("pages/farm-manager/pig-management/register_boar", {
      page_title: "Register Boar",
      current_section: "pig_management",
      current_page: "register_boar",
    });
  }
);


/* =========================
   FARMER PAGES
========================= */

// Farmer Dashboard
router.get(
  "/farmer/dashboard",
  requireLogin,
  requireFarmer,
  (req, res) => {
    res.render("pages/farmer/farmer_dashboard", {
      page_title: "Farmer Dashboard",
      current_section: "dashboard",
      current_page: "farmer_dashboard",
      user: req.session.user,
    });
  }
);

// My Pigs
router.get(
  "/farmer/mypigs",
  requireLogin,
  requireFarmer,
  (req, res) => {
    res.render("pages/farmer/mypigs", {
      page_title: "MyPigs",
      current_section: "pigs",
      current_page: "mypigs",
    });
  }
);

// Farmer Profile
router.get(
  "/farmer/profile",
  requireLogin,
  requireFarmer,
  (req, res) => {
    res.render("pages/farmer/profile", {
      page_title: "Profile",
      current_section: "profile",
      current_page: "profile",
    });
  }
);

// Farmer Reports
router.get(
  "/farmer/report",
  requireLogin,
  requireFarmer,
  (req, res) => {
    res.render("pages/farmer/report", {
      page_title: "Report",
      current_section: "report",
      current_page: "report",
    });
  }
);

// Farmer Help
router.get(
  "/farmer/help",
  requireLogin,
  requireFarmer,
  (req, res) => {
    res.render("pages/farmer/help", {
      page_title: "Help",
      current_section: "help",
      current_page: "help",
    });
  }
);



module.exports = router;
