// /js/notifications.js
export async function initNotifications(userId, backendUrl = "http://localhost:5000") {
  const token = localStorage.getItem("token");
  if (!token) return;

  const recentList = document.getElementById("notificationsList");
  const viewAllBtn = document.getElementById("viewAllNotificationsBtn");
  const historyList = document.getElementById("notificationHistoryList");
  const typeFilter = document.getElementById("notifFilterType");
  const timeFilter = document.getElementById("notifFilterTime");
  const notifBadge = document.getElementById("notificationBadge"); // Add this ID to your HTML bell icon

  if (!recentList) return;

  let allNotifications = [];

  /* =========================
      FETCH
  ========================= */
  async function fetchNotifications() {
    try {
      const res = await fetch(`${backendUrl}/api/notifications/user/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include"
      });

      const data = await res.json();
      return data.success ? data.notifications : [];
    } catch (err) {
      console.error("Fetch Notifications Error:", err);
      return [];
    }
  }

  /* =========================
      RENDER RECENT (LIMIT 8)
  ========================= */
  function renderRecent() {
    recentList.innerHTML = "";
    const recent = allNotifications.slice(0, 8);

    // Update Badge Visibility (Show if any notification is unread)
    const hasUnread = allNotifications.some(n => !n.is_read);
    if (notifBadge) {
      notifBadge.style.display = hasUnread ? "block" : "none";
    }

    if (!recent.length) {
      recentList.innerHTML =
        `<li class="list-group-item text-muted text-center">No notifications</li>`;
      return;
    }

    recent.forEach(n => {
      const li = document.createElement("li");
      // Add 'bg-light' or a custom class if the notification is unread
      li.className = `list-group-item ${!n.is_read ? "fw-bold border-start border-primary border-4" : ""}`;
      li.style.cursor = "pointer";

      li.innerHTML = `
        <div class="d-flex justify-content-between align-items-start">
          <div>
            <strong>${n.title}</strong>
            <div class="small text-dark">${n.message}</div>
            <div class="text-muted small mt-1">
              ${new Date(n.created_at).toLocaleString()}
            </div>
          </div>
          ${!n.is_read ? '<span class="badge rounded-pill bg-primary" style="font-size: 0.6rem;">NEW</span>' : ''}
        </div>
      `;

      li.onclick = () => markAsRead(n._id);
      recentList.appendChild(li);
    });
  }

  /* =========================
      HISTORY (Modal View)
  ========================= */
  function renderHistory() {
    let list = [...allNotifications];

    if (typeFilter?.value) {
      list = list.filter(n => n.type === typeFilter.value);
    }

    if (timeFilter?.value) {
      const ranges = {
        "24h": 86400000,
        "7d": 604800000,
        "30d": 2592000000
      };
      const cutoff = Date.now() - ranges[timeFilter.value];
      list = list.filter(n => new Date(n.created_at).getTime() >= cutoff);
    }

    historyList.innerHTML = "";

    if (!list.length) {
      historyList.innerHTML =
        `<li class="list-group-item text-muted text-center">No notifications found in this range</li>`;
      return;
    }

    list.forEach(n => {
      const li = document.createElement("li");
      li.className = `list-group-item ${!n.is_read ? "border-start border-primary border-3" : ""}`;
      
      li.innerHTML = `
        <div class="d-flex justify-content-between">
          <strong>${n.title}</strong>
          <small class="text-muted">${n.type.toUpperCase()}</small>
        </div>
        <div class="my-1">${n.message}</div>
        <div class="text-muted small">
          ${new Date(n.created_at).toLocaleString()}
        </div>
      `;
      historyList.appendChild(li);
    });
  }

  /* =========================
      MARK READ
  ========================= */
  async function markAsRead(id) {
    try {
      const res = await fetch(`${backendUrl}/api/notifications/${id}/read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include"
      });
      
      if (res.ok) {
        // Optimistically update local data to prevent "flicker" before reload
        allNotifications = allNotifications.map(n => 
          n._id === id ? { ...n, is_read: true } : n
        );
        renderRecent();
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
    renderRecent();
  }

  /* =========================
      EVENTS
  ========================= */
  viewAllBtn?.addEventListener("click", () => {
    const modalElement = document.getElementById("notificationHistoryModal");
    if (modalElement) {
      const modal = new bootstrap.Modal(modalElement);
      modal.show();
      renderHistory();
    }
  });

  typeFilter?.addEventListener("change", renderHistory);
  timeFilter?.addEventListener("change", renderHistory);

  /* =========================
      INIT
  ========================= */
  await load();
  // Poll every 30 seconds for new updates
  setInterval(load, 30000);
}