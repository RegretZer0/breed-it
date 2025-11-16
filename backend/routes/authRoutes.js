const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const User = require("../models/UserModel");
const Farmer = require("../models/UserFarmer");

// Login
router.post("/login", async (req, res) => {
  console.log("Login attempt received:", req.body);

  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required" });
    }

    let user = await User.findOne({ email });
    let role = "admin";

    if (!user) {
      user = await Farmer.findOne({ email });
      role = "farmer";
    }

    if (!user) {
      console.log("User not found for email:", email);
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log("Invalid password for user:", email);
      return res.status(400).json({ success: false, message: "Invalid password" });
    }

    const token = jwt.sign({ id: user._id, role }, process.env.JWT_SECRET, { expiresIn: "1d" });

    console.log("Login successful for:", email, "Role:", role);
    res.json({ success: true, message: "Login successful", token, role, user });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// -Register Admin
router.post("/register", async (req, res) => {
  const { fullName, address, contact_info, email, password } = req.body;

  try {
    if (!fullName || !email || !password) {
      return res.status(400).json({ success: false, message: "Full name, email, and password are required" });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      fullName,
      address,
      contact_info,
      email,
      password: hashedPassword,
      role: "admin",
    });

    await newUser.save();
    console.log("Admin registered:", newUser.email);
    res.status(201).json({ success: true, message: "Admin registered successfully", user: newUser });
  } catch (error) {
    console.error("Admin registration error:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// Register Farmer
router.post("/register-farmer", async (req, res) => {
  const { name, address, contact_no, email, password, num_of_pens, pen_capacity, adminId } = req.body;

  console.log("Register farmer payload:", req.body);

  try {
    if (!name || !email || !password || !adminId) {
      return res.status(400).json({ success: false, message: "Name, email, password, and adminId are required" });
    }

    const admin = await User.findById(adminId);
    if (!admin || admin.role !== "admin") {
      return res.status(400).json({ success: false, message: "Invalid admin ID" });
    }
    console.log("Found admin:", admin.email);

    const existing = await Farmer.findOne({ email });
    if (existing) return res.status(400).json({ success: false, message: "Email already registered" });

    const hashedPassword = await bcrypt.hash(password, 10);

    // Safe farmer ID generation
    let nextNumber = 1;
    const lastFarmer = await Farmer.findOne().sort({ _id: -1 });
    if (lastFarmer?.farmer_id) {
      const parts = lastFarmer.farmer_id.split("-");
      const lastNum = parseInt(parts[1]);
      if (!isNaN(lastNum)) nextNumber = lastNum + 1;
    }
    const farmer_id = `Farmer-${String(nextNumber).padStart(5, "0")}`;
    console.log("Generated farmer_id:", farmer_id);

    const newFarmer = new Farmer({
      name,
      address,
      contact_no,
      email,
      password: hashedPassword,
      farmer_id,
      num_of_pens: num_of_pens || 0,
      pen_capacity: pen_capacity || 0,
      registered_by: adminId,
      user_id: adminId, // Link farmer to admin as initial user_id
    });

    await newFarmer.save();
    console.log("Farmer saved:", newFarmer.email, "ID:", newFarmer.farmer_id);

    res.status(201).json({ success: true, message: "Farmer registered successfully", farmer: newFarmer });
  } catch (error) {
    console.error("Farmer registration error:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// Get farmers registered by a specific admin
router.get("/farmers/:adminId", async (req, res) => {
  const { adminId } = req.params;

  try {
    const farmers = await Farmer.find({ registered_by: adminId }).select("-password -__v");
    console.log(`Fetched ${farmers.length} farmers for admin ${adminId}`);
    farmers.forEach(f => console.log(`Farmer: ${f.name}, ID: ${f.farmer_id}`));

    res.json({ success: true, farmers });
  } catch (error) {
    console.error("Fetch farmers error:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// Update Farmer
router.put("/update-farmer/:farmerId", async (req, res) => {
  const { farmerId } = req.params;
  const { name, address, contact_no, email, num_of_pens, pen_capacity } = req.body;

  try {
    const farmer = await Farmer.findOne({ farmer_id: farmerId });
    if (!farmer) {
      return res.status(404).json({ success: false, message: "Farmer not found" });
    }

    if (name) farmer.name = name;
    if (address) farmer.address = address;
    if (contact_no) farmer.contact_no = contact_no;
    if (email) farmer.email = email;
    if (num_of_pens !== undefined) farmer.num_of_pens = num_of_pens;
    if (pen_capacity !== undefined) farmer.pen_capacity = pen_capacity;

    await farmer.save();
    console.log("Updated farmer:", farmer.name, "ID:", farmer.farmer_id);

    res.json({ success: true, message: "Farmer updated successfully", farmer });
  } catch (error) {
    console.error("Update farmer error:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

module.exports = router;
