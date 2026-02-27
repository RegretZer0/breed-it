const express = require("express");
const router = express.Router();
const Ticket = require("../models/Tickets");
const { requireSessionAndToken: protect } = require("../middleware/authMiddleware");

// ==========================================
// USER ENDPOINTS (Existing Features)
// ==========================================

// @route   POST /api/support/ticket
// @desc    Submit a new support ticket
router.post("/ticket", protect, async (req, res) => {
  try {
    const { category, priority, subject, message, page } = req.body;

    const newTicket = new Ticket({
      user_id: req.user.id,
      name: req.body.name, 
      email: req.body.email,
      category,
      priority,
      subject,
      message,
      page_url: page
    });

    await newTicket.save();
    res.status(201).json({ success: true, ticket_id: newTicket.ticket_id });
  } catch (err) {
    console.error("Ticket Submission Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

// @route   GET /api/support/tickets
// @desc    Get ticket history for logged-in user
router.get("/tickets", protect, async (req, res) => {
  try {
    const { page = 1, limit = 6, status, category, priority, q } = req.query;
    
    // Build filter object restricted to the user
    const query = { user_id: req.user.id };
    if (status) query.status = status;
    if (category) query.category = category;
    if (priority) query.priority = priority;
    if (q) query.subject = { $regex: q, $options: "i" };

    const tickets = await Ticket.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const count = await Ticket.countDocuments(query);

    res.json({
      success: true,
      tickets,
      total: count,
      totalPages: Math.ceil(count / limit),
      currentPage: page
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch tickets" });
  }
});

// ==========================================
// ADMIN ENDPOINTS (New Features)
// ==========================================

// @route   GET /api/support/admin/all
// @desc    Get ALL tickets across the system (System Admin Only)
router.get("/admin/all", protect, async (req, res) => {
  try {
    // Role Authorization Check
    if (req.user.role !== 'system_admin' && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: "Access denied: Admins only." });
    }

    // Populate user details so we can see who submitted the ticket on the dashboard
    const tickets = await Ticket.find()
      .populate("user_id", "first_name last_name email role") 
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      tickets,
      total: tickets.length
    });
  } catch (err) {
    console.error("Admin Fetch Error:", err);
    res.status(500).json({ success: false, message: "Error fetching system tickets" });
  }
});

// @route   PATCH /api/support/admin/ticket/:id
// @desc    Update ticket status (System Admin Only)
router.patch("/admin/ticket/:id", protect, async (req, res) => {
  try {
    // Role Authorization Check
    if (req.user.role !== 'system_admin' && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { status } = req.body;
    
    // Ensure the status provided is valid according to our Schema
    const validStatuses = ["open", "in_progress", "resolved", "closed"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status value" });
    }

    const ticket = await Ticket.findByIdAndUpdate(
      req.params.id, 
      { status }, 
      { new: true } // Returns the updated document
    );

    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found" });
    }

    res.json({ 
      success: true, 
      message: `Ticket ${ticket.ticket_id} updated to ${status}`,
      ticket 
    });
  } catch (err) {
    console.error("Admin Update Error:", err);
    res.status(500).json({ success: false, message: "Update failed" });
  }
});

module.exports = router;