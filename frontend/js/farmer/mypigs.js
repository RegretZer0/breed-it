import { authGuard } from "/js/authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  const user = await authGuard("farmer");
  if (!user) return;

  const token = localStorage.getItem("token");
  const pigList = document.getElementById("pigList");
  const loadingMessage = document.getElementById("loadingMessage");
  const pigModal = document.getElementById("pigModal");
  const modalBody = document.getElementById("modalBody");
  const closeModal = document.getElementById("closeModal");
  const BACKEND_URL = "http://localhost:5000";

  let currentSwineData = [];

  closeModal?.addEventListener("click", () => {
    pigModal.classList.add("hidden");
  });

  /* =========================
     HELPERS (FROM PROTOTYPE)
  ========================= */

  const formatStageDisplay = (stage) => {
    const mapping = {
      "Monitoring (Day 1-30)": "piglet",
      "Weaned (Monitoring 3 Months)": "weaner",
      "Final Selection": "selection",
      adult: "adult",
      piglet: "piglet",
    };
    return mapping[stage] || stage || "-";
  };

  const getLatestPerformance = (records = []) => {
    if (!records.length) return {};
    return records.sort(
      (a, b) => new Date(b.record_date) - new Date(a.record_date)
    )[0];
  };

  const formatDeformities = (deformities) => {
    const active = (deformities || []).filter(d => d && d !== "None");
    return active.length ? active.join(", ") : "None";
  };

  const calculateADG = (records = []) => {
    if (records.length < 2) return "N/A";
    const last = records[records.length - 1];
    const prev = records[records.length - 2];
    const days =
      (new Date(last.record_date) - new Date(prev.record_date)) /
      (1000 * 60 * 60 * 24);
    if (days <= 0) return "N/A";
    return ((last.weight - prev.weight) / days).toFixed(3) + " kg/day";
  };

  /* =========================
     HEALTH UPDATE (ACTION)
  ========================= */
  async function updateHealthStatus(swineId, newStatus) {
    try {
      const response = await fetch(
        `http://localhost:5000/api/swine/update/${swineId}`,
        {
          method: "PUT",
          credentials: "include", // 🔑 REQUIRED
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ health_status: newStatus }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        alert("Error: " + (data.message || "Failed to update health status."));
        return;
      }

      location.reload();
    } catch (error) {
      console.error("Update Error:", error);
      alert("Server error while updating health status.");
    }
  }

  /* =========================
     MONTHLY UPDATE (ACTION)
  ========================= */
  window.recordGrowth = async (swineId) => {
    const swine = currentSwineData.find(s => s.swine_id === swineId);
    if (!swine) return;

    const weight = prompt("Enter Weight (kg):");
    if (weight === null) return;

    const length = prompt("Enter Body Length (cm):");
    const girth = prompt("Enter Heart Girth (cm):");
    const teeth = prompt("Enter Teeth Count:");
    const deformity = prompt("Enter Deformities (leave blank for 'None'):") || "None";

    const payload = {
      performance_records: {
        weight: parseFloat(weight),
        body_length: parseFloat(length),
        heart_girth: parseFloat(girth),
        teeth_count: parseInt(teeth),
        deformities: [deformity],
        stage: swine.current_status,
        record_date: new Date()
      }
    };

    try {
      const res = await fetch(
        `http://localhost:5000/api/swine/update/${swineId}`,
        {
          method: "PUT",
          credentials: "include", // 🔑 REQUIRED
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await res.json();

      if (data.success) {
        alert(`Monthly update saved for ${swineId}!`);
        location.reload();
      } else {
        alert("Error: " + data.message);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to save growth record.");
    }
  };

  /* =========================
     LOAD SWINE
  ========================= */
  try {
    loadingMessage.textContent = "Loading your pigs...";

    const response = await fetch(`${BACKEND_URL}/api/swine/farmer`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      credentials: "include",
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      loadingMessage.textContent = data.message || "Failed to load pigs.";
      return;
    }

    currentSwineData = data.swine;
    loadingMessage.textContent = "";
    pigList.innerHTML = "";

    data.swine.forEach(pig => {
      const latest = getLatestPerformance(pig.performance_records);
      const adg = calculateADG(pig.performance_records);

      const card = document.createElement("div");
      card.className = "pig-card";

      card.innerHTML = `
        <div class="pig-left">
          <img 
              src="${pig.image_url || '/images/default-pig.png'}"
              alt="Pig"
              onerror="this.src='/images/default-pig.png'"
            />
          <span class="pig-tag">${pig.swine_id}</span>
        </div>

        <div class="pig-summary">
          <p><strong>Breed:</strong> ${pig.breed}</p>
          <p><strong>Age Stage:</strong> ${formatStageDisplay(pig.age_stage)}</p>
          <p><strong>Health:</strong> ${pig.health_status}</p>

          <p><strong>Status:</strong> ${pig.current_status}</p>
        </div>

        <div class="pig-actions">
          <button class="details-btn">View / Edit</button>
        </div>
      `;

      card.querySelector(".details-btn").onclick = () => {
        modalBody.innerHTML = `
          <h3>${pig.swine_id}</h3>
          <hr />

          <p><strong>Breed:</strong> ${pig.breed}</p>
          <p><strong>Sex:</strong> ${pig.sex}</p>
          <p><strong>Age Stage:</strong> ${formatStageDisplay(pig.age_stage)}</p>

          <h4>Health Status</h4>
          <select id="healthSelect">
            <option ${pig.health_status === "Healthy" ? "selected" : ""}>Healthy</option>
            <option ${pig.health_status === "Sick" ? "selected" : ""}>Sick</option>
            <option ${pig.health_status === "Deceased" ? "selected" : ""}>Deceased</option>
          </select>

          <h4>Latest Performance</h4>
          <ul>
            <li><strong>Weight:</strong> ${latest.weight || "-"} kg</li>
            <li><strong>Dimensions:</strong> ${latest.body_length || "-"}L / ${latest.heart_girth || "-"}G</li>
            <li><strong>ADG:</strong> ${adg}</li>
            <li><strong>Deformities:</strong> ${formatDeformities(latest.deformities)}</li>
          </ul>

          <button class="btn-update-growth"
            onclick="recordGrowth('${pig.swine_id}')">
            Monthly Update
          </button>
        `;

        modalBody.querySelector("#healthSelect")
          .addEventListener("change", e =>
            updateHealthStatus(pig.swine_id, e.target.value)
          );

        pigModal.classList.remove("hidden");
      };

      pigList.appendChild(card);
    });

  } catch (err) {
    console.error(err);
    loadingMessage.innerHTML =
      `<span style="color:red">${err.message}</span>`;
  }
});
