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


app.get("/pig_management", (req, res) => {
  res.render("pages/pig_management", {
    page_title: "Pig Management",
    current_page: "pig_management"
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
