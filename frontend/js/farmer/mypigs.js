import { authGuard } from "/js/authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  await authGuard("farmer");

  const token = localStorage.getItem("token");
  const pigList = document.getElementById("pigList");
  const loadingMessage = document.getElementById("loadingMessage");
  const pigModal = document.getElementById("pigModal");
  const modalBody = document.getElementById("modalBody");
  const closeModal = document.getElementById("closeModal");

  if (!pigList || !loadingMessage) {
    console.error("❌ Required DOM elements missing");
    return;
  }

  closeModal?.addEventListener("click", () => {
    pigModal.classList.add("hidden");
  });

  try {
    loadingMessage.textContent = "Loading your pigs...";

    const response = await fetch("http://localhost:5000/api/swine/farmer", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      credentials: "include",
    });

    // ✅ SAME SAFETY CHECK AS WORKING PROTOTYPE
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await response.text();
      console.error("Non-JSON response:", text);
      throw new Error("Server returned invalid response (HTML)");
    }

    const data = await response.json();

    if (!response.ok || !data.success) {
      loadingMessage.textContent = data.message || "Failed to load pigs.";
      return;
    }

    if (!data.swine || data.swine.length === 0) {
      loadingMessage.textContent = "No pigs registered yet.";
      return;
    }

    loadingMessage.textContent = "";
    pigList.innerHTML = "";

    data.swine.forEach((pig) => {
  const latestPerf =
    pig.performance_records?.[pig.performance_records.length - 1] || {};

  const card = document.createElement("div");
  card.className = "pig-card";

  card.innerHTML = `
    <div class="pig-left">
      <img src="/images/pig-placeholder.png" alt="Pig" />
      <div class="pig-tag">${pig.swine_id || "-"}</div>
    </div>

    <div class="pig-summary">
      <p><strong>Age Stage:</strong> ${pig.age_stage || "-"}</p>
      <p><strong>Breed:</strong> ${pig.breed || "-"}</p>
      <p><strong>Health:</strong> ${pig.health_status || "Healthy"}</p>
      <p><strong>Status:</strong> ${pig.current_status || "-"}</p>
      <p><strong>Batch:</strong> ${pig.batch || "-"}</p>
    </div>

    <div class="pig-actions">
      <button class="details-btn">View Details</button>
    </div>
  `;

  card.querySelector(".details-btn").onclick = () => {
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
          pig.date_registered || pig.createdAt
            ? new Date(pig.date_registered || pig.createdAt).toLocaleDateString()
            : "-"
        }
      </p>

      <hr />
      <h4>Latest Performance</h4>
      <ul>
        <li><strong>Weight:</strong> ${latestPerf.weight ? latestPerf.weight + " kg" : "-"}</li>
        <li><strong>Body Length:</strong> ${latestPerf.body_length || "-"} cm</li>
        <li><strong>Teeth Count:</strong> ${latestPerf.teeth_count || "-"}</li>
        <li><strong>Deformities:</strong> ${
          Array.isArray(latestPerf.deformities)
            ? latestPerf.deformities.join(", ")
            : latestPerf.deformities || "None"
        }</li>
        <li><strong>Stage:</strong> ${latestPerf.stage || "Initial"}</li>
      </ul>
    `;

    pigModal.classList.remove("hidden");
  };

  pigList.appendChild(card);
});


  } catch (error) {
    console.error("❌ Load error:", error);
    loadingMessage.innerHTML =
      `<span style="color:red">${error.message}</span>`;
  }
});
