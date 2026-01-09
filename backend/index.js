const express = require("express");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const session = require("express-session");
const MongoStore = require("connect-mongo").default;


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

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'some_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }, // 1 day
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    ttl: 24 * 60 * 60, // 1 day in seconds
  }),
}));

// 🚫🚫 PREVENT DASHBOARD FROM BEING CACHED AFTER LOGOUT
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

// Example usage in a route
app.get("/api/farmer/admin/:adminId/farmers", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const farmers = await Farmer.find({ registered_by: req.params.adminId }).select("-password -__v");
    res.json({ success: true, farmers });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
});

// API ROUTES
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
// EJS PAGE ROUTES
// =======================
app.get("/landing_page", (req, res) =>
  res.render("pages/landing_page", { page_title: "Landing Page" })
);

app.get("/login", (req, res) =>
  res.render("pages/login", { page_title: "Login" })
);

app.get("/register", (req, res) =>
  res.render("pages/register", { page_title: "Register" })
);

app.get("/admin_dashboard", (req, res) =>
  res.render("pages/admin_dashboard", {
    page_title: "Admin Dashboard",
    current_page: "admin_dashboard",
  })
);

// Pig Management
app.get("/pigmanagement_overview", (req, res) =>
  res.render("pages/pigmanagement_overview", {
    page_title: "Pig Management Overview",
    current_page: "pigmanagement_overview",
  })
);

app.get("/pigmanagement_byf", (req, res) =>
  res.render("pages/pigmanagement_byf", {
    page_title: "Pig Management BYF",
    current_page: "pigmanagement_byf",
  })
);

app.get("/pigmanagement_health", (req, res) =>
  res.render("pages/pigmanagement_health", {
    page_title: "Pig Management Health",
    current_page: "pigmanagement_health",
  })
);

app.get("/pigmanagement_breeding", (req, res) =>
  res.render("pages/pigmanagement_breeding", {
    page_title: "Pig Management Breeding",
    current_page: "pigmanagement_breeding",
  })
);

app.get("/pigmanagement_regpig", (req, res) =>
  res.render("pages/pigmanagement_regpig", {
    page_title: "Pig Management RegPig",
    current_page: "pigmanagement_regpig",
  })
);

app.get("/breed_analysis", (req, res) =>
  res.render("pages/breed_analysis", {
    page_title: "Breed Analysis",
    current_page: "breed_analysis",
  })
);


app.get("/reports", (req, res) =>
  res.render("pages/reports", {
    page_title: "Reports",
    current_page: "reports",
  })
);

// Admin Dashboard - Farmers
app.get("/farmers_report", (req, res) =>
  res.render("pages/farmers_report", {
    page_title: "Farmers Report",
    current_page: "farmers_report",
  })
);

app.get("/farmers_newacc", (req, res) =>
  res.render("pages/farmers_newacc", {
    page_title: "Farmers New Account",
    current_page: "farmers_newacc",
  })
);

app.get("/farmers_manageacc", (req, res) =>
  res.render("pages/farmers_manageacc", {
    page_title: "Farmers Manage Account",
    current_page: "farmers_manageacc",
  })
);


// Farmer Dashboard
// app.get("/farmer_dashboard", (req, res) =>
//   res.render("pages/farmer_dashboard", {
//     page_title: "Farmer Dashboard",
//     current_page: "farmer_dashboard",
//     user: req.session.user // or req.user
//   })
// );

app.get("/farmer_dashboard", (req, res) =>
  res.render("pages/farmer_dashboard", {
    page_title: "Farmer Dashboard",
    current_page: "farmer_dashboard",
    user: {
      firstName: "Juan Test"
    }
  })
);

app.get("/farmer_mypigs", (req, res) =>
  res.render("pages/farmer_mypigs", {
    page_title: "Farmer My Pigs",
    current_page: "farmer_mypigs",
  })
);

app.get("/farmer_dashboard_report", (req, res) =>
  res.render("pages/farmer_dashboard_report", {
    page_title: "Farmer Dashboard Report",
    current_page: "farmer_dashboard_report",
  })
);

app.get("/farmer_profile", (req, res) =>
  res.render("pages/farmer_profile", {
    page_title: "Farmer Profile",
    current_page: "farmer_profile",
  })
);

app.get("/farmer_help", (req, res) =>
  res.render("pages/farmer_help", {
    page_title: "Farmer Help",
    current_page: "farmer_help",
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