const express = require("express");
const router = express.Router();

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
   FARMER PAGES
========================= */

// Farmer Dashboard
router.get("/farmer/dashboard", (req, res) => {
  res.render("pages/farmer/farmer_dashboard", {
    page_title: "Farmer Dashboard",
    current_page: "farmer_dashboard",
  });
});

// My Pigs
router.get("/farmer/mypigs", (req, res) => {
  res.render("pages/farmer/mypigs", {
    page_title: "My Pigs",
    current_page: "mypigs",
  });
});

// Farmer Profile
router.get("/farmer/profile", (req, res) => {
  res.render("pages/farmer/profile", {
    page_title: "Profile",
    current_page: "profile",
  });
});

// Farmer Reports
router.get("/farmer/report", (req, res) => {
  res.render("pages/farmer/report", {
    page_title: "Reports",
    current_page: "report",
  });
});

// Farmer Help
router.get("/farmer/help", (req, res) => {
  res.render("pages/farmer/help", {
    page_title: "Help",
    current_page: "help",
  });
});

/* =========================
   FARM MANAGER PAGES
========================= */

// Dashboard
router.get("/farm-manager/dashboard", (req, res) => {
  res.render("pages/farm-manager/dashboard", {
    page_title: "Farm Manager Dashboard",
    current_page: "dashboard",
  });
});

// Breed Analysis
router.get("/farm-manager/breed-analysis", (req, res) => {
  res.render("pages/farm-manager/breed_analysis", {
    page_title: "Breed Analysis",
    current_page: "breed_analysis",
  });
});

// Reports
router.get("/farm-manager/reports", (req, res) => {
  res.render("pages/farm-manager/reports", {
    page_title: "Reports",
    current_page: "reports",
  });
});

/* =========================
   FARM MANAGER – USER MANAGEMENT
========================= */

// Create Account
router.get("/farm-manager/user-management/create", (req, res) => {
  res.render("pages/farm-manager/user-management/create_account", {
    page_title: "Create Account",
    current_page: "create_account",
  });
});

// Manage Account
router.get("/farm-manager/user-management/manage", (req, res) => {
  res.render("pages/farm-manager/user-management/manage_account", {
    page_title: "Manage Account",
    current_page: "manage_account",
  });
});

/* =========================
   FARM MANAGER – PIG MANAGEMENT
========================= */

// Pig Management Overview
router.get("/farm-manager/pig-management", (req, res) => {
  res.render("pages/farm-manager/pig-management/overview", {
    page_title: "Pig Management Overview",
    current_page: "pig_management_overview",
  });
});

// Register Pig
router.get("/farm-manager/pig-management/register", (req, res) => {
  res.render("pages/farm-manager/pig-management/register_pig", {
    page_title: "Pig Management RegPig",
    current_page: "pig_management_register",
  });
});


module.exports = router;
