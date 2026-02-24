document.addEventListener("DOMContentLoaded", () => {
  const logoutBtn = document.getElementById("logoutBtn");
  const darkToggle = document.getElementById("darkModeToggle");

  // =========================
  // Logout
  // =========================
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

  // =========================
  // Dark Mode (persisted)
  // =========================
  const isDark = localStorage.getItem("darkMode") === "true";
  document.body.classList.toggle("dark-mode", isDark);

  if (darkToggle) {
    darkToggle.checked = isDark;

    darkToggle.addEventListener("change", () => {
      document.body.classList.toggle("dark-mode", darkToggle.checked);
      localStorage.setItem("darkMode", darkToggle.checked);
    });
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const viewAllBtn = document.getElementById("viewAllNotificationsBtn");
  const notificationsPanel = document.getElementById("notificationsPanel");
  const notificationHistoryModal = document.getElementById("notificationHistoryModal");

  if (!viewAllBtn || !notificationsPanel || !notificationHistoryModal) return;

  const offcanvas = bootstrap.Offcanvas.getOrCreateInstance(notificationsPanel);
  const modal = bootstrap.Modal.getOrCreateInstance(notificationHistoryModal);

  // HARD CLEANUP FUNCTION
  const forceCleanup = () => {
    document.body.classList.remove("modal-open", "offcanvas-open");
    document.body.style.removeProperty("overflow");

    document.querySelectorAll(".modal-backdrop, .offcanvas-backdrop").forEach((b) => b.remove());
  };

  viewAllBtn.addEventListener("click", () => {
    // Close offcanvas first
    offcanvas.hide();

    notificationsPanel.addEventListener(
      "hidden.bs.offcanvas",
      () => {
        forceCleanup();
        requestAnimationFrame(() => {
          modal.show();
        });
      },
      { once: true }
    );
  });

  // When modal closes → clean again
  notificationHistoryModal.addEventListener("hidden.bs.modal", () => {
    forceCleanup();
  });
});