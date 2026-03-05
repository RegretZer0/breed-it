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
  // TIME WARP: SYNC VIRTUAL TIME
  // ============================
  // CRITICAL: Await this so offset is saved BEFORE loading stats
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

    // Update the stat numbers in the UI
    Object.entries(data.stats || {}).forEach(([key, value]) => {
      console.log(`[dashboard] updating stat: ${key} =`, value);

      const el = document.querySelector(`[data-stat="${key}"]`);
      if (!el) {
        console.warn(`[dashboard] element not found for key: ${key}`);
        return;
      }

      el.textContent = (value ?? 0);

      // Small animation (from MVP branch)
      el.style.animation = "none";
      // force reflow
      // eslint-disable-next-line no-unused-expressions
      el.offsetHeight;
      el.style.animation = "fadeIn 0.5s forwards";
    });

  } catch (err) {
    console.error("Dashboard stats error:", err);
  }
}

/**
 * TIME WARP: SYNC VIRTUAL TIME
 * Fetches server's perception of "Now" and saves the offset locally.
 * Also updates the dashboard UI indicators if present.
 */
async function syncVirtualTime() {
  try {
    console.log("[dashboard] syncing virtual time via /health");

    const res = await fetch("/health");
    console.log("[dashboard] /health response status:", res.status);

    const text = await res.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch (parseErr) {
      console.warn("[dashboard] /health JSON parse error:", parseErr);
      return;
    }

    console.log("[dashboard] /health payload:", data);

    const timeDisplay = document.getElementById("currentVirtualTime");
    const warpBanner = document.getElementById("timeWarpStatus"); // banner in stats.ejs

    if (!data || !data.virtualTime) {
      console.warn("[dashboard] No virtualTime provided by /health");
      return;
    }

    // 1) Calculate offset (server virtual time - local time)
    const serverTime = new Date(data.virtualTime).getTime();
    if (Number.isNaN(serverTime)) {
      console.warn("[dashboard] Invalid virtualTime:", data.virtualTime);
      return;
    }

    const localTime = Date.now();
    const offset = serverTime - localTime;

    // 2) Save offset to localStorage
    localStorage.setItem("timeWarpOffset", offset.toString());
    console.log("[dashboard] timeWarpOffset saved:", offset);

    // 3) Update UI clock + banner
    if (timeDisplay) {
      timeDisplay.textContent = new Date(data.virtualTime).toLocaleString();

      if (data.isMocked) {
        if (warpBanner) {
          warpBanner.style.setProperty("display", "flex", "important");
        }
        timeDisplay.style.color = "#d97706";
        console.log("[dashboard] Time Warp Active:", data.virtualTime);
      } else {
        // If not mocked, keep UI clean
        if (warpBanner) {
          warpBanner.style.setProperty("display", "none", "important");
        }
        timeDisplay.style.color = "";
      }
    }
  } catch (err) {
    console.warn("[dashboard] Could not sync virtual time with server:", err);
  }
}