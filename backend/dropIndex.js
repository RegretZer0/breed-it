// dropIndex.js
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const Farmer = require("./models/UserFarmer"); // adjust path if needed

// ✅ Load environment variables
dotenv.config();

async function dropOldIndex() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is not defined in .env");
    }

    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("Connected to DB");

    // ✅ Drop the old index if it exists
    const indexes = await Farmer.collection.indexes();
    if (indexes.some(idx => idx.name === "farmerID_1")) {
      await Farmer.collection.dropIndex("farmerID_1");
      console.log("Old index dropped successfully");
    } else {
      console.log("Old index not found, nothing to drop");
    }

    process.exit(0);
  } catch (err) {
    console.error("Error dropping index:", err);
    process.exit(1);
  }
}

dropOldIndex();
