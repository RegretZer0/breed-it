document.addEventListener("DOMContentLoaded", () => {
  // Initial Load
  refreshDashboard();
  loadUsers();
  loadAdminTickets(); // Initial load for tickets

  // Feature: Auto-refresh system metrics every 3 seconds
  const autoRefreshInterval = setInterval(refreshDashboard, 3000);

  document.getElementById("logoutBtn").addEventListener("click", logout);
  document.getElementById("searchUser").addEventListener("input", filterUsers);
  
  // Maintenance Broadcast Listener
  const sendMaintBtn = document.getElementById("sendMaintBtn");
  if (sendMaintBtn) {
    sendMaintBtn.addEventListener("click", broadcastMaintenance);
  }

  // Optional: Listener for a manual refresh button
  const manualBtn = document.getElementById("manualRefreshBtn");
  if (manualBtn) {
    manualBtn.addEventListener("click", () => {
        refreshDashboard();
        loadAdminTickets();
    });
  }
});

/**
 * Combined function to update all dynamic system metrics
 */
function refreshDashboard() {
  loadAdminStats();
  loadDataOversight();
  // We don't necessarily need to refresh the whole ticket table every 3 seconds 
  // to save bandwidth, but you can add loadAdminTickets() here if desired.
}

/**
 * HELPER: Consistently extract a display name from user objects
 */
function getDisplayName(user) {
  if (!user) return "-";
  if (user.fullName) return user.fullName;
  if (user.first_name || user.last_name) {
    return `${user.first_name || ""} ${user.last_name || ""}`.trim();
  }
  return user.name || "-";
}

// FIXED: BROADCAST MAINTENANCE WITH SCHEDULED START & END
function broadcastMaintenance() {
  const title = document.getElementById("maintTitle").value.trim();
  const message = document.getElementById("maintMessage").value.trim();
  const scheduled_for = document.getElementById("maintStart").value; 
  const ends_at = document.getElementById("maintEnd").value;        
  const btn = document.getElementById("sendMaintBtn");

  if (!title || !message || !scheduled_for || !ends_at) {
    alert("Please fill in all fields: Title, Start Time, End Time, and Message.");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Broadcasting...";

  const payload = {
    title,
    message,
    scheduled_for,
    ends_at,
    type: "maintenance"
  };

  fetch("http://localhost:5000/api/notifications/broadcast-maintenance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload)
  })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        alert("Maintenance notification successfully broadcasted to all users.");
        document.getElementById("maintTitle").value = "";
        document.getElementById("maintMessage").value = "";
        document.getElementById("maintStart").value = "";
        document.getElementById("maintEnd").value = "";
      } else {
        alert("Broadcast failed: " + (data.message || "Unknown error"));
      }
    })
    .catch(err => {
      console.error("Maintenance Error:", err);
      alert("Error connecting to notification service.");
    })
    .finally(() => {
      btn.disabled = false;
      btn.textContent = "🚀 Broadcast to All Users";
    });
}

// SYSTEM & INFRASTRUCTURE OVERVIEW
function loadAdminStats() {
  fetch("http://localhost:5000/api/admin/stats", { credentials: "include" })
    .then(res => res.json())
    .then(data => {
      if (!data.success) {
        window.location.href = "login.html";
        return;
      }

      const stats = data.stats || {};
      
      const statusEl = document.getElementById("serverStatus");
      if (statusEl) {
        statusEl.textContent = stats.serverStatus ?? "--";
        statusEl.className = stats.serverStatus === "Stable" ? "status-stable" : "status-strained";
      }

      const cpuEl = document.getElementById("cpuLoad");
      if (cpuEl) cpuEl.textContent = stats.cpuLoad ? `${stats.cpuLoad} avg` : "--";

      const memEl = document.getElementById("memoryUsage");
      if (memEl) memEl.textContent = stats.memoryUsage ?? "--";

      const totalUsersEl = document.getElementById("totalUsers");
      if (totalUsersEl) totalUsersEl.textContent = stats.totalUsers ?? 0;

      const concurrentEl = document.getElementById("concurrentUsers");
      if (concurrentEl) concurrentEl.textContent = stats.concurrentUsers ?? 0;

    })
    .catch(err => console.error("Stats Error:", err));
}

// LOGOUT
function logout() {
  fetch("http://localhost:5000/api/auth/logout", {
    method: "POST",
    credentials: "include"
  }).then(() => window.location.href = "login.html");
}

// USER & ACCESS CONTROL
let allUsers = [];

function loadUsers() {
  fetch("http://localhost:5000/api/admin/users", { credentials: "include" })
    .then(res => res.json())
    .then(data => {
      if (!data.success) return;
      allUsers = Array.isArray(data.users) ? data.users : [];
      renderUsersTable(allUsers);
    })
    .catch(err => console.error(err));
}

function renderUsersTable(users) {
  const tbody = document.querySelector("#usersTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  users.forEach(user => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${getDisplayName(user)}</td>
      <td>${user.email}</td>
      <td>
        <select class="roleSelect" data-id="${user._id}">
          <option value="system_admin" ${user.role === "system_admin" ? "selected" : ""}>System Admin</option>
          <option value="farm_manager" ${user.role === "farm_manager" ? "selected" : ""}>Farm Manager</option>
          <option value="farmer" ${user.role === "farmer" ? "selected" : ""}>Farmer</option>
        </select>
      </td>
      <td>
        <select class="statusSelect" data-id="${user._id}">
          <option value="active" ${user.status === "active" ? "selected" : ""}>Active</option>
          <option value="disabled" ${user.status === "disabled" ? "selected" : ""}>Disabled</option>
        </select>
      </td>
      <td>
        <button class="updateBtn" data-id="${user._id}">Update</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.querySelectorAll(".updateBtn").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const role = document.querySelector(`.roleSelect[data-id="${id}"]`).value;
      const status = document.querySelector(`.statusSelect[data-id="${id}"]`).value;
      updateUser(id, { role, status });
    });
  });
}

function updateUser(id, payload) {
  fetch(`http://localhost:5000/api/admin/user/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload)
  })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        alert("User updated");
        loadUsers();
      } else {
        alert("Update failed");
      }
    })
    .catch(err => console.error(err));
}

function filterUsers(e) {
  const q = e.target.value.toLowerCase();
  renderUsersTable(
    allUsers.filter(u =>
      getDisplayName(u).toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    )
  );
}

// INFRASTRUCTURE OVERSIGHT
function loadDataOversight() {
  fetch("http://localhost:5000/api/admin/data", { credentials: "include" })
    .then(res => res.json())
    .then(parsed => {
      const data = parsed.data || parsed;

      if (data.systemInfo) {
        const platformEl = document.getElementById("osPlatform");
        const uptimeEl = document.getElementById("systemUptime");
        const cpuModelEl = document.getElementById("cpuModel");
        const memTotalEl = document.getElementById("totalMemory");

        if (platformEl) platformEl.textContent = data.systemInfo.platform;
        if (uptimeEl) uptimeEl.textContent = data.systemInfo.uptime;
        if (cpuModelEl) cpuModelEl.textContent = data.systemInfo.cpuModel;
        if (memTotalEl) memTotalEl.textContent = data.systemInfo.totalMemory;
      }

      const fmTbody = document.querySelector("#farmManagersTable tbody");
      if (fmTbody && fmTbody.children.length === 0) {
        renderFarmManagersTable(data.farmManagers);
      }
      
      const fTbody = document.querySelector("#farmersTable tbody");
      if (fTbody && fTbody.children.length === 0) {
        renderFarmersTable(data.farmers);
      }
    })
    .catch(err => console.error("Data oversight Error:", err));
}

function renderFarmManagersTable(rows = []) {
  const tbody = document.querySelector("#farmManagersTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  rows.forEach(fm => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${fm._id}</td>
      <td>${getDisplayName(fm)}</td>
      <td>${fm.email || "-"}</td>
      <td>${fm.status || "-"}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderFarmersTable(rows = []) {
  const tbody = document.querySelector("#farmersTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  rows.forEach(f => {
    const registeredBy = getDisplayName(f.managerId);
    
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${f.farmer_id || "-"}</td>
      <td>${getDisplayName(f)}</td>
      <td>${f.email || "-"}</td>
      <td>${f.contact_no || "-"}</td>
      <td>${f.num_of_pens ?? 0}</td>
      <td>${registeredBy}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ==========================================
// NEW: SUPPORT TICKET OVERSIGHT
// ==========================================

function loadAdminTickets() {
  fetch("http://localhost:5000/api/support/admin/all", { credentials: "include" })
    .then(res => res.json())
    .then(data => {
      if (!data.success) return;
      renderAdminTickets(data.tickets);
    })
    .catch(err => console.error("Ticket Load Error:", err));
}

function renderAdminTickets(tickets = []) {
  const tbody = document.getElementById("adminTicketsBody");
  const badge = document.getElementById("ticketCountBadge");
  if (!tbody) return;

  tbody.innerHTML = "";
  let openCount = 0;

  tickets.forEach(t => {
    if (t.status === 'open') openCount++;
    
    // User data is populated from the user_id reference in the route
    const userName = getDisplayName(t.user_id);
    const userRole = t.user_id?.role?.replace('_', ' ') || 'unknown';

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>#${t.ticket_id}</strong></td>
      <td>
        <div style="font-weight:bold">${userName}</div>
        <div style="font-size:11px; color:#6b7280">${t.user_id?.email || ''} (${userRole})</div>
      </td>
      <td><span class="ticket-pill">${t.category}</span></td>
      <td>${t.subject}</td>
      <td><span class="priority-${t.priority}">${t.priority}</span></td>
      <td><span class="status-${t.status}">${t.status.replace('_', ' ')}</span></td>
      <td>
        <select onchange="updateTicketStatus('${t._id}', this.value)" style="padding: 5px; border-radius: 4px; border: 1px solid #ddd;">
          <option value="open" ${t.status === 'open' ? 'selected' : ''}>Open</option>
          <option value="in_progress" ${t.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
          <option value="resolved" ${t.status === 'resolved' ? 'selected' : ''}>Resolved</option>
          <option value="closed" ${t.status === 'closed' ? 'selected' : ''}>Closed</option>
        </select>
      </td>
    `;
    tbody.appendChild(tr);
  });

  if (badge) badge.textContent = `${openCount} Open Tickets`;
}

/**
 * Updates the status of a specific ticket via the admin endpoint
 */
function updateTicketStatus(mongoId, newStatus) {
  fetch(`http://localhost:5000/api/support/admin/ticket/${mongoId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ status: newStatus })
  })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        console.log(`Ticket ${mongoId} updated to ${newStatus}`);
        loadAdminTickets(); // Refresh list to update UI and badges
      } else {
        alert("Failed to update ticket status.");
      }
    })
    .catch(err => {
      console.error("Status Update Error:", err);
      alert("Error connecting to support service.");
    });
}