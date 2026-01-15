require("dotenv").config(); // ✅ MUST be first

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const session = require("express-session");
const MongoStore = require("connect-mongo").default; // Fixed .default issue for newer versions
const initHeatCron = require("./utils/cronJobs"); // 🛠️ Added Cron Job Import

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

// CORS
app.use(
  cors({
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    credentials: true,
  })
);

// BODY PARSERS
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// STATIC FILES
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static(path.join(__dirname, "public")));

// MONGODB CONNECTION
mongoose
  .connect(process.env.MONGO_URI, { autoIndex: true })
  .then(() => {
    console.log("✅ MongoDB Connected");
    // 🛠️ Initialize Cron Jobs once the database is connected
    initHeatCron();
    console.log("⏲️ Heat Observation Cron Job Initialized");
  })
  .catch((err) => {
    console.error("❌ MongoDB Connection Failed:", err);
    process.exit(1);
  });

// SESSION CONFIG (MongoDB)
app.use(
  session({
    name: "breedit.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 1 day
      httpOnly: true,
      sameSite: "lax",
      secure: false, // true only if HTTPS
    },
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      ttl: 24 * 60 * 60,
    }),
  })
);

// PREVENT CACHE AFTER LOGOUT
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

// ROUTES
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/swine", require("./routes/swineRoutes"));
app.use("/api/heat", require("./routes/heatReportRoutes"));
app.use("/api/swine-records", require("./routes/swinePerformanceRoutes"));
app.use("/api/breeding", require("./routes/breedingRoutes"));
app.use("/api/farmer", require("./routes/farmerRoutes"));
app.use("/api/admin", adminRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/reproduction", reproductionRoute);
app.use("/api/analytics", analyticsRoutes);

// HEALTH CHECK
app.get("/", (req, res) => {
  res.send("BreedIT Backend is running...");
});

// START SERVER
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log("🔐 JWT Secret Loaded:", !!process.env.JWT_SECRET);
});