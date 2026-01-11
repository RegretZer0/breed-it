document.addEventListener("DOMContentLoaded", () => {

  // 🔐 Force reload if page restored from BFCache
  window.addEventListener("pageshow", event => {
    if (event.persisted) {
      window.location.reload();
    }
  });

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
