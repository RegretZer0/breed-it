// dashboard.js
import { authGuard } from "/js/authGuard.js";
import { initNotifications } from "/js/notifications.js";
import { initFarmCalendar } from "/js/farm-manager/calendar_module.js";

console.log("[dashboard] file loaded");

document.addEventListener("DOMContentLoaded", async () => {
  console.log("[dashboard] DOMContentLoaded");

  // ============================
  // AUTH CHECK
  // ============================
  const user = await authGuard(["farm_manager", "encoder"]);
  console.log("[dashboard] authGuard result:", user);

  if (!user) {
    console.warn("[dashboard] No user returned from authGuard");
    return;
  }

  const BACKEND_URL = "http://localhost:5000";
  const token = localStorage.getItem("token");

  console.log("[dashboard] token exists?", !!token);

  if (!token) {
    alert("Session expired. Please log in again.");
    return;
  }

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
  console.log("[dashboard] calling loadDashboardStats...");
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
    console.log("[dashboard] fetching /api/dashboard/farm-manager/stats");

    const res = await fetch("/api/dashboard/farm-manager/stats", {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log("[dashboard] response status:", res.status);

    const text = await res.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch (parseErr) {
      console.error("[dashboard] JSON parse error:", parseErr);
      throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 120)}`);
    }

    console.log("[dashboard] response payload:", data);

    if (!res.ok || !data.success) {
      throw new Error(data.message || `Request failed (${res.status})`);
    }

    Object.entries(data.stats || {}).forEach(([key, value]) => {
      console.log(`[dashboard] updating stat: ${key} =`, value);

      const el = document.querySelector(`[data-stat="${key}"]`);
      if (!el) {
        console.warn(`[dashboard] element not found for key: ${key}`);
      }

      if (el) el.textContent = (value ?? 0);
    });

  } catch (err) {
    console.error("Dashboard stats error:", err);
  }
}