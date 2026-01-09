// farmer_dashboard.js
import { authGuard } from "../auth/authGuard.js"; // 🔐 import authGuard

document.addEventListener("DOMContentLoaded", async () => {
  // 🔐 Protect the page
  await authGuard("farmer"); // only farmers

  const farmerId = localStorage.getItem("userId");
  const token = localStorage.getItem("token");

  // View Swine
  const viewSwineBtn = document.getElementById("viewSwineBtn");
  if (viewSwineBtn) {
    viewSwineBtn.addEventListener("click", () => {
      window.location.href = "farmer_swine.html";
    });
  }

  // Heat Report
  const heatReportBtn = document.getElementById("heatReportBtn");
  if (heatReportBtn) {
    heatReportBtn.addEventListener("click", () => {
      window.location.href = "report_heat.html";
    });
  }

  // View Profile
  const profileBtn = document.getElementById("profileBtn");
  if (profileBtn) {
    profileBtn.addEventListener("click", () => {
      window.location.href = "farmer_profile.html";
    });
  }

  // Logout
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        // 🔒 Optionally notify backend of logout
        await fetch("http://localhost:5000/api/auth/logout", {
          method: "POST",
          credentials: "include",
        });
      } catch (err) {
        console.error("Logout error:", err);
      } finally {
        // Clear local storage
        localStorage.removeItem("token");
        localStorage.removeItem("userId");
        localStorage.removeItem("role");
        localStorage.removeItem("user");

        window.location.href = "login.html";
      }
    });
  }
});
