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
  // CRITICAL: We await this to ensure the offset is saved BEFORE we ask for stats
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
  // Now that time is synced, load the numbers
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

    // Update the stat numbers in the UI
    Object.entries(data.stats).forEach(([key, value]) => {
      const el = document.querySelector(`[data-stat="${key}"]`);
      if (el) {
          el.textContent = value;
          // Add a small animation effect so you see the numbers change
          el.style.animation = 'none';
          el.offsetHeight; 
          el.style.animation = 'fadeIn 0.5s forwards';
      }
    });

  } catch (err) {
    console.error("Dashboard stats error:", err);
  }
}

/**
 * MVP FEATURE: SYNC VIRTUAL TIME (UPDATED)
 * Fetches server's perception of "Now" and saves the offset locally.
 */
async function syncVirtualTime() {
  try {
    const res = await fetch("/health");
    const data = await res.json();
    
    const timeDisplay = document.getElementById("currentVirtualTime");
    const warpBanner = document.getElementById("timeWarpStatus"); // The banner in stats.ejs
    
    if (data.virtualTime) {
      // 1. Calculate the offset
      const serverTime = new Date(data.virtualTime).getTime();
      const localTime = Date.now();
      const offset = serverTime - localTime;

      // 2. Save offset to localStorage
      localStorage.setItem('timeWarpOffset', offset.toString());

      // 3. Update the UI clock
      if (timeDisplay) {
        timeDisplay.textContent = new Date(data.virtualTime).toLocaleString();
        
        if (data.isMocked) {
          // Show the banner we added to stats.ejs
          if (warpBanner) {
            warpBanner.style.setProperty('display', 'flex', 'important');
          }
          timeDisplay.style.color = "#d97706";
          console.log("🚀 Time Warp Active: Dashboard synced to " + data.virtualTime);
        }
      }
    }
  } catch (err) {
    console.warn("Could not sync virtual time with server.");
  }
}