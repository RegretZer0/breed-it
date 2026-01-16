// frontend/js/notifications.js
export async function initNotifications() {
  const list = document.getElementById("notificationList");
  const countEl = document.getElementById("notificationCount");

  if (!list || !countEl) return;

  const token = localStorage.getItem("token");

  async function loadNotifications() {
    try {
      const res = await fetch("/api/notifications", {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include"
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      const notifications = data.notifications || [];

      // unread count
      const unread = notifications.filter(n => !n.read_by?.includes(data.userId)).length;
      countEl.textContent = unread;
      countEl.classList.toggle("d-none", unread === 0);

      // render (limit 5–8)
      list.innerHTML = notifications.slice(0, 8).map(n => `
        <li
          class="list-group-item ${n.is_read ? "" : "fw-bold"}"
          data-id="${n._id}"
        >
          ${n.title}
          <div class="text-muted small">
            ${new Date(n.created_at).toLocaleString()}
          </div>
        </li>
      `).join("") || `<li class="list-group-item text-muted">No notifications</li>`;

      // mark as read
      list.querySelectorAll("li[data-id]").forEach(li => {
        li.addEventListener("click", async () => {
          await fetch(`/api/notifications/${li.dataset.id}/read`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            credentials: "include"
          });
          loadNotifications();
        });
      });

    } catch (err) {
      console.error("Notification error:", err);
    }
  }

  loadNotifications();
  setInterval(loadNotifications, 30000);
}
