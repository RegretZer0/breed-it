const express = require("express");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

// Routes
const authRoutes = require("./routes/authRoutes.js");
const swineRoutes = require("./routes/swineRoutes.js");
const heatReportRoutes = require("./routes/heatReportRoutes.js");
const swinePerformanceRoutes = require("./routes/swinePerformanceRoutes.js");
const breedingRoutes = require("./routes/breedingRoutes.js");

// Load environment variables
dotenv.config();

const app = express();

// ✅ Enable CORS for your frontend
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

// =====================================
// 🔌 MongoDB Connection
// =====================================
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

// =====================================
// 📌 API ROUTES
// =====================================
app.use("/api/auth", authRoutes);
app.use("/api/swine", swineRoutes);
app.use("/api/heat", heatReportRoutes);
app.use("/api/swine-records", swinePerformanceRoutes);
app.use("/api/breeding", breedingRoutes); // 🔥 NEW: Breeding analytics endpoint

// Health Check Route
app.get("/", (req, res) => {
  res.send("BreedIT Backend is running...");
});

// =====================================
// 🚀 Start Server
// =====================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);
