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

  const hasUnread = allNotifications.some(n => !n.is_read);
  if (notifBadge) {
    notifBadge.style.display = hasUnread ? "block" : "none";
  }

  if (!recent.length) {
    recentList.innerHTML =
      `<div class="notification-item">
         <div class="notification-message text-muted">
           No notifications yet
         </div>
       </div>`;
    return;
  }

  recent.forEach(n => {

    const div = document.createElement("div");
    div.className = `notification-item ${!n.is_read ? "unread" : ""}`;

    div.innerHTML = `
      <div class="notification-title">${n.title}</div>
      <div class="notification-message">${n.message}</div>
      <div class="notification-time">
        ${new Date(n.created_at).toLocaleString()}
      </div>
    `;

    div.onclick = () => markAsRead(n._id);

    recentList.appendChild(div);
  });
}


  /* =========================
      HISTORY (Modal View)
  ========================= */
    function renderHistory() {

    let list = [...allNotifications];

    historyList.innerHTML = "";

    if (!list.length) {
      historyList.innerHTML =
        `<div class="notification-item">
          <div class="notification-message text-muted">
            No notifications found
          </div>
        </div>`;
      return;
    }

    list.forEach(n => {

      const div = document.createElement("div");

      div.className = `notification-item history ${!n.is_read ? "unread" : ""}`;

      const typeClass = n.type?.toLowerCase() || "info";

      div.innerHTML = `
        <div class="notification-header">
          <strong>${n.title}</strong>
          <span class="notification-type ${typeClass}">
            ${n.type || "INFO"}
          </span>
        </div>

        <div class="notification-message">
          ${n.message}
        </div>

        <div class="notification-time">
          ${new Date(n.created_at).toLocaleString()}
        </div>
      `;

      historyList.appendChild(div);
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
    const panel = document.getElementById("notificationHistoryModal");
    if (!panel) return;

    panel.classList.add("active");
    document.body.style.overflow = "hidden";

    renderHistory(); // ✅ THIS WAS MISSING
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