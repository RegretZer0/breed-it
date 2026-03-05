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
  // This ensures the dashboard "Time Warp" is active
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
  // Now that time is synced and the banner is prepared, load the numbers
  await loadDashboardStats(token);

  // ============================
  // CALENDAR (Single Instance)
  // ============================
  try {
    // Pass virtual time awareness to calendar if your module supports it
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

    // If the backend sent back the virtual date it used, log it for verification
    if (data.virtualDateUsed) {
        console.log("📊 Stats calculated using Virtual Date:", data.virtualDateUsed);
    }

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
    // Calling /health (which we updated earlier to return virtualTime)
    const res = await fetch("/health");
    const data = await res.json();
    
    const timeDisplay = document.getElementById("currentVirtualTime");
    const warpBanner = document.getElementById("timeWarpStatus"); 
    const warpDateText = document.getElementById("warpDateText"); // Extra detail if you have it
    
    if (data.virtualTime) {
      // 1. Calculate the offset and save it
      const serverTime = new Date(data.virtualTime).getTime();
      const localTime = Date.now();
      const offset = serverTime - localTime;
      localStorage.setItem('timeWarpOffset', offset.toString());

      // 2. UI Updates
      const vDate = new Date(data.virtualTime);

      if (timeDisplay) {
        timeDisplay.textContent = vDate.toLocaleString();
      }
      
      if (data.isMocked) {
        // Show the banner and update the text to show the 2026 date
        if (warpBanner) {
          warpBanner.style.setProperty('display', 'flex', 'important');
        }
        if (warpDateText) {
          warpDateText.textContent = vDate.toDateString();
        }
        
        if (timeDisplay) timeDisplay.style.color = "#d97706";
        console.log("🚀 Time Warp Active: Dashboard synced to " + data.virtualTime);
      } else {
        // Hide banner if not mocked
        if (warpBanner) warpBanner.style.display = 'none';
      }
    }
  } catch (err) {
    console.warn("Could not sync virtual time with server. Dashboard may show real-time stats.");
  }
}