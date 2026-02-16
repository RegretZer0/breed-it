import { authGuard } from "/js/authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  const user = await authGuard("farmer");
  if (!user) return;

  const token = localStorage.getItem("token");
  const pigList = document.getElementById("pigList");
  const loadingMessage = document.getElementById("loadingMessage");
  const pigModal = document.getElementById("pigModal");
  // Ensure modal is hidden on refresh
  pigModal?.classList.remove("show");
  document.body.style.overflow = "";

  const modalBody = document.getElementById("modalBody");
  const closeModal = document.getElementById("closeModal");

  const BACKEND_URL = "http://localhost:5000";
  let currentSwineData = [];
  let currentPage = 1;
  let itemsPerPage = 5; // card limit - my-pigs
  let currentTypeFilter = "all";
  let weightChartInstance = null;

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
    pigModal.classList.remove("show");
    document.body.style.overflow = "";
  });

  pigModal.addEventListener("click", (e) => {
  if (e.target === pigModal) {
    pigModal.classList.remove("show");
    document.body.style.overflow = "";
  }
});

  /* EDIT MODAL CONTROLS (MOVE HERE) */
  const editModal = document.getElementById("editPigModal");
  const closeEditModal = document.getElementById("closeEditModal");

  closeEditModal?.addEventListener("click", () => {
    editModal.classList.remove("show");
    document.body.style.overflow = "";
  });

  editModal?.addEventListener("click", (e) => {
    if (e.target === editModal) {
      editModal.classList.remove("show");
      document.body.style.overflow = "";
    }
  });

  const editForm = document.getElementById("editPigForm");

  editForm?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const swineId = document.getElementById("editPigId").value;
    const health = document.getElementById("editHealth").value;
    const status = document.getElementById("editStatus").value;
    const notes = document.getElementById("editNotes").value;

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
          body: JSON.stringify({
            health_status: health,
            current_status: status,
            notes: notes
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        alert(data.message || "Update failed.");
        return;
      }

      alert("Pig information updated successfully.");

      editModal.classList.remove("show");
      document.body.style.overflow = "";

      // Refresh swine list
      location.reload();

    } catch (err) {
      console.error(err);
      alert("Update failed.");
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
      case "Deceased":
      case "Deceased (Before Weaning)":
        return "deceased";
      case "Monitoring": return "monitoring";
      default: return "";
    }
  };

  const getLatestPerformance = (records = []) => {
    if (!records.length) return {};
    return [...records].sort(
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
      pigModal.classList.remove("show");
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
      <div class="monthly-section">

        <h4 class="section-title">
          <i class="bi bi-graph-up"></i> Monthly Growth
        </h4>

        <p class="pig-ref">${pig.swine_id}</p>

        <form id="growthForm" class="modern-form">

          <div class="form-group">
            <label>Weight (kg)</label>
            <input type="number" step="0.01" required name="weight" />
          </div>

          <div class="form-group">
            <label>Body Length (cm)</label>
            <input type="number" step="0.1" required name="body_length" />
          </div>

          <div class="form-group">
            <label>Heart Girth (cm)</label>
            <input type="number" step="0.1" required name="heart_girth" />
          </div>

          <div class="form-group">
            <label>Teeth Count</label>
            <input type="number" required name="teeth_count" />
          </div>

          <button type="submit" class="primary-btn full-width">
            <i class="bi bi-check-circle"></i> Save Update
          </button>

        </form>
      </div>
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
      pigModal.classList.remove("show");    };

    pigModal.classList.add("show");
    document.body.style.overflow = "hidden";
  }

  /* =========================
     TAB GENERATOR
  ========================= */
  function generateTabs(pig) {

    const isPiglet = pig.age_stage === "piglet";
    const isFemale = pig.sex === "Female";
    const isAdult = pig.age_stage === "adult";

    let tabs = `
      <button class="details-tab active" data-tab="overview">Overview</button>
      <button class="details-tab" data-tab="growth">Growth</button>
    `;

    if (!isPiglet && isAdult && isFemale) {
      tabs += `
        <button class="details-tab" data-tab="reproduction">Reproduction</button>
        <button class="details-tab" data-tab="offspring">Offspring</button>
      `;
    }

    return `
      <div class="details-tabs">
        ${tabs}
      </div>
    `;
  }

  /* =========================
    OPEN PIG MODAL
  ========================= */
  function openPigDetails(pig, latest = {}, adg = "N/A") {

    modalBody.innerHTML = `
      <div class="pig-details">

        <!-- HEADER -->
        <div class="details-header">
          <div>
            <h2>${pig.swine_id}</h2>
            <small>${pig.breed || "-"} • ${pig.sex || "-"}</small>
          </div>

          <span class="health-badge ${getStatusClass(pig.health_status)}">
            ${pig.health_status || "-"}
          </span>
        </div>

        <!-- QUICK INFO GRID -->
        <div class="details-grid">
          <div class="info-card">
            <small>Age Group</small>
            <strong>${formatStageDisplay(pig.age_stage)}</strong>
          </div>

          <div class="info-card">
            <small>Latest Weight</small>
            <strong>${latest.weight ? latest.weight + " kg" : "-"}</strong>
          </div>

          <div class="info-card">
            <small>Current Stage</small>
            <strong>${pig.current_status || "-"}</strong>
          </div>

          <div class="info-card">
            <small>Sex</small>
            <strong>${pig.sex || "-"}</strong>
          </div>
        </div>

        <!-- TABS -->
        ${generateTabs(pig)}

        <!-- TAB CONTENT -->
        <div class="details-content" id="detailsContent">
          ${renderOverviewTab(pig, latest, adg)}
        </div>

      </div>
    `;

    initializeTabSwitching(pig, latest, adg);

    pigModal.classList.add("show");
    document.body.style.overflow = "hidden";
  }



  /* =========================
    OVERVIEW TAB
  ========================= */
  function renderOverviewTab(pig, latest = {}, adg = "N/A") {

    return `
      <div class="overview-section">

        <h4>Pig Information</h4>

        <div class="condition-list">
          <div><span>Status</span><span>${pig.current_status || "-"}</span></div>
          <div><span>Health</span><span>${pig.health_status || "-"}</span></div>
          <div><span>Age Group</span><span>${formatStageDisplay(pig.age_stage)}</span></div>
          <div><span>Sex</span><span>${pig.sex || "-"}</span></div>
        </div>

        <h4>Latest Growth Record</h4>

        <div class="condition-list">
          <div><span>Weight</span><span>${latest.weight ? latest.weight + " kg" : "-"}</span></div>
          <div><span>Daily Gain (ADG)</span><span>${adg}</span></div>
          <div><span>Body Length</span><span>${latest.body_length || "-"}</span></div>
          <div><span>Heart Girth</span><span>${latest.heart_girth || "-"}</span></div>
        </div>

        <div class="overview-actions">

          <button class="secondary-btn full-btn" id="updateInfoBtn">
            <i class="bi bi-pencil-square"></i> Update Pig Info
          </button>

          <button class="primary-btn full-btn" id="monthlyUpdateBtn">
            <i class="bi bi-graph-up"></i> Add Monthly Growth
          </button>

        </div>

      </div>
    `;
  }



  /* =========================
    DEFAULT FALLBACK TAB
  ========================= */
  function renderComingSoon() {
    return `
      <div class="empty-state">
        <i class="bi bi-hourglass-split"></i>
        <p>Feature coming soon.</p>
      </div>
    `;
  }

  /* =========================
     GROWTH TAB RENDER
  ========================= */
  function renderGrowthTab(pig) {

    const records = [...(pig.performance_records || [])]
      .filter(r => r.weight)
      .sort((a, b) => new Date(a.record_date) - new Date(b.record_date));

    if (!records.length) {
      return `
        <div class="empty-state">
          <i class="bi bi-graph-up"></i>
          <p>No growth records yet.</p>
        </div>
      `;
    }

    const years = [...new Set(
      records.map(r => new Date(r.record_date).getFullYear())
    )];

    return `
      <div class="growth-section">

        <!-- BACK BUTTON -->
        <button class="back-btn" id="backToOverviewGrowth">
          <i class="bi bi-arrow-left"></i> Back
        </button>

        <div class="chart-card">
          <div class="chart-header">
            <h4>Weight Trend</h4>
            <small>Auto-updated</small>
          </div>
          <canvas id="weightChart"></canvas>
        </div>

        <div class="summary-card-light">
          <h4>Monthly Growth Summary</h4>

          <div class="year-filter">
            <i class="bi bi-calendar3"></i>
            <select id="yearFilter"></select>
          </div>

          <div id="monthlySummary"></div>
        </div>

      </div>
    `;
  }
  
  /* =========================
   CHART INITIALIZATION
  ========================= */
  function initializeGrowthChart(pig) {

    const records = [...(pig.performance_records || [])]
      .filter(r => r.weight && r.record_date)
      .sort((a, b) => new Date(a.record_date) - new Date(b.record_date));

    const ctx = document.getElementById("weightChart");
    if (!ctx) return;

    // Destroy previous instance (prevent stacking + overflow bugs)
    if (weightChartInstance) {
      weightChartInstance.destroy();
      weightChartInstance = null;
    }

    if (!records.length) return;

    const labels = records.map(r =>
      new Date(r.record_date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric"
      })
    );


    const weights = records.map(r => Number(r.weight));

    weightChartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Weight (kg)",
          data: weights,
          borderColor: "#1FA774",
          backgroundColor: "rgba(31,167,116,0.15)",
          fill: true,
          tension: 0.3,
          pointRadius: 4
        }]
      },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      devicePixelRatio: window.devicePixelRatio,

      layout: {
        padding: {
          bottom: 30
        }
      },

      plugins: {
        legend: { display: false }
      },

      scales: {
        x: {
          ticks: {
            autoSkip: false,
            maxRotation: 0,
            padding: 20
          }
        },
        y: {
          ticks: {
            callback: value => value + " kg",
            padding: 8
          }
        }
      }
    }

    });


    generateMonthlySummary(records);
  }

  /* =========================
     MONTHLY SUMMARY
  ========================= */
  function generateMonthlySummary(records) {

    const container = document.getElementById("monthlySummary");
    const yearFilter = document.getElementById("yearFilter");
    if (!container || !yearFilter) return;

    // --- GROUP BY YEAR ---
    const years = [...new Set(
      records.map(r => new Date(r.record_date).getFullYear())
    )].sort((a,b)=>b-a);

    yearFilter.innerHTML = years.map(y =>
      `<option value="${y}">${y}</option>`
    ).join("");

    function render(year) {

      const monthly = {};

      records
        .filter(r => new Date(r.record_date).getFullYear() == year)
        .forEach(r => {

          const date = new Date(r.record_date);
          const monthIndex = date.getMonth();
          const monthName = date.toLocaleString("default", { month: "long" });

          if (!monthly[monthIndex]) {
            monthly[monthIndex] = {
              name: monthName,
              records: []
            };
          }

          monthly[monthIndex].records.push(r);
        });

      // Sort months newest first
      const sortedMonths = Object.keys(monthly)
        .map(m => parseInt(m))
        .sort((a,b)=>b-a);

      container.innerHTML = sortedMonths.map(monthIndex => {

        const monthData = monthly[monthIndex];
        const data = monthData.records
          .sort((a,b)=> new Date(a.record_date)-new Date(b.record_date));

        const start = data[0].weight;
        const end = data[data.length-1].weight;
        const diff = (end - start).toFixed(1);

        return `
          <div class="month-card">

            <div class="month-header">
              <strong>${monthData.name} ${year}</strong>

              <div class="month-right">
                <span>${start} → ${end} kg</span>
                <span class="gain-badge ${diff>0?"positive":"neutral"}">
                  ${diff>0?"+":""}${diff} kg
                </span>
              </div>
            </div>

            <button class="month-toggle-btn">
              View ${data.length} update(s)
            </button>

            <div class="month-details hidden">
              ${data.map(r=>`
                <div class="month-row">
                  <div>${new Date(r.record_date).toLocaleDateString()}</div>
                  <div>
                    Weight <strong>${r.weight}</strong> kg
                    &nbsp; Length ${r.body_length||"-"} cm
                    &nbsp; Girth ${r.heart_girth||"-"} cm
                  </div>
                </div>
              `).join("")}
            </div>

          </div>
        `;
      }).join("");

      attachMonthToggle();
    }

    if (years.length) {
      render(years[0]);
    }

    yearFilter.addEventListener("change", e=>render(e.target.value));
  }

  //Toggle
   function attachMonthToggle() {
      document.querySelectorAll(".month-toggle-btn").forEach(btn=>{
        btn.addEventListener("click", ()=>{
          const details = btn.nextElementSibling;
          details.classList.toggle("hidden");

          btn.textContent =
            details.classList.contains("hidden")
            ? btn.textContent.replace("Hide","View")
            : "Hide";
        });
      });
    }

  /* =========================
     OFFSPRING TAB
  ========================= */
  function renderOffspringTab(pig) {

    if (pig.sex !== "Female") {
      return `
        <div class="empty-state">
          <i class="bi bi-gender-male"></i>
          <p>Offspring records are available for female pigs only.</p>
        </div>
      `;
    }

    const cycles = (pig.breeding_cycles || [])
      .filter(c => c.actual_farrowing_date)
      .sort((a, b) =>
        new Date(b.actual_farrowing_date) -
        new Date(a.actual_farrowing_date)
      );

    if (!cycles.length) {
      return `
        <div class="empty-state">
          <i class="bi bi-heart"></i>
          <p>No farrowing records yet.</p>
        </div>
      `;
    }

    return `
      <div class="offspring-section">

        <div class="cycle-header">
          <h4>Farrowing Cycles</h4>
          <small>Total Parity: ${pig.parity || 0}</small>
        </div>

        ${cycles.map(cycle => {
          const results = cycle.farrowing_results || {};
          return `
            <div class="cycle-card">
              <div>
                <strong>Cycle ${cycle.cycle_number || "-"}</strong>
                <small>
                  ${cycle.actual_farrowing_date
                    ? new Date(cycle.actual_farrowing_date).toLocaleDateString()
                    : "Date not recorded"}
                </small>
              </div>

              <div class="cycle-stats">
                <span>Total: ${results.total_piglets || 0}</span>
                <span>Live: ${results.live_piglets || 0}</span>
                <span>Mortality: ${results.mortality_count || 0}</span>
              </div>
            </div>
          `;
        }).join("")}

      </div>
    `;
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

      card.addEventListener("click", () => {
        console.log("Pig clicked:", pig.swine_id);
        openPigDetails(pig, latest, adg);
      });


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

  /* =========================
   TAB SWITCHING FUNCTION
   Handles switching between Overview, Growth, etc.
  ========================= */
  function initializeTabSwitching(pig, latest, adg) {
    const tabs = document.querySelectorAll(".details-tab");
    const content = document.getElementById("detailsContent");

    if (!tabs.length || !content) return;

    // Helper to attach Overview buttons
    function attachOverviewActions() {
      const monthlyBtn = document.getElementById("monthlyUpdateBtn");
      if (monthlyBtn) {
        monthlyBtn.addEventListener("click", () =>
          openMonthlyUpdateModal(pig)
        );
      }

      const updateInfoBtn = document.getElementById("updateInfoBtn");
      if (updateInfoBtn) {
        updateInfoBtn.addEventListener("click", () => {
          const editModal = document.getElementById("editPigModal");

          if (!editModal) return;

          // Populate edit fields
          const idField = document.getElementById("editPigId");
          const healthField = document.getElementById("editHealth");
          const statusField = document.getElementById("editStatus");
          const notesField = document.getElementById("editNotes");

          if (idField) idField.value = pig.swine_id;
          if (healthField) healthField.value = pig.health_status || "Healthy";
          if (statusField) statusField.value = pig.current_status || "Open";
          if (notesField) notesField.value = "";

          editModal.classList.add("show");
          document.body.style.overflow = "hidden";
        });
      }
    }

    tabs.forEach(tab => {
      tab.addEventListener("click", () => {

        // Remove active from all
        tabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");

        const selected = tab.dataset.tab;

        /* =========================
          OVERVIEW TAB
        ========================= */
        if (selected === "overview") {
          content.innerHTML = renderOverviewTab(pig, latest, adg);
          attachOverviewActions();
        }

        /* =========================
          GROWTH TAB
        ========================= */
        else if (selected === "growth") {
          content.innerHTML = renderGrowthTab(pig);
          initializeGrowthChart(pig);

          // Attach back button
          const backBtn = document.getElementById("backToOverviewGrowth");
          if (backBtn) {
            backBtn.addEventListener("click", () => {
              const overviewTab = document.querySelector('[data-tab="overview"]');
              if (overviewTab) overviewTab.click();
            });
          }
        }

        /* =========================
          OFFSPRING TAB
        ========================= */
        else if (selected === "offspring") {
          content.innerHTML = renderOffspringTab(pig);
        }

        /* =========================
          OTHER TABS
        ========================= */
        else {
          content.innerHTML = renderComingSoon();
        }

      });
    });

    // Ensure Overview buttons work on first load
    attachOverviewActions();
  }

});
