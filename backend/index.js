const express = require("express");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const session = require("express-session");
const MongoStore = require("connect-mongo").default;
const fs = require("fs");

// =======================
// ROUTES
// =======================
const authRoutes = require("./routes/authRoutes.js");
const { isAuthenticated, isAdmin, isFarmer } = require("./middleware/authMiddleware");
const swineRoutes = require("./routes/swineRoutes.js");
const heatReportRoutes = require("./routes/heatReportRoutes.js");
const swinePerformanceRoutes = require("./routes/swinePerformanceRoutes.js");
const breedingRoutes = require("./routes/breedingRoutes.js");
const farmerRoutes = require("./routes/farmerRoutes.js");

// ✅ PAGE AUTH MIDDLEWARE
const {
  requireAuthPage,
  requireAdminPage,
  requireFarmerPage
} = require("./middleware/pageAuth");

// ✅ NO-CACHE MIDDLEWARE (ADDED)
const noCache = require("./middleware/noCache");

// =======================
// ENV
// =======================
dotenv.config();

const app = express();

// =======================
// VIEW ENGINE (EJS)
// =======================
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../frontend/views"));

// =======================
// CORS
// =======================
app.use(
  cors({
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    credentials: true,
  })
);

// =======================
// BODY PARSERS
// =======================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =======================
// STATIC FILES
// =======================
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(path.join(__dirname, "..", "frontend")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// =======================
// MONGODB
// =======================
if (!process.env.MONGO_URI) {
  console.error("❌ ERROR: MONGO_URI missing in .env");
  process.exit(1);
}

mongoose
  .connect(process.env.MONGO_URI, { autoIndex: true })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => {
    console.error("❌ MongoDB Connection Failed:", err);
    process.exit(1);
  });

// =======================
// SESSION
// =======================
app.use(session({
  secret: process.env.SESSION_SECRET || "some_secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    path: "/",          // 🔒 REQUIRED FOR CLEARING
    httpOnly: true,
    sameSite: "lax",
  },
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    ttl: 24 * 60 * 60,
  }),
}));


// ❌ REMOVED GLOBAL CACHE BLOCK (THIS WAS THE PROBLEM)

// =======================
// API ROUTES
// =======================
app.use("/api/auth", authRoutes);
app.use("/api/swine", swineRoutes);
app.use("/api/heat", heatReportRoutes);
app.use("/api/swine-records", swinePerformanceRoutes);
app.use("/api/breeding", breedingRoutes);
app.use("/api/farmer", farmerRoutes);

// =======================
// HEALTH CHECK
// =======================
app.get("/", (req, res) => {
  res.send("BreedIT Backend is running...");
});

// =======================
// PUBLIC PAGES
// =======================
app.get("/landing_page", (req, res) =>
  res.render("pages/auth/landing_page", { page_title: "Landing Page" })
);

app.get("/login", (req, res) =>
  res.render("pages/auth/login", { page_title: "Login" })
);

app.get("/register", (req, res) =>
  res.render("pages/auth/register", { page_title: "Register" })
);

// =======================
// ADMIN PAGES (PROTECTED + NO CACHE)
// =======================
app.get("/admin/dashboard", noCache, requireAdminPage, (req, res) =>
  res.render("pages/admin/admin_dashboard", {
    page_title: "Admin Dashboard",
    current_page: "dashboard",
    user: req.session.user,
  })
);

app.get("/admin/reports", noCache, requireAdminPage, (req, res) =>
  res.render("pages/admin/reports", {
    page_title: "Reports",
    current_page: "reports",
  })
);

app.get("/admin/breed-analysis", noCache, requireAdminPage, (req, res) =>
  res.render("pages/admin/breed_analysis", {
    page_title: "Breed Analysis",
    current_page: "breed_analysis",
  })
);

// USER MANAGEMENT
app.get("/admin/users/new", noCache, requireAdminPage, (req, res) =>
  res.render("pages/admin/user-management/create_account", {
    page_title: "Create Account",
    current_page: "create_account",
  })
);

app.get("/admin/users/manage", noCache, requireAdminPage, (req, res) =>
  res.render("pages/admin/user-management/manage_account", {
    page_title: "Manage Accounts",
    current_page: "manage_account",
  })
);

// PIG MANAGEMENT
app.get("/admin/pigs/overview", noCache, requireAdminPage, (req, res) =>
  res.render("pages/admin/pig-management/overview", {
    page_title: "Pig Management Overview",
    current_page: "overview",
  })
);

app.get("/admin/pigs/register", noCache, requireAdminPage, (req, res) =>
  res.render("pages/admin/pig-management/register_pig", {
    page_title: "Register Pig",
    current_page: "register_pig",
  })
);

// =======================
// FARMER PAGES (PROTECTED + NO CACHE)
// =======================
app.get("/farmer/dashboard", noCache, requireFarmerPage, (req, res) =>
  res.render("pages/farmer/farmer_dashboard", {
    page_title: "Farmer Dashboard",
    current_page: "farmer_dashboard",
    user: req.session.user,
  })
);

app.get("/farmer/pigs", noCache, requireFarmerPage, (req, res) =>
  res.render("pages/farmer/mypigs", {
    page_title: "MyPigs",
    current_page: "mypigs",
    user: req.session.user,
  })
);

app.get("/farmer/reports", noCache, requireFarmerPage, (req, res) =>
  res.render("pages/farmer/report", {
    page_title: "Reports",
    current_page: "reports",
    user: req.session.user,
  })
);

app.get("/farmer/profile", noCache, requireFarmerPage, (req, res) =>
  res.render("pages/farmer/profile", {
    page_title: "Profile",
    current_page: "profile",
    user: req.session.user,
  })
);

app.get("/farmer/help", noCache, requireFarmerPage, (req, res) =>
  res.render("pages/farmer/help", {
    page_title: "Help",
    current_page: "help",
    user: req.session.user,
  })
);

// =======================
// DEBUG VIEW CHECK
// =======================
app.get("/__debug_views__", (req, res) => {
  const viewsDir = app.get("views");
  const pageFile = path.join(viewsDir, "pages", "viewjs.ejs");
  res.json({
    viewsDir,
    pageFile,
    exists: fs.existsSync(pageFile),
  });
});

// =======================
// 404 HANDLER
// =======================
app.use((req, res) => {
  if (req.originalUrl.startsWith("/api/")) {
    return res.status(404).json({ error: "API route not found" });
  }

  const view404 = path.join(app.get("views"), "pages", "404.ejs");
  if (fs.existsSync(view404)) {
    return res.status(404).render("pages/404");
  }

  res.status(404).send("404 - Not Found");
});

// =======================
// START SERVER
// =======================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);
