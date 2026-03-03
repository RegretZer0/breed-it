// dashboard.js
import { authGuard } from "/js/authGuard.js";
import { initNotifications } from "/js/notifications.js";
import { initFarmCalendar } from "/js/farm-manager/calendar_module.js";

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
  // MVP: SYNC VIRTUAL TIME
  // ============================
  // This ensures the manager sees the "Server Date" during testing
  await syncVirtualTime();

  // ============================
  // WELCOME MESSAGE
  // ============================
  const welcome = document.querySelector(".dashboard-welcome");
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
  // DASHBOARD STATS
  // ============================
  await loadDashboardStats(token);

  // ============================
  // CALENDAR (Single Instance)
  // ============================
  try {
    initFarmCalendar(BACKEND_URL, token);
  } catch (err) {
    console.error("Calendar init failed:", err);
  }
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

/**
 * MVP FEATURE: SYNC VIRTUAL TIME
 * Fetches the server's perception of "Now" so testing remains consistent
 */
async function syncVirtualTime() {
  try {
    const res = await fetch("/health");
    const data = await res.json();
    
    const timeDisplay = document.getElementById("currentVirtualTime");
    if (timeDisplay && data.virtualTime) {
      timeDisplay.textContent = data.virtualTime;
      
      // If the time is mocked, give it a subtle highlight so the tester knows
      if (data.isMocked) {
        timeDisplay.parentElement.style.borderLeft = "4px solid #f59e0b";
        timeDisplay.style.color = "#d97706";
      }
    }
  } catch (err) {
    console.warn("Could not sync virtual time with server.");
  }
}