// overview.breeding.js
export function initBreedingModule(ctx) {
  const { state } = ctx;

  /* ================= HELPERS ================= */
  function safeDate(d) {
    if (!d) return "—";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "—";
    return dt.toLocaleDateString();
  }

  function normStr(v) {
    return (v ?? "").toString().trim();
  }

  function groupPigletsByCycle(sow) {
    const sowTag = normStr(sow?.swine_id);

    const piglets = (Array.isArray(state.allSwineData) ? state.allSwineData : []).filter(
      (p) => normStr(p?.dam_id) === sowTag
    );

    const grouped = {};
    piglets.forEach((p) => {
      const cycle = p.birth_cycle_number ?? "Unknown";
      const key = normStr(cycle) || "Unknown";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(p);
    });

    return grouped;
  }

  /* ================= MAIN: PERFORMANCE LIST ================= */
  function renderBreedingPerformance() {
    const wrap = document.getElementById("breedingSowList");
    const kpiWrap = document.getElementById("breedingKpiSection");
    if (!wrap || !kpiWrap) return;

    wrap.innerHTML = "";

    state.breedingSowsCache = (Array.isArray(state.currentFarmerPigs) ? state.currentFarmerPigs : []).filter(
      (p) =>
        (p.sex || "").toString().toLowerCase() === "female" &&
        (p.age_stage || "").toString().toLowerCase().includes("adult")
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

    pageItems.forEach((sow) => {
      const cycles = groupPigletsByCycle(sow);
      const cycleKeys = Object.keys(cycles);

      totalCycles += cycleKeys.length;

      let sowBorn = 0;
      let sowDead = 0;

      cycleKeys.forEach((c) => {
        const piglets = cycles[c] || [];
        const born = piglets.length;
        const dead = piglets.filter((p) => ctx.isDeadStatus(p.health_status)).length;

        sowBorn += born;
        sowDead += dead;
      });

      totalBornAll += sowBorn;
      totalDeadAll += sowDead;

      const mortality = sowBorn > 0 ? ((sowDead / sowBorn) * 100).toFixed(1) : "0.0";

      wrap.insertAdjacentHTML(
        "beforeend",
        `
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

            <button type="button" class="btn btn-sm btn-outline-primary view-sow-cycles-btn" data-id="${sow._id}">
              View Cycles
            </button>
          </div>
        </div>
      `
      );
    });

    wrap.insertAdjacentHTML(
      "beforeend",
      `
      <div class="d-flex justify-content-between align-items-center mt-3">
        <button type="button" class="btn btn-sm btn-outline-secondary" id="breedingPrevBtn">Prev</button>
        <span class="small text-muted">Page ${state.breedingSowPage} of ${totalPages}</span>
        <button type="button" class="btn btn-sm btn-outline-secondary" id="breedingNextBtn">Next</button>
      </div>
    `
    );

    const prev = document.getElementById("breedingPrevBtn");
    const next = document.getElementById("breedingNextBtn");
    if (prev) prev.disabled = state.breedingSowPage <= 1;
    if (next) next.disabled = state.breedingSowPage >= totalPages;

    prev?.addEventListener("click", () => {
      if (state.breedingSowPage > 1) {
        state.breedingSowPage--;
        renderBreedingPerformance();
      }
    });

    next?.addEventListener("click", () => {
      if (state.breedingSowPage < totalPages) {
        state.breedingSowPage++;
        renderBreedingPerformance();
      }
    });

    const overallMortality =
      totalBornAll > 0 ? ((totalDeadAll / totalBornAll) * 100).toFixed(1) : "0.0";

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

  /* ================= SOW -> CYCLES VIEW ================= */
  function closeSowDetailView() {
    document.getElementById("breedingCyclePanel")?.classList.add("d-none");
    document.getElementById("breedingSowList")?.classList.remove("d-none");
    document.getElementById("breedingKpiSection")?.classList.remove("d-none");
  }

  function openSowCycles(sowId) {
    const sow = (Array.isArray(state.currentFarmerPigs) ? state.currentFarmerPigs : []).find(
      (p) => (p._id || "").toString() === (sowId || "").toString()
    );
    if (!sow) return;

    state.activeSowForBreeding = sow;

    document.getElementById("breedingSowList")?.classList.add("d-none");
    document.getElementById("breedingKpiSection")?.classList.add("d-none");

    const panel = document.getElementById("breedingCyclePanel");
    if (!panel) return;

    panel.classList.remove("d-none");

    panel.innerHTML = `
      <div class="mb-3">
        <button type="button" class="btn btn-sm btn-outline-secondary" id="backToSowList">
          ← Back to Sow List
        </button>
      </div>

      <div class="card shadow-sm border-0 mb-4">
        <div class="card-body d-flex justify-content-between align-items-center">
          <div>
            <h5 class="mb-1">Sow: ${sow.swine_id}</h5>
            <div class="text-muted small">Breed: ${sow.breed || "Native"}</div>
          </div>

          <button type="button" class="btn btn-sm btn-outline-dark" id="toggleSowAnalyticsBtn">
            <i class="bi bi-bar-chart-line"></i>
            View Analytics
          </button>
        </div>
      </div>

      <div id="sowAnalyticsContainer" class="mb-4 d-none"></div>
      <div id="cycleCardsContainer"></div>
    `;

    document.getElementById("backToSowList")?.addEventListener("click", closeSowDetailView);
    document.getElementById("toggleSowAnalyticsBtn")?.addEventListener("click", () => toggleSowAnalytics(sow));

    renderCycleCards(sow);
  }

  function renderCycleCards(sow) {
    const wrap = document.getElementById("cycleCardsContainer");
    if (!wrap) return;

    const cycles = (Array.isArray(sow?.breeding_cycles) ? sow.breeding_cycles : [])
      .slice()
      .sort((a, b) => Number(b?.cycle_number ?? -1) - Number(a?.cycle_number ?? -1));

    if (!cycles.length) {
      wrap.innerHTML = `<div class="text-muted">No breeding cycles found.</div>`;
      return;
    }

    const sowTag = normStr(sow?.swine_id);

    wrap.innerHTML = cycles
      .map((cycle) => {
        const cycleNumber = cycle?.cycle_number ?? "—";

        let status = "Heat Stage";
        if (cycle?.farrowed) status = "Completed";
        else if (cycle?.is_pregnant) status = "Pregnant";
        else if (cycle?.ai_service_date) status = "Under Observation";

        const statusClass =
          {
            Completed: "bg-success-subtle text-success",
            Pregnant: "bg-primary-subtle text-primary",
            "Under Observation": "bg-warning-subtle text-warning",
            "Heat Stage": "bg-secondary-subtle text-secondary"
          }[status] || "bg-secondary-subtle text-secondary";

        // FIX: normalize comparisons (string/number issues)
        const piglets = (Array.isArray(state.allSwineData) ? state.allSwineData : []).filter(
          (p) =>
            normStr(p?.dam_id) === sowTag &&
            normStr(p?.birth_cycle_number) === normStr(cycleNumber)
        );

        const born = piglets.length;
        const dead = piglets.filter((p) => ctx.isDeadStatus(p.health_status)).length;
        const mortality = born > 0 ? ((dead / born) * 100).toFixed(1) : "0.0";

        // IMPORTANT: add dataset the global click handler can read
        return `
          <div class="card shadow-sm border-0 mb-3">
            <div class="card-body d-flex justify-content-between align-items-center">
              <div>
                <div class="fw-semibold">Cycle / Batch ${cycleNumber}</div>
                <div class="small text-muted">
                  AI Date: ${safeDate(cycle?.ai_service_date)}
                </div>
                <div class="small text-muted">
                  Born: ${born} | Mortality: ${mortality}%
                </div>
              </div>

              <div class="d-flex align-items-center gap-3">
                <span class="badge ${statusClass}">${status}</span>

                <button
                  type="button"
                  class="btn btn-sm btn-outline-primary view-cycle-btn"
                  data-cycle-id="${cycleNumber}"
                  data-sow-id="${sow._id}">
                  View
                </button>
              </div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  /* ================= CYCLE DETAIL (NEW - FIXES "View" BUTTON) ================= */
  function closeCycleDetailView() {
    document.getElementById("cycleDetailPanel")?.classList.add("d-none");
    document.getElementById("cycleCardsContainer")?.classList.remove("d-none");
    document.getElementById("sowAnalyticsContainer")?.classList.remove("d-none"); // stays as user toggles
  }

  function openCycleDetail(cycleId, sowId) {
    const sow =
      (Array.isArray(state.currentFarmerPigs) ? state.currentFarmerPigs : []).find(
        (p) => (p._id || "").toString() === (sowId || "").toString()
      ) || state.activeSowForBreeding;

    if (!sow) {
      console.warn("openCycleDetail: sow not found");
      return;
    }

    state.activeSowForBreeding = sow;
    state.activeCycleForBreeding = cycleId;

    const cardsWrap = document.getElementById("cycleCardsContainer");
    if (cardsWrap) cardsWrap.classList.add("d-none");

    let detail = document.getElementById("cycleDetailPanel");
    if (!detail) {
      // inject below cycle list inside breedingCyclePanel
      const host = document.getElementById("breedingCyclePanel");
      if (!host) return;

      const node = document.createElement("div");
      node.id = "cycleDetailPanel";
      node.className = "mt-3";
      host.appendChild(node);
      detail = node;
    }

    detail.classList.remove("d-none");

    const sowTag = normStr(sow?.swine_id);
    const cycleKey = normStr(cycleId);

    const piglets = (Array.isArray(state.allSwineData) ? state.allSwineData : []).filter(
      (p) => normStr(p?.dam_id) === sowTag && normStr(p?.birth_cycle_number) === cycleKey
    );

    const born = piglets.length;
    const dead = piglets.filter((p) => ctx.isDeadStatus(p.health_status)).length;
    const mortality = born > 0 ? ((dead / born) * 100).toFixed(1) : "0.0";

    const listHtml = !piglets.length
      ? `<div class="text-muted">No piglets recorded for this cycle.</div>`
      : `
        <div class="list-group">
          ${piglets
            .slice()
            .reverse()
            .map((p) => {
              const hs = (p.health_status || "").toString().trim();
              let badge = "bg-secondary-subtle text-secondary";
              if (/healthy/i.test(hs)) badge = "bg-success-subtle text-success";
              else if (/sick/i.test(hs)) badge = "bg-warning-subtle text-warning";
              else if (/deceased|dead|died/i.test(hs)) badge = "bg-danger-subtle text-danger";

              return `
                <div class="list-group-item d-flex justify-content-between align-items-center">
                  <div class="min-w-0">
                    <div class="fw-semibold text-truncate">${p.swine_id || "—"}</div>
                    <div class="small text-muted">
                      Sex: ${p.sex || "—"} · Stage: ${p.age_stage || "—"}
                    </div>
                  </div>
                  <span class="badge ${badge}">${hs || "—"}</span>
                </div>
              `;
            })
            .join("")}
        </div>
      `;

    detail.innerHTML = `
      <div class="mb-3">
        <button type="button" class="btn btn-sm btn-outline-secondary" id="backToCyclesBtn">
          ← Back to Cycles
        </button>
      </div>

      <div class="card shadow-sm border-0">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
            <div>
              <div class="h6 mb-1">Sow: ${sow.swine_id}</div>
              <div class="text-muted small">Cycle / Batch ${cycleId}</div>
            </div>

            <div class="text-end">
              <div class="small text-muted">Born</div>
              <div class="fw-bold">${born}</div>
            </div>

            <div class="text-end">
              <div class="small text-muted">Dead</div>
              <div class="fw-bold text-danger">${dead}</div>
            </div>

            <div class="text-end">
              <div class="small text-muted">Mortality</div>
              <div class="fw-bold text-danger">${mortality}%</div>
            </div>
          </div>

          ${listHtml}
        </div>
      </div>
    `;

    document.getElementById("backToCyclesBtn")?.addEventListener("click", () => {
      detail?.classList.add("d-none");
      cardsWrap?.classList.remove("d-none");
    });
  }

  /* ================= ANALYTICS ================= */
  function toggleSowAnalytics(sow) {
    const container = document.getElementById("sowAnalyticsContainer");
    if (!container) return;

    if (!container.classList.contains("d-none")) {
      container.classList.add("d-none");
      return;
    }

    const cycles = groupPigletsByCycle(sow);
    const cycleNumbers = Object.keys(cycles)
      .filter((c) => c !== "Unknown")
      .sort((a, b) => Number(a) - Number(b));

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

    cycleNumbers.forEach((c) => {
      const born = (cycles[c] || []).length;
      const dead = (cycles[c] || []).filter((p) => ctx.isDeadStatus(p.health_status)).length;
      totalBorn += born;
      totalDead += dead;
    });

    const avgMortality = totalBorn > 0 ? ((totalDead / totalBorn) * 100).toFixed(1) : "0.0";

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

    const mortalityRates = cycleNumbers.map((cycle) => {
      const piglets = cycles[cycle] || [];
      const born = piglets.length;
      const dead = piglets.filter((p) => ctx.isDeadStatus(p.health_status)).length;
      return born > 0 ? Number(((dead / born) * 100).toFixed(1)) : 0;
    });

    if (state.breedingChartInstance) state.breedingChartInstance.destroy();

    // guard if Chart isn't loaded
    if (typeof Chart === "undefined") {
      console.warn("Chart.js not found. Skipping chart render.");
      return;
    }

    state.breedingChartInstance = new Chart(ctxCanvas, {
      type: "bar",
      data: {
        labels: cycleNumbers.map((c) => `Cycle ${c}`),
        datasets: [
          {
            label: "Mortality Rate (%)",
            data: mortalityRates,
            backgroundColor: "rgba(220,53,69,0.6)"
          }
        ]
      },
      options: {
        responsive: true,
        scales: { y: { beginAtZero: true, max: 100 } }
      }
    });
  }

  return {
    renderBreedingPerformance,
    openSowCycles,
    closeSowDetailView,

    // IMPORTANT: exported so overview.pigs.js can call it from the global click handler
    openCycleDetail,

    // optional (not required, but handy)
    closeCycleDetailView
  };
}