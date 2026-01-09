// farmer_profile.js
import { authGuard } from "../auth/authGuard.js"; // 🔐 import authGuard

document.addEventListener("DOMContentLoaded", async () => {
  // 🔐 Protect the page: only farmers
  await authGuard("farmer");

  const token = localStorage.getItem("token");
  const farmerId = localStorage.getItem("userId"); // Using _id
  const profileMessage = document.getElementById("profileMessage");

  // Elements
  const nameEl = document.getElementById("name");
  const emailEl = document.getElementById("email");
  const farmerIdEl = document.getElementById("farmerId");
  const addressEl = document.getElementById("address");
  const contactEl = document.getElementById("contact");
  const numPensEl = document.getElementById("numPens");
  const penCapacityEl = document.getElementById("penCapacity");

  try {
    const res = await fetch(`http://localhost:5000/api/farmer/profile/${farmerId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) throw new Error(`Server returned ${res.status}`);

    const data = await res.json();

    if (!data.success) {
      profileMessage.textContent = data.message || "Failed to fetch profile";
      profileMessage.style.color = "red";
      return;
    }

    const farmer = data.farmer;

    // Populate the HTML fields
    nameEl.textContent = farmer.name || "-";
    emailEl.textContent = farmer.email || "-";
    farmerIdEl.textContent = farmer.farmer_id || "-";
    addressEl.textContent = farmer.address || "-";
    contactEl.textContent = farmer.contact_no || "-";
    numPensEl.textContent = farmer.num_of_pens ?? 0;
    penCapacityEl.textContent = farmer.pen_capacity ?? 0;

  } catch (err) {
    console.error("Error fetching profile:", err);
    profileMessage.textContent = "Server error occurred.";
    profileMessage.style.color = "red";
  }

  // Back to dashboard
  const backBtn = document.getElementById("backBtn");
  backBtn?.addEventListener("click", () => {
    const role = localStorage.getItem("role");
    if (role === "farmer") window.location.href = "farmer_dashboard.html";
    else window.location.href = "login.html";
  });

  // Logout handler
  const logoutBtn = document.getElementById("logoutBtn");
  logoutBtn?.addEventListener("click", async () => {
    try {
      await fetch("http://localhost:5000/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      localStorage.clear();
      window.location.href = "login.html";
    }
  });
});
