import { authGuard } from "/js/authGuard.js";

console.log("✅ mypigs.js loaded");

document.addEventListener("DOMContentLoaded", async () => {
  // 🔐 Farmer-only access
  await authGuard("farmer");

  const token = localStorage.getItem("token");
  const pigList = document.getElementById("pigList");
  const loadingMessage = document.getElementById("loadingMessage");

  // Modal elements
  const pigModal = document.getElementById("pigModal");
  const modalBody = document.getElementById("modalBody");
  const closeModal = document.getElementById("closeModal");

  if (!pigList || !loadingMessage || !pigModal || !modalBody) {
    console.error("❌ Required DOM elements missing");
    return;
  }

  closeModal?.addEventListener("click", () => {
    pigModal.classList.add("hidden");
  });

  try {
    loadingMessage.textContent = "Loading your pigs...";

    const res = await fetch("http://localhost:5000/api/swine/farmer", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      loadingMessage.textContent =
        data.message || "Failed to load pigs.";
      return;
    }

    const pigs = data.swine;

    if (!pigs || pigs.length === 0) {
      loadingMessage.textContent = "No pigs registered yet.";
      return;
    }

    loadingMessage.textContent = "";
    pigList.innerHTML = "";

    pigs.forEach((pig) => {
      // Latest performance record
      const latestPerf = pig.performance_records?.length
        ? pig.performance_records[pig.performance_records.length - 1]
        : {};

      const card = document.createElement("div");
      card.className = "pig-card";

      card.innerHTML = `
        <!-- LEFT -->
        <div class="pig-left">
          <img src="/images/pig-placeholder.png" alt="Pig" />
          <div class="pig-tag">${pig.swine_id || "—"}</div>
        </div>

        <!-- CENTER SUMMARY -->
        <div class="pig-summary">
          <p><strong>Age:</strong> ${pig.age_stage || "-"}</p>
          <p><strong>Breed:</strong> ${pig.breed || "-"}</p>
          <p><strong>Status:</strong>
            <span class="pig-status">${pig.current_status || "-"}</span>
          </p>
          <p><strong>Sex:</strong> ${pig.sex || "—"}</p>
        </div>

        <!-- RIGHT -->
        <div class="pig-actions">
          <button class="details-btn" data-id="${pig._id}">
            VIEW DETAILS
          </button>
        </div>
      `;


      // View details → modal
      card.querySelector(".details-btn").addEventListener("click", () => {
        modalBody.innerHTML = `
          <h3>${pig.swine_id}</h3>
          <hr />

          <p><strong>Breed:</strong> ${pig.breed || "-"}</p>
          <p><strong>Color:</strong> ${pig.color || "-"}</p>
          <p><strong>Sex:</strong> ${pig.sex || "-"}</p>
          <p><strong>Health Status:</strong> ${pig.health_status || "Healthy"}</p>
          <p><strong>Pipeline Status:</strong> ${pig.current_status || "-"}</p>
          <p><strong>Age Stage:</strong> ${pig.age_stage || "-"}</p>
          <p><strong>Batch:</strong> ${pig.batch || "-"}</p>
          <p><strong>Date Registered:</strong>
            ${
              pig.date_registered
                ? new Date(pig.date_registered).toLocaleDateString()
                : "-"
            }
          </p>

          <hr />
          <h4>Latest Performance</h4>
          <ul>
            <li><strong>Weight:</strong> ${latestPerf.weight ? latestPerf.weight + " kg" : "-"}</li>
            <li><strong>Body Length:</strong> ${latestPerf.body_length || "-"} cm</li>
            <li><strong>Teeth Count:</strong> ${latestPerf.teeth_count || "-"}</li>
            <li><strong>Stage:</strong> ${latestPerf.stage || "Initial"}</li>
          </ul>
        `;

        pigModal.classList.remove("hidden");
      });

      pigList.appendChild(card);
    });
  } catch (err) {
    console.error("❌ Error loading pigs:", err);
    loadingMessage.textContent =
      "Server error occurred while loading pigs.";
  }
});
