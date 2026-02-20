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
  loadGlobalAlerts(); // Fetches Maintenance broadcasts
  // You can also call your private user notifications here if needed

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
      // Fetch alerts where ends_at is still in the future
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
    // Check if banner already exists to prevent duplicates
    if (document.getElementById(`banner-${alert._id}`)) return;

    const header = document.querySelector("header") || document.body;
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
        <small>(Scheduled: ${start} to ${end})</small></span>
      </div>
    `;

    // Insert at the very top of the page
    document.body.prepend(banner);
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
        localStorage.clear();
        window.location.href = "/login";
      }
    });
});