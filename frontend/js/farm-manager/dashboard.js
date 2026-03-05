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
  // Must run before loading stats so local offset + banner are ready.
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
      headers: { Authorization: `Bearer ${token}` },
    });

    console.log("[dashboard] response status:", res.status);

    // Keep control-70's robust parsing so you can see non-JSON backend errors
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

    // If backend reports the virtual date used, log it for verification
    if (data.virtualDateUsed) {
      console.log("[dashboard] stats calculated using virtual date:", data.virtualDateUsed);
    }

    Object.entries(data.stats || {}).forEach(([key, value]) => {
      console.log(`[dashboard] updating stat: ${key} =`, value);

      const el = document.querySelector(`[data-stat="${key}"]`);
      if (!el) {
        console.warn(`[dashboard] element not found for key: ${key}`);
        return;
      }

      el.textContent = value ?? 0;

      // Keep MVP's small "update" effect without depending on a specific animation name existing
      try {
        el.style.animation = "none";
        // force reflow
        void el.offsetHeight;
        el.style.animation = "fadeIn 0.5s forwards";
      } catch (e) {
        // ignore if style/animation isn't supported
      }
    });
  } catch (err) {
    console.error("Dashboard stats error:", err);
  }
}

/**
 * Time Warp: Sync Virtual Time
 * Fetches server's perception of "now" and saves the offset locally for any UI helpers that use it.
 * Also updates any optional banner/labels if present in the DOM.
 */
async function syncVirtualTime() {
  try {
    const res = await fetch("/health");
    const data = await res.json();

    const timeDisplay = document.getElementById("currentVirtualTime");
    const warpBanner = document.getElementById("timeWarpStatus");
    const warpDateText = document.getElementById("warpDateText");

    if (!data || !data.virtualTime) return;

    // 1) Calculate and persist offset for frontend helpers (if your UI uses it elsewhere)
    const serverTime = new Date(data.virtualTime).getTime();
    const localTime = Date.now();
    const offset = serverTime - localTime;
    localStorage.setItem("timeWarpOffset", String(offset));

    // 2) UI updates (optional elements)
    const vDate = new Date(data.virtualTime);

    if (timeDisplay) {
      timeDisplay.textContent = vDate.toLocaleString();
    }

    if (data.isMocked) {
      if (warpBanner) {
        warpBanner.style.setProperty("display", "flex", "important");
      }
      if (warpDateText) {
        warpDateText.textContent = vDate.toDateString();
      }
      if (timeDisplay) timeDisplay.style.color = "#d97706";

      console.log("[dashboard] time warp active:", data.virtualTime);
    } else {
      if (warpBanner) warpBanner.style.display = "none";
    }
  } catch (err) {
    console.warn("Could not sync virtual time with server. Dashboard may show real-time stats.");
  }
}