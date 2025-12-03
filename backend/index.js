const express = require("express");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const authRoutes = require("./routes/authRoutes.js");
const swineRoutes = require("./routes/swineRoutes.js");
const heatReportRoutes = require("./routes/heatReportRoutes.js"); // NEW
const swinePerformanceRoutes = require("./routes/swinePerformanceRoutes.js");

// Load environment variables
dotenv.config();

const app = express();

// Set up EJS as the view engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../frontend/views"));

// Enable CORS for frontend
app.use(cors({
  origin: "http://localhost:3000",
  credentials: true
}));

// Enable JSON body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (CSS, JS, images) from backend/public (if any)
app.use(express.static(path.join(__dirname, "public")));

// ALSO serve static files from frontend folder so /css, /js, /images map to frontend/*
// This is important when your styles/scripts/images live in frontend/
app.use(express.static(path.join(__dirname, "..", "frontend")));

// Serve uploaded files statically
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// MongoDB Connection
if (!process.env.MONGO_URI) {
  console.error("❌ MONGO_URI is missing in .env file");
  process.exit(1);
}

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/swine", swineRoutes);
app.use("/api/heat", heatReportRoutes);
app.use("/api/swine-records", swinePerformanceRoutes);

// Optional: Default route to check server
app.get("/", (req, res) => {
  res.send("BreedIT Backend is running...");
});

// ⭐ EJS Page Routes (add one per page)
app.get("/landing_page", (req, res) => {
  res.render("pages/landing_page", {
    page_title: "Landing Page",
  });
});

app.get("/login", (req, res) => {
  res.render("pages/login", {
    page_title: "Login",
  });
});

app.get("/register", (req, res) => {
  res.render("pages/register", {
    page_title: "Register",
  });
});

app.get("/admin_dashboard", (req, res) => {
  res.render("pages/admin_dashboard", {
    page_title: "Admin Dashboard",
    current_page: "admin_dashboard"
  });
});


// Pig Management Pages
app.get("/pigmanagement_overview", (req, res) => {
  res.render("pages/pigmanagement_overview", {
    page_title: "Pig Management Overview",
    current_page: "pigmanagement_overview"
  });
});

app.get("/pigmanagement_byf", (req, res) => {
  res.render("pages/pigmanagement_byf", {
    page_title: "Pig Management BYF",
    current_page: "pigmanagement_byf"
  });
});

app.get("/pigmanagement_health", (req, res) => {
  res.render("pages/pigmanagement_health", {
    page_title: "Pig Management Health",
    current_page: "pigmanagement_health"
  });
});

app.get("/pigmanagement_breeding", (req, res) => {
  res.render("pages/pigmanagement_breeding", {
    page_title: "Pig Management Breeding",
    current_page: "pigmanagement_breeding"
  });
});

app.get("/pigmanagement_regpig", (req, res) => {
  res.render("pages/pigmanagement_regpig", {
    page_title: "Pig Management RegPig",
    current_page: "pigmanagement_regpig"
  });
});


app.get("/breed_analysis", (req, res) => {
  res.render("pages/breed_analysis", {
    page_title: "Breed Analysis",
    current_page: "breed_analysis"
  });
});

app.get("/calendar", (req, res) => {
  res.render("pages/calendar", {
    page_title: "Calendar",
    current_page: "calendar"
  });
});

app.get("/reports", (req, res) => {
  res.render("pages/reports", {
    page_title: "Reports",
    current_page: "reports"
  });
});


// Farmer Pages
app.get("/farmers_report", (req, res) => {
  res.render("pages/farmers_report", {
    page_title: "Farmers Report",
    current_page: "farmers_report" 
  });
});

app.get("/farmers_newacc", (req, res) => {
  res.render("pages/farmers_newacc", {
    page_title: "Farmers New Account",
    current_page: "farmers_newacc" 
  });
});

app.get("/farmers_manageacc", (req, res) => {
  res.render("pages/farmers_manageacc", {
    page_title: "Farmers Manage Account",
    current_page: "farmers_manageacc" 
  });
});

// Debug helper route (safe to remove later)
// Prints the resolved views directory and checks if the EJS file exists.
app.get("/__debug_views__", (req, res) => {
  try {
    const viewsDir = app.get("views");
    const fs = require("fs");
    const pageFile = path.join(viewsDir, "pages", "viewjs.ejs");
    const exists = fs.existsSync(pageFile);
    res.json({ viewsDir, pageFile, exists });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// 404 handler for pages (optional)
app.use((req, res, next) => {
  // if request expects JSON (API), send JSON error
  if (req.originalUrl.startsWith("/api/")) {
    return res.status(404).json({ error: "API route not found" });
  }

  // else try to render a 404 EJS page if you have one, otherwise plain text
  const view404 = path.join(app.get("views"), "pages", "404.ejs");
  const fs = require("fs");
  if (fs.existsSync(view404)) {
    return res.status(404).render("pages/404");
  }

  res.status(404).send("404 - Not Found");
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
