// /js/notifications.js
export async function initNotifications(userId, backendUrl = "http://localhost:5000") {
  const token = localStorage.getItem("token");
  if (!token) return;

  const recentList = document.getElementById("notificationsList");
  const historyList = document.getElementById("notificationHistoryList");

  const typeFilter = document.getElementById("notifFilterType");
  const timeFilter = document.getElementById("notifFilterTime");

  const notifBadge = document.getElementById("notificationBadge");

  // Pagination UI (NEW)
  const prevBtn = document.getElementById("notifPrevPageBtn");
  const nextBtn = document.getElementById("notifNextPageBtn");
  const pageLabel = document.getElementById("notifPageLabel");

  if (!recentList) return;

  let allNotifications = [];

  // Pagination state
  const PAGE_SIZE = 10;
  let historyPage = 1; // 1-based

  /* =========================
      FETCH
  ========================= */
  async function fetchNotifications() {
    try {
      const res = await fetch(`${backendUrl}/api/notifications/user/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      const data = await res.json();
      return data.success ? (data.notifications || []) : [];
    } catch (err) {
      console.error("Fetch Notifications Error:", err);
      return [];
    }
  }

  /* =========================
      HELPERS
  ========================= */
  function normalizeType(t) {
    return (t || "info").toString().trim().toLowerCase();
  }

  function parseDate(d) {
    const dt = new Date(d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  function withinTimeWindow(createdAt, windowValue) {
    if (!windowValue) return true;

    const dt = parseDate(createdAt);
    if (!dt) return false;

    const now = new Date();
    const diffMs = now - dt;

    const hour = 60 * 60 * 1000;
    const day = 24 * hour;

    if (windowValue === "24h") return diffMs <= 24 * hour;
    if (windowValue === "7d") return diffMs <= 7 * day;
    if (windowValue === "30d") return diffMs <= 30 * day;

    return true;
  }

  function applyHistoryFilters(list) {
    let filtered = [...list];

    const typeVal = (typeFilter?.value || "").trim().toLowerCase();
    const timeVal = (timeFilter?.value || "").trim().toLowerCase();

    if (typeVal) filtered = filtered.filter(n => normalizeType(n.type) === typeVal);
    if (timeVal) filtered = filtered.filter(n => withinTimeWindow(n.created_at, timeVal));

    return filtered;
  }

  function setBadgeCount() {
    if (!notifBadge) return;

    const unreadCount = allNotifications.filter(n => !n.is_read).length;

    if (unreadCount <= 0) {
      notifBadge.style.display = "none";
      notifBadge.textContent = "";
      return;
    }

    notifBadge.style.display = "inline-flex";
    notifBadge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
  }

  /* =========================
      RENDER RECENT (LIMIT 8)
  ========================= */
  function renderRecent() {
    recentList.innerHTML = "";

    const recent = allNotifications.slice(0, 8);

    if (!recent.length) {
      recentList.innerHTML = `
        <div class="notification-item">
          <div class="notification-message text-muted">No notifications yet</div>
        </div>`;
      return;
    }

    recent.forEach(n => {
      const div = document.createElement("div");
      div.className = `notification-item ${!n.is_read ? "unread" : ""}`;

      div.innerHTML = `
        <div class="notification-title">${n.title || "Notification"}</div>
        <div class="notification-message">${n.message || ""}</div>
        <div class="notification-time">
          ${n.created_at ? new Date(n.created_at).toLocaleString() : ""}
        </div>
      `;

      div.addEventListener("click", () => markAsRead(n._id, { rerenderHistory: false }));
      recentList.appendChild(div);
    });
  }

  /* =========================
      HISTORY + PAGINATION
  ========================= */
  function getPaged(list) {
    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    // clamp page
    if (historyPage > totalPages) historyPage = totalPages;
    if (historyPage < 1) historyPage = 1;

    const start = (historyPage - 1) * PAGE_SIZE;
    const pageItems = list.slice(start, start + PAGE_SIZE);

    return { pageItems, totalPages, total };
  }

  function updatePagerUI(totalPages) {
    if (pageLabel) pageLabel.textContent = `Page ${historyPage} / ${totalPages}`;

    if (prevBtn) prevBtn.disabled = historyPage <= 1;
    if (nextBtn) nextBtn.disabled = historyPage >= totalPages;
  }

  function renderHistory() {
    if (!historyList) return;

    const filtered = applyHistoryFilters(allNotifications);
    const { pageItems, totalPages } = getPaged(filtered);

    historyList.innerHTML = "";

    if (!filtered.length) {
      updatePagerUI(1);
      historyList.innerHTML = `
        <div class="notification-item history">
          <div class="notification-message text-muted">No notifications found</div>
        </div>`;
      return;
    }

    updatePagerUI(totalPages);

    pageItems.forEach(n => {
      const unread = !n.is_read;
      const typeClass = normalizeType(n.type);

      const div = document.createElement("div");
      div.className = `notification-item history ${unread ? "unread" : ""}`;

      div.innerHTML = `
        <div class="notification-header">
          <strong>${n.title || "Notification"}</strong>
          <span class="notification-type ${typeClass}">
            ${(n.type || "INFO").toString()}
          </span>
        </div>
        <div class="notification-message">${n.message || ""}</div>
        <div class="notification-time">
          ${n.created_at ? new Date(n.created_at).toLocaleString() : ""}
        </div>
      `;

      // Optional: click history item to mark read
      if (unread && n._id) {
        div.style.cursor = "pointer";
        div.addEventListener("click", () => markAsRead(n._id, { rerenderHistory: true }));
      }

      historyList.appendChild(div);
    });
  }

  /* =========================
      MARK SINGLE READ
  ========================= */
  async function markAsRead(id, opts = {}) {
    if (!id) return;

    try {
      const res = await fetch(`${backendUrl}/api/notifications/${id}/read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });

      if (res.ok) {
        allNotifications = allNotifications.map(n =>
          n._id === id ? { ...n, is_read: true } : n
        );

        setBadgeCount();
        renderRecent();
        if (opts.rerenderHistory) renderHistory();
      }
    } catch (err) {
      console.error("Mark as Read Error:", err);
    }
  }

  /* =========================
      LOAD
  ========================= */
  async function load() {
    allNotifications = await fetchNotifications();
    setBadgeCount();
    renderRecent();
    renderHistory(); // safe even if modal isn't open
  }

  /* =========================
      EVENTS
  ========================= */

  // Filters: reset to page 1
  typeFilter?.addEventListener("change", () => {
    historyPage = 1;
    renderHistory();
  });

  timeFilter?.addEventListener("change", () => {
    historyPage = 1;
    renderHistory();
  });

  // Pagination
  prevBtn?.addEventListener("click", () => {
    historyPage = Math.max(1, historyPage - 1);
    renderHistory();
  });

  nextBtn?.addEventListener("click", () => {
    historyPage += 1;
    renderHistory();
  });

  // When modal opens, reset page to 1 and render (Bootstrap event)
  const modalEl = document.getElementById("notificationHistoryModal");
  modalEl?.addEventListener("shown.bs.modal", () => {
    historyPage = 1;
    renderHistory();
  });

  /* =========================
      INIT
  ========================= */
  await load();
  setInterval(load, 30000);
}