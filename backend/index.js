require("dotenv").config(); // ✅ MUST be first

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const session = require("express-session");
const MongoStore = require("connect-mongo").default;
const initHeatCron = require("./utils/cronJobs");

// ROUTES
const adminRoutes = require("./routes/adminRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const reproductionRoute = require("./routes/reproductionRoute");
const analyticsRoutes = require("./routes/analyticsRoute");

// ENV VALIDATION (FAIL FAST)
if (!process.env.MONGO_URI) {
  console.error("❌ ERROR: MONGO_URI missing in .env");
  process.exit(1);
}
if (!process.env.JWT_SECRET) {
  console.error("❌ ERROR: JWT_SECRET missing in .env");
  process.exit(1);
}
if (!process.env.SESSION_SECRET) {
  console.error("❌ ERROR: SESSION_SECRET missing in .env");
  process.exit(1);
}

// APP INIT
const app = express();

/* =========================
    GLOBAL EJS DEFAULTS
========================= */
app.use((req, res, next) => {
  res.locals.page_title = "BreedIT";
  res.locals.current_page = "";
  next();
});

/* =========================
    VIEW ENGINE (EJS)
========================= */
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../frontend/views"));

/* =========================
    CORS
========================= */
app.use(
  cors({
    origin: ["http://localhost:3000", "http://127.0.0.1:5000", "http://localhost:3000"],
    credentials: true,
  })
);

/* =========================
    BODY PARSERS
========================= */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================
    SESSION CONFIG
========================= */
app.use(
  session({
    name: "breedit.sid",
    secret: process.env.SESSION_SECRET,
    resave: true, // Change to true to ensure session is touched on every refresh
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: "lax", // Essential for local development sessions
      secure: false,   // Must be false if you are not using HTTPS/SSL
    },
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      collectionName: 'sessions', // Explicitly name the collection
      ttl: 24 * 60 * 60,
    }),
  })
);

/* =========================
    SESSION → EJS USER BINDING
========================= */
app.use((req, res, next) => {
  res.locals.user = req.session?.user || null;
  next();
});

/* =========================
    STATIC FILES
========================= */
// Specific asset folders
app.use("/images", express.static(path.join(__dirname, "../frontend/images")));
app.use("/css", express.static(path.join(__dirname, "../frontend/css")));
app.use("/js", express.static(path.join(__dirname, "../frontend/js")));
app.use('/uploads', express.static(path.join(__dirname, "uploads")));

// ✅ UPDATED: Serve the frontend root to allow access to audit_logs.html and others
app.use(express.static(path.join(__dirname, "../frontend")));

// Uploaded & public assets
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static(path.join(__dirname, "public")));

/* =========================
    MONGODB CONNECTION
========================= */
mongoose
  .connect(process.env.MONGO_URI, { autoIndex: true })
  .then(() => {
    console.log("✅ MongoDB Connected");
    initHeatCron();
    console.log("⏲️ Heat Observation Cron Job Initialized");
  })
  .catch((err) => {
    console.error("❌ MongoDB Connection Failed:", err);
    process.exit(1);
  });



/* =========================
    PREVENT CACHE AFTER LOGOUT
========================= */
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

/* =========================
    PAGE ROUTES (EJS)
========================= */
app.use("/", require("./routes/pageRoutes"));

/* =========================
    API ROUTES
========================= */
// ✅ The audit log endpoint is contained within authRoutes
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/swine", require("./routes/swineRoutes"));
app.use("/api/heat", require("./routes/heatReportRoutes"));
app.use("/api/swine-records", require("./routes/swinePerformanceRoutes"));
app.use("/api/breeding", require("./routes/breedingRoutes"));
app.use("/api/farmer", require("./routes/farmerRoutes"));
app.use("/api/farmer", require("./routes/farmerProfileRoutes"));
app.use("/api/admin", adminRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/reproduction", reproductionRoute);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/dashboard", require("./routes/dashboardRoutes"));

/* =========================
    HEALTH CHECK
========================= */
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "BreedIT Backend" });
});

/* =========================
    START SERVER
========================= */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log("📄 EJS Views:", path.join(__dirname, "../frontend/views"));
  console.log("🎨 Frontend Root Static Assets Enabled");
  console.log("🔐 JWT Secret Loaded:", !!process.env.JWT_SECRET);
});