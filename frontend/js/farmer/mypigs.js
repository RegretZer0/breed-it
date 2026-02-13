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
  let currentPage = 1;
  let itemsPerPage = 5; // card limit - my-pigs
  let currentTypeFilter = "all";


  function updateSummaryStats() {
  document.getElementById("totalCount").textContent =
    currentSwineData.length;

  document.getElementById("healthyCount").textContent =
    currentSwineData.filter(p => p.health_status === "Healthy").length;

  document.getElementById("sickCount").textContent =
    currentSwineData.filter(p => p.health_status === "Sick").length;
}

  /* =========================
     MODAL CONTROLS
  ========================= */
  closeModal?.addEventListener("click", () => {
    pigModal.classList.add("hidden");
  });

  pigModal.addEventListener("click", (e) => {
    if (e.target === pigModal) {
      pigModal.classList.add("hidden");
    }
  });

  /* =========================
     HELPERS
  ========================= */
  const formatStageDisplay = (stage) => {
    const mapping = {
      "Monitoring (Day 1-30)": "Piglet",
      "Weaned (Monitoring 3 Months)": "Weaner",
      "Final Selection": "Selection",
      adult: "Adult",
      piglet: "Piglet",
    };
    return mapping[stage] || stage || "-";
  };

  const getStatusClass = (status) => {
    switch (status) {
      case "Healthy": return "healthy";
      case "Sick": return "sick";
      case "Deceased": return "deceased";
      case "Monitoring": return "monitoring";
      default: return "";
    }
  };

  const getLatestPerformance = (records = []) => {
    if (!records.length) return {};
    return records.sort(
      (a, b) => new Date(b.record_date) - new Date(a.record_date)
    )[0];
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
     HEALTH UPDATE
  ========================= */
  async function updateHealthStatus(swineId, newStatus) {
    try {
      const response = await fetch(
        `${BACKEND_URL}/api/swine/update/${swineId}`,
        {
          method: "PUT",
          credentials: "include",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ health_status: newStatus }),
        }
      );

      const data = await response.json();
      if (!response.ok || !data.success) {
        alert(data.message || "Failed to update.");
        return;
      }

      // Update locally instead of reload
      const pig = currentSwineData.find(p => p.swine_id === swineId);
      if (pig) pig.health_status = newStatus;

      // Update stats
      document.getElementById("totalCount").textContent = currentSwineData.length;
      document.getElementById("healthyCount").textContent =
        currentSwineData.filter(p => p.health_status === "Healthy").length;
      document.getElementById("sickCount").textContent =
        currentSwineData.filter(p => p.health_status === "Sick").length;

      renderSwine();
      pigModal.classList.add("hidden");

    } catch (err) {
      console.error(err);
      alert("Update failed.");
    }
  }

  /* =========================
     MONTHLY UPDATE MODAL
  ========================= */
  function openMonthlyUpdateModal(pig) {
    modalBody.innerHTML = `
      <h3><i class="bi bi-graph-up"></i> Monthly Growth</h3>
      <p><strong>${pig.swine_id}</strong></p>
      <hr />

      <form id="growthForm" class="growth-form">
        <label>Weight (kg)
          <input type="number" step="0.01" required name="weight" />
        </label>

        <label>Body Length (cm)
          <input type="number" step="0.1" required name="body_length" />
        </label>

        <label>Heart Girth (cm)
          <input type="number" step="0.1" required name="heart_girth" />
        </label>

        <label>Teeth Count
          <input type="number" required name="teeth_count" />
        </label>

        <button type="submit">
          <i class="bi bi-save"></i> Save Update
        </button>
      </form>
    `;

    modalBody.querySelector("#growthForm").onsubmit = async (e) => {
      e.preventDefault();
      const form = e.target;

      const payload = {
        performance_records: {
          weight: Number(form.weight.value),
          body_length: Number(form.body_length.value),
          heart_girth: Number(form.heart_girth.value),
          teeth_count: Number(form.teeth_count.value),
          stage: pig.current_status
        }
      };

      await fetch(`${BACKEND_URL}/api/swine/update/${pig.swine_id}`, {
        method: "PUT",
        credentials: "include",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      alert("Update saved!");
      pigModal.classList.add("hidden");
    };

    pigModal.classList.remove("hidden");
  }

  /* =========================
     OPEN PIG MODAL
  ========================= */
  function openPigDetails(pig, latest, adg) {
  modalBody.innerHTML = `
    <h3>${pig.swine_id}</h3>
    <hr />

    <p><i class="bi bi-tag"></i> ${pig.breed}</p>
    <p><i class="bi bi-gender-ambiguous"></i> ${pig.sex}</p>
    <p><i class="bi bi-calendar"></i> ${formatStageDisplay(pig.age_stage)}</p>

    <h4>Health Status</h4>
    <select id="healthSelect">
      <option ${pig.health_status === "Healthy" ? "selected" : ""}>Healthy</option>
      <option ${pig.health_status === "Sick" ? "selected" : ""}>Sick</option>
      <option ${pig.health_status === "Deceased" ? "selected" : ""}>Deceased</option>
    </select>

    <h4>Performance</h4>
    <ul>
      <li><strong>Weight:</strong> ${latest.weight || "-"} kg</li>
      <li><strong>ADG:</strong> ${adg}</li>
    </ul>

    <button id="monthlyUpdateBtn">
      <i class="bi bi-graph-up"></i> Monthly Update
    </button>
  `;

  modalBody.querySelector("#healthSelect")
    ?.addEventListener("change", e =>
      updateHealthStatus(pig.swine_id, e.target.value)
    );

  modalBody.querySelector("#monthlyUpdateBtn")
    ?.addEventListener("click", () =>
      openMonthlyUpdateModal(pig)
    );

  pigModal.classList.remove("hidden");
}
  /* =========================
     RENDER SWINE
  ========================= */
  function renderSwine() {
  pigList.innerHTML = "";

  let filtered = [...currentSwineData];

  // Type filtering
  if (currentTypeFilter !== "all") {
    filtered = filtered.filter(p => {
      const stage = (p.age_stage || "").toLowerCase();
      const sex = (p.sex || "").toLowerCase();

      if (currentTypeFilter === "piglet") {
        return stage.includes("piglet") || stage.includes("monitoring");
      }

      if (currentTypeFilter === "sow") {
        return sex === "female" && stage.includes("adult");
      }

      if (currentTypeFilter === "boar") {
        return sex === "male" && stage.includes("adult");
      }

      return true;
    });
  }

  // Sort sick first
  filtered.sort((a, b) => {
    if (a.health_status === "Sick") return -1;
    if (b.health_status === "Sick") return 1;
    return 0;
  });

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  if (currentPage > totalPages) currentPage = totalPages || 1;

  const start = (currentPage - 1) * itemsPerPage;
  const paginatedItems = filtered.slice(start, start + itemsPerPage);

  paginatedItems.forEach(pig => {
    const latest = getLatestPerformance(pig.performance_records);
    const adg = calculateADG(pig.performance_records);

    const card = document.createElement("div");
    card.className = "pig-card";

    card.innerHTML = `
      <div class="pig-card-top">
        <div class="pig-id">
          <i class="bi bi-piggy-bank"></i> ${pig.swine_id}
        </div>
        <span class="status-badge ${getStatusClass(pig.health_status)}">
          ${pig.health_status}
        </span>
      </div>

      <div class="pig-card-meta">
        ${formatStageDisplay(pig.age_stage)} • ${pig.current_status}
      </div>
    `;

    card.onclick = () => openPigDetails(pig, latest, adg);

    pigList.appendChild(card);
  });

  // Update pagination UI
  document.getElementById("pageInfo").textContent =
    `Page ${currentPage} of ${totalPages || 1}`;

  document.getElementById("prevPage").disabled = currentPage === 1;
  document.getElementById("nextPage").disabled = currentPage === totalPages;
}

document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn")
      .forEach(b => b.classList.remove("active"));

    btn.classList.add("active");

    currentTypeFilter = btn.dataset.type;
    currentPage = 1;

    renderSwine();
  });
});


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

    updateSummaryStats();
    renderSwine();


  } catch (err) {
    console.error(err);
    loadingMessage.innerHTML =
      `<span style="color:red">${err.message}</span>`;
  }

  document.getElementById("prevPage").addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      renderSwine();
    }
  });

  document.getElementById("nextPage").addEventListener("click", () => {
    currentPage++;
    renderSwine();
  });
});
