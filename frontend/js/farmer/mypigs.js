import { authGuard } from "../auth/authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  // 🔐 Farmer-only access
  await authGuard("farmer");

  const token = localStorage.getItem("token");
  const farmerId = localStorage.getItem("userId");

  const pigList = document.getElementById("pigList");
  const loadingMessage = document.getElementById("loadingMessage");

  const modal = document.getElementById("pigModal");
  const modalBody = document.getElementById("modalBody");
  const closeModal = document.getElementById("closeModal");

  if (closeModal) {
    closeModal.onclick = () => modal.classList.add("hidden");
  }

  try {
    loadingMessage.textContent = "Loading pigs...";

    const response = await fetch(
      `http://localhost:5000/api/swine/farmer/mypigs?farmerId=${farmerId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      loadingMessage.textContent = data.message || "Failed to load pigs.";
      return;
    }

    if (!data.pigs || data.pigs.length === 0) {
      loadingMessage.textContent = "No pigs found.";
      return;
    }

    loadingMessage.textContent = "";
    pigList.innerHTML = "";

    data.pigs.forEach(pig => {
      const ageMonths = getAgeInMonths(pig.birth_date);

      const card = document.createElement("div");
      card.className = "pig-card";

      card.innerHTML = `
        <div class="pig-image">
          <img src="/images/pig-placeholder.png" alt="Pig">
          <p class="tag">${pig.swine_id || "-"}</p>
        </div>

        <div class="pig-info">
          <p><strong>AGE:</strong> ${ageMonths} MONTHS</p>
          <p><strong>BREED:</strong> ${pig.breed || "-"}</p>
          <p><strong>STATUS:</strong> ${pig.status || "-"}</p>
          <p><strong>INVENTORY:</strong> ${pig.inventory_status || "-"}</p>

          <button class="details-btn">VIEW DETAILS</button>
        </div>
      `;

      card.querySelector(".details-btn").addEventListener("click", () => {
        showDetails(pig);
      });

      pigList.appendChild(card);
    });

  } catch (error) {
    console.error("[MY PIGS ERROR]:", error);
    loadingMessage.textContent = "Server error occurred while loading pigs.";
  }

  // =========================
  // MODAL DETAILS
  // =========================
  function showDetails(pig) {
    modalBody.innerHTML = `
      <h3>Pig Full Details</h3>
      <p><strong>Tag Number:</strong> ${pig.swine_id || "-"}</p>
      <p><strong>Sex:</strong> ${pig.sex || "-"}</p>
      <p><strong>Color:</strong> ${pig.color || "-"}</p>
      <p><strong>Breed:</strong> ${pig.breed || "-"}</p>
      <p><strong>Status:</strong> ${pig.status || "-"}</p>
      <p><strong>Inventory Status:</strong> ${pig.inventory_status || "-"}</p>
      <p><strong>Batch:</strong> ${pig.batch || "-"}</p>
      <p><strong>Sire ID:</strong> ${pig.sire_id || "-"}</p>
      <p><strong>Dam ID:</strong> ${pig.dam_id || "-"}</p>
      <p><strong>Date Registered:</strong> ${formatDate(pig.date_registered)}</p>
      <p><strong>Date Transferred:</strong> ${formatDate(pig.date_transfer)}</p>
    `;

    modal.classList.remove("hidden");
  }

  // =========================
  // HELPERS
  // =========================
  function getAgeInMonths(birthDate) {
    if (!birthDate) return "-";
    const diff = Date.now() - new Date(birthDate);
    return Math.floor(diff / (1000 * 60 * 60 * 24 * 30));
  }

  function formatDate(date) {
    return date ? new Date(date).toLocaleDateString() : "-";
  }
});
