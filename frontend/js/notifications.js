// /js/notifications.js
export async function initNotifications(userId, backendUrl = "http://localhost:5000") {
  const token = localStorage.getItem("token");
  if (!token) return;

  const recentList = document.getElementById("notificationsList");
  const viewAllBtn = document.getElementById("viewAllNotificationsBtn");
  const historyList = document.getElementById("notificationHistoryList");
  const typeFilter = document.getElementById("notifFilterType");
  const timeFilter = document.getElementById("notifFilterTime");

  if (!recentList) return;

  let allNotifications = [];

  /* =========================
     FETCH
  ========================= */
  async function fetchNotifications() {
    const res = await fetch(`${backendUrl}/api/notifications/user/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include"
    });

    const data = await res.json();
    return data.success ? data.notifications : [];
  }

  /* =========================
     RENDER RECENT (LIMIT 8)
  ========================= */
  function renderRecent() {
    recentList.innerHTML = "";
    const recent = allNotifications.slice(0, 8);

    if (!recent.length) {
      recentList.innerHTML =
        `<li class="list-group-item text-muted">No notifications</li>`;
      return;
    }

    recent.forEach(n => {
      const li = document.createElement("li");
      li.className = "list-group-item";
      li.style.cursor = "pointer";

      li.innerHTML = `
        <strong>${n.title}</strong>
        <div class="small">${n.message}</div>
        <div class="text-muted small">
          ${new Date(n.created_at).toLocaleString()}
        </div>
      `;

      li.onclick = () => markAsRead(n._id);
      recentList.appendChild(li);
    });
  }

  /* =========================
     HISTORY
  ========================= */
  function renderHistory() {
    let list = [...allNotifications];

    if (typeFilter.value) {
      list = list.filter(n => n.type === typeFilter.value);
    }

    if (timeFilter.value) {
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
        `<li class="list-group-item text-muted">No notifications</li>`;
      return;
    }

    list.forEach(n => {
      historyList.innerHTML += `
        <li class="list-group-item">
          <strong>${n.title}</strong>
          <div>${n.message}</div>
          <div class="text-muted small">
            ${n.type.toUpperCase()} • ${new Date(n.created_at).toLocaleString()}
          </div>
        </li>
      `;
    });
  }

  /* =========================
     MARK READ
  ========================= */
  async function markAsRead(id) {
    await fetch(`${backendUrl}/api/notifications/${id}/read`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include"
    });
    await load();
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
    const modal = new bootstrap.Modal(
      document.getElementById("notificationHistoryModal")
    );
    modal.show();
    renderHistory();
  });

  typeFilter?.addEventListener("change", renderHistory);
  timeFilter?.addEventListener("change", renderHistory);

  /* =========================
     INIT
  ========================= */
  await load();
  setInterval(load, 30000);
}
