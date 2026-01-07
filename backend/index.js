const express = require("express");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const session = require("express-session");
const MongoStore = require("connect-mongo").default;


// Routes
const authRoutes = require("./routes/authRoutes.js");
const { isAuthenticated, isAdmin, isFarmer } = require("./middleware/authMiddleware");
const swineRoutes = require("./routes/swineRoutes.js");
const heatReportRoutes = require("./routes/heatReportRoutes.js");
const swinePerformanceRoutes = require("./routes/swinePerformanceRoutes.js");
const breedingRoutes = require("./routes/breedingRoutes.js");
const farmerRoutes = require("./routes/farmerRoutes.js");

// Load environment variables
dotenv.config();

const app = express();

// Enable CORS for your frontend
app.use(
  cors({
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    credentials: true,
  })
);

// Middleware for parsing JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static folder for uploads
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// MongoDB Connection

if (!process.env.MONGO_URI) {
  console.error("❌ ERROR: MONGO_URI missing in .env");
  process.exit(1);
}

mongoose
  .connect(process.env.MONGO_URI, {
    autoIndex: true,
  })
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

// Health Check Route
app.get("/", (req, res) => {
  res.send("BreedIT Backend is running...");
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);
