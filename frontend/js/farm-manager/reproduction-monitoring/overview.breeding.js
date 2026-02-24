export function initBreedingModule(ctx) {
  const { state } = ctx;

  function groupPigletsByCycle(sow) {
    const piglets = state.allSwineData.filter(p =>
      (p.dam_id || "").toString().trim() === (sow.swine_id || "").toString().trim()
    );

    const grouped = {};
    piglets.forEach(p => {
      const cycle = p.birth_cycle_number || "Unknown";
      if (!grouped[cycle]) grouped[cycle] = [];
      grouped[cycle].push(p);
    });

    return grouped;
  }

  function renderBreedingPerformance() {
    const wrap = document.getElementById("breedingSowList");
    const kpiWrap = document.getElementById("breedingKpiSection");
    if (!wrap || !kpiWrap) return;

    wrap.innerHTML = "";

    state.breedingSowsCache = state.currentFarmerPigs.filter(p =>
      p.sex?.toLowerCase() === "female" &&
      p.age_stage?.toLowerCase().includes("adult")
    );

    if (!state.breedingSowsCache.length) {
      wrap.innerHTML = `<div class="text-muted">No adult sows found.</div>`;
      return;
    }

    const totalPages = Math.max(
      1,
      Math.ceil(state.breedingSowsCache.length / state.BREEDING_SOWS_PER_PAGE)
    );

    if (state.breedingSowPage > totalPages) state.breedingSowPage = totalPages;

    const start = (state.breedingSowPage - 1) * state.BREEDING_SOWS_PER_PAGE;
    const pageItems = state.breedingSowsCache.slice(start, start + state.BREEDING_SOWS_PER_PAGE);

    let totalBornAll = 0;
    let totalDeadAll = 0;
    let totalCycles = 0;

    pageItems.forEach(sow => {
      const cycles = groupPigletsByCycle(sow);
      const cycleKeys = Object.keys(cycles);

      totalCycles += cycleKeys.length;

      let sowBorn = 0;
      let sowDead = 0;

      cycleKeys.forEach(c => {
        const piglets = cycles[c];
        const born = piglets.length;
        const dead = piglets.filter(p => ctx.isDeadStatus(p.health_status)).length; // ✅ FIX

        sowBorn += born;
        sowDead += dead;
      });

      totalBornAll += sowBorn;
      totalDeadAll += sowDead;

      const mortality = sowBorn > 0 ? ((sowDead / sowBorn) * 100).toFixed(1) : 0;

      wrap.insertAdjacentHTML("beforeend", `
        <div class="card shadow-sm border-0 mb-3">
          <div class="card-body d-flex justify-content-between align-items-center">
            <div>
              <div class="fw-semibold">${sow.swine_id}</div>
              <div class="small text-muted">
                Cycles: ${cycleKeys.length} |
                Total Born: ${sowBorn} |
                Mortality: ${mortality}%
              </div>
            </div>

            <button class="btn btn-sm btn-outline-primary view-sow-cycles-btn" data-id="${sow._id}">
              View Cycles
            </button>
          </div>
        </div>
      `);
    });

    wrap.insertAdjacentHTML("beforeend", `
      <div class="d-flex justify-content-between align-items-center mt-3">
        <button class="btn btn-sm btn-outline-secondary" id="breedingPrevBtn">Prev</button>
        <span class="small text-muted">Page ${state.breedingSowPage} of ${totalPages}</span>
        <button class="btn btn-sm btn-outline-secondary" id="breedingNextBtn">Next</button>
      </div>
    `);

    document.getElementById("breedingPrevBtn").disabled = state.breedingSowPage <= 1;
    document.getElementById("breedingNextBtn").disabled = state.breedingSowPage >= totalPages;

    document.getElementById("breedingPrevBtn")
      ?.addEventListener("click", () => {
        if (state.breedingSowPage > 1) {
          state.breedingSowPage--;
          renderBreedingPerformance();
        }
      });

    document.getElementById("breedingNextBtn")
      ?.addEventListener("click", () => {
        if (state.breedingSowPage < totalPages) {
          state.breedingSowPage++;
          renderBreedingPerformance();
        }
      });

    const overallMortality = totalBornAll > 0
      ? ((totalDeadAll / totalBornAll) * 100).toFixed(1)
      : 0;

    kpiWrap.innerHTML = `
      <div class="col-md-3">
        <div class="card text-center p-3 shadow-sm border-0">
          <div class="small text-muted">Total Sows</div>
          <div class="fs-4 fw-bold">${state.breedingSowsCache.length}</div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card text-center p-3 shadow-sm border-0">
          <div class="small text-muted">Total Cycles</div>
          <div class="fs-4 fw-bold">${totalCycles}</div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card text-center p-3 shadow-sm border-0">
          <div class="small text-muted">Total Piglets</div>
          <div class="fs-4 fw-bold">${totalBornAll}</div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card text-center p-3 shadow-sm border-0">
          <div class="small text-muted">Avg Mortality</div>
          <div class="fs-4 fw-bold text-danger">${overallMortality}%</div>
        </div>
      </div>
    `;
  }

  function closeSowDetailView() {
    document.getElementById("breedingCyclePanel")?.classList.add("d-none");
    document.getElementById("breedingSowList")?.classList.remove("d-none");
    document.getElementById("breedingKpiSection")?.classList.remove("d-none");
  }

  function openSowCycles(sowId) {
    const sow = state.currentFarmerPigs.find(p => p._id === sowId);
    if (!sow) return;

    state.activeSowForBreeding = sow;

    document.getElementById("breedingSowList")?.classList.add("d-none");
    document.getElementById("breedingKpiSection")?.classList.add("d-none");

    const panel = document.getElementById("breedingCyclePanel");
    if (!panel) return;

    panel.classList.remove("d-none");

    panel.innerHTML = `
      <div class="mb-3">
        <button class="btn btn-sm btn-outline-secondary" id="backToSowList">
          ← Back to Sow List
        </button>
      </div>

      <div class="card shadow-sm border-0 mb-4">
        <div class="card-body d-flex justify-content-between align-items-center">
          <div>
            <h5 class="mb-1">Sow: ${sow.swine_id}</h5>
            <div class="text-muted small">Breed: ${sow.breed || "Native"}</div>
          </div>

          <button class="btn btn-sm btn-outline-dark" id="toggleSowAnalyticsBtn">
            <i class="bi bi-bar-chart-line"></i>
            View Analytics
          </button>
        </div>
      </div>

      <div id="sowAnalyticsContainer" class="mb-4 d-none"></div>
      <div id="cycleCardsContainer"></div>
    `;

    document.getElementById("backToSowList")
      ?.addEventListener("click", () => closeSowDetailView());

    document.getElementById("toggleSowAnalyticsBtn")
      ?.addEventListener("click", () => toggleSowAnalytics(sow));

    renderCycleCards(sow);
  }

  function renderCycleCards(sow) {
    const wrap = document.getElementById("cycleCardsContainer");
    if (!wrap) return;

    const cycles = (sow.breeding_cycles || []).slice().sort((a, b) => {
    const A = Number(a?.cycle_number ?? -1);
    const B = Number(b?.cycle_number ?? -1);
      return B - A;
    });
    
    if (!cycles.length) {
      wrap.innerHTML = `<div class="text-muted">No breeding cycles found.</div>`;
      return;
    }

    let html = "";

    cycles.forEach(cycle => {
      const cycleNumber = cycle.cycle_number;

      let status = "Heat Stage";
      if (cycle.farrowed) status = "Completed";
      else if (cycle.is_pregnant) status = "Pregnant";
      else if (cycle.ai_service_date) status = "Under Observation";

      const statusClass = {
        "Completed": "bg-success-subtle text-success",
        "Pregnant": "bg-primary-subtle text-primary",
        "Under Observation": "bg-warning-subtle text-warning",
        "Heat Stage": "bg-secondary-subtle text-secondary"
      }[status];

      const piglets = state.allSwineData.filter(p =>
        p.dam_id === sow.swine_id && p.birth_cycle_number === cycleNumber
      );

      const born = piglets.length;
      const dead = piglets.filter(p => ctx.isDeadStatus(p.health_status)).length; // ✅ FIX
      const mortality = born > 0 ? ((dead/born)*100).toFixed(1) : 0;

      html += `
        <div class="card shadow-sm border-0 mb-3">
          <div class="card-body d-flex justify-content-between align-items-center">
            <div>
              <div class="fw-semibold">Cycle / Batch ${cycleNumber}</div>
              <div class="small text-muted">
                AI Date: ${cycle.ai_service_date ? new Date(cycle.ai_service_date).toLocaleDateString() : "—"}
              </div>
              <div class="small text-muted">
                Born: ${born} | Mortality: ${mortality}%
              </div>
            </div>

            <div class="d-flex align-items-center gap-3">
              <span class="badge ${statusClass}">${status}</span>

              <button class="btn btn-sm btn-outline-primary open-cycle-btn" data-cycle="${cycleNumber}">
                View
              </button>
            </div>
          </div>
        </div>
      `;
    });

    wrap.innerHTML = html;

    wrap.querySelectorAll(".open-cycle-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        // keep your existing openCycleDetail if needed in your full file
        console.warn("openCycleDetail() not included in this module snippet.");
      });
    });
  }

  function toggleSowAnalytics(sow) {
    const container = document.getElementById("sowAnalyticsContainer");
    if (!container) return;

    if (!container.classList.contains("d-none")) {
      container.classList.add("d-none");
      return;
    }

    const cycles = groupPigletsByCycle(sow);
    const cycleNumbers = Object.keys(cycles)
      .filter(c => c !== "Unknown")
      .sort((a,b) => a - b);

    if (!cycleNumbers.length) {
      container.innerHTML = `
        <div class="card shadow-sm border-0 p-4 text-center text-muted">
          No cycle data available.
        </div>
      `;
      container.classList.remove("d-none");
      return;
    }

    let totalBorn = 0;
    let totalDead = 0;

    cycleNumbers.forEach(c => {
      const born = cycles[c].length;
      const dead = cycles[c].filter(p => ctx.isDeadStatus(p.health_status)).length; // ✅ FIX
      totalBorn += born;
      totalDead += dead;
    });

    const avgMortality = totalBorn > 0 ? ((totalDead / totalBorn) * 100).toFixed(1) : 0;

    container.innerHTML = `
      <div class="card shadow-sm border-0 mb-4">
        <div class="card-body">

          <div class="row text-center mb-4">
            <div class="col-md-3">
              <div class="small text-muted"><i class="bi bi-repeat"></i> Total Cycles</div>
              <div class="fs-4 fw-bold">${cycleNumbers.length}</div>
            </div>

            <div class="col-md-3">
              <div class="small text-muted"><i class="bi bi-egg"></i> Total Born</div>
              <div class="fs-4 fw-bold">${totalBorn}</div>
            </div>

            <div class="col-md-3">
              <div class="small text-muted"><i class="bi bi-x-circle"></i> Total Dead</div>
              <div class="fs-4 fw-bold text-danger">${totalDead}</div>
            </div>

            <div class="col-md-3">
              <div class="small text-muted"><i class="bi bi-activity"></i> Avg Mortality</div>
              <div class="fs-4 fw-bold text-danger">${avgMortality}%</div>
            </div>
          </div>

          <canvas id="breedingLifetimeChart" height="120"></canvas>
        </div>
      </div>
    `;

    container.classList.remove("d-none");
    renderLifetimeMortalityChart(cycleNumbers, cycles);
  }

  function renderLifetimeMortalityChart(cycleNumbers, cycles) {
    const ctxCanvas = document.getElementById("breedingLifetimeChart");
    if (!ctxCanvas) return;

    const mortalityRates = cycleNumbers.map(cycle => {
      const piglets = cycles[cycle];
      const born = piglets.length;
      const dead = piglets.filter(p => ctx.isDeadStatus(p.health_status)).length; // ✅ FIX
      return born > 0 ? ((dead/born)*100).toFixed(1) : 0;
    });

    if (state.breedingChartInstance) state.breedingChartInstance.destroy();

    state.breedingChartInstance = new Chart(ctxCanvas, {
      type: "bar",
      data: {
        labels: cycleNumbers.map(c => `Cycle ${c}`),
        datasets: [{
          label: "Mortality Rate (%)",
          data: mortalityRates,
          backgroundColor: "rgba(220,53,69,0.6)"
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: { beginAtZero: true, max: 100 }
        }
      }
    });
  }

  return {
    renderBreedingPerformance,
    openSowCycles,
    closeSowDetailView
  };
}