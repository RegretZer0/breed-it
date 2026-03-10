//system-admin/dashboard.js
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
    
    users: {
      roleTab: "all",
      status: "all",
      sort: "name_asc",
      search: "",
      currentPage: 1,
      pageSize: 10,
      totalPages: 1,
      totalResults: 0,
    },

    maintenanceStatus: "all",
    maintenancePage: 1,
    maintenanceLimit: 10,
    maintenanceTotalPages: 1,
    maintenanceTotal: 0,

    archiveStatus: "all",
    archivePage: 1,
    archiveLimit: 10,
    archiveTotalPages: 1,
    archiveTotal: 0,

    tickets: {
      status: "all",
      category: "all",
      priority: "all",
      role: "all",
      search: "",
      page: 1,
      limit: 5,
      totalPages: 1,
      total: 0,
      stats: {
        open: 0,
        in_progress: 0,
        resolved: 0,
        closed: 0,
        archived: 0
      }
    },

    archiveTickets: {
      search: "",
      category: "all",
      priority: "all",
      page: 1,
      limit: 6,
      totalPages: 1,
      total: 0
    },
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
    const sendMaintBtn = document.getElementById("sendMaintBtn");
    const teleportBtn = document.getElementById("teleportBtn");
    const resetTimeBtn = document.getElementById("resetTimeBtn");
    const manualRefreshBtn = document.getElementById("manualRefreshBtn");
    const themeToggleBtn = document.getElementById("themeToggleBtn");

    bindSidebar();
    bindActivityRangeEvents();
    bindMaintenanceHistoryEvents();
    bindUsersControls();
    bindTicketControls();
    bindTicketsTableEvents();

    logoutBtn?.addEventListener("click", logout);
    sendMaintBtn?.addEventListener("click", broadcastMaintenance);
    teleportBtn?.addEventListener("click", () => teleportSystemTime(false));
    resetTimeBtn?.addEventListener("click", () => teleportSystemTime(true));
    themeToggleBtn?.addEventListener("click", toggleTheme);

    manualRefreshBtn?.addEventListener("click", async () => {
      await refreshPageData();
    });

    bindUsersTableEvents();
  }

  /* =========================================================
     MODULE: Maintenance History Events
     PURPOSE: Handle tabs, archive toggle, pagination, and actions.
  ========================================================= */
  function bindMaintenanceHistoryEvents() {
    const tabsWrap = document.getElementById("maintenanceTabs");
    const prevBtn = document.getElementById("maintenancePrevBtn");
    const nextBtn = document.getElementById("maintenanceNextBtn");
    const tableBody = document.getElementById("maintenanceHistoryBody");

    const archiveTabsWrap = document.getElementById("maintenanceArchiveTabs");
    const archivePrevBtn = document.getElementById("maintenanceArchivePrevBtn");
    const archiveNextBtn = document.getElementById("maintenanceArchiveNextBtn");
    const archiveTableBody = document.getElementById("maintenanceArchiveBody");
    const archiveModal = document.getElementById("maintenanceArchiveModal");

    tabsWrap?.addEventListener("click", async (e) => {
      const btn = e.target.closest(".sa-history-tab");
      if (!btn) return;

      const nextStatus = btn.dataset.status || "all";
      if (nextStatus === state.maintenanceStatus) return;

      state.maintenanceStatus = nextStatus;
      state.maintenancePage = 1;
      syncMaintenanceTabs();
      await loadMaintenanceHistory();
    });

    prevBtn?.addEventListener("click", async () => {
      if (state.maintenancePage <= 1) return;
      state.maintenancePage -= 1;
      await loadMaintenanceHistory();
    });

    nextBtn?.addEventListener("click", async () => {
      if (state.maintenancePage >= state.maintenanceTotalPages) return;
      state.maintenancePage += 1;
      await loadMaintenanceHistory();
    });

    tableBody?.addEventListener("click", async (e) => {
      const cancelBtn = e.target.closest(".maintenance-cancel-btn");
      if (!cancelBtn) return;

      const id = cancelBtn.dataset.id;
      if (!id) return;

      const confirmed = window.confirm("Cancel this maintenance broadcast?");
      if (!confirmed) return;

      await cancelMaintenanceRecord(id);
    });

    archiveTabsWrap?.addEventListener("click", async (e) => {
      const btn = e.target.closest(".sa-history-tab");
      if (!btn) return;

      const nextStatus = btn.dataset.status || "all";
      if (nextStatus === state.archiveStatus) return;

      state.archiveStatus = nextStatus;
      state.archivePage = 1;
      syncArchiveTabs();
      await loadArchivedMaintenanceHistory();
    });

    archivePrevBtn?.addEventListener("click", async () => {
      if (state.archivePage <= 1) return;
      state.archivePage -= 1;
      await loadArchivedMaintenanceHistory();
    });

    archiveNextBtn?.addEventListener("click", async () => {
      if (state.archivePage >= state.archiveTotalPages) return;
      state.archivePage += 1;
      await loadArchivedMaintenanceHistory();
    });

    archiveTableBody?.addEventListener("click", async (e) => {
      const restoreBtn = e.target.closest(".maintenance-restore-btn");
      if (!restoreBtn) return;

      const id = restoreBtn.dataset.id;
      if (!id) return;

      const confirmed = window.confirm("Restore this archived maintenance record?");
      if (!confirmed) return;

      await restoreMaintenanceRecord(id);
    });

    archiveModal?.addEventListener("shown.bs.modal", async () => {
      await loadArchivedMaintenanceHistory();
    });
  }

  /* =========================================================
    MODULE: User Control Events
    PURPOSE: Handle role tabs, filters, search, and pagination.
  ========================================================= */
  function bindUsersControls() {
    const searchUser = document.getElementById("searchUser");
    const userStatusFilter = document.getElementById("userStatusFilter");
    const userSortFilter = document.getElementById("userSortFilter");
    const clearUserFiltersBtn = document.getElementById("clearUserFiltersBtn");
    const usersRoleTabs = document.getElementById("usersRoleTabs");
    const usersPrevBtn = document.getElementById("usersPrevBtn");
    const usersNextBtn = document.getElementById("usersNextBtn");

    searchUser?.addEventListener("input", (e) => {
      state.users.search = (e.target.value || "").trim().toLowerCase();
      state.users.currentPage = 1;
      applyUserFiltersAndRender();
    });

    userStatusFilter?.addEventListener("change", (e) => {
      state.users.status = e.target.value || "all";
      state.users.currentPage = 1;
      applyUserFiltersAndRender();
    });

    userSortFilter?.addEventListener("change", (e) => {
      state.users.sort = e.target.value || "name_asc";
      state.users.currentPage = 1;
      applyUserFiltersAndRender();
    });

    clearUserFiltersBtn?.addEventListener("click", () => {
      state.users.roleTab = "all";
      state.users.status = "all";
      state.users.sort = "name_asc";
      state.users.search = "";
      state.users.currentPage = 1;

      if (searchUser) searchUser.value = "";
      if (userStatusFilter) userStatusFilter.value = "all";
      if (userSortFilter) userSortFilter.value = "name_asc";

      syncUserRoleTabs();
      applyUserFiltersAndRender();
    });

    usersRoleTabs?.addEventListener("click", (e) => {
      const btn = e.target.closest(".sa-users-tab");
      if (!btn) return;

      const nextRole = btn.dataset.role || "all";
      if (nextRole === state.users.roleTab) return;

      state.users.roleTab = nextRole;
      state.users.currentPage = 1;
      syncUserRoleTabs();
      applyUserFiltersAndRender();
    });

    usersPrevBtn?.addEventListener("click", () => {
      if (state.users.currentPage <= 1) return;
      state.users.currentPage -= 1;
      renderUsersTable(state.filteredUsers);
    });

    usersNextBtn?.addEventListener("click", () => {
      if (state.users.currentPage >= state.users.totalPages) return;
      state.users.currentPage += 1;
      renderUsersTable(state.filteredUsers);
    });
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
    MODULE: Ticket Card Events
    PURPOSE: Handle apply, archive, and restore actions.
  ========================================================= */
  function bindTicketsTableEvents() {
    const ticketsWrap = document.getElementById("adminTicketsTable");
    const archiveWrap = document.getElementById("adminArchivedTicketsBody");

    ticketsWrap?.addEventListener("click", async (e) => {
      const updateBtn = e.target.closest(".ticketUpdateBtn");
      const archiveBtn = e.target.closest(".ticketArchiveBtn");

      if (updateBtn) {
        const mongoId = updateBtn.dataset.id;
        const select = document.querySelector(`.ticketStatusSelect[data-id="${mongoId}"]`);
        const newStatus = select?.value;

        if (!mongoId || !newStatus) return;
        await updateTicketStatus(mongoId, newStatus);
        return;
      }

      if (archiveBtn) {
        const mongoId = archiveBtn.dataset.id;
        if (!mongoId) return;
        await archiveTicket(mongoId);
      }
    });

    archiveWrap?.addEventListener("click", async (e) => {
      const restoreBtn = e.target.closest(".ticketRestoreBtn");
      if (!restoreBtn) return;

      const mongoId = restoreBtn.dataset.id;
      if (!mongoId) return;

      await restoreTicket(mongoId);
    });
  }

  /* =========================================================
    MODULE: Ticket Helpers
    PURPOSE: Shared label, badge, and date helpers for tickets.
  ========================================================= */
  function formatRoleLabel(role) {
    const map = {
      system_admin: "System Admin",
      farm_manager: "Farm Manager",
      encoder: "Encoder",
      farmer: "Farmer",
    };
    return map[role] || "Unknown";
  }

  function formatTicketStatusLabel(status) {
    const map = {
      open: "Open",
      in_progress: "In Progress",
      resolved: "Resolved",
      closed: "Closed",
    };
    return map[status] || "Unknown";
  }

  function formatTicketPriorityLabel(priority) {
    const map = {
      low: "Low",
      normal: "Normal",
      high: "High",
      urgent: "Urgent",
    };
    return map[priority] || "Normal";
  }

  function formatTicketCategoryLabel(category) {
    const map = {
      technical: "Technical",
      billing: "Billing",
      account: "Account",
      other: "Other",
    };
    return map[category] || "Other";
  }

  function formatTicketDate(value) {
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

  function buildTicketStatusBadge(status) {
    const normalized = String(status || "").toLowerCase();
    return `<span class="sa-ticket-status-badge sa-ticket-status-${escapeHtml(normalized)}">${escapeHtml(formatTicketStatusLabel(normalized))}</span>`;
  }

  function buildTicketPriorityBadge(priority) {
    const normalized = String(priority || "").toLowerCase();
    return `<span class="sa-ticket-priority-badge sa-ticket-priority-${escapeHtml(normalized)}">${escapeHtml(formatTicketPriorityLabel(normalized))}</span>`;
  }

  function buildTicketCategoryBadge(category) {
    const normalized = String(category || "").toLowerCase();
    return `<span class="sa-ticket-category-badge">${escapeHtml(formatTicketCategoryLabel(normalized))}</span>`;
  }

  function updateTicketStats(stats = {}) {
    setText("ticketStatOpen", stats.open ?? 0);
    setText("ticketStatInProgress", stats.in_progress ?? 0);
    setText("ticketStatResolved", stats.resolved ?? 0);
    setText("ticketStatClosed", stats.closed ?? 0);

    const badge = document.getElementById("ticketCountBadge");
    if (badge) {
      badge.textContent = `${stats.open ?? 0} Open Tickets`;
    }
  }

  function syncTicketTabs() {
    const tabs = document.querySelectorAll("#ticketStatusTabs .sa-ticket-tab");
    tabs.forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.status === state.tickets.status);
    });
  }

  function updateTicketsPagination(pagination = {}) {
    const info = document.getElementById("ticketsPaginationInfo");
    const meta = document.getElementById("ticketsResultMeta");
    const prevBtn = document.getElementById("ticketsPrevBtn");
    const nextBtn = document.getElementById("ticketsNextBtn");

    const page = pagination.page || state.tickets.page || 1;
    const totalPages = pagination.totalPages || 1;
    const total = pagination.total || 0;
    const limit = pagination.limit || state.tickets.limit;

    state.tickets.page = page;
    state.tickets.totalPages = totalPages;
    state.tickets.total = total;

    const start = total === 0 ? 0 : (page - 1) * limit + 1;
    const end = Math.min(page * limit, total);

    if (info) {
      info.textContent = total === 0 ? "Showing 0 of 0" : `Showing ${start}-${end} of ${total}`;
    }

    if (meta) {
      meta.textContent = total === 0
        ? "No tickets found for the current filters."
        : `${total} ticket${total === 1 ? "" : "s"} in the current result set.`;
    }

    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page >= totalPages;
  }

  function updateTicketArchivePagination(pagination = {}) {
    const info = document.getElementById("archivePaginationInfo");
    const meta = document.getElementById("archiveResultMeta");
    const prevBtn = document.getElementById("archivePrevBtn");
    const nextBtn = document.getElementById("archiveNextBtn");

    const page = pagination.page || state.archiveTickets.page || 1;
    const totalPages = pagination.totalPages || 1;
    const total = pagination.total || 0;
    const limit = pagination.limit || state.archiveTickets.limit;

    state.archiveTickets.page = page;
    state.archiveTickets.totalPages = totalPages;
    state.archiveTickets.total = total;

    const start = total === 0 ? 0 : (page - 1) * limit + 1;
    const end = Math.min(page * limit, total);

    if (info) {
      info.textContent = total === 0 ? "Showing 0 of 0" : `Showing ${start}-${end} of ${total}`;
    }

    if (meta) {
      meta.textContent = total === 0
        ? "No archived tickets found."
        : `${total} archived ticket${total === 1 ? "" : "s"} found.`;
    }

    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page >= totalPages;
  }

  /* =========================================================
     MODULE: App Init
     PURPOSE: Start all page processes.
  ========================================================= */
  async function init() {
    initTheme();
    bindEvents();
    syncUserRoleTabs();
    syncMaintenanceTabs();
    syncArchiveTabs();

    updateMaintenancePagination({
      page: 1,
      totalPages: 1,
      total: 0,
      limit: state.maintenanceLimit,
    });

    updateTicketArchivePagination({
      page: 1,
      totalPages: 1,
      total: 0,
      limit: state.archiveLimit,
    });

    await refreshPageData();
    startAutoRefresh();
  }

  /* =========================================================
    MODULE: Ticket Filters And Pagination
    PURPOSE: Handle tabs, filters, archive panel, and pagination.
  ========================================================= */
  function bindTicketControls() {
    const statusTabs = document.getElementById("ticketStatusTabs");
    const searchInput = document.getElementById("ticketSearchInput");
    const categoryFilter = document.getElementById("ticketCategoryFilter");
    const priorityFilter = document.getElementById("ticketPriorityFilter");
    const roleFilter = document.getElementById("ticketRoleFilter");
    const clearBtn = document.getElementById("clearTicketFiltersBtn");
    const prevBtn = document.getElementById("ticketsPrevBtn");
    const nextBtn = document.getElementById("ticketsNextBtn");

    const archivePanel = document.getElementById("ticketsArchivePanel");
    const archiveSearchInput = document.getElementById("archiveSearchInput");
    const archiveCategoryFilter = document.getElementById("archiveCategoryFilter");
    const archivePriorityFilter = document.getElementById("archivePriorityFilter");
    const clearArchiveBtn = document.getElementById("clearArchiveFiltersBtn");
    const archivePrevBtn = document.getElementById("archivePrevBtn");
    const archiveNextBtn = document.getElementById("archiveNextBtn");

    statusTabs?.addEventListener("click", async (e) => {
      const btn = e.target.closest(".sa-ticket-tab");
      if (!btn) return;

      const nextStatus = btn.dataset.status || "all";
      if (nextStatus === state.tickets.status) return;

      state.tickets.status = nextStatus;
      state.tickets.page = 1;
      syncTicketTabs();
      await loadAdminTickets();
    });

    searchInput?.addEventListener("input", async (e) => {
      state.tickets.search = (e.target.value || "").trim();
      state.tickets.page = 1;
      await loadAdminTickets();
    });

    categoryFilter?.addEventListener("change", async (e) => {
      state.tickets.category = e.target.value || "all";
      state.tickets.page = 1;
      await loadAdminTickets();
    });

    priorityFilter?.addEventListener("change", async (e) => {
      state.tickets.priority = e.target.value || "all";
      state.tickets.page = 1;
      await loadAdminTickets();
    });

    roleFilter?.addEventListener("change", async (e) => {
      state.tickets.role = e.target.value || "all";
      state.tickets.page = 1;
      await loadAdminTickets();
    });

    clearBtn?.addEventListener("click", async () => {
      state.tickets.status = "all";
      state.tickets.category = "all";
      state.tickets.priority = "all";
      state.tickets.role = "all";
      state.tickets.search = "";
      state.tickets.page = 1;

      if (searchInput) searchInput.value = "";
      if (categoryFilter) categoryFilter.value = "all";
      if (priorityFilter) priorityFilter.value = "all";
      if (roleFilter) roleFilter.value = "all";

      syncTicketTabs();
      await loadAdminTickets();
    });

    prevBtn?.addEventListener("click", async () => {
      if (state.tickets.page <= 1) return;
      state.tickets.page -= 1;
      await loadAdminTickets();
    });

    nextBtn?.addEventListener("click", async () => {
      if (state.tickets.page >= state.tickets.totalPages) return;
      state.tickets.page += 1;
      await loadAdminTickets();
    });

    archivePanel?.addEventListener("shown.bs.modal", async () => {
      await loadArchivedTickets();
    });

    archiveSearchInput?.addEventListener("input", async (e) => {
      state.archiveTickets.search = (e.target.value || "").trim();
      state.archiveTickets.page = 1;
      await loadArchivedTickets();
    });

    archiveCategoryFilter?.addEventListener("change", async (e) => {
      state.archiveTickets.category = e.target.value || "all";
      state.archiveTickets.page = 1;
      await loadArchivedTickets();
    });

    archivePriorityFilter?.addEventListener("change", async (e) => {
      state.archiveTickets.priority = e.target.value || "all";
      state.archiveTickets.page = 1;
      await loadArchivedTickets();
    });

    clearArchiveBtn?.addEventListener("click", async () => {
      state.archiveTickets.search = "";
      state.archiveTickets.category = "all";
      state.archiveTickets.priority = "all";
      state.archiveTickets.page = 1;

      if (archiveSearchInput) archiveSearchInput.value = "";
      if (archiveCategoryFilter) archiveCategoryFilter.value = "all";
      if (archivePriorityFilter) archivePriorityFilter.value = "all";

      await loadArchivedTickets();
    });

    archivePrevBtn?.addEventListener("click", async () => {
      if (state.archiveTickets.page <= 1) return;
      state.archiveTickets.page -= 1;
      await loadArchivedTickets();
    });

    archiveNextBtn?.addEventListener("click", async () => {
      if (state.archiveTickets.page >= state.archiveTickets.totalPages) return;
      state.archiveTickets.page += 1;
      await loadArchivedTickets();
    });
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
        loadArchivedMaintenanceHistory(),
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

        state.maintenancePage = 1;
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
          <td colspan="6" class="text-center py-4">Loading maintenance history...</td>
        </tr>
      `;

      const params = new URLSearchParams({
        status: state.maintenanceStatus,
        page: String(state.maintenancePage),
        limit: String(state.maintenanceLimit),
        archived: "false",
      });

      const { data } = await fetchJson(`/api/notifications/maintenance-history?${params.toString()}`);

      if (!data.success) {
        renderMaintenanceHistory([]);
        updateMaintenanceSummary([]);
        updateMaintenancePagination({
          page: 1,
          totalPages: 1,
          total: 0,
          limit: state.maintenanceLimit,
        });
        return;
      }

      const records = Array.isArray(data.history) ? data.history : [];
      const pagination = data.pagination || {};

      state.maintenanceTotalPages = pagination.totalPages || 1;
      state.maintenanceTotal = pagination.total || 0;

      renderMaintenanceHistory(records);
      updateMaintenanceSummary(records);
      updateMaintenancePagination(pagination);
    } catch (err) {
      console.error("Maintenance History Load Error:", err);

      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-4 text-danger">
            Failed to load maintenance history.
          </td>
        </tr>
      `;

      updateMaintenanceSummary([]);
      updateMaintenancePagination({
        page: 1,
        totalPages: 1,
        total: 0,
        limit: state.maintenanceLimit,
      });
    }
  }

  async function loadArchivedMaintenanceHistory() {
    const tbody = document.getElementById("maintenanceArchiveBody");
    if (!tbody) return;

    try {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-4">Loading archived maintenance...</td>
        </tr>
      `;

      const params = new URLSearchParams({
        status: state.archiveStatus,
        page: String(state.archivePage),
        limit: String(state.archiveLimit),
        archived: "true",
      });

      const { data } = await fetchJson(`/api/notifications/maintenance-history?${params.toString()}`);

      if (!data.success) {
        renderArchivedMaintenanceHistory([]);
        updateArchivePagination({
          page: 1,
          totalPages: 1,
          total: 0,
          limit: state.archiveLimit,
        });
        return;
      }

      const records = Array.isArray(data.history) ? data.history : [];
      const pagination = data.pagination || {};

      state.archiveTotalPages = pagination.totalPages || 1;
      state.archiveTotal = pagination.total || 0;

      renderArchivedMaintenanceHistory(records);
      updateArchivePagination(pagination);
    } catch (err) {
      console.error("Archived Maintenance Load Error:", err);

      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-4 text-danger">
            Failed to load archived maintenance.
          </td>
        </tr>
      `;

      updateArchivePagination({
        page: 1,
        totalPages: 1,
        total: 0,
        limit: state.archiveLimit,
      });
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
          <td colspan="6" class="text-center py-5">
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
      const title = escapeHtml(item.title || "Untitled Maintenance");
      const message = escapeHtml(item.message || "-");
      const start = formatMaintenanceDate(item.scheduled_for || item.created_at);
      const end = formatMaintenanceDate(item.ends_at);
      const status = getMaintenanceStatus(item);
      const rawStatus = normalizeMaintenanceRawStatus(item);
      const canCancel = rawStatus === "scheduled" || rawStatus === "active";
      const itemId = escapeHtml(item._id || "");

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
          <td>
            ${canCancel ? `
              <button
                type="button"
                class="btn sa-btn-danger btn-sm maintenance-cancel-btn"
                data-id="${itemId}"
              >
                <i class="bi bi-x-circle me-1"></i>
                Cancel
              </button>
            ` : `
              <span class="sa-table-toolbar-text">No action</span>
            `}
          </td>
        </tr>
      `;
    }).join("");
  }

  function renderArchivedMaintenanceHistory(records = []) {
    const tbody = document.getElementById("maintenanceArchiveBody");
    if (!tbody) return;

    if (!records.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-5">
            <div class="sa-empty-state">
              <div class="sa-empty-state-icon">
                <i class="bi bi-archive"></i>
              </div>
              <div class="sa-empty-state-title">No archived maintenance records</div>
              <div class="sa-empty-state-text">
                Completed and cancelled records moved to archive will appear here.
              </div>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = records.map((item) => {
      const title = escapeHtml(item.title || "Untitled Maintenance");
      const message = escapeHtml(item.message || "-");
      const start = formatMaintenanceDate(item.scheduled_for || item.created_at);
      const end = formatMaintenanceDate(item.ends_at);
      const status = getMaintenanceStatus(item);
      const itemId = escapeHtml(item._id || "");

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
          <td>
            <button
              type="button"
              class="btn sa-btn-outline btn-sm maintenance-restore-btn"
              data-id="${itemId}"
            >
              <i class="bi bi-arrow-counterclockwise me-1"></i>
              Restore
            </button>
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
    let total = records.length;
    let scheduled = 0;
    let active = 0;
    let completed = 0;

    records.forEach((item) => {
      const rawStatus = normalizeMaintenanceRawStatus(item);

      if (rawStatus === "scheduled") {
        scheduled++;
        return;
      }

      if (rawStatus === "active") {
        active++;
        return;
      }

      if (rawStatus === "completed") {
        completed++;
      }
    });

    setText("maintenanceHistoryCount", total);
    setText("maintenanceScheduledCount", scheduled);
    setText("maintenanceActiveCount", active);
    setText("maintenanceCompletedCount", completed);
  }

  /* =========================================================
     MODULE: Maintenance Actions
     PURPOSE: Handle cancel requests for maintenance records.
  ========================================================= */
  async function cancelMaintenanceRecord(id) {
    try {
      const { data } = await fetchJson(`/api/notifications/maintenance-history/${id}/cancel`, {
        method: "PATCH",
      });

      if (!data.success) {
        alert(data.message || "Failed to cancel maintenance.");
        return;
      }

      alert("Maintenance cancelled successfully.");
      await loadMaintenanceHistory();
    } catch (err) {
      console.error("Cancel Maintenance Error:", err);
      alert("Error cancelling maintenance.");
    }
  }

  /* =========================================================
     MODULE: Maintenance UI Sync
     PURPOSE: Keep tabs, archive toggle, and pagination in sync.
  ========================================================= */
  function syncMaintenanceTabs() {
    const tabs = document.querySelectorAll("#maintenanceTabs .sa-history-tab");
    tabs.forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.status === state.maintenanceStatus);
    });
  }

  function updateMaintenancePagination(pagination = {}) {
    const info = document.getElementById("maintenancePaginationInfo");
    const prevBtn = document.getElementById("maintenancePrevBtn");
    const nextBtn = document.getElementById("maintenanceNextBtn");

    const page = pagination.page || state.maintenancePage || 1;
    const totalPages = pagination.totalPages || 1;
    const total = pagination.total || 0;
    const limit = pagination.limit || state.maintenanceLimit;

    state.maintenancePage = page;
    state.maintenanceTotalPages = totalPages;
    state.maintenanceTotal = total;

    const start = total === 0 ? 0 : (page - 1) * limit + 1;
    const end = Math.min(page * limit, total);

    if (info) {
      info.textContent = total === 0
        ? "Showing 0 of 0"
        : `Showing ${start}-${end} of ${total}`;
    }

    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page >= totalPages;
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

  function syncArchiveTabs() {
  const tabs = document.querySelectorAll("#maintenanceArchiveTabs .sa-history-tab");
  tabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.status === state.archiveStatus);
  });
}

function updateArchivePagination(pagination = {}) {
  const info = document.getElementById("maintenanceArchivePaginationInfo");
  const prevBtn = document.getElementById("maintenanceArchivePrevBtn");
  const nextBtn = document.getElementById("maintenanceArchiveNextBtn");

  const page = pagination.page || state.archivePage || 1;
  const totalPages = pagination.totalPages || 1;
  const total = pagination.total || 0;
  const limit = pagination.limit || state.archiveLimit;

  state.archivePage = page;
  state.archiveTotalPages = totalPages;
  state.archiveTotal = total;

  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  if (info) {
    info.textContent = total === 0
      ? "Showing 0 of 0"
      : `Showing ${start}-${end} of ${total}`;
  }

  if (prevBtn) prevBtn.disabled = page <= 1;
  if (nextBtn) nextBtn.disabled = page >= totalPages;
}

async function restoreMaintenanceRecord(id) {
  try {
    const { data } = await fetchJson(`/api/notifications/maintenance-history/${id}/restore`, {
      method: "PATCH",
    });

    if (!data.success) {
      alert(data.message || "Failed to restore maintenance.");
      return;
    }

    alert("Maintenance restored successfully.");
    await Promise.all([
      loadMaintenanceHistory(),
      loadArchivedMaintenanceHistory(),
    ]);
  } catch (err) {
    console.error("Restore Maintenance Error:", err);
    alert("Error restoring maintenance.");
  }
}

  function normalizeMaintenanceRawStatus(item) {
    const status = String(item?.status || "").toLowerCase().trim();

    if (status === "scheduled" || status === "active" || status === "completed" || status === "cancelled") {
      return status;
    }

    const now = new Date();
    const start = new Date(item?.scheduled_for || item?.created_at);
    const end = new Date(item?.ends_at);

    if (Number.isNaN(start.getTime())) return "unknown";
    if (start > now) return "scheduled";
    if (!Number.isNaN(end.getTime()) && start <= now && end >= now) return "active";
    return "completed";
  }

  function getMaintenanceStatus(item) {
    const rawStatus = normalizeMaintenanceRawStatus(item);

    if (rawStatus === "scheduled") return "Upcoming";
    if (rawStatus === "active") return "Active";
    if (rawStatus === "completed") return "Completed";
    if (rawStatus === "cancelled") return "Cancelled";
    return "Unknown";
  }

  function buildMaintenanceStatusBadge(status) {
    const map = {
      Upcoming: "sa-maint-badge sa-maint-badge-scheduled",
      Active: "sa-maint-badge sa-maint-badge-active",
      Completed: "sa-maint-badge sa-maint-badge-completed",
      Cancelled: "sa-maint-badge sa-maint-badge-unknown",
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
      updateUsersSummary(state.allUsers);
      applyUserFiltersAndRender();
    } catch (err) {
      console.error("Load Users Error:", err);
    }
  }

    /* =========================================================
     MODULE: Users Summary
     PURPOSE: Update user overview metric cards.
  ========================================================= */
  function updateUsersSummary(users = []) {
    const farmManagers = users.filter((u) => u.role === "farm_manager").length;
    const encoders = users.filter((u) => u.role === "encoder").length;
    const farmers = users.filter((u) => u.role === "farmer").length;

    setText("usersTotalCount", users.length);
    setText("usersFarmManagerCount", farmManagers);
    setText("usersEncoderCount", encoders);
    setText("usersFarmerCount", farmers);
  }

  /* =========================================================
     MODULE: Users Tab Sync
     PURPOSE: Keep active tab aligned with state.
  ========================================================= */
  function syncUserRoleTabs() {
    const tabs = document.querySelectorAll(".sa-users-tab");
    tabs.forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.role === state.users.roleTab);
    });
  }

  /* =========================================================
     MODULE: Users Filter Engine
     PURPOSE: Apply role, status, search, and sort rules.
  ========================================================= */
  function applyUserFiltersAndRender() {
    let rows = [...state.allUsers];

    if (state.users.roleTab !== "all") {
      rows = rows.filter((user) => user.role === state.users.roleTab);
    }

    if (state.users.status !== "all") {
      rows = rows.filter((user) => String(user.status || "").toLowerCase() === state.users.status);
    }

    if (state.users.search) {
      rows = rows.filter((user) => {
        const name = getDisplayName(user).toLowerCase();
        const email = String(user.email || "").toLowerCase();
        return name.includes(state.users.search) || email.includes(state.users.search);
      });
    }

    rows.sort((a, b) => compareUsers(a, b, state.users.sort));

    state.filteredUsers = rows;
    state.users.totalResults = rows.length;
    state.users.totalPages = Math.max(1, Math.ceil(rows.length / state.users.pageSize));

    if (state.users.currentPage > state.users.totalPages) {
      state.users.currentPage = state.users.totalPages;
    }

    updateUsersResultMeta();
    renderUsersTable(rows);
  }

  /* =========================================================
     MODULE: Users Sort Helper
     PURPOSE: Sort filtered users by selected rule.
  ========================================================= */
  function compareUsers(a, b, mode) {
    const nameA = getDisplayName(a).toLowerCase();
    const nameB = getDisplayName(b).toLowerCase();
    const emailA = String(a.email || "").toLowerCase();
    const emailB = String(b.email || "").toLowerCase();
    const roleA = String(a.role || "").toLowerCase();
    const roleB = String(b.role || "").toLowerCase();
    const statusA = String(a.status || "").toLowerCase();
    const statusB = String(b.status || "").toLowerCase();

    if (mode === "name_desc") return nameB.localeCompare(nameA);
    if (mode === "email_asc") return emailA.localeCompare(emailB);
    if (mode === "email_desc") return emailB.localeCompare(emailA);
    if (mode === "role_asc") return roleA.localeCompare(roleB);
    if (mode === "status_asc") return statusA.localeCompare(statusB);

    return nameA.localeCompare(nameB);
  }

  /* =========================================================
     MODULE: Users Result Meta
     PURPOSE: Update result count and pagination text.
  ========================================================= */
  function updateUsersResultMeta() {
    const resultCount = document.getElementById("usersResultCount");
    const info = document.getElementById("usersPaginationInfo");
    const prevBtn = document.getElementById("usersPrevBtn");
    const nextBtn = document.getElementById("usersNextBtn");

    const total = state.users.totalResults;
    const page = state.users.currentPage;
    const limit = state.users.pageSize;
    const totalPages = state.users.totalPages;

    const start = total === 0 ? 0 : (page - 1) * limit + 1;
    const end = total === 0 ? 0 : Math.min(page * limit, total);

    if (resultCount) {
      resultCount.textContent = `${total} result${total === 1 ? "" : "s"}`;
    }

    if (info) {
      info.textContent = total === 0
        ? "Showing 0 of 0"
        : `Showing ${start}-${end} of ${total}`;
    }

    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page >= totalPages;
  }

  /* =========================================================
     MODULE: Role Label Helper
     PURPOSE: Convert database role keys into readable labels.
  ========================================================= */
  function formatRoleLabel(role) {
    const map = {
      system_admin: "System Admin",
      farm_manager: "Farm Manager",
      encoder: "Encoder",
      farmer: "Farmer",
    };
    return map[role] || "Unknown";
  }

  /* =========================================================
     MODULE: Status Badge Helper
     PURPOSE: Render visual pill for account status.
  ========================================================= */
  function buildUserStatusBadge(status) {
    const normalized = String(status || "").toLowerCase();
    const label = normalized === "disabled" ? "Disabled" : "Active";
    const cls = normalized === "disabled"
      ? "sa-user-status-badge sa-user-status-disabled"
      : "sa-user-status-badge sa-user-status-active";

    return `<span class="${cls}">${escapeHtml(label)}</span>`;
  }

  /* =========================================================
     MODULE: Users Mobile Cards
     PURPOSE: Render a mobile-friendly card layout.
  ========================================================= */
  function renderUsersCardList(users = []) {
    const list = document.getElementById("usersCardList");
    if (!list) return;

    if (!users.length) {
      list.innerHTML = `
        <div class="sa-empty-state">
          <div class="sa-empty-state-icon">
            <i class="bi bi-people"></i>
          </div>
          <div class="sa-empty-state-title">No users found</div>
          <div class="sa-empty-state-text">
            Try changing the current search, tab, or filters.
          </div>
        </div>
      `;
      return;
    }

    list.innerHTML = users.map((user) => {
      const name = escapeHtml(getDisplayName(user));
      const email = escapeHtml(user.email || "-");
      const id = escapeHtml(user._id || "");
      const role = user.role || "";
      const status = user.status || "";

      return `
        <div class="sa-user-mobile-card">
          <div class="sa-user-mobile-head">
            <div class="sa-user-mobile-avatar">
              <i class="bi bi-person-circle"></i>
            </div>
            <div class="min-w-0">
              <div class="sa-user-mobile-name">${name}</div>
              <div class="sa-user-mobile-email text-truncate">${email}</div>
            </div>
          </div>

          <div class="sa-user-mobile-meta">
            <div class="sa-user-mobile-meta-item">
              <span class="sa-user-mobile-meta-label">Role</span>
              <select class="roleSelect form-select form-select-sm" data-id="${id}">
                <option value="system_admin" ${role === "system_admin" ? "selected" : ""}>System Admin</option>
                <option value="farm_manager" ${role === "farm_manager" ? "selected" : ""}>Farm Manager</option>
                <option value="farmer" ${role === "farmer" ? "selected" : ""}>Farmer</option>
                <option value="encoder" ${role === "encoder" ? "selected" : ""}>Encoder</option>
              </select>
            </div>

            <div class="sa-user-mobile-meta-item">
              <span class="sa-user-mobile-meta-label">Status</span>
              <select class="statusSelect form-select form-select-sm" data-id="${id}">
                <option value="active" ${status === "active" ? "selected" : ""}>Active</option>
                <option value="disabled" ${status === "disabled" ? "selected" : ""}>Disabled</option>
              </select>
            </div>
          </div>

          <div class="d-flex align-items-center justify-content-between gap-2 mt-3">
            ${buildUserStatusBadge(status)}
            <button type="button" class="updateBtn btn btn-sm btn-primary" data-id="${id}">
              <i class="bi bi-check2-circle me-1"></i>
              Update
            </button>
          </div>
        </div>
      `;
    }).join("");
  }

  /* =========================================================
    MODULE: Users Table Render
    PURPOSE: Render paginated user rows safely for table and mobile cards.
  ========================================================= */
  function renderUsersTable(users = []) {
    const tbody = $("#usersTable tbody");
    const page = state.users.currentPage;
    const limit = state.users.pageSize;
    const startIndex = (page - 1) * limit;
    const paginatedUsers = users.slice(startIndex, startIndex + limit);

    if (tbody) {
      if (!paginatedUsers.length) {
        tbody.innerHTML = `
          <tr>
            <td colspan="5" class="text-center py-5">
              <div class="sa-empty-state">
                <div class="sa-empty-state-icon">
                  <i class="bi bi-people"></i>
                </div>
                <div class="sa-empty-state-title">No users found</div>
                <div class="sa-empty-state-text">
                  Try changing the current search, tab, or filters.
                </div>
              </div>
            </td>
          </tr>
        `;
      } else {
        tbody.innerHTML = paginatedUsers.map((user) => {
          const name = escapeHtml(getDisplayName(user));
          const email = escapeHtml(user.email || "-");
          const id = escapeHtml(user._id || "");
          const role = user.role || "";
          const status = user.status || "";

          return `
            <tr>
              <td>
                <div class="d-flex align-items-center gap-2">
                  <span class="sa-user-table-avatar">
                    <i class="bi bi-person-circle"></i>
                  </span>
                  <div>
                    <div class="fw-semibold">${name}</div>
                    <div class="small sa-table-toolbar-text">${formatRoleLabel(role)}</div>
                  </div>
                </div>
              </td>
              <td>${email}</td>
              <td>
                <select class="roleSelect form-select form-select-sm" data-id="${id}">
                  <option value="system_admin" ${role === "system_admin" ? "selected" : ""}>System Admin</option>
                  <option value="farm_manager" ${role === "farm_manager" ? "selected" : ""}>Farm Manager</option>
                  <option value="farmer" ${role === "farmer" ? "selected" : ""}>Farmer</option>
                  <option value="encoder" ${role === "encoder" ? "selected" : ""}>Encoder</option>
                </select>
              </td>
              <td>${buildUserStatusBadge(status)}</td>
              <td>
                <div class="d-flex flex-wrap gap-2">
                  <select class="statusSelect form-select form-select-sm" data-id="${id}" style="max-width: 130px;">
                    <option value="active" ${status === "active" ? "selected" : ""}>Active</option>
                    <option value="disabled" ${status === "disabled" ? "selected" : ""}>Disabled</option>
                  </select>

                  <button type="button" class="updateBtn btn btn-sm btn-primary" data-id="${id}">
                    <i class="bi bi-check2-circle me-1"></i>
                    Update
                  </button>
                </div>
              </td>
            </tr>
          `;
        }).join("");
      }
    }

    renderUsersCardList(paginatedUsers);
    updateUsersResultMeta();
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
     PURPOSE: Compatibility wrapper for search-based filtering.
  ========================================================= */
  function filterUsers(e) {
    state.users.search = (e?.target?.value || "").trim().toLowerCase();
    state.users.currentPage = 1;
    applyUserFiltersAndRender();
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
    MODULE: Active Tickets Data
    PURPOSE: Load filtered active tickets with pagination.
  ========================================================= */
  async function loadAdminTickets() {
    const body = document.getElementById("adminTicketsBody");
    if (body) {
      body.innerHTML = `
        <div class="sa-empty-state py-4">
          <div class="sa-empty-state-icon">
            <i class="bi bi-arrow-repeat"></i>
          </div>
          <div class="sa-empty-state-title">Loading tickets</div>
          <div class="sa-empty-state-text">Please wait while the support queue is being refreshed.</div>
        </div>
      `;
    }

    try {
      const params = new URLSearchParams({
        archived: "false",
        page: String(state.tickets.page),
        limit: String(state.tickets.limit),
        status: state.tickets.status,
        category: state.tickets.category,
        priority: state.tickets.priority,
        role: state.tickets.role,
        q: state.tickets.search
      });

      const { data } = await fetchJson(`/api/support/admin/all?${params.toString()}`);
      if (!data.success) {
        renderAdminTickets([]);
        updateTicketStats({});
        updateTicketsPagination({
          page: 1,
          totalPages: 1,
          total: 0,
          limit: state.tickets.limit
        });
        return;
      }

      state.tickets.stats = data.stats || {};
      updateTicketStats(state.tickets.stats);
      renderAdminTickets(Array.isArray(data.tickets) ? data.tickets : []);
      updateTicketsPagination(data.pagination || {});
    } catch (err) {
      console.error("Ticket Load Error:", err);
      renderAdminTickets([]);
      updateTicketsPagination({
        page: 1,
        totalPages: 1,
        total: 0,
        limit: state.tickets.limit
      });
    }
  }

  /* =========================================================
    MODULE: Active Tickets Render
    PURPOSE: Render tickets as clean structured cards.
  ========================================================= */
  function renderAdminTickets(tickets = []) {
    const body = document.getElementById("adminTicketsBody");
    if (!body) return;

    if (!tickets.length) {
      body.innerHTML = `
        <div class="sa-empty-state py-5">
          <div class="sa-empty-state-icon">
            <i class="bi bi-inbox"></i>
          </div>
          <div class="sa-empty-state-title">No support tickets found</div>
          <div class="sa-empty-state-text">
            Try changing the current tabs or filters to view more tickets.
          </div>
        </div>
      `;
      return;
    }

    body.innerHTML = `
      <div class="row g-3">
        ${tickets.map((ticket) => {
          const userName = escapeHtml(getDisplayName(ticket.user_id) || ticket.name || "-");
          const userEmail = escapeHtml(ticket.user_id?.email || ticket.email || "-");
          const userRole = escapeHtml(formatRoleLabel(ticket.user_id?.role || ""));
          const category = ticket.category || "other";
          const priority = ticket.priority || "normal";
          const status = ticket.status || "open";
          const ticketId = escapeHtml(ticket.ticket_id || "-");
          const subject = escapeHtml(ticket.subject || "-");
          const message = escapeHtml(ticket.message || "-");
          const pageUrl = escapeHtml(ticket.page_url || "-");
          const createdAt = formatTicketDate(ticket.createdAt);
          const mongoId = escapeHtml(ticket._id || "");
          const canArchive = status === "closed";

          return `
            <div class="col-12">
              <article class="sa-ticket-card">
                <div class="sa-ticket-card-header">
                  <div class="min-w-0">
                    <div class="sa-ticket-id">#${ticketId}</div>
                    <h3 class="sa-ticket-title mb-0">${subject}</h3>
                  </div>
                  <div class="sa-ticket-header-badge">
                    ${buildTicketStatusBadge(status)}
                  </div>
                </div>

                <div class="sa-ticket-user-block">
                  <div class="sa-ticket-user-icon">
                    <i class="bi bi-person-circle"></i>
                  </div>
                  <div class="min-w-0">
                    <div class="sa-ticket-user-name">${userName}</div>
                    <div class="sa-ticket-user-meta">${userEmail}</div>
                    <div class="sa-ticket-user-meta">${userRole}</div>
                  </div>
                </div>

                <div class="sa-ticket-chip-row">
                  ${buildTicketCategoryBadge(category)}
                  ${buildTicketPriorityBadge(priority)}
                  <span class="sa-ticket-soft-chip">
                    <i class="bi bi-calendar3 me-1"></i>${createdAt}
                  </span>
                </div>

                <div class="sa-ticket-section">
                  <div class="sa-ticket-section-label">
                    <i class="bi bi-card-text me-2"></i>Message / Note
                  </div>
                  <div class="sa-ticket-message">${message}</div>
                </div>

                <div class="sa-ticket-actions">
                  <div class="row g-2">
                    <div class="col-12 col-md-7">
                      <label class="sa-label mb-2">Update Status</label>
                      <select class="ticketStatusSelect form-select form-select-sm" data-id="${mongoId}">
                        <option value="open" ${status === "open" ? "selected" : ""}>Open</option>
                        <option value="in_progress" ${status === "in_progress" ? "selected" : ""}>In Progress</option>
                        <option value="resolved" ${status === "resolved" ? "selected" : ""}>Resolved</option>
                        <option value="closed" ${status === "closed" ? "selected" : ""}>Closed</option>
                      </select>
                    </div>

                    <div class="col-12 col-md-5 d-flex align-items-end">
                      <button type="button" class="btn sa-btn-primary w-100 ticketUpdateBtn" data-id="${mongoId}">
                        <i class="bi bi-check2-circle me-2"></i>
                        Apply
                      </button>
                    </div>
                  </div>

                  ${canArchive ? `
                    <div class="mt-2">
                      <button type="button" class="btn sa-btn-outline w-100 ticketArchiveBtn" data-id="${mongoId}">
                        <i class="bi bi-archive me-2"></i>
                        Move to Archive
                      </button>
                    </div>
                  ` : ""}
                </div>
              </article>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  /* =========================================================
     MODULE: Ticket Status Update
     PURPOSE: Update support ticket status and refresh lists.
  ========================================================= */
  async function updateTicketStatus(mongoId, newStatus) {
    try {
      const { data } = await fetchJson(`/api/support/admin/ticket/${mongoId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });

      if (data.success) {
        await Promise.all([
          loadAdminTickets(),
          loadArchivedTickets()
        ]);
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
    MODULE: Archived Tickets Data
    PURPOSE: Load archived tickets for the archive panel.
  ========================================================= */
  async function loadArchivedTickets() {
    const body = document.getElementById("adminArchivedTicketsBody");
    if (!body) return;

    body.innerHTML = `
      <div class="sa-empty-state py-4">
        <div class="sa-empty-state-icon">
          <i class="bi bi-archive"></i>
        </div>
        <div class="sa-empty-state-title">Loading archive</div>
        <div class="sa-empty-state-text">Please wait while archived tickets are being loaded.</div>
      </div>
    `;

    try {
      const params = new URLSearchParams({
        archived: "true",
        page: String(state.archiveTickets.page),
        limit: String(state.archiveTickets.limit),
        status: "all",
        category: state.archiveTickets.category,
        priority: state.archiveTickets.priority,
        q: state.archiveTickets.search
      });

      const { data } = await fetchJson(`/api/support/admin/all?${params.toString()}`);
      if (!data.success) {
        renderArchivedTickets([]);
        updateArchivePagination({
          page: 1,
          totalPages: 1,
          total: 0,
          limit: state.archiveTickets.limit
        });
        return;
      }

      renderArchivedTickets(Array.isArray(data.tickets) ? data.tickets : []);
      updateArchivePagination(data.pagination || {});
    } catch (err) {
      console.error("Archived Ticket Load Error:", err);
      renderArchivedTickets([]);
      updateArchivePagination({
        page: 1,
        totalPages: 1,
        total: 0,
        limit: state.archiveTickets.limit
      });
    }
  }

  /* =========================================================
    MODULE: Archived Tickets Render
    PURPOSE: Render archived tickets in side archive panel.
  ========================================================= */
  function renderArchivedTickets(tickets = []) {
    const body = document.getElementById("adminArchivedTicketsBody");
    if (!body) return;

    if (!tickets.length) {
      body.innerHTML = `
        <div class="sa-empty-state py-4">
          <div class="sa-empty-state-icon">
            <i class="bi bi-archive"></i>
          </div>
          <div class="sa-empty-state-title">No archived tickets</div>
          <div class="sa-empty-state-text">
            Closed tickets older than 3 months will appear here automatically.
          </div>
        </div>
      `;
      return;
    }

    body.innerHTML = tickets.map((ticket) => {
      const userName = escapeHtml(getDisplayName(ticket.user_id) || ticket.name || "-");
      const userEmail = escapeHtml(ticket.user_id?.email || ticket.email || "-");
      const userRole = escapeHtml(formatRoleLabel(ticket.user_id?.role || ""));
      const ticketId = escapeHtml(ticket.ticket_id || "-");
      const subject = escapeHtml(ticket.subject || "-");
      const message = escapeHtml(ticket.message || "-");
      const createdAt = formatTicketDate(ticket.createdAt);
      const archivedAt = formatTicketDate(ticket.archivedAt);
      const mongoId = escapeHtml(ticket._id || "");

      return `
        <div class="sa-ticket-archive-card">
          <div class="d-flex justify-content-between gap-3 mb-2">
            <div class="min-w-0">
              <div class="sa-ticket-id">#${ticketId}</div>
              <div class="sa-ticket-subject mb-0">${subject}</div>
            </div>
            ${buildTicketStatusBadge(ticket.status || "closed")}
          </div>

          <div class="sa-panel-text mb-2">
            <strong>${userName}</strong> · ${userRole} · ${userEmail}
          </div>

          <div class="sa-ticket-chip-row mb-2">
            ${buildTicketCategoryBadge(ticket.category || "other")}
            ${buildTicketPriorityBadge(ticket.priority || "normal")}
          </div>

          <div class="sa-ticket-note mb-2">${message}</div>

          <div class="sa-panel-text mb-3">
            Created: ${createdAt}<br>
            Archived: ${archivedAt}
          </div>

          <button type="button" class="btn sa-btn-outline w-100 ticketRestoreBtn" data-id="${mongoId}">
            <i class="bi bi-arrow-counterclockwise me-2"></i>
            Restore to Active Queue
          </button>
        </div>
      `;
    }).join("");
  }

  /* =========================================================
    MODULE: Archive Actions
    PURPOSE: Manual archive and restore actions.
  ========================================================= */
  async function archiveTicket(mongoId) {
    try {
      const { data } = await fetchJson(`/api/support/admin/ticket/${mongoId}/archive`, {
        method: "PATCH",
      });

      if (data.success) {
        await Promise.all([
          loadAdminTickets(),
          loadArchivedTickets()
        ]);
      } else {
        alert(data.message || "Failed to archive ticket.");
      }
    } catch (err) {
      console.error("Archive Ticket Error:", err);
      alert("Error archiving ticket.");
    }
  }

  async function restoreTicket(mongoId) {
    try {
      const { data } = await fetchJson(`/api/support/admin/ticket/${mongoId}/restore`, {
        method: "PATCH",
      });

      if (data.success) {
        await Promise.all([
          loadAdminTickets(),
          loadArchivedTickets()
        ]);
      } else {
        alert(data.message || "Failed to restore ticket.");
      }
    } catch (err) {
      console.error("Restore Ticket Error:", err);
      alert("Error restoring ticket.");
    }
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