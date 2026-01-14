import { authGuard } from "./authGuard.js"; // 🔐 import authGuard
import { initNotifications } from "./notifications.js";

document.addEventListener("DOMContentLoaded", async () => {
  // 🔐 Protect the page
  const user = await authGuard("farmer"); // only farmers
  if (!user) return; // authGuard will redirect if not authenticated

  const farmerId = user.id; // safer than reading localStorage
  const token = localStorage.getItem("token");

  // ----- Notifications Setup -----
  initNotifications(farmerId); // centralized notification logic

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
        await fetch("http://localhost:5000/api/auth/logout", {
          method: "POST",
          credentials: "include",
        });
      } catch (err) {
        console.error("Logout error:", err);
      } finally {
        localStorage.clear(); // clear all user info
        window.location.href = "login.html";
      }
    });
  }
});
