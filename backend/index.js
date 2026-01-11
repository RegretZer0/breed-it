require("dotenv").config(); // MUST be first

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const session = require("express-session");
const MongoStore = require("connect-mongo").default;

// ROUTES
const adminRoutes = require("./routes/adminRoutes");

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
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    credentials: true,
  })
);

/* =========================
   BODY PARSERS
========================= */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================
   STATIC FILES
========================= */
// Frontend assets
app.use("/images", express.static(path.join(__dirname, "../frontend/images")));
app.use("/css", express.static(path.join(__dirname, "../frontend/css")));
app.use("/js", express.static(path.join(__dirname, "../frontend/js")));

// Uploaded files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* =========================
   MONGODB CONNECTION
========================= */
mongoose
  .connect(process.env.MONGO_URI, { autoIndex: true })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => {
    console.error("❌ MongoDB Connection Failed:", err);
    process.exit(1);
  });

/* =========================
   SESSION CONFIG
========================= */
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
      secure: false, // set true in HTTPS
    },
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      ttl: 24 * 60 * 60,
    }),
  })
);

/* =========================
   SESSION → EJS USER BINDING
   (AFTER session, BEFORE routes)
========================= */
app.use((req, res, next) => {
  res.locals.user = req.session?.user || null;
  next();
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
app.use("/api/admin", adminRoutes);

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
  console.log("🎨 Frontend Assets Enabled");
  console.log("🔐 JWT Secret Loaded:", !!process.env.JWT_SECRET);
});
