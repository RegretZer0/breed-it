const express = require("express");
const router = express.Router();
const Ticket = require("../models/Tickets");
const { requireSessionAndToken: protect } = require("../middleware/authMiddleware");

/* =========================================================
   MODULE: Admin Helpers
   PURPOSE: Shared auth, query building, and auto-archive logic.
========================================================= */
function ensureAdmin(req, res) {
  if (req.user.role !== "system_admin" && req.user.role !== "admin") {
    res.status(403).json({ success: false, message: "Access denied: Admins only." });
    return false;
  }
  return true;
}

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildAdminTicketQuery(query = {}) {
  const {
    status,
    category,
    priority,
    role,
    q,
    archived
  } = query;

  const mongoQuery = {};

  if (archived === "true") {
    mongoQuery.archived = true;
  } else {
    mongoQuery.$and = [
      {
        $or: [
          { archived: false },
          { archived: { $exists: false } }
        ]
      }
    ];
  }

  if (status && status !== "all") {
    if (mongoQuery.$and) {
      mongoQuery.$and.push({ status });
    } else {
      mongoQuery.status = status;
    }
  }

  if (category && category !== "all") {
    if (mongoQuery.$and) {
      mongoQuery.$and.push({ category });
    } else {
      mongoQuery.category = category;
    }
  }

  if (priority && priority !== "all") {
    if (mongoQuery.$and) {
      mongoQuery.$and.push({ priority });
    } else {
      mongoQuery.priority = priority;
    }
  }

  if (q && String(q).trim()) {
    const pattern = new RegExp(escapeRegex(String(q).trim()), "i");
    const searchBlock = {
      $or: [
        { ticket_id: pattern },
        { subject: pattern },
        { message: pattern },
        { name: pattern },
        { email: pattern },
        { page_url: pattern }
      ]
    };

    if (mongoQuery.$and) {
      mongoQuery.$and.push(searchBlock);
    } else {
      mongoQuery.$or = searchBlock.$or;
    }
  }

  return { mongoQuery, role };
}

async function autoArchiveClosedTickets() {
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  await Ticket.updateMany(
    {
      status: "closed",
      archived: false,
      closedAt: { $ne: null, $lte: threeMonthsAgo }
    },
    {
      $set: {
        archived: true,
        archivedAt: new Date()
      }
    }
  );
}

/* =========================================================
   MODULE: User Endpoints
   PURPOSE: Existing support ticket submission/history.
========================================================= */

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

    const query = { user_id: req.user.id };
    if (status) query.status = status;
    if (category) query.category = category;
    if (priority) query.priority = priority;
    if (q) {
      query.$or = [
        { subject: { $regex: q, $options: "i" } },
        { message: { $regex: q, $options: "i" } },
        { ticket_id: { $regex: q, $options: "i" } }
      ];
    }

    const tickets = await Ticket.find(query)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .exec();

    const count = await Ticket.countDocuments(query);

    res.json({
      success: true,
      tickets,
      total: count,
      totalPages: Math.ceil(count / Number(limit)),
      currentPage: Number(page)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch tickets" });
  }
});

/* =========================================================
   MODULE: Admin Ticket Listing
   PURPOSE: Load active or archived tickets with filters/pagination.
========================================================= */

// @route   GET /api/support/admin/all
// @desc    Get tickets across the system with filters/pagination
router.get("/admin/all", protect, async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;

    await autoArchiveClosedTickets();

    const {
      page = 1,
      limit = 5
    } = req.query;

    const { mongoQuery, role } = buildAdminTicketQuery(req.query);

    let tickets = await Ticket.find(mongoQuery)
      .populate("user_id", "first_name last_name email role")
      .sort({ createdAt: -1 });

    if (role && role !== "all") {
      tickets = tickets.filter((ticket) => {
        return String(ticket.user_id?.role || "").toLowerCase() === String(role).toLowerCase();
      });
    }

    const total = tickets.length;
    const currentPage = Number(page);
    const pageSize = Number(limit);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const startIndex = (currentPage - 1) * pageSize;
    const paginated = tickets.slice(startIndex, startIndex + pageSize);

    const statsBase = await Ticket.find({
      $or: [
        { archived: false },
        { archived: { $exists: false } }
      ]
    }).populate("user_id", "role");
    const stats = {
      open: statsBase.filter((t) => t.status === "open").length,
      in_progress: statsBase.filter((t) => t.status === "in_progress").length,
      resolved: statsBase.filter((t) => t.status === "resolved").length,
      closed: statsBase.filter((t) => t.status === "closed").length,
      archived: await Ticket.countDocuments({ archived: true })
    };

    res.json({
      success: true,
      tickets: paginated,
      total,
      stats,
      pagination: {
        page: currentPage,
        limit: pageSize,
        total,
        totalPages
      }
    });
  } catch (err) {
    console.error("Admin Fetch Error:", err);
    res.status(500).json({ success: false, message: "Error fetching system tickets" });
  }
});

/* =========================================================
   MODULE: Admin Ticket Status Update
   PURPOSE: Update status and manage closed timestamps.
========================================================= */

// @route   PATCH /api/support/admin/ticket/:id
// @desc    Update ticket status (System Admin Only)
router.patch("/admin/ticket/:id", protect, async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;

    const { status } = req.body;
    const validStatuses = ["open", "in_progress", "resolved", "closed"];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status value" });
    }

    const update = { status };

    if (status === "closed") {
      update.closedAt = new Date();
    } else {
      update.closedAt = null;
      update.archived = false;
      update.archivedAt = null;
    }

    const ticket = await Ticket.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true }
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

/* =========================================================
   MODULE: Admin Archive Controls
   PURPOSE: Manual archive / restore support.
========================================================= */

// @route   PATCH /api/support/admin/ticket/:id/archive
// @desc    Archive a closed ticket manually
router.patch("/admin/ticket/:id/archive", protect, async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found" });
    }

    if (ticket.status !== "closed") {
      return res.status(400).json({
        success: false,
        message: "Only closed tickets can be archived."
      });
    }

    ticket.archived = true;
    ticket.archivedAt = new Date();
    await ticket.save();

    res.json({
      success: true,
      message: `Ticket ${ticket.ticket_id} archived successfully.`,
      ticket
    });
  } catch (err) {
    console.error("Archive Ticket Error:", err);
    res.status(500).json({ success: false, message: "Archive failed" });
  }
});

// @route   PATCH /api/support/admin/ticket/:id/restore
// @desc    Restore archived ticket back to active list
router.patch("/admin/ticket/:id/restore", protect, async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;

    const ticket = await Ticket.findByIdAndUpdate(
      req.params.id,
      {
        archived: false,
        archivedAt: null
      },
      { new: true }
    );

    if (!ticket) {
      return res.status(404).json({ success: false, message: "Ticket not found" });
    }

    res.json({
      success: true,
      message: `Ticket ${ticket.ticket_id} restored successfully.`,
      ticket
    });
  } catch (err) {
    console.error("Restore Ticket Error:", err);
    res.status(500).json({ success: false, message: "Restore failed" });
  }
});

module.exports = router;