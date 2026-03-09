document.addEventListener("DOMContentLoaded", () => {
  /* =========================================================
     MODULE: App Bootstrap
     PURPOSE: Initialize dashboard modules and event bindings.
  ========================================================= */
  AdminDashboard.init();
});

const AdminDashboard = (() => {
  /* =========================================================
     MODULE: State
     PURPOSE: Store dashboard runtime state.
  ========================================================= */
  const state = {
    allUsers: [],
    autoRefreshInterval: null,
    isRefreshing: false,
    activityChart: null,
    activityRange: "24h",
    adminStats: {},
    systemInfo: {},
    openTicketCount: 0,
  };
  
  /* =========================================================
     MODULE: Config
     PURPOSE: Centralize API endpoints and refresh timing.
  ========================================================= */
  const config = {
    API_BASE: "http://localhost:5000",
    REFRESH_INTERVAL_MS: 3000,
  };

  /* =========================================================
     MODULE: DOM Helpers
     PURPOSE: Safe DOM selection helpers.
  ========================================================= */
  const $ = (selector, scope = document) => scope.querySelector(selector);

  /* =========================================================
     MODULE: Utility Helpers
     PURPOSE: Shared helper functions used across modules.
  ========================================================= */
  function getDisplayName(user) {
    if (!user) return "-";
    if (user.fullName) return user.fullName;
    if (user.first_name || user.last_name) {
      return `${user.first_name || ""} ${user.last_name || ""}`.trim() || "-";
    }
    return user.name || "-";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setText(id, value) {
    const els = document.querySelectorAll(`#${id}`);
    els.forEach((el) => {
      el.textContent = value ?? "--";
    });
  }

  function setButtonLoading(btn, isLoading, loadingText, defaultText) {
    if (!btn) return;
    btn.disabled = isLoading;
    btn.innerHTML = isLoading ? loadingText : defaultText;
  }

  function currentPage() {
    const path = window.location.pathname || "";
    if (path.includes("/maintenance")) return "maintenance";
    if (path.includes("/users")) return "users";
    if (path.includes("/tickets")) return "tickets";
    if (path.includes("/infrastructure")) return "infrastructure";
    return "dashboard";
  }

  async function fetchJson(path, options = {}) {
    const res = await fetch(`${config.API_BASE}${path}`, {
      credentials: "include",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    const data = await res.json().catch(() => ({}));
    return { res, data };
  }

  /* =========================================================
     MODULE: Sidebar UI
     PURPOSE: Handle mobile sidebar open and close behavior.
  ========================================================= */
  function bindSidebar() {
    const sidebar = document.getElementById("saSidebar");
    const backdrop = document.getElementById("saBackdrop");
    const toggleBtn = document.getElementById("sidebarToggleBtn");
    const closeBtn = document.getElementById("sidebarCloseBtn");

    if (!sidebar || !backdrop) return;

    const openSidebar = () => {
      sidebar.classList.add("open");
      backdrop.classList.add("show");
      document.body.style.overflow = "hidden";
    };

    const closeSidebar = () => {
      sidebar.classList.remove("open");
      backdrop.classList.remove("show");
      document.body.style.overflow = "";
    };

    toggleBtn?.addEventListener("click", openSidebar);
    closeBtn?.addEventListener("click", closeSidebar);
    backdrop?.addEventListener("click", closeSidebar);

    window.addEventListener("resize", () => {
      if (window.innerWidth >= 992) {
        closeSidebar();
      }
    });
  }

  /* =========================================================
     MODULE: Event Binding
     PURPOSE: Attach all event listeners in one place.
  ========================================================= */
  function bindEvents() {
    const logoutBtn = document.getElementById("logoutBtn");
    const searchUser = document.getElementById("searchUser");
    const sendMaintBtn = document.getElementById("sendMaintBtn");
    const teleportBtn = document.getElementById("teleportBtn");
    const resetTimeBtn = document.getElementById("resetTimeBtn");
    const manualRefreshBtn = document.getElementById("manualRefreshBtn");
    const themeToggleBtn = document.getElementById("themeToggleBtn");

    bindSidebar();
    bindActivityRangeEvents();

    logoutBtn?.addEventListener("click", logout);
    searchUser?.addEventListener("input", filterUsers);
    sendMaintBtn?.addEventListener("click", broadcastMaintenance);
    teleportBtn?.addEventListener("click", () => teleportSystemTime(false));
    resetTimeBtn?.addEventListener("click", () => teleportSystemTime(true));
    themeToggleBtn?.addEventListener("click", toggleTheme);

    manualRefreshBtn?.addEventListener("click", async () => {
      await refreshPageData();
    });

    bindUsersTableEvents();
    bindTicketsTableEvents();
  }

  /* =========================================================
     MODULE: User Table Events
     PURPOSE: Use event delegation for user action buttons.
  ========================================================= */
  function bindUsersTableEvents() {
    const usersTable = document.getElementById("usersTable");
    if (!usersTable) return;

    usersTable.addEventListener("click", async (e) => {
      const btn = e.target.closest(".updateBtn");
      if (!btn) return;

      const id = btn.dataset.id;
      const roleEl = document.querySelector(`.roleSelect[data-id="${id}"]`);
      const statusEl = document.querySelector(`.statusSelect[data-id="${id}"]`);

      if (!id || !roleEl || !statusEl) return;

      await updateUser(id, {
        role: roleEl.value,
        status: statusEl.value,
      });
    });
  }

  /* =========================================================
     MODULE: Ticket Table Events
     PURPOSE: Use event delegation for ticket status updates.
  ========================================================= */
  function bindTicketsTableEvents() {
    const ticketsTable = document.getElementById("adminTicketsTable");
    if (!ticketsTable) return;

    ticketsTable.addEventListener("change", async (e) => {
      const select = e.target.closest(".ticketStatusSelect");
      if (!select) return;

      const mongoId = select.dataset.id;
      const newStatus = select.value;

      if (!mongoId || !newStatus) return;
      await updateTicketStatus(mongoId, newStatus);
    });
  }

  /* =========================================================
     MODULE: App Init
     PURPOSE: Start all page processes.
  ========================================================= */
  async function init() {
    initTheme();
    bindEvents();
    await refreshPageData();
    startAutoRefresh();
  }

  /* =========================================================
     MODULE: Auto Refresh
     PURPOSE: Keep page metrics fresh without reloading.
  ========================================================= */
  function startAutoRefresh() {
    stopAutoRefresh();

    state.autoRefreshInterval = setInterval(async () => {
      if (state.isRefreshing) return;

      state.isRefreshing = true;
      try {
        await refreshDashboard();
      } catch (err) {
        console.error("Auto refresh error:", err);
      } finally {
        state.isRefreshing = false;
      }
    }, config.REFRESH_INTERVAL_MS);
  }

  function stopAutoRefresh() {
    if (state.autoRefreshInterval) {
      clearInterval(state.autoRefreshInterval);
      state.autoRefreshInterval = null;
    }
  }

  /* =========================================================
     MODULE: Page Refresh Router
     PURPOSE: Refresh data based on current page context.
  ========================================================= */
  async function refreshPageData() {
    const page = currentPage();

    if (page === "dashboard") {
      await Promise.all([
        refreshDashboard(),
        loadUsers(),
        loadAdminTickets(),
      ]);
      return;
    }

    if (page === "users") {
      await Promise.all([
        refreshDashboard(),
        loadUsers(),
      ]);
      return;
    }

    if (page === "tickets") {
      await Promise.all([
        refreshDashboard(),
        loadAdminTickets(),
      ]);
      return;
    }

    if (page === "infrastructure") {
      await Promise.all([
        refreshDashboard(),
        loadDataOversight(),
      ]);
      return;
    }

    if (page === "maintenance") {
      await Promise.all([
        refreshDashboard(),
        loadMaintenanceHistory(),
      ]);
      return;
    }

    await refreshDashboard();
  }

  /* =========================================================
     MODULE: Dashboard Refresh
     PURPOSE: Refresh stats and infrastructure data together.
  ========================================================= */
  async function refreshDashboard() {
    await Promise.all([
      loadAdminStats(),
      loadDataOversight(),
    ]);
  }

  /* =========================================================
     MODULE: Time Warp
     PURPOSE: Change or reset the system virtual time.
  ========================================================= */
  async function teleportSystemTime(isReset = false) {
    const timeInput = document.getElementById("systemTimeInput");
    const targetDateValue = isReset ? null : timeInput?.value;

    if (!isReset && (!targetDateValue || targetDateValue === "")) {
      alert("Please select a target date and time from the picker first.");
      return;
    }

    try {
      const { data } = await fetchJson("/api/admin/set-system-time", {
        method: "POST",
        body: JSON.stringify({ targetDate: targetDateValue }),
      });

      if (data.success) {
        alert(data.message || "System time updated successfully.");
        window.location.reload();
      } else {
        alert(`Teleport failed: ${data.message || "Unknown error"}`);
      }
    } catch (err) {
      console.error("Teleport Error:", err);
      alert("Error connecting to admin service.");
    }
  }

  /* =========================================================
     MODULE: Maintenance Broadcast
     PURPOSE: Send a scheduled maintenance notification.
  ========================================================= */
  async function broadcastMaintenance() {
    const titleEl = document.getElementById("maintTitle");
    const messageEl = document.getElementById("maintMessage");
    const startEl = document.getElementById("maintStart");
    const endEl = document.getElementById("maintEnd");
    const btn = document.getElementById("sendMaintBtn");

    const title = titleEl?.value.trim() || "";
    const message = messageEl?.value.trim() || "";
    const scheduled_for = startEl?.value || "";
    const ends_at = endEl?.value || "";

    if (!title || !message || !scheduled_for || !ends_at) {
      alert("Please fill in all fields: Title, Start Time, End Time, and Message.");
      return;
    }

    if (new Date(ends_at) < new Date(scheduled_for)) {
      alert("Maintenance end time must be later than the start time.");
      return;
    }

    setButtonLoading(
      btn,
      true,
      '<i class="bi bi-hourglass-split me-2"></i>Broadcasting...',
      '<i class="bi bi-megaphone me-2"></i>Broadcast to All Users'
    );

    try {
      const payload = {
        title,
        message,
        scheduled_for,
        ends_at,
        type: "maintenance",
      };

      const { data } = await fetchJson("/api/notifications/broadcast-maintenance", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (data.success) {
        alert("Maintenance notification successfully broadcasted to all users.");

        if (titleEl) titleEl.value = "";
        if (messageEl) messageEl.value = "";
        if (startEl) startEl.value = "";
        if (endEl) endEl.value = "";

        await loadMaintenanceHistory();
      } else {
        alert(`Broadcast failed: ${data.message || "Unknown error"}`);
      }
    } catch (err) {
      console.error("Maintenance Error:", err);
      alert("Error connecting to notification service.");
    } finally {
      setButtonLoading(
        btn,
        false,
        '<i class="bi bi-hourglass-split me-2"></i>Broadcasting...',
        '<i class="bi bi-megaphone me-2"></i>Broadcast to All Users'
      );
    }
  }

  /* =========================================================
    MODULE: Maintenance History Data
    PURPOSE: Load maintenance broadcast records for the page.
  ========================================================= */
  async function loadMaintenanceHistory() {
    const tbody = document.getElementById("maintenanceHistoryBody");
    if (!tbody) return;

    try {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center py-4">Loading maintenance history...</td>
        </tr>
      `;

      // Change this endpoint if your backend uses a different route
      const { data } = await fetchJson("/api/notifications/maintenance-history");

      if (!data.success) {
        renderMaintenanceHistory([]);
        updateMaintenanceSummary([]);
        return;
      }

      const records = Array.isArray(data.history)
        ? data.history
        : Array.isArray(data.notifications)
        ? data.notifications
        : Array.isArray(data.records)
        ? data.records
        : [];

      renderMaintenanceHistory(records);
      updateMaintenanceSummary(records);
    } catch (err) {
      console.error("Maintenance History Load Error:", err);

      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="5" class="text-center py-4 text-danger">
              Failed to load maintenance history.
            </td>
          </tr>
        `;
      }

      updateMaintenanceSummary([]);
    }
  }

  /* =========================================================
     MODULE: Maintenance History Render
     PURPOSE: Render maintenance records into the history table.
  ========================================================= */
  function renderMaintenanceHistory(records = []) {
    const tbody = document.getElementById("maintenanceHistoryBody");
    if (!tbody) return;

    if (!records.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center py-5">
            <div class="sa-empty-state">
              <div class="sa-empty-state-icon">
                <i class="bi bi-clock-history"></i>
              </div>
              <div class="sa-empty-state-title">No maintenance history yet</div>
              <div class="sa-empty-state-text">
                Previous broadcasts will appear here once maintenance history data is available.
              </div>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = records.map((item) => {
      const title = escapeHtml(item.title || item.alertTitle || "Untitled Maintenance");
      const message = escapeHtml(item.message || item.body || item.content || "-");
      const startRaw = item.scheduled_for || item.start || item.start_time || item.createdAt;
      const endRaw = item.ends_at || item.end || item.end_time || null;

      const start = formatMaintenanceDate(startRaw);
      const end = formatMaintenanceDate(endRaw);

      const status = getMaintenanceStatus(item);

      return `
        <tr>
          <td class="fw-semibold">${title}</td>
          <td class="text-nowrap">${start}</td>
          <td class="text-nowrap">${end}</td>
          <td>${buildMaintenanceStatusBadge(status)}</td>
          <td>
            <div style="max-width: 420px; white-space: normal;">
              ${message}
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  /* =========================================================
     MODULE: Maintenance Summary
     PURPOSE: Update maintenance analytics cards.
  ========================================================= */
  function updateMaintenanceSummary(records = []) {
    const now = new Date();

    let total = records.length;
    let scheduled = 0;
    let active = 0;
    let completed = 0;

    records.forEach((item) => {
      const start = new Date(item.scheduled_for || item.start || item.start_time || item.createdAt);
      const end = new Date(item.ends_at || item.end || item.end_time || item.createdAt);

      if (Number.isNaN(start.getTime())) return;

      if (start > now) {
        scheduled++;
        return;
      }

      if (!Number.isNaN(end.getTime()) && start <= now && end >= now) {
        active++;
        return;
      }

      completed++;
    });

    setText("maintenanceHistoryCount", total);
    setText("maintenanceScheduledCount", scheduled);
    setText("maintenanceActiveCount", active);
    setText("maintenanceCompletedCount", completed);
  }

  /* =========================================================
     MODULE: Maintenance Helpers
     PURPOSE: Shared formatting and status helpers.
  ========================================================= */
  function formatMaintenanceDate(value) {
    if (!value) return "--";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";

    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function getMaintenanceStatus(item) {
    const now = new Date();
    const start = new Date(item.scheduled_for || item.start || item.start_time || item.createdAt);
    const end = new Date(item.ends_at || item.end || item.end_time || item.createdAt);

    if (Number.isNaN(start.getTime())) return "Unknown";
    if (start > now) return "Scheduled";
    if (!Number.isNaN(end.getTime()) && start <= now && end >= now) return "Active";
    return "Completed";
  }

  function buildMaintenanceStatusBadge(status) {
    const map = {
      Scheduled: "sa-maint-badge sa-maint-badge-scheduled",
      Active: "sa-maint-badge sa-maint-badge-active",
      Completed: "sa-maint-badge sa-maint-badge-completed",
      Unknown: "sa-maint-badge sa-maint-badge-unknown",
    };

    const cls = map[status] || map.Unknown;
    return `<span class="${cls}">${escapeHtml(status)}</span>`;
  }

  /* =========================================================
     MODULE: Admin Stats
     PURPOSE: Load and render system health summary cards.
  ========================================================= */
  async function loadAdminStats() {
    try {
      const { data } = await fetchJson("/api/admin/stats");

      if (!data.success) {
        window.location.href = "login.html";
        return;
      }

      const stats = data.stats || {};
      state.adminStats = stats;

      updateVirtualTime(stats);
      updateServerStatus(stats.serverStatus);
      const rawCpuLoad = Number.parseFloat(stats.cpuLoad);
      const platform = String(state.systemInfo.platform || "").toLowerCase();

      if (platform.includes("win")) {
        setText("cpuLoad", "N/A");
      } else if (Number.isFinite(rawCpuLoad)) {
        setText("cpuLoad", `${rawCpuLoad.toFixed(2)} avg`);
      } else {
        setText("cpuLoad", "--");
      }
      setText("memoryUsage", stats.memoryUsage ?? "--");
      setText("totalUsers", stats.totalUsers ?? 0);
      setText("concurrentUsers", stats.concurrentUsers ?? 0);
    } catch (err) {
      console.error("Stats Error:", err);
    }
  }

  function updateVirtualTime(stats) {
    const virtualTimeEl = document.getElementById("virtualTimeDisplay");
    if (!virtualTimeEl) return;

    virtualTimeEl.textContent = stats.virtualTime || "--";
    virtualTimeEl.style.color = stats.isTimeMocked ? "#f5c451" : "#54e08c";
  }

  function updateServerStatus(status) {
    const elements = document.querySelectorAll("#serverStatus");
    elements.forEach((statusEl) => {
      statusEl.textContent = status ?? "--";
      statusEl.classList.remove("status-stable", "status-strained", "status-danger");

      if (status === "Stable") {
        statusEl.classList.add("status-stable");
      } else if (status === "Danger" || status === "Critical") {
        statusEl.classList.add("status-danger");
      } else {
        statusEl.classList.add("status-strained");
      }
    });
  }

  /* =========================================================
     MODULE: Logout
     PURPOSE: End current session and redirect to login page.
  ========================================================= */
  async function logout() {
    try {
      await fetch(`${config.API_BASE}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.error("Logout Error:", err);
    } finally {
      window.location.href = "login.html";
    }
  }

  /* =========================================================
     MODULE: Users Data
     PURPOSE: Load all users for access management table.
  ========================================================= */
  async function loadUsers() {
    try {
      const { data } = await fetchJson("/api/admin/users");
      if (!data.success) return;

      state.allUsers = Array.isArray(data.users) ? data.users : [];
      renderUsersTable(state.allUsers);
    } catch (err) {
      console.error("Load Users Error:", err);
    }
  }

  /* =========================================================
     MODULE: Users Table Render
     PURPOSE: Render user management rows safely.
  ========================================================= */
  function renderUsersTable(users = []) {
    const tbody = $("#usersTable tbody");
    if (!tbody) return;

    if (!users.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center text-muted py-4">No users found.</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = users.map((user) => {
      const name = escapeHtml(getDisplayName(user));
      const email = escapeHtml(user.email || "-");
      const id = escapeHtml(user._id || "");
      const role = user.role || "";
      const status = user.status || "";

      return `
        <tr>
          <td>${name}</td>
          <td>${email}</td>
          <td>
            <select class="roleSelect form-select form-select-sm" data-id="${id}">
              <option value="system_admin" ${role === "system_admin" ? "selected" : ""}>System Admin</option>
              <option value="farm_manager" ${role === "farm_manager" ? "selected" : ""}>Farm Manager</option>
              <option value="farmer" ${role === "farmer" ? "selected" : ""}>Farmer</option>
              <option value="encoder" ${role === "encoder" ? "selected" : ""}>Encoder</option>
            </select>
          </td>
          <td>
            <select class="statusSelect form-select form-select-sm" data-id="${id}">
              <option value="active" ${status === "active" ? "selected" : ""}>Active</option>
              <option value="disabled" ${status === "disabled" ? "selected" : ""}>Disabled</option>
            </select>
          </td>
          <td>
            <button type="button" class="updateBtn btn btn-sm btn-primary" data-id="${id}">
              Update
            </button>
          </td>
        </tr>
      `;
    }).join("");
  }

  /* =========================================================
     MODULE: User Update
     PURPOSE: Update selected user role and status.
  ========================================================= */
  async function updateUser(id, payload) {
    try {
      const { data } = await fetchJson(`/api/admin/user/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      if (data.success) {
        alert("User updated successfully.");
        await loadUsers();
      } else {
        alert(data.message || "Update failed.");
      }
    } catch (err) {
      console.error("Update User Error:", err);
      alert("Error updating user.");
    }
  }

  /* =========================================================
     MODULE: User Filter
     PURPOSE: Filter users by name or email.
  ========================================================= */
  function filterUsers(e) {
    const q = (e.target.value || "").toLowerCase().trim();

    if (!q) {
      renderUsersTable(state.allUsers);
      return;
    }

    const filtered = state.allUsers.filter((user) => {
      const name = getDisplayName(user).toLowerCase();
      const email = String(user.email || "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });

    renderUsersTable(filtered);
  }

  /* =========================================================
     MODULE: Infrastructure Data
     PURPOSE: Load system info and oversight tables.
  ========================================================= */
  async function loadDataOversight() {
    try {
      const { data: parsed } = await fetchJson("/api/admin/data");
      const data = parsed.data || parsed || {};

      state.systemInfo = data.systemInfo || {};
      renderSystemInfo(state.systemInfo);
      renderFarmManagersTable(Array.isArray(data.farmManagers) ? data.farmManagers : []);
      renderFarmersTable(Array.isArray(data.farmers) ? data.farmers : []);
    } catch (err) {
      console.error("Data Oversight Error:", err);
    }
  }

  /* =========================================================
     MODULE: System Info Render
     PURPOSE: Render infrastructure information summary.
  ========================================================= */
  function renderSystemInfo(systemInfo = {}) {
    setText("osPlatform", systemInfo.platform || "--");
    setText("systemUptime", systemInfo.uptime || "--");
    setText("cpuModel", systemInfo.cpuModel || "--");
    setText("totalMemory", systemInfo.totalMemory || "--");
  }

  /* =========================================================
     MODULE: Farm Managers Table Render
     PURPOSE: Render farm manager oversight rows.
  ========================================================= */
  function renderFarmManagersTable(rows = []) {
    const tbody = $("#farmManagersTable tbody");
    if (!tbody) return;

    if (!rows.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" class="text-center text-muted py-4">No farm managers found.</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = rows.map((fm) => `
      <tr>
        <td>${escapeHtml(fm._id || "-")}</td>
        <td>${escapeHtml(getDisplayName(fm))}</td>
        <td>${escapeHtml(fm.email || "-")}</td>
        <td>${escapeHtml(fm.status || "-")}</td>
      </tr>
    `).join("");
  }

  /* =========================================================
     MODULE: Farmers Table Render
     PURPOSE: Render farmer oversight rows.
  ========================================================= */
  function renderFarmersTable(rows = []) {
    const tbody = $("#farmersTable tbody");
    if (!tbody) return;

    if (!rows.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center text-muted py-4">No farmers found.</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = rows.map((farmer) => {
      const registeredBy = getDisplayName(farmer.managerId);

      return `
        <tr>
          <td>${escapeHtml(farmer.farmer_id || "-")}</td>
          <td>${escapeHtml(getDisplayName(farmer))}</td>
          <td>${escapeHtml(farmer.email || "-")}</td>
          <td>${escapeHtml(farmer.contact_no || "-")}</td>
          <td>${escapeHtml(farmer.num_of_pens ?? 0)}</td>
          <td>${escapeHtml(registeredBy)}</td>
        </tr>
      `;
    }).join("");
  }

  /* =========================================================
     MODULE: Tickets Data
     PURPOSE: Load support tickets for admin oversight.
  ========================================================= */
  async function loadAdminTickets() {
    try {
      const { data } = await fetchJson("/api/support/admin/all");
      if (!data.success) return;

      renderAdminTickets(Array.isArray(data.tickets) ? data.tickets : []);
    } catch (err) {
      console.error("Ticket Load Error:", err);
    }
  }

  /* =========================================================
     MODULE: Tickets Table Render
     PURPOSE: Render support tickets safely and update open count.
  ========================================================= */
  function renderAdminTickets(tickets = []) {
    const tbody = document.getElementById("adminTicketsBody");
    const badge = document.getElementById("ticketCountBadge");
    if (!tbody) return;

    if (!tickets.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center text-muted py-4">No support tickets found.</td>
        </tr>
      `;
      if (badge) badge.textContent = "0 Open Tickets";
      return;
    }

    let openCount = 0;

    tbody.innerHTML = tickets.map((ticket) => {
      if (ticket.status === "open") openCount++;

      const userName = escapeHtml(getDisplayName(ticket.user_id));
      const userEmail = escapeHtml(ticket.user_id?.email || "");
      const userRole = escapeHtml((ticket.user_id?.role || "unknown").replace(/_/g, " "));
      const category = escapeHtml(ticket.category || "-");
      const subject = escapeHtml(ticket.subject || "-");
      const priority = escapeHtml(ticket.priority || "normal");
      const status = escapeHtml(ticket.status || "open");
      const ticketId = escapeHtml(ticket.ticket_id || "-");
      const mongoId = escapeHtml(ticket._id || "");

      return `
        <tr>
          <td><strong>#${ticketId}</strong></td>
          <td>
            <div class="fw-semibold">${userName}</div>
            <div class="small text-muted">${userEmail} (${userRole})</div>
          </td>
          <td><span class="ticket-pill">${category}</span></td>
          <td>${subject}</td>
          <td><span class="priority-${priority} text-capitalize">${priority.replace(/_/g, " ")}</span></td>
          <td><span class="status-${status} text-capitalize">${status.replace(/_/g, " ")}</span></td>
          <td>
            <select class="ticketStatusSelect form-select form-select-sm" data-id="${mongoId}">
              <option value="open" ${status === "open" ? "selected" : ""}>Open</option>
              <option value="in_progress" ${status === "in_progress" ? "selected" : ""}>In Progress</option>
              <option value="resolved" ${status === "resolved" ? "selected" : ""}>Resolved</option>
              <option value="closed" ${status === "closed" ? "selected" : ""}>Closed</option>
            </select>
          </td>
        </tr>
      `;
    }).join("");

    state.openTicketCount = openCount;

    if (badge) {
      badge.textContent = `${openCount} Open Tickets`;
    }
  }

  /* =========================================================
     MODULE: Ticket Status Update
     PURPOSE: Update support ticket status and refresh table.
  ========================================================= */
  async function updateTicketStatus(mongoId, newStatus) {
    try {
      const { data } = await fetchJson(`/api/support/admin/ticket/${mongoId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });

      if (data.success) {
        await loadAdminTickets();
      } else {
        alert(data.message || "Failed to update ticket status.");
      }
    } catch (err) {
      console.error("Status Update Error:", err);
      alert("Error connecting to support service.");
    }
  }

  /* =========================================================
    MODULE: Theme Init
    PURPOSE: Restore saved theme and update toggle label.
  ========================================================= */
  function initTheme() {
    const savedTheme = localStorage.getItem("sa_theme") || "dark";
    const body = document.body;

    body.classList.remove("sa-theme-dark", "sa-theme-light");
    body.classList.add(savedTheme === "light" ? "sa-theme-light" : "sa-theme-dark");

    updateThemeToggleLabel();
    syncActivityRangeButtons();
    renderActivityChart();
    renderActivitySummaryCards();
  }

  /* =========================================================
     MODULE: Theme Toggle
     PURPOSE: Switch between dark and light theme.
  ========================================================= */
  function toggleTheme() {
    const body = document.body;
    const isLight = body.classList.contains("sa-theme-light");

    body.classList.remove("sa-theme-dark", "sa-theme-light");
    body.classList.add(isLight ? "sa-theme-dark" : "sa-theme-light");

    localStorage.setItem("sa_theme", isLight ? "dark" : "light");
    updateThemeToggleLabel();
    renderActivityChart();
  }

  /* =========================================================
     MODULE: Theme Toggle Label
     PURPOSE: Keep toggle button text and icon in sync.
  ========================================================= */
  function updateThemeToggleLabel() {
    const btn = document.getElementById("themeToggleBtn");
    if (!btn) return;

    const isLight = document.body.classList.contains("sa-theme-light");

    btn.innerHTML = isLight
      ? '<i class="bi bi-moon-stars-fill me-2"></i>Switch to Dark Mode'
      : '<i class="bi bi-sun-fill me-2"></i>Switch to Light Mode';
  }

    /* =========================================================
     MODULE: Activity Range Events
     PURPOSE: Handle chart range filter button interactions.
  ========================================================= */
  function bindActivityRangeEvents() {
    const group = document.getElementById("activityRangeGroup");
    if (!group) return;

    group.addEventListener("click", (e) => {
      const btn = e.target.closest(".sa-range-btn");
      if (!btn) return;

      const range = btn.dataset.range;
      if (!range || range === state.activityRange) return;

      state.activityRange = range;
      syncActivityRangeButtons();
      renderActivityChart();
      renderActivitySummaryCards();
    });
  }

  /* =========================================================
     MODULE: Activity Range Buttons
     PURPOSE: Keep active state in sync with selected range.
  ========================================================= */
  function syncActivityRangeButtons() {
    const buttons = document.querySelectorAll(".sa-range-btn");
    buttons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.range === state.activityRange);
    });
  }

  /* =========================================================
     MODULE: Activity Demo Data
     PURPOSE: Provide admin chart demo data per selected range.
  ========================================================= */
  function getActivityDataset(range = "24h") {
    if (range === "7d") {
      return {
        labels: ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"],
        values: [64, 88, 57, 91, 78, 69, 96],
        summary: {
          totalLogins: "3,842",
          peakSessions: "96",
          activeUsers: "1,128",
        },
      };
    }

    if (range === "30d") {
      return {
        labels: ["W1", "W2", "W3", "W4", "W5", "W6"],
        values: [420, 510, 468, 590, 552, 638],
        summary: {
          totalLogins: "14,206",
          peakSessions: "214",
          activeUsers: "4,386",
        },
      };
    }

    return {
      labels: ["12 AM", "4 AM", "8 AM", "12 PM", "4 PM", "8 PM", "11 PM"],
      values: [18, 10, 34, 56, 72, 61, 42],
      summary: {
        totalLogins: "1,284",
        peakSessions: "96",
        activeUsers: "342",
      },
    };
  }

  /* =========================================================
    MODULE: Activity Summary Cards
    PURPOSE: Render real dashboard snapshot metrics only.
  ========================================================= */
  function renderActivitySummaryCards() {
    const totalUsers = state.adminStats.totalUsers ?? 0;
    const activeSessions = state.adminStats.concurrentUsers ?? 0;
    const openTickets = state.openTicketCount ?? 0;

    setText("activityTotalLogins", totalUsers);
    setText("activityPeakSessions", activeSessions);
    setText("activityActiveUsers", openTickets);
  }

  /* =========================================================
     MODULE: Activity Chart
     PURPOSE: Render admin activity line chart using Chart.js.
  ========================================================= */
  function renderActivityChart() {
    const canvas = document.getElementById("adminActivityChart");
    const emptyState = document.getElementById("adminActivityChartEmpty");

    if (state.activityChart) {
      state.activityChart.destroy();
      state.activityChart = null;
    }

    if (canvas) {
      canvas.style.display = "none";
    }

    if (emptyState) {
      emptyState.style.display = "grid";
    }
  }

  return {
    init,
    refreshDashboard,
    loadUsers,
    loadAdminTickets,
    updateTicketStatus,
  };
})();