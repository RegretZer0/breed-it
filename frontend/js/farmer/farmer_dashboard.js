document.addEventListener("DOMContentLoaded", () => {

  // 🔐 Force reload if page restored from BFCache
  window.addEventListener("pageshow", event => {
    if (event.persisted) {
      window.location.reload();
    }
  });

  // =========================
  // INITIALIZE DATA FETCHING
  // =========================
  syncVirtualTime(); // UPDATED: Now calculates and saves offset
  loadGlobalAlerts(); // Fetches Maintenance broadcasts

  // =========================
  // DASHBOARD NAVIGATION
  // =========================

  document.getElementById("viewSwineBtn")?.addEventListener("click", () => {
    window.location.href = "/farmer/pigs";
  });

  document.getElementById("heatReportBtn")?.addEventListener("click", () => {
    window.location.href = "/farmer/reports";
  });

  document.getElementById("profileBtn")?.addEventListener("click", () => {
    window.location.href = "/farmer/profile";
  });

  document.getElementById("scheduleBtn")?.addEventListener("click", () => {
    window.location.href = "/farmer/calendar";
  });

  document.getElementById("reproductionBtn")?.addEventListener("click", () => {
    window.location.href = "/farmer/reproduction";
  });

  // ===================================
  // GLOBAL NOTIFICATIONS (MAINTENANCE)
  // ===================================

  async function loadGlobalAlerts() {
    try {
      const response = await fetch("/api/notifications/global");
      const data = await response.json();

      if (data.success && data.alerts.length > 0) {
        data.alerts.forEach(alert => {
          if (alert.type === "maintenance") {
            displayMaintenanceBanner(alert);
          }
        });
      }
    } catch (err) {
      console.error("Error loading global alerts:", err);
    }
  }

  function displayMaintenanceBanner(alert) {
    if (document.getElementById(`banner-${alert._id}`)) return;

    const banner = document.createElement("div");
    
    banner.id = `banner-${alert._id}`;
    banner.style.cssText = `
      background: #fff3cd;
      color: #856404;
      padding: 15px;
      text-align: center;
      border-bottom: 2px solid #ffeeba;
      font-weight: bold;
      position: relative;
      z-index: 1000;
    `;

    // Format the dates for display
    const start = new Date(alert.scheduled_for).toLocaleString();
    const end = new Date(alert.ends_at).toLocaleString();

    banner.innerHTML = `
      <div style="display: flex; justify-content: center; align-items: center; gap: 10px;">
        <span>🚧 <strong>${alert.title}:</strong> ${alert.message} 
        <br><small>(Scheduled Server Time: ${start} to ${end})</small></span>
      </div>
    `;

    document.body.prepend(banner);
  }

  // ==========================================
  // UPDATED: SYNC VIRTUAL TIME & SAVE OFFSET
  // ==========================================
  async function syncVirtualTime() {
    try {
      const res = await fetch("/health");
      const data = await res.json();
      
      const timeDisplay = document.getElementById("currentVirtualTime");
      const warpBanner = document.getElementById("timeWarpStatus"); // Banner check
      
      if (data.virtualTime) {
        // 1. Calculate the offset between local system time and server virtual time
        const serverTime = new Date(data.virtualTime).getTime();
        const localTime = Date.now();
        const offset = serverTime - localTime;

        // 2. Save offset to localStorage so MyPigs/Reports can use it for countdowns
        localStorage.setItem('timeWarpOffset', offset.toString());

        // 3. Update UI display
        if (timeDisplay) {
          // Use toLocaleString for a cleaner UI look
          timeDisplay.textContent = new Date(data.virtualTime).toLocaleString();
          
          // Visual indicator that the farmer is in "Test Mode"
          if (data.isMocked) {
            timeDisplay.style.color = "#d97706";
            
            // Show the Warp Banner if it exists in the farmer dashboard HTML
            if (warpBanner) {
               warpBanner.style.setProperty('display', 'flex', 'important');
            }

            console.log("🛠️ Testing Mode: Server time is being mocked (2026 Warp). Offset saved.");
          } else {
            if (warpBanner) warpBanner.style.display = 'none';
          }
        }
      }
    } catch (err) {
      console.warn("Could not sync virtual time. Using local system time.");
    }
  }

  // =========================
  // LOGOUT
  // =========================

  document.querySelector('[data-action="logout"]')
    ?.addEventListener("click", async () => {
      console.log("🚪 Logout clicked");

      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "include",
        });
        console.log("✅ Logout request sent");
      } catch (err) {
        console.error("Logout error:", err);
      } finally {
        // Clear local storage and redirect
        localStorage.clear();
        window.location.href = "/login";
      }
    });
});