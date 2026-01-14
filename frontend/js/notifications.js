// notifications.js
import { authGuard } from "./authGuard.js";

export function initNotifications(userId, backendUrl = "http://localhost:5000") {
  // --- Notification container ---
  let container = document.getElementById("notificationContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "notificationContainer";
    container.style.position = "fixed";
    container.style.top = "10px";
    container.style.right = "20px";
    container.style.zIndex = "9999";
    document.body.appendChild(container);
  }

  // --- Bell button ---
  let bellBtn = document.getElementById("notificationBell");
  if (!bellBtn) {
    bellBtn = document.createElement("button");
    bellBtn.id = "notificationBell";
    bellBtn.innerHTML = "🔔 <span id='notificationCount'>0</span>";
    bellBtn.style.position = "relative";
    bellBtn.style.cursor = "pointer";
    bellBtn.style.padding = "5px 10px";
    bellBtn.style.border = "none";
    bellBtn.style.borderRadius = "5px";
    bellBtn.style.backgroundColor = "#5aa9e6";
    bellBtn.style.color = "white";
    container.appendChild(bellBtn);
  }

  // --- Dropdown ---
  let dropdown = document.getElementById("notificationDropdown");
  if (!dropdown) {
    dropdown = document.createElement("div");
    dropdown.id = "notificationDropdown";
    dropdown.style.display = "none";
    dropdown.style.position = "absolute";
    dropdown.style.top = "35px";
    dropdown.style.right = "0";
    dropdown.style.width = "320px";
    dropdown.style.maxHeight = "400px";
    dropdown.style.overflowY = "auto";
    dropdown.style.backgroundColor = "#fff";
    dropdown.style.border = "1px solid #ccc";
    dropdown.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";
    dropdown.style.borderRadius = "5px";
    container.appendChild(dropdown);
  }

  bellBtn.addEventListener("click", () => {
    dropdown.style.display = dropdown.style.display === "none" ? "block" : "none";
  });

  const typeColors = {
    info: "#e6f7ff",
    alert: "#fff4e6",
    success: "#e6ffe6",
    error: "#ffe6e6"
  };

  async function loadNotifications() {
    try {
      const token = localStorage.getItem("token");

      // --- Get logged-in user info ---
      const userRes = await fetch(`${backendUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include"
      });
      const userData = await userRes.json();
      const user = userData.user || {};

      // --- Build IDs to fetch notifications for ---
      let queryUserId = userId; // default
      if (user.role === "encoder" && user.managerId) {
        queryUserId = `${userId},${user.managerId}`; // encoder + manager notifications
      }

      // --- Fetch notifications ---
      const notifRes = await fetch(`${backendUrl}/api/notifications/user/${queryUserId}`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include"
      });
      const notifData = await notifRes.json();
      if (!notifData.success) throw new Error("Failed to fetch notifications");

      const notifications = notifData.notifications || [];
      notifications.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      // --- Update unread count ---
      const unreadCount = notifications.filter(n => !n.is_read).length;
      document.getElementById("notificationCount").textContent = unreadCount;

      // --- Render notifications ---
      dropdown.innerHTML = notifications
        .map(n => {
          const bgColor = n.is_read ? "#f9f9f9" : (typeColors[n.type] || "#e6f7ff");
          return `
            <div class="notificationItem" style="
              padding: 10px;
              border-bottom: 1px solid #eee;
              background-color: ${bgColor};
              cursor: pointer;
            " data-id="${n._id}">
              <strong>${n.title}</strong><br>
              <span>${n.message}</span>
              <small style="display:block; color:#888;">${new Date(n.created_at).toLocaleString()}</small>
            </div>
          `;
        })
        .join("") || "<p style='padding:10px;'>No notifications</p>";

      // --- Mark as read on click ---
      dropdown.querySelectorAll(".notificationItem").forEach(item => {
        item.addEventListener("click", async () => {
          const id = item.dataset.id;
          try {
            await fetch(`${backendUrl}/api/notifications/${id}/read`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}` },
              credentials: "include"
            });
            await loadNotifications();
          } catch (err) {
            console.error("Failed to mark notification read:", err);
          }
        });
      });

    } catch (err) {
      console.error("Load notifications error:", err);
    }
  }

  loadNotifications();
  setInterval(loadNotifications, 30000);
}
