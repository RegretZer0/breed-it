// navbar.js
document.addEventListener("DOMContentLoaded", () => {
  const logoutBtn = document.getElementById("logoutBtn");
  const darkToggle = document.getElementById("darkModeToggle");

  /* =========================
      Logout
  ========================= */
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "include",
        });
      } catch (err) {
        console.error("Logout error:", err);
      } finally {
        window.location.href = "/login";
      }
    });
  }

  /* =========================
      Dark Mode (persisted)
  ========================= */
  const isDark = localStorage.getItem("darkMode") === "true";
  document.body.classList.toggle("dark-mode", isDark);

  if (darkToggle) {
    darkToggle.checked = isDark;

    darkToggle.addEventListener("change", () => {
      document.body.classList.toggle("dark-mode", darkToggle.checked);
      localStorage.setItem("darkMode", darkToggle.checked);
    });
  }

  /* =========================================================
     BOOTSTRAP OPEN FIX (prevents backdrop errors)
     - If target panel/modal isn't in DOM, we don't call Bootstrap.
     - Also disables Bootstrap data-api to stop it from throwing.
  ========================================================= */

  function safeOffcanvasOpen(triggerSelector, panelId) {
    const trigger = document.querySelector(triggerSelector);
    const panel = document.getElementById(panelId);

    if (!trigger) return;

    // Prevent Bootstrap data-api from running automatically
    trigger.removeAttribute("data-bs-toggle");
    trigger.removeAttribute("data-bs-target");

    trigger.addEventListener("click", (e) => {
      e.preventDefault();

      if (!panel || !window.bootstrap?.Offcanvas) {
        console.warn(`[navbar] Missing offcanvas #${panelId} or Bootstrap not loaded`);
        return;
      }

      bootstrap.Offcanvas.getOrCreateInstance(panel).toggle();
    });
  }

  function safeModalOpen(buttonId, modalId) {
    const btn = document.getElementById(buttonId);
    const modalEl = document.getElementById(modalId);

    if (!btn) return;

    // Prevent Bootstrap data-api from running automatically
    btn.removeAttribute("data-bs-toggle");
    btn.removeAttribute("data-bs-target");

    btn.addEventListener("click", (e) => {
      e.preventDefault();

      if (!modalEl || !window.bootstrap?.Modal) {
        console.warn(`[navbar] Missing modal #${modalId} or Bootstrap not loaded`);
        return;
      }

      bootstrap.Modal.getOrCreateInstance(modalEl).show();
    });
  }

  // Bell -> Notifications Offcanvas
  safeOffcanvasOpen('[data-bs-target="#notificationsPanel"]', "notificationsPanel");

  // Dropdown items -> Modals
  safeModalOpen("accountSettingsBtn", "accountSettingsModal");
  safeModalOpen("helpBtn", "helpModal");

  /* =========================
      View All Notifications
  ========================= */
  const viewAllBtn = document.getElementById("viewAllNotificationsBtn");
  const notificationsPanel = document.getElementById("notificationsPanel");
  const notificationHistoryModal = document.getElementById("notificationHistoryModal");

  if (viewAllBtn) {
    // Prevent data-api just in case
    viewAllBtn.removeAttribute("data-bs-toggle");
    viewAllBtn.removeAttribute("data-bs-target");

    viewAllBtn.addEventListener("click", (e) => {
      e.preventDefault();

      if (!notificationsPanel || !notificationHistoryModal || !window.bootstrap) {
        console.warn("[navbar] Missing notificationsPanel or notificationHistoryModal");
        return;
      }

      const offcanvas = bootstrap.Offcanvas.getOrCreateInstance(notificationsPanel);
      const modal = bootstrap.Modal.getOrCreateInstance(notificationHistoryModal);

      // Close offcanvas first, then open modal
      offcanvas.hide();

      const onHidden = () => {
        notificationsPanel.removeEventListener("hidden.bs.offcanvas", onHidden);

        // remove leftover backdrops
        document.querySelectorAll(".modal-backdrop, .offcanvas-backdrop").forEach((b) => b.remove());
        document.body.classList.remove("modal-open");
        document.body.style.removeProperty("overflow");
        document.body.style.removeProperty("padding-right");

        requestAnimationFrame(() => modal.show());
      };

      notificationsPanel.addEventListener("hidden.bs.offcanvas", onHidden);
    });
  }
});