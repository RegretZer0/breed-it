// dashboard.js
import { authGuard } from "/js/authGuard.js";
import { initNotifications } from "/js/notifications.js";
import { initFarmCalendar } from "/js/farm-manager/calendar_module.js";
import { initAuditLogs } from "/js/farm-manager/audit_logs_module.js";

document.addEventListener("DOMContentLoaded", async () => {
  // ============================
  // AUTH CHECK
  // ============================
  const user = await authGuard(["farm_manager", "encoder"]);
  if (!user) return;

  const BACKEND_URL = "http://localhost:5000";
  const token = localStorage.getItem("token");

  if (!token) {
    alert("Session expired. Please log in again.");
    return;
  }

  // ============================
  // WELCOME MESSAGE
  // ============================
  const welcome = document.querySelector(".dashboard-container h4");
  if (welcome) {
    const roleLabel =
      user.role === "encoder"
        ? "Encoder"
        : user.role === "farm_manager"
        ? "Farm Manager"
        : "User";

    welcome.textContent = `Welcome, ${user.name || roleLabel}`;
  }

  // ============================
  // NOTIFICATIONS
  // ============================
  initNotifications(user.id);

  // ============================
  // DASHBOARD DATA
  // ============================
  loadLoginLogs();
  await loadDashboardStats(token);

  // ============================
  // AUDIT LOGS (SAFE)
  // ============================
  try {
    initAuditLogs(BACKEND_URL, token);
  } catch (err) {
    console.error("Audit logs init failed:", err);
  }

  // ============================
  // CALENDAR (ISOLATED & SAFE)
  // ============================
  let calendars = [];
  try {
    calendars = initFarmCalendar(BACKEND_URL, token);
  } catch (err) {
    console.error("Calendar init failed:", err);
  }

  // Refetch calendar events when tab regains focus
  window.addEventListener("focus", () => {
    calendars.forEach(c => c?.refetchEvents());
  });
});

// ============================
// DASHBOARD STATS
// ============================
async function loadDashboardStats(token) {
  try {
    const res = await fetch("/api/dashboard/farm-manager/stats", {
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    Object.entries(data.stats).forEach(([key, value]) => {
      const el = document.querySelector(`[data-stat="${key}"]`);
      if (el) el.textContent = value;
    });
  } catch (err) {
    console.error("Dashboard stats error:", err);
  }
}

// ============================
// LOGIN LOGS
// ============================
async function loadLoginLogs() {
  const list = document.getElementById("loginLogs");
  if (!list) return;

  try {
    const res = await fetch("/api/auth/logs", { credentials: "include" });
    const data = await res.json();

    if (!data.success || !data.logs?.length) {
      list.innerHTML = "<li class='log-loading'>No recent logins.</li>";
      return;
    }

    list.innerHTML = "";
    data.logs.forEach(log => {
      const li = document.createElement("li");
      li.innerHTML = `
        <div>
          <span class="log-user">${log.name}</span>
          <span class="log-role ${log.role}">${log.role}</span>
        </div>
        <div class="log-time">${new Date(log.createdAt).toLocaleString()}</div>
      `;
      list.appendChild(li);
    });
  } catch (err) {
    console.error("Failed to load logs:", err);
    list.innerHTML = "<li class='log-loading'>Error loading activity.</li>";
  }
}
