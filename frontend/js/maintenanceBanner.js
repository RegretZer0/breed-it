(function () {
  /* =========================================================
     MODULE: Config
     PURPOSE: Centralize banner timing and endpoint settings.
  ========================================================= */
  const CONFIG = {
    API_URL: "http://localhost:5000/api/notifications/global",
    ACTIVE_RESHOW_MS: 60 * 60 * 1000,      // 1 hour
    UPCOMING_RESHOW_MS: 3 * 60 * 60 * 1000, // 3 hours
    REFRESH_MS: 5 * 60 * 1000,             // refresh every 5 minutes
    STORAGE_PREFIX: "maintenance_banner_dismiss_",
  };

  let currentBannerId = null;

  document.addEventListener("DOMContentLoaded", () => {
    initMaintenanceBanner();
  });

  /* =========================================================
     MODULE: Init
     PURPOSE: Start banner check cycle.
  ========================================================= */
  async function initMaintenanceBanner() {
    await checkAndRenderBanner();

    setInterval(async () => {
      await checkAndRenderBanner();
    }, CONFIG.REFRESH_MS);
  }

  /* =========================================================
     MODULE: Banner Loader
     PURPOSE: Fetch global alerts and render maintenance banner.
  ========================================================= */
  async function checkAndRenderBanner() {
    try {
      const res = await fetch(CONFIG.API_URL, {
        credentials: "include",
      });

      const data = await res.json().catch(() => ({}));
      if (!data.success || !Array.isArray(data.alerts)) {
        removeBanner();
        return;
      }

      const maintenanceAlerts = data.alerts
        .filter((item) => item && item.type === "maintenance")
        .sort((a, b) => {
          const aStart = new Date(a.scheduled_for || a.created_at || 0).getTime();
          const bStart = new Date(b.scheduled_for || b.created_at || 0).getTime();
          return aStart - bStart;
        });

      if (!maintenanceAlerts.length) {
        removeBanner();
        clearExpiredDismissals();
        return;
      }

      const alertToShow = pickBestAlert(maintenanceAlerts);
      if (!alertToShow) {
        removeBanner();
        clearExpiredDismissals();
        return;
      }

      const bannerState = getBannerState(alertToShow);
      const dismissUntil = getDismissUntil(alertToShow._id);

      if (dismissUntil && Date.now() < dismissUntil) {
        removeBanner();
        return;
      }

      renderBanner(alertToShow, bannerState);
    } catch (err) {
      console.error("Maintenance banner error:", err);
    }
  }

  /* =========================================================
     MODULE: Alert Picker
     PURPOSE: Prefer active alerts, then nearest upcoming.
  ========================================================= */
  function pickBestAlert(alerts) {
    const now = Date.now();

    const active = alerts.find((item) => {
      const start = new Date(item.scheduled_for || item.created_at || 0).getTime();
      const end = new Date(item.ends_at || 0).getTime();
      return Number.isFinite(start) && Number.isFinite(end) && start <= now && end >= now;
    });
    if (active) return active;

    const upcoming = alerts.find((item) => {
      const start = new Date(item.scheduled_for || item.created_at || 0).getTime();
      const end = new Date(item.ends_at || 0).getTime();
      return Number.isFinite(start) && Number.isFinite(end) && start > now;
    });
    if (upcoming) return upcoming;

    return null;
  }

  /* =========================================================
     MODULE: Banner State
     PURPOSE: Resolve active/upcoming state from dates.
  ========================================================= */
  function getBannerState(alert) {
    const now = Date.now();
    const start = new Date(alert.scheduled_for || alert.created_at || 0).getTime();
    const end = new Date(alert.ends_at || 0).getTime();

    if (Number.isFinite(start) && Number.isFinite(end) && start <= now && end >= now) {
      return "active";
    }

    if (Number.isFinite(start) && start > now) {
      return "upcoming";
    }

    return "inactive";
  }

  /* =========================================================
     MODULE: Banner Render
     PURPOSE: Inject a fixed maintenance banner into the page.
  ========================================================= */
  function renderBanner(alert, bannerState) {
    if (!alert || !alert._id) return;

    const existing = document.getElementById("maintenanceFloatingBanner");

    const title = escapeHtml(alert.title || "System Maintenance");
    const message = escapeHtml(alert.message || "A maintenance notice is currently active.");
    const startLabel = formatDateTime(alert.scheduled_for || alert.created_at);
    const endLabel = formatDateTime(alert.ends_at);
    const statusLabel = bannerState === "active" ? "Maintenance in Progress" : "Upcoming Maintenance";

    const bannerClass =
      bannerState === "active"
        ? "maintenance-banner-active"
        : "maintenance-banner-upcoming";

    const html = `
      <div class="maintenance-banner-card ${bannerClass}">
        <div class="maintenance-banner-accent"></div>

        <div class="maintenance-banner-main">
          <div class="maintenance-banner-icon">
            <i class="bi ${bannerState === "active" ? "bi-exclamation-triangle" : "bi-tools"}"></i>
          </div>

          <div class="maintenance-banner-content">
            <div class="maintenance-banner-topline">
              <span class="maintenance-banner-status">${statusLabel}</span>
            </div>

            <div class="maintenance-banner-title">${title}</div>
            <div class="maintenance-banner-message">${message}</div>

            <div class="maintenance-banner-meta">
              <span><i class="bi bi-calendar-event me-1"></i>Start: ${startLabel}</span>
              <span><i class="bi bi-calendar-check me-1"></i>End: ${endLabel}</span>
            </div>
          </div>
        </div>

        <div class="maintenance-banner-actions">
          <button
            type="button"
            class="maintenance-banner-close"
            id="maintenanceBannerCloseBtn"
            aria-label="Close maintenance banner"
            title="Dismiss temporarily"
          >
            <i class="bi bi-x-lg"></i>
          </button>
        </div>
      </div>
    `;

    if (existing) {
      existing.innerHTML = html;
    } else {
      const shell = document.createElement("div");
      shell.id = "maintenanceFloatingBanner";
      shell.className = "maintenance-floating-banner";
      shell.innerHTML = html;
      document.body.appendChild(shell);
    }

    currentBannerId = alert._id;

    const closeBtn = document.getElementById("maintenanceBannerCloseBtn");
    closeBtn?.addEventListener("click", () => {
      const duration =
        bannerState === "active"
          ? CONFIG.ACTIVE_RESHOW_MS
          : CONFIG.UPCOMING_RESHOW_MS;

      const dismissUntil = Date.now() + duration;
      localStorage.setItem(
        `${CONFIG.STORAGE_PREFIX}${alert._id}`,
        String(dismissUntil)
      );

      removeBanner();
    });
  }

  /* =========================================================
     MODULE: Banner Remove
     PURPOSE: Remove the banner safely.
  ========================================================= */
  function removeBanner() {
    const existing = document.getElementById("maintenanceFloatingBanner");
    if (existing) existing.remove();
    currentBannerId = null;
  }

  /* =========================================================
     MODULE: Dismiss State
     PURPOSE: Read saved dismiss cooldown per alert.
  ========================================================= */
  function getDismissUntil(alertId) {
    const raw = localStorage.getItem(`${CONFIG.STORAGE_PREFIX}${alertId}`);
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  /* =========================================================
     MODULE: Cleanup
     PURPOSE: Clear expired old dismiss timestamps.
  ========================================================= */
  function clearExpiredDismissals() {
    const now = Date.now();

    Object.keys(localStorage).forEach((key) => {
      if (!key.startsWith(CONFIG.STORAGE_PREFIX)) return;

      const value = Number(localStorage.getItem(key));
      if (!Number.isFinite(value) || value <= now) {
        localStorage.removeItem(key);
      }
    });
  }

  /* =========================================================
     MODULE: Formatting Helpers
     PURPOSE: Shared text/date helpers for rendering.
  ========================================================= */
  function formatDateTime(value) {
    if (!value) return "--";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";

    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
})();