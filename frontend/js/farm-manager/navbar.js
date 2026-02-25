document.addEventListener("DOMContentLoaded", () => {
  const logoutBtn = document.getElementById("logoutBtn");

  // =========================
  // Logout
  // =========================
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      } catch (err) {
        console.error("Logout error:", err);
      } finally {
        window.location.href = "/login";
      }
    });
  }

  // =========================
  // Notifications: Offcanvas -> History modal (SAFE HANDOFF)
  // =========================
  const viewAllBtn = document.getElementById("viewAllNotificationsBtn");
  const notificationsPanel = document.getElementById("notificationsPanel");
  const historyModalEl = document.getElementById("notificationHistoryModal");

  if (!viewAllBtn || !notificationsPanel || !historyModalEl) return;

  const offcanvas = bootstrap.Offcanvas.getOrCreateInstance(notificationsPanel);
  const historyModal = bootstrap.Modal.getOrCreateInstance(historyModalEl, {
    backdrop: true,
    focus: true
  });

  // Force-remove any leftover locks/backdrops that cause "page disappeared"
  const hardCleanup = () => {
    // Remove bootstrap's scroll lock styles
    document.body.classList.remove("modal-open");
    document.body.style.removeProperty("overflow");
    document.body.style.removeProperty("padding-right");

    // If bootstrap added padding/margin to fixed/sticky elements, remove them
    document.querySelectorAll(".fixed-top, .fixed-bottom, .is-fixed, .sticky-top").forEach((el) => {
      el.style.removeProperty("padding-right");
      el.style.removeProperty("margin-right");
    });

    // Remove stray backdrops (offcanvas + modal)
    document.querySelectorAll(".modal-backdrop, .offcanvas-backdrop").forEach((b) => b.remove());
  };

  // IMPORTANT: when closing offcanvas, cleanup before opening modal
  const openHistoryModalSafely = () => {
    hardCleanup();
    // next frame helps avoid race with bootstrap transitions
    requestAnimationFrame(() => {
      hardCleanup();
      historyModal.show();
    });
  };

  viewAllBtn.addEventListener("click", () => {
    // 1) hide offcanvas
    offcanvas.hide();

    // 2) after it's fully hidden, open modal safely
    notificationsPanel.addEventListener(
      "hidden.bs.offcanvas",
      () => {
        openHistoryModalSafely();
      },
      { once: true }
    );
  });

  // Cleanup after modal closes too
  historyModalEl.addEventListener("hidden.bs.modal", () => {
    hardCleanup();
  });

  // Extra safety: if user clicks backdrop fast, cleanup
  historyModalEl.addEventListener("hide.bs.modal", () => {
    setTimeout(hardCleanup, 50);
  });
});