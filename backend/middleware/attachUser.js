// middleware/attachUser.js
const User = require("../models/UserModel");
const Farmer = require("../models/UserFarmer");

async function attachUser(req, res, next) {
  try {
    // From session or JWT
    const userId = req.session?.user?.id || (req.user && req.user.id);
    const role = req.session?.user?.role || (req.user && req.user.role);

    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    if (role === "farmer") {
      const farmer = await Farmer.findOne({ user_id: userId }).select("-password -__v");
      if (!farmer) return res.status(404).json({ message: "Farmer profile not found" });
      req.currentUser = farmer; // attach farmer
    } else {
      const user = await User.findById(userId).select("-password -__v");
      if (!user) return res.status(404).json({ message: "User not found" });
      req.currentUser = user;
    }

    next();
  } catch (err) {
    console.error("attachUser middleware error:", err);
    res.status(500).json({ message: "Server error" });
  }
}

module.exports = attachUser;
