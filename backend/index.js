require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const session = require("express-session");
const MongoStore = require("connect-mongo").default;
const { initHeatCron } = require("./utils/cronJobs");
const fs = require("fs");
const SystemSettings = require("./models/SystemSettings");

/* =========================
    MVP: GLOBAL TIME CONTROL
========================= */
global.timeControl = {
  offsetMS: 0, 
  isMocked: false
};

// Global helper to get "Virtual Now" instead of real system time
global.getNow = function() {
  return new Date(Date.now() + global.timeControl.offsetMS);
};

// Function to sync global variable with Database (Used at startup and on health check)
const syncGlobalTimeWithDB = async () => {
  try {
    const settings = await SystemSettings.findOne();
    if (settings && settings.mockDate) {
      const virtualNow = new Date(settings.mockDate);
      const realNow = Date.now();
      global.timeControl.offsetMS = virtualNow.getTime() - realNow;
      global.timeControl.isMocked = true;
      console.log(`⏰ Time Warp Initialized: ${virtualNow.toLocaleString()}`);
    } else {
      global.timeControl.offsetMS = 0;
      global.timeControl.isMocked = false;
    }
  } catch (err) {
    console.error("❌ Failed to sync global time with DB:", err.message);
  }
};

// ROUTES
const adminRoutes = require("./routes/adminRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const reproductionRoute = require("./routes/reproductionRoute");
const analyticsRoutes = require("./routes/analyticsRoute");
const supportRoutes = require("./routes/supportRoutes");

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
  
  // Use function calls to ensure we get the CURRENT state of global.timeControl
  res.locals.getVirtualNow = () => global.getNow(); 
  res.locals.isTimeMocked = () => global.timeControl.isMocked;
  
  // Update local variable for simple access
  res.locals.virtualNow = global.getNow();
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
    origin: ["http://localhost:3000", "http://127.0.0.1:5000"],
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
    resave: true, 
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: "lax",
      secure: false,   
    },
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      collectionName: 'sessions', 
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
app.use("/images", express.static(path.join(__dirname, "../frontend/images")));
app.use("/css", express.static(path.join(__dirname, "../frontend/css")));
app.use("/js", express.static(path.join(__dirname, "../frontend/js")));
app.use(express.static(path.join(__dirname, "../frontend")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static(path.join(__dirname, "public")));


/* =========================
    UPLOADS FOLDER (ENSURE EXISTS)
========================= */
const uploadsDir = path.join(__dirname, "uploads");
const pigUploadsDir = path.join(uploadsDir, "pigs");
const userProfileUploadsDir = path.join(uploadsDir, "user_profiles");

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(pigUploadsDir)) fs.mkdirSync(pigUploadsDir, { recursive: true });
if (!fs.existsSync(userProfileUploadsDir)) fs.mkdirSync(userProfileUploadsDir, { recursive: true });

/* =========================
    BODY LIMITS
========================= */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));


/* =========================
    MONGODB CONNECTION
========================= */
mongoose
  .connect(process.env.MONGO_URI, { autoIndex: true })
  .then(async () => {
    console.log("✅ MongoDB Connected");
    
    // Immediately sync time from DB so refreshes work from the start
    await syncGlobalTimeWithDB();
    
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
app.use("/api/support", supportRoutes);

/* =========================
    HEALTH CHECK (TIME WARP SYNCED)
========================= */
app.get("/health", async (req, res) => {
  try {
    // Re-sync with DB to pick up any recent changes from Admin
    await syncGlobalTimeWithDB();

    res.json({ 
      status: "ok", 
      service: "BreedIT Backend",
      systemTime: new Date().toISOString(),
      virtualTime: global.getNow().toISOString(),
      isMocked: global.timeControl.isMocked
    });
  } catch (err) {
    console.error("Health check sync failed:", err);
    res.status(500).json({ 
      success: false, 
      message: "Time synchronization error" 
    });
  }
});

/* =========================
    START SERVER
========================= */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  setTimeout(() => {
    console.log(`⏰ Current Virtual Time: ${global.getNow().toLocaleString()}`);
  }, 2000);
  console.log("🔐 JWT Secret Loaded:", !!process.env.JWT_SECRET);
});