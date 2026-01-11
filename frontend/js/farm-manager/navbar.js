document.addEventListener("DOMContentLoaded", () => {
  const accountBtn = document.getElementById("accountSettingsBtn");
  const helpBtn = document.getElementById("helpBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const darkToggle = document.getElementById("darkModeToggle");

  // Account Settings modal
  if (accountBtn) {
    accountBtn.addEventListener("click", () => {
      new bootstrap.Modal(
        document.getElementById("accountSettingsModal")
      ).show();
    });
  }

  // Help modal
  if (helpBtn) {
    helpBtn.addEventListener("click", () => {
      new bootstrap.Modal(
        document.getElementById("helpModal")
      ).show();
    });
  }

  // Logout
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
