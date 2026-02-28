// overview.breeding.js
export function initBreedingModule(ctx) {
  const { state } = ctx;

  /* =========================================================
     API HELPERS (frontend -> backend)
     - Uses ctx.BACKEND_URL if provided, else ""
     - Uses ctx.token if provided, else localStorage token
  ========================================================= */
  const API_BASE = (ctx.BACKEND_URL || "").replace(/\/$/, "");
  const getToken = () => ctx.token || localStorage.getItem("token") || "";

  async function apiJson(path, opts = {}) {
    const url = path.startsWith("http") ? path : `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
    const headers = {
      ...(opts.headers || {}),
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`
    };

    const res = await fetch(url, { ...opts, headers });
    let data = null;
    try {
      data = await res.json();
    } catch (_) {
      // ignore
    }
    if (!res.ok) {
      const msg = data?.message || data?.error || `Request failed (${res.status})`;
      throw new Error(msg);
    }
    return data;
  }

  function safeDate(d) {
    if (!d) return "—";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "—";
    return dt.toLocaleDateString();
  }

  function normStr(v) {
    return (v ?? "").toString().trim();
  }

  function normLower(v) {
    return normStr(v).toLowerCase();
  }

  function isFemaleAdult(p) {
    const sex = normLower(p?.sex);
    const stage = normLower(p?.age_stage);
    return sex === "female" && stage.includes("adult");
  }

  // Fallback grouping (used only if farrowing_results is missing)
  function groupPigletsByCycleFromCache(sow) {
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

  function deriveCycleStatus(cycle) {
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

    return { status, statusClass };
  }

  function getCycleByNumber(sow, cycleNumber) {
    const cycles = Array.isArray(sow?.breeding_cycles) ? sow.breeding_cycles : [];
    return cycles.find((c) => normStr(c?.cycle_number) === normStr(cycleNumber)) || null;
  }

  function computeCycleCounts(sow, cycle) {
    // Prefer farrowing_results in the cycle
    const fr = cycle?.farrowing_results || null;
    const total = Number(fr?.total_piglets ?? NaN);
    const dead = Number(fr?.mortality_count ?? NaN);

    if (Number.isFinite(total) && total >= 0) {
      const d = Number.isFinite(dead) && dead >= 0 ? dead : 0;
      const mortality = total > 0 ? ((d / total) * 100).toFixed(1) : "0.0";
      return { born: total, dead: d, mortality };
    }

    // Fallback: count from cached piglets list
    const sowTag = normStr(sow?.swine_id);
    const cycleNumber = cycle?.cycle_number ?? "—";

    const piglets = (Array.isArray(state.allSwineData) ? state.allSwineData : []).filter(
      (p) => normStr(p?.dam_id) === sowTag && normStr(p?.birth_cycle_number) === normStr(cycleNumber)
    );

    const born2 = piglets.length;
    const dead2 = piglets.filter((p) => ctx.isDeadStatus(p.health_status)).length;
    const mortality2 = born2 > 0 ? ((dead2 / born2) * 100).toFixed(1) : "0.0";
    return { born: born2, dead: dead2, mortality: mortality2 };
  }

  async function fetchPigletsByCycle({ damTag, cycleNumber }) {
    // Uses your backend: GET /api/reproduction/piglets/by-cycle?dam_id=SOWTAG&cycle_number=1
    try {
      const q = `dam_id=${encodeURIComponent(damTag)}&cycle_number=${encodeURIComponent(cycleNumber)}`;
      const resp = await apiJson(`/api/reproduction/piglets/by-cycle?${q}`, { method: "GET" });
      const list = Array.isArray(resp?.data) ? resp.data : [];
      // Normalize to match existing UI usage (swine_id/sex/etc)
      return list.map((p) => ({
        _id: p.id,
        swine_id: p.swine_tag,
        sex: p.sex,
        breed: p.breed,
        profile_photo: p.profile_photo,
        birth_date: p.birth_date,
        dam_id: p.dam_id,
        sire_id: p.sire_id,
        birth_cycle_number: p.birth_cycle_number,
        health_status: p.health_status,
        current_status: p.current_status,
        deformities: p.deformities || [],
        last_medical: p.last_medical || null,
        latest_growth: p.latest_growth || null
      }));
    } catch (e) {
      console.warn("fetchPigletsByCycle failed:", e?.message || e);
      return null; // return null to allow fallback
    }
  }

  /* =========================================================
     VIEW STATE
     - "SOWS"   sow list visible
     - "CYCLES" cycles list visible (back -> sows)
     - "DETAIL" cycle detail visible (back -> cycles)
  ========================================================= */
  function setReproView(mode) {
    state.__reproView = mode;

    const sowList = document.getElementById("breedingSowList");
    const kpi = document.getElementById("breedingKpiSection");
    const panel = document.getElementById("breedingCyclePanel");

    const cards = document.getElementById("cycleCardsContainer");
    const pag = document.getElementById("cyclePaginationWrap");
    const detail = document.getElementById("cycleDetailPanel");

    const bar = document.getElementById("breedingContextBar");
    const backBtn = document.getElementById("breedingBackBtn");
    const rightInfo = document.getElementById("breedingContextRight");

    // Sow filter card (in table.ejs) must only show when viewing sow list
    const sowFilterCard = document.getElementById("reproSowFilterCard");

    if (mode === "SOWS") {
      sowList?.classList.remove("d-none");
      kpi?.classList.remove("d-none");
      panel?.classList.add("d-none");
      if (sowFilterCard) sowFilterCard.classList.remove("d-none");
      return;
    }

    // CYCLES or DETAIL
    sowList?.classList.add("d-none");
    kpi?.classList.add("d-none");
    panel?.classList.remove("d-none");
    if (sowFilterCard) sowFilterCard.classList.add("d-none");

    // Update bar/back button labeling
    if (bar && backBtn) {
      if (mode === "CYCLES") {
        backBtn.classList.remove("d-none");
        backBtn.dataset.mode = "toSows";
        backBtn.innerHTML = `<i class="bi bi-arrow-left me-1"></i> Back to Sows`;
        if (rightInfo) rightInfo.classList.remove("d-none");
      } else if (mode === "DETAIL") {
        backBtn.classList.remove("d-none");
        backBtn.dataset.mode = "toCycles";
        backBtn.innerHTML = `<i class="bi bi-arrow-left me-1"></i> Back to Cycles`;
        if (rightInfo) rightInfo.classList.remove("d-none");
      }
    }

    // Inside panel toggle:
    // In DETAIL, hide the whole cycles list section to avoid confusion
    if (mode === "CYCLES") {
      cards?.classList.remove("d-none");
      pag?.classList.remove("d-none");
      detail?.classList.add("d-none");
    } else if (mode === "DETAIL") {
      cards?.classList.add("d-none");
      pag?.classList.add("d-none");
      detail?.classList.remove("d-none");
    }
  }

  /* ================= SOW LIST (Reproduction tab) ================= */
  function renderBreedingPerformance() {
    const wrap = document.getElementById("breedingSowList");
    const kpiWrap = document.getElementById("breedingKpiSection");
    if (!wrap || !kpiWrap) return;

    // Ensure defaults so module doesn't break if not set
    state.BREEDING_SOWS_PER_PAGE = Number(state.BREEDING_SOWS_PER_PAGE || 6);
    state.breedingSowPage = Number(state.breedingSowPage || 1);

    wrap.innerHTML = "";

    let sows = (Array.isArray(state.currentFarmerPigs) ? state.currentFarmerPigs : []).filter(isFemaleAdult);

    const term = (document.getElementById("reproSowSearch")?.value || "").trim().toLowerCase();
    const health = (document.getElementById("reproSowHealth")?.value || "").trim();

    if (term) sows = sows.filter((s) => (s.swine_id || "").toString().toLowerCase().includes(term));
    if (health) sows = sows.filter((s) => (s.health_status || "") === health);

    state.breedingSowsCache = sows;

    if (!state.breedingSowsCache.length) {
      kpiWrap.innerHTML = "";
      wrap.innerHTML = `<div class="text-muted">No adult sows found.</div>`;
      setReproView("SOWS");
      return;
    }

    const totalPages = Math.max(1, Math.ceil(state.breedingSowsCache.length / state.BREEDING_SOWS_PER_PAGE));
    if (state.breedingSowPage > totalPages) state.breedingSowPage = totalPages;

    const start = (state.breedingSowPage - 1) * state.BREEDING_SOWS_PER_PAGE;
    const pageItems = state.breedingSowsCache.slice(start, start + state.BREEDING_SOWS_PER_PAGE);

    let totalBornAll = 0;
    let totalDeadAll = 0;
    let totalCycles = 0;

    pageItems.forEach((sow) => {
      const cyclesArr = Array.isArray(sow?.breeding_cycles) ? sow.breeding_cycles : [];

      // If no breeding_cycles, fallback to cache grouping
      const cycleKeys =
        cyclesArr.length > 0
          ? cyclesArr.map((c) => normStr(c?.cycle_number)).filter(Boolean)
          : Object.keys(groupPigletsByCycleFromCache(sow));

      totalCycles += cycleKeys.length;

      let sowBorn = 0;
      let sowDead = 0;

      if (cyclesArr.length > 0) {
        cyclesArr.forEach((c) => {
          const { born, dead } = computeCycleCounts(sow, c);
          sowBorn += born;
          sowDead += dead;
        });
      } else {
        const grouped = groupPigletsByCycleFromCache(sow);
        Object.keys(grouped).forEach((k) => {
          const piglets = grouped[k] || [];
          const born = piglets.length;
          const dead = piglets.filter((p) => ctx.isDeadStatus(p.health_status)).length;
          sowBorn += born;
          sowDead += dead;
        });
      }

      totalBornAll += sowBorn;
      totalDeadAll += sowDead;

      const mortality = sowBorn > 0 ? ((sowDead / sowBorn) * 100).toFixed(1) : "0.0";

      const hs = (sow.health_status || "").toString().trim();
      let hsBadge = "bg-secondary-subtle text-secondary";
      if (/healthy/i.test(hs)) hsBadge = "bg-success-subtle text-success";
      else if (/sick/i.test(hs)) hsBadge = "bg-warning-subtle text-warning";
      else if (/deceased|dead|died/i.test(hs)) hsBadge = "bg-danger-subtle text-danger";

      wrap.insertAdjacentHTML(
        "beforeend",
        `
        <div class="card shadow-sm border-0">
          <div class="card-body d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3">

            <div class="min-w-0">
              <div class="d-flex flex-wrap align-items-center gap-2">
                <div class="fw-semibold">${sow.swine_id || "—"}</div>
                <span class="badge ${hsBadge}">${hs || "—"}</span>
              </div>

              <div class="small text-muted">
                Breed: ${sow.breed || "Native"} · Stage: ${sow.age_stage || "—"}
              </div>

              <div class="small text-muted">
                Cycles: ${cycleKeys.length} · Born: ${sowBorn} · Mortality: ${mortality}%
              </div>
            </div>

            <div class="d-flex gap-2 flex-shrink-0">
              <button type="button" class="btn btn-sm btn-outline-primary view-sow-cycles-btn" data-id="${sow._id}">
                <i class="bi bi-collection me-1"></i>
                View Cycles
              </button>
            </div>

          </div>
        </div>
      `
      );
    });

    wrap.insertAdjacentHTML(
      "beforeend",
      `
      <div class="d-flex justify-content-between align-items-center mt-3" id="breedingSowPagination">
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

    // ✅ IMPORTANT: bind Sow -> Cycles button (delegated)
    wrap.onclick = (e) => {
      const btn = e.target.closest(".view-sow-cycles-btn");
      if (!btn) return;
      const id = btn.dataset.id;
      if (id) openSowCycles(id);
    };

    const overallMortality = totalBornAll > 0 ? ((totalDeadAll / totalBornAll) * 100).toFixed(1) : "0.0";

    kpiWrap.innerHTML = `
      <div class="col-6 col-md-3">
        <div class="card text-center p-3 shadow-sm border-0">
          <div class="small text-muted">Total Sows</div>
          <div class="fs-4 fw-bold">${state.breedingSowsCache.length}</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card text-center p-3 shadow-sm border-0">
          <div class="small text-muted">Total Cycles</div>
          <div class="fs-4 fw-bold">${totalCycles}</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card text-center p-3 shadow-sm border-0">
          <div class="small text-muted">Total Piglets</div>
          <div class="fs-4 fw-bold">${totalBornAll}</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="card text-center p-3 shadow-sm border-0">
          <div class="small text-muted">Avg Mortality</div>
          <div class="fs-4 fw-bold text-danger">${overallMortality}%</div>
        </div>
      </div>
    `;

    setReproView("SOWS");
  }

  function closeSowDetailView() {
    setReproView("SOWS");
  }

  /* ================= SOW -> CYCLES VIEW ================= */
  function openSowCycles(sowId) {
    const sow = (Array.isArray(state.currentFarmerPigs) ? state.currentFarmerPigs : []).find(
      (p) => (p._id || "").toString() === (sowId || "").toString()
    );
    if (!sow) return;

    state.activeSowForBreeding = sow;
    state.breedingCyclePage = 1;
    state.CYCLES_PER_PAGE = Number(state.CYCLES_PER_PAGE || 5);

    const panel = document.getElementById("breedingCyclePanel");
    if (!panel) return;

    panel.classList.remove("d-none");

    panel.innerHTML = `
      <div class="mb-3 d-flex justify-content-between align-items-center flex-wrap gap-2" id="breedingContextBar">
        <button type="button" class="btn btn-sm btn-outline-secondary" id="breedingBackBtn">
          <i class="bi bi-arrow-left me-1"></i> Back
        </button>

        <div class="small text-muted" id="breedingContextRight">
          Sow: <span class="fw-semibold" id="breedingActiveSowTag">${sow.swine_id || "—"}</span>
        </div>
      </div>

      <div class="card border-0 shadow-sm mb-3">
        <div class="card-body p-3">
          <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2">
            <div class="min-w-0">
              <div class="fw-semibold mb-0">Breeding Cycles</div>
              <div class="small text-muted">Select a cycle to open details</div>
            </div>
            <div class="small text-muted">
              Sow: <span class="fw-semibold">${sow.swine_id || "—"}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="card border-0 shadow-sm mb-3" id="cycleFilterCard">
        <div class="card-body p-3">
          <div class="row g-2 align-items-end">
            <div class="col-12 col-md-6">
              <label class="form-label small text-muted mb-1">Cycle / Batch</label>
              <select id="cycleFilterSelect" class="form-select form-select-sm">
                <option value="">All Cycles</option>
              </select>
            </div>

            <div class="col-12 col-md-6">
              <div class="d-grid d-sm-flex gap-2 justify-content-md-end">
                <button type="button" class="btn btn-success btn-sm" id="applyCycleFilterBtn">
                  <i class="bi bi-funnel me-1"></i> Apply
                </button>
                <button type="button" class="btn btn-outline-secondary btn-sm" id="resetCycleFilterBtn">
                  Reset
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div id="cycleCardsContainer"></div>
      <div id="cyclePaginationWrap" class="mt-3"></div>

      <div id="cycleDetailPanel" class="mt-3 d-none"></div>
    `;

    document.getElementById("breedingBackBtn")?.addEventListener("click", () => {
      const mode = document.getElementById("breedingBackBtn")?.dataset.mode;
      if (mode === "toSows") {
        closeSowDetailView();
      } else if (mode === "toCycles") {
        setReproView("CYCLES");
      } else {
        closeSowDetailView();
      }
    });

    populateCycleFilterOptions(sow);
    renderCycleCards(sow);

    document.getElementById("applyCycleFilterBtn")?.addEventListener("click", () => {
      state.breedingCyclePage = 1;
      renderCycleCards(sow);
    });

    document.getElementById("resetCycleFilterBtn")?.addEventListener("click", () => {
      const sel = document.getElementById("cycleFilterSelect");
      if (sel) sel.value = "";
      state.breedingCyclePage = 1;
      renderCycleCards(sow);
    });

    setReproView("CYCLES");
  }

  function populateCycleFilterOptions(sow) {
    const sel = document.getElementById("cycleFilterSelect");
    if (!sel) return;

    const cycles = (Array.isArray(sow?.breeding_cycles) ? sow.breeding_cycles : [])
      .slice()
      .map((c) => normStr(c?.cycle_number))
      .filter(Boolean);

    const unique = Array.from(new Set(cycles));

    sel.innerHTML =
      `<option value="">All Cycles</option>` +
      unique.map((c) => `<option value="${c}">Cycle / Batch ${c}</option>`).join("");
  }

  /* ================= CYCLE CARDS ================= */
  function renderCycleCards(sow) {
    const wrap = document.getElementById("cycleCardsContainer");
    const pagWrap = document.getElementById("cyclePaginationWrap");
    if (!wrap || !pagWrap) return;

    const selectedCycle = (document.getElementById("cycleFilterSelect")?.value || "").trim();

    let cycles = (Array.isArray(sow?.breeding_cycles) ? sow.breeding_cycles : [])
      .slice()
      .sort((a, b) => Number(b?.cycle_number ?? -1) - Number(a?.cycle_number ?? -1));

    if (selectedCycle) cycles = cycles.filter((c) => normStr(c?.cycle_number) === normStr(selectedCycle));

    if (!cycles.length) {
      wrap.innerHTML = `<div class="text-muted">No breeding cycles found.</div>`;
      pagWrap.innerHTML = "";
      return;
    }

    const pageSize = Number(state.CYCLES_PER_PAGE || 5);
    const totalPages = Math.max(1, Math.ceil(cycles.length / pageSize));
    if (state.breedingCyclePage > totalPages) state.breedingCyclePage = totalPages;

    const start = (state.breedingCyclePage - 1) * pageSize;
    const pageItems = cycles.slice(start, start + pageSize);

    wrap.innerHTML = pageItems
      .map((cycle) => {
        const cycleNumber = cycle?.cycle_number ?? "—";
        const { status, statusClass } = deriveCycleStatus(cycle);

        const { born, dead, mortality } = computeCycleCounts(sow, cycle);

        return `
          <div class="card shadow-sm border-0 mb-3">
            <div class="card-body d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3">

              <div class="min-w-0">
                <div class="d-flex flex-wrap align-items-center gap-2">
                  <div class="fw-semibold">Cycle / Batch ${cycleNumber}</div>
                  <span class="badge ${statusClass}">${status}</span>
                </div>

                <div class="small text-muted">AI Date: ${safeDate(cycle?.ai_service_date)}</div>
                <div class="small text-muted">Born: ${born} · Dead: ${dead} · Mortality: ${mortality}%</div>
              </div>

              <div class="d-flex gap-2 flex-shrink-0">
                <button
                  type="button"
                  class="btn btn-sm btn-outline-primary view-cycle-btn"
                  data-cycle-id="${cycleNumber}"
                  data-sow-id="${sow._id}">
                  <i class="bi bi-eye me-1"></i> View
                </button>
              </div>

            </div>
          </div>
        `;
      })
      .join("");

    // ✅ IMPORTANT: bind Cycle -> Detail click (delegated)
    wrap.onclick = (e) => {
      const btn = e.target.closest(".view-cycle-btn");
      if (!btn) return;
      const cycleId = btn.dataset.cycleId;
      const sowId = btn.dataset.sowId;
      if (cycleId && sowId) openCycleDetail(cycleId, sowId);
    };

    pagWrap.innerHTML = `
      <div class="d-flex justify-content-between align-items-center">
        <button type="button" class="btn btn-sm btn-outline-secondary" id="cyclePrevBtn">Prev</button>
        <span class="small text-muted">Page ${state.breedingCyclePage} of ${totalPages}</span>
        <button type="button" class="btn btn-sm btn-outline-secondary" id="cycleNextBtn">Next</button>
      </div>
    `;

    const prev = document.getElementById("cyclePrevBtn");
    const next = document.getElementById("cycleNextBtn");
    if (prev) prev.disabled = state.breedingCyclePage <= 1;
    if (next) next.disabled = state.breedingCyclePage >= totalPages;

    prev?.addEventListener("click", () => {
      if (state.breedingCyclePage > 1) {
        state.breedingCyclePage--;
        renderCycleCards(sow);
      }
    });

    next?.addEventListener("click", () => {
      if (state.breedingCyclePage < totalPages) {
        state.breedingCyclePage++;
        renderCycleCards(sow);
      }
    });

    setReproView("CYCLES");
  }

  /* ================= CYCLE DETAIL ================= */
  async function openCycleDetail(cycleId, sowId) {
    const sow =
      (Array.isArray(state.currentFarmerPigs) ? state.currentFarmerPigs : []).find(
        (p) => (p._id || "").toString() === (sowId || "").toString()
      ) || state.activeSowForBreeding;

    if (!sow) return;

    state.activeSowForBreeding = sow;
    state.activeCycleForBreeding = cycleId;

    const detail = document.getElementById("cycleDetailPanel");
    if (!detail) return;

    const sowTag = normStr(sow?.swine_id);
    const cycleKey = normStr(cycleId);

    // Fetch piglets from backend (preferred). If fails, fallback to cached allSwineData filter.
    let piglets = await fetchPigletsByCycle({ damTag: sowTag, cycleNumber: cycleKey });
    if (!Array.isArray(piglets)) {
      piglets = (Array.isArray(state.allSwineData) ? state.allSwineData : []).filter(
        (p) => normStr(p?.dam_id) === sowTag && normStr(p?.birth_cycle_number) === cycleKey
      );
    }

    const born = piglets.length;
    const dead = piglets.filter((p) => ctx.isDeadStatus(p?.health_status)).length;
    const mortality = born > 0 ? ((dead / born) * 100).toFixed(1) : "0.0";

    const titleBlock = `
      <div class="card border-0 shadow-sm mb-3">
        <div class="card-body p-3 p-md-4">
          <div class="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-3">
            <div class="min-w-0">
              <div class="fw-semibold mb-1">Cycle Details</div>
              <div class="text-muted small">Cycle / Batch ${cycleId}</div>
            </div>

            <div class="d-flex flex-wrap gap-2 justify-content-lg-end">
              <span class="badge bg-light text-dark border">
                <i class="bi bi-folder2-open me-1"></i> Sow: <span class="fw-semibold">${sow.swine_id || "—"}</span>
              </span>
              <span class="badge bg-success-subtle text-success border">Born: ${born}</span>
              <span class="badge bg-danger-subtle text-danger border">Dead: ${dead}</span>
              <span class="badge bg-danger-subtle text-danger border">Mortality: ${mortality}%</span>
            </div>
          </div>
        </div>
      </div>
    `;

    detail.innerHTML = `
      ${titleBlock}

      <div class="tabs-scroll mb-3">
        <ul class="nav nav-pills flex-nowrap" id="cycleDetailTabs">
          <li class="nav-item"><button type="button" class="nav-link active" data-target="cycleOverviewTab">
            <i class="bi bi-info-circle me-1"></i> Overview
          </button></li>

          <li class="nav-item"><button type="button" class="nav-link" data-target="cycleAiTab">
            <i class="bi bi-journal-text me-1"></i> Artificial Insemination Record
          </button></li>

          <li class="nav-item"><button type="button" class="nav-link" data-target="cyclePerformanceTab">
            <i class="bi bi-bar-chart-line me-1"></i> Breeding Performance
          </button></li>

          <li class="nav-item"><button type="button" class="nav-link" data-target="cycleGrowthTab">
            <i class="bi bi-graph-up me-1"></i> Growth Monitoring
          </button></li>

          <li class="nav-item"><button type="button" class="nav-link" data-target="cycleSelectionTab">
            <i class="bi bi-check2-circle me-1"></i> Selection Process
          </button></li>
        </ul>
      </div>

      <div id="cycleOverviewTab" class="cycle-tab">${buildOverviewTabHtml({ sow, cycleId })}</div>
      <div id="cycleAiTab" class="cycle-tab d-none">${buildAiTabHtml({ sow, cycleId })}</div>
      <div id="cyclePerformanceTab" class="cycle-tab d-none">${buildPerformanceTabHtml({ piglets })}</div>
      <div id="cycleGrowthTab" class="cycle-tab d-none">${buildGrowthTabHtml({ piglets })}</div>
      <div id="cycleSelectionTab" class="cycle-tab d-none">${buildSelectionTabHtml({ piglets })}</div>
    `;

    // Tab switching
    document.getElementById("cycleDetailTabs")?.addEventListener("click", (e) => {
      const btn = e.target.closest(".nav-link");
      if (!btn) return;

      document.querySelectorAll("#cycleDetailTabs .nav-link").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      document.querySelectorAll(".cycle-tab").forEach((t) => t.classList.add("d-none"));
      const target = btn.dataset.target;
      document.getElementById(target)?.classList.remove("d-none");
    });

    // Bind Growth + Selection interactions
    bindGrowthUI(piglets);
    bindSelectionUI(piglets);

    setReproView("DETAIL");
  }

  /* ================= DETAIL TAB BUILDERS ================= */
  function buildOverviewTabHtml({ sow, cycleId }) {
    const cycle = getCycleByNumber(sow, cycleId);
    const { status } = deriveCycleStatus(cycle);

    const fr = cycle?.farrowing_results || null;
    const total = Number(fr?.total_piglets ?? 0);
    const live = Number(fr?.live_piglets ?? 0);
    const dead = Number(fr?.mortality_count ?? 0);

    return `
      <div class="row g-3">
        <div class="col-12 col-lg-6">
          <div class="card border-0 shadow-sm h-100">
            <div class="card-body">
              <div class="fw-semibold mb-2"><i class="bi bi-info-circle me-2"></i>Sow Summary</div>
              <div class="d-flex justify-content-between py-2 border-bottom"><span class="text-muted">Sow</span><span class="fw-semibold">${sow.swine_id || "—"}</span></div>
              <div class="d-flex justify-content-between py-2 border-bottom"><span class="text-muted">Cycle</span><span class="fw-semibold">${cycleId || "—"}</span></div>
              <div class="d-flex justify-content-between py-2 border-bottom"><span class="text-muted">Breed</span><span class="fw-semibold">${sow.breed || "Native"}</span></div>
              <div class="d-flex justify-content-between py-2 border-bottom"><span class="text-muted">Cycle Status</span><span class="fw-semibold">${status}</span></div>
              <div class="d-flex justify-content-between py-2"><span class="text-muted">Health</span><span class="fw-semibold">${sow.health_status || "—"}</span></div>
            </div>
          </div>
        </div>

        <div class="col-12 col-lg-6">
          <div class="card border-0 shadow-sm h-100">
            <div class="card-body">
              <div class="fw-semibold mb-2"><i class="bi bi-clipboard-data me-2"></i>Cycle Summary</div>
              <div class="d-flex justify-content-between py-2 border-bottom"><span class="text-muted">Estrus Date</span><span class="fw-semibold">${safeDate(cycle?.estrus_date)}</span></div>
              <div class="d-flex justify-content-between py-2 border-bottom"><span class="text-muted">AI Service Date</span><span class="fw-semibold">${safeDate(cycle?.ai_service_date)}</span></div>
              <div class="d-flex justify-content-between py-2 border-bottom"><span class="text-muted">Pregnancy Check</span><span class="fw-semibold">${safeDate(cycle?.pregnancy_check_date)}</span></div>
              <div class="d-flex justify-content-between py-2 border-bottom"><span class="text-muted">Expected Farrowing</span><span class="fw-semibold">${safeDate(cycle?.expected_farrowing_date)}</span></div>
              <div class="d-flex justify-content-between py-2"><span class="text-muted">Actual Farrowing</span><span class="fw-semibold">${safeDate(cycle?.actual_farrowing_date)}</span></div>

              <div class="mt-3 pt-3 border-top">
                <div class="fw-semibold mb-2"><i class="bi bi-people me-2"></i>Farrowing Results</div>
                <div class="d-flex justify-content-between py-2 border-bottom"><span class="text-muted">Total</span><span class="fw-semibold">${total || "—"}</span></div>
                <div class="d-flex justify-content-between py-2 border-bottom"><span class="text-muted">Live</span><span class="fw-semibold">${live || "—"}</span></div>
                <div class="d-flex justify-content-between py-2"><span class="text-muted">Mortality</span><span class="fw-semibold">${dead || "—"}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function buildAiTabHtml({ sow, cycleId }) {
    const cycle = getCycleByNumber(sow, cycleId);
    const { status, statusClass } = deriveCycleStatus(cycle);

    const boar = normStr(cycle?.cycle_sire_id) || "—";
    const aiDate = safeDate(cycle?.ai_service_date);
    const aiRecordId = normStr(cycle?.ai_record_id) || "—";
    const preg = cycle?.is_pregnant ? "Yes" : "No";

    return `
      <div class="row g-3">
        <div class="col-12 col-lg-6">
          <div class="card border-0 shadow-sm h-100">
            <div class="card-body">
              <div class="fw-semibold mb-3"><i class="bi bi-journal-text me-2"></i>Artificial Insemination Record</div>

              <div class="mb-2 text-muted small">Sow</div>
              <div class="fw-semibold mb-3">${sow?.swine_id || "—"}</div>

              <div class="mb-2 text-muted small">AI Service Date</div>
              <div class="fw-semibold mb-3">${aiDate}</div>

              <div class="mb-2 text-muted small">Cycle Status</div>
              <span class="badge ${statusClass}">${status}</span>

              <div class="mt-3 pt-3 border-top">
                <div class="mb-2 text-muted small">AI Record ID</div>
                <div class="fw-semibold">${aiRecordId}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="col-12 col-lg-6">
          <div class="card border-0 shadow-sm h-100">
            <div class="card-body">
              <div class="fw-semibold mb-3"><i class="bi bi-person-badge me-2"></i>Service Details</div>

              <div class="mb-2 text-muted small">Boar (Sire Tag / Code)</div>
              <div class="fw-semibold mb-3">${boar}</div>

              <div class="mb-2 text-muted small">Pregnancy Confirmed</div>
              <div class="fw-semibold mb-3">${preg}</div>

              <div class="mb-2 text-muted small">Expected Farrowing</div>
              <div class="fw-semibold mb-3">${safeDate(cycle?.expected_farrowing_date)}</div>

              <div class="text-muted small">
                Note: This tab uses the sow's <code>breeding_cycles</code> data (cycle_sire_id, ai_service_date, ai_record_id).
                If you want richer boar info (breed/sex), we can add a backend endpoint to fetch AI record by id and hydrate it.
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function buildPerformanceTabHtml({ piglets }) {
    const list = Array.isArray(piglets) ? piglets : [];

    const alive = list.filter((p) => !ctx.isDeadStatus(p?.health_status));
    const aliveMale = alive.filter((p) => normLower(p?.sex) === "male").length;
    const aliveFemale = alive.filter((p) => normLower(p?.sex) === "female").length;
    const deceased = list.filter((p) => ctx.isDeadStatus(p?.health_status)).length;

    const itemsHtml =
      list.length === 0
        ? `<div class="text-muted">No piglets found in this cycle.</div>`
        : `
          <div class="card border-0 shadow-sm">
            <div class="card-body">
              <div class="fw-semibold mb-2"><i class="bi bi-list me-2"></i>Piglets</div>
              <div class="d-flex flex-column gap-2">
                ${list
                  .slice(0, 8)
                  .map((p) => {
                    const tag = p?.swine_id || "—";
                    const sex = p?.sex || "—";
                    const stage = p?.age_stage || p?.current_status || "—";
                    const aliveBadge = ctx.isDeadStatus(p?.health_status)
                      ? `<span class="badge bg-danger-subtle text-danger">Deceased</span>`
                      : `<span class="badge bg-success-subtle text-success">Alive</span>`;

                    return `
                      <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
                        <div class="min-w-0">
                          <div class="fw-semibold">${tag}</div>
                          <div class="text-muted small">${sex} · ${stage}</div>
                        </div>
                        <div class="flex-shrink-0">${aliveBadge}</div>
                      </div>
                    `;
                  })
                  .join("")}
              </div>

              ${
                list.length > 8
                  ? `<div class="text-muted small mt-2">Showing 8 items. Full list is available in Growth Monitoring and Selection Process.</div>`
                  : ""
              }
            </div>
          </div>
        `;

    return `
      <div class="row g-3 mb-3">
        <div class="col-12 col-md-4">
          <div class="card border-0 shadow-sm h-100">
            <div class="card-body">
              <div class="text-muted small">Alive Male</div>
              <div class="fs-4 fw-bold">${aliveMale}</div>
            </div>
          </div>
        </div>

        <div class="col-12 col-md-4">
          <div class="card border-0 shadow-sm h-100">
            <div class="card-body">
              <div class="text-muted small">Alive Female</div>
              <div class="fs-4 fw-bold">${aliveFemale}</div>
            </div>
          </div>
        </div>

        <div class="col-12 col-md-4">
          <div class="card border-0 shadow-sm h-100">
            <div class="card-body">
              <div class="text-muted small">Deceased</div>
              <div class="fs-4 fw-bold">${deceased}</div>
            </div>
          </div>
        </div>
      </div>

      ${itemsHtml}
    `;
  }

  function buildGrowthTabHtml({ piglets }) {
    return `
      <div class="card border-0 shadow-sm">
        <div class="card-body">
          <div class="d-flex flex-column flex-lg-row justify-content-between align-items-lg-start gap-3 mb-3">
            <div class="min-w-0">
              <div class="fw-semibold"><i class="bi bi-graph-up me-2"></i>Growth Monitoring</div>
              <div class="text-muted small">Filter piglets.</div>
            </div>

            <div class="text-lg-end">
              <div class="text-muted small mb-1">Sex Filter</div>
              <div class="btn-group btn-group-sm" role="group" aria-label="Growth sex filter">
                <button type="button" class="btn btn-success" data-growth-sex="all">All</button>
                <button type="button" class="btn btn-outline-success" data-growth-sex="male">Male</button>
                <button type="button" class="btn btn-outline-success" data-growth-sex="female">Female</button>
              </div>
            </div>
          </div>

          <input
            id="growthSearchInput"
            class="form-control form-control-sm mb-3"
            placeholder="Filter piglets by tag or stage..."
          >

          <div id="growthList"></div>
          <div id="growthPagination" class="mt-3"></div>
        </div>
      </div>
    `;
  }

  function buildSelectionTabHtml({ piglets }) {
    return `
      <div class="card border-0 shadow-sm">
        <div class="card-body">
          <div class="d-flex flex-column flex-lg-row justify-content-between align-items-lg-start gap-3 mb-3">
            <div class="min-w-0">
              <div class="fw-semibold"><i class="bi bi-check2-circle me-2"></i>Selection Process</div>
              <div class="text-muted small">Filter piglets.</div>
            </div>

            <div class="text-lg-end">
              <div class="text-muted small mb-1">Sex Filter</div>
              <div class="btn-group btn-group-sm" role="group" aria-label="Selection sex filter">
                <button type="button" class="btn btn-success" data-selection-sex="all">All</button>
                <button type="button" class="btn btn-outline-success" data-selection-sex="male">Male</button>
                <button type="button" class="btn btn-outline-success" data-selection-sex="female">Female</button>
              </div>
            </div>
          </div>

          <div class="row g-3 mb-3">
            <div class="col-12 col-md-4">
              <div class="card border-0 shadow-sm h-100">
                <div class="card-body">
                  <div class="text-muted small">Total in Selection</div>
                  <div class="fs-4 fw-bold" id="selTotalInSelection">0</div>
                </div>
              </div>
            </div>

            <div class="col-12 col-md-4">
              <div class="card border-0 shadow-sm h-100">
                <div class="card-body">
                  <div class="text-muted small">Retain for Breeding</div>
                  <div class="fs-4 fw-bold" id="selRetainForBreeding">0</div>
                </div>
              </div>
            </div>

            <div class="col-12 col-md-4">
              <div class="card border-0 shadow-sm h-100">
                <div class="card-body">
                  <div class="text-muted small">Mark for Sale</div>
                  <div class="fs-4 fw-bold" id="selMarkForSale">0</div>
                </div>
              </div>
            </div>
          </div>

          <input
            id="selectionSearchInput"
            class="form-control form-control-sm mb-3"
            placeholder="Filter piglets by tag or stage..."
          >

          <div id="selectionList"></div>
          <div id="selectionPagination" class="mt-3"></div>
        </div>
      </div>
    `;
  }

  /* ================= GROWTH LIST + PAGINATION ================= */
  function bindGrowthUI(piglets) {
    const list = Array.isArray(piglets) ? piglets : [];
    const listEl = document.getElementById("growthList");
    const pagEl = document.getElementById("growthPagination");
    const searchEl = document.getElementById("growthSearchInput");

    if (!listEl || !pagEl) return;

    const pageSize = 5;
    const uiState = (state.__growthUI = state.__growthUI || { sex: "all", q: "", page: 1 });

    function applyFilters(items) {
      let out = items.slice();

      if (uiState.sex !== "all") {
        out = out.filter((p) => normLower(p?.sex) === uiState.sex);
      }

      const q = (uiState.q || "").trim().toLowerCase();
      if (q) {
        out = out.filter((p) => {
          const tag = normLower(p?.swine_id);
          const stage = normLower(p?.age_stage || p?.current_status);
          return tag.includes(q) || stage.includes(q);
        });
      }

      return out;
    }

    function render() {
      const filtered = applyFilters(list);
      const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
      if (uiState.page > totalPages) uiState.page = totalPages;

      const start = (uiState.page - 1) * pageSize;
      const pageItems = filtered.slice(start, start + pageSize);

      if (!pageItems.length) {
        listEl.innerHTML = `<div class="text-muted">No piglets match your filters.</div>`;
      } else {
        listEl.innerHTML = pageItems
          .map((p) => {
            const tag = p?.swine_id || "—";
            const sex = p?.sex || "—";
            const stage = p?.age_stage || p?.current_status || "—";

            const aliveBadge = ctx.isDeadStatus(p?.health_status)
              ? `<span class="badge bg-danger-subtle text-danger">Deceased</span>`
              : `<span class="badge bg-success-subtle text-success">Alive</span>`;

            const selection = normStr(p?.selection_status) || "Pending";

            return `
              <div class="card border-0 shadow-sm mb-3">
                <div class="card-body d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3">
                  <div class="min-w-0">
                    <div class="fw-semibold"><i class="bi bi-tag me-2"></i>${tag}</div>
                    <div class="text-muted small">${sex} · ${stage}</div>
                    <div class="mt-2">${aliveBadge}</div>
                  </div>

                  <div class="text-md-end">
                    <div class="text-muted small mb-1">Selection</div>
                    <span class="badge bg-light text-dark border">${selection}</span>

                    <div class="mt-3">
                      <button type="button" class="btn btn-success btn-sm" disabled>
                        Open <i class="bi bi-chevron-right ms-1"></i>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            `;
          })
          .join("");
      }

      pagEl.innerHTML = `
        <div class="d-flex justify-content-between align-items-center">
          <button type="button" class="btn btn-sm btn-outline-secondary" id="growthPrevBtn">Prev</button>
          <span class="small text-muted">Page ${uiState.page} of ${totalPages}</span>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="growthNextBtn">Next</button>
        </div>
      `;

      const prev = document.getElementById("growthPrevBtn");
      const next = document.getElementById("growthNextBtn");
      if (prev) prev.disabled = uiState.page <= 1;
      if (next) next.disabled = uiState.page >= totalPages;

      prev?.addEventListener("click", () => {
        if (uiState.page > 1) {
          uiState.page--;
          render();
        }
      });

      next?.addEventListener("click", () => {
        if (uiState.page < totalPages) {
          uiState.page++;
          render();
        }
      });
    }

    document.querySelectorAll("[data-growth-sex]").forEach((btn) => {
      btn.addEventListener("click", () => {
        uiState.sex = btn.getAttribute("data-growth-sex") || "all";
        uiState.page = 1;

        document.querySelectorAll("[data-growth-sex]").forEach((b) => {
          b.classList.remove("btn-success");
          b.classList.add("btn-outline-success");
        });
        btn.classList.remove("btn-outline-success");
        btn.classList.add("btn-success");

        render();
      });
    });

    searchEl?.addEventListener("input", (e) => {
      uiState.q = e.target.value || "";
      uiState.page = 1;
      render();
    });

    // default active
    const defaultBtn = document.querySelector('[data-growth-sex="all"]');
    if (defaultBtn) {
      document.querySelectorAll("[data-growth-sex]").forEach((b) => {
        b.classList.remove("btn-success");
        b.classList.add("btn-outline-success");
      });
      defaultBtn.classList.remove("btn-outline-success");
      defaultBtn.classList.add("btn-success");
    }

    render();
  }

  /* ================= SELECTION LIST + PAGINATION ================= */
  function bindSelectionUI(piglets) {
    const list = Array.isArray(piglets) ? piglets : [];
    const listEl = document.getElementById("selectionList");
    const pagEl = document.getElementById("selectionPagination");
    const searchEl = document.getElementById("selectionSearchInput");

    if (!listEl || !pagEl) return;

    const pageSize = 5;
    const uiState = (state.__selectionUI = state.__selectionUI || { sex: "all", q: "", page: 1 });

    function normalizeSelection(v) {
      const s = normLower(v);
      if (!s) return "Pending";
      return normStr(v);
    }

    function classifySelection(v) {
      const s = normLower(v);
      if (!s || s === "pending") return "in";
      if (s.includes("retain") || s.includes("breeding")) return "retain";
      if (s.includes("sale")) return "sale";
      if (s.includes("selection")) return "in";
      return "in";
    }

    function applyFilters(items) {
      let out = items.slice();

      if (uiState.sex !== "all") {
        out = out.filter((p) => normLower(p?.sex) === uiState.sex);
      }

      const q = (uiState.q || "").trim().toLowerCase();
      if (q) {
        out = out.filter((p) => {
          const tag = normLower(p?.swine_id);
          const stage = normLower(p?.age_stage || p?.current_status);
          return tag.includes(q) || stage.includes(q);
        });
      }

      return out;
    }

    function updateKpis(filteredItems) {
      let totalIn = 0;
      let retain = 0;
      let sale = 0;

      filteredItems.forEach((p) => {
        const cls = classifySelection(p?.selection_status);
        if (cls === "retain") retain++;
        else if (cls === "sale") sale++;
        else totalIn++;
      });

      document.getElementById("selTotalInSelection")?.replaceChildren(document.createTextNode(String(totalIn)));
      document.getElementById("selRetainForBreeding")?.replaceChildren(document.createTextNode(String(retain)));
      document.getElementById("selMarkForSale")?.replaceChildren(document.createTextNode(String(sale)));
    }

    function render() {
      const filtered = applyFilters(list);
      updateKpis(filtered);

      const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
      if (uiState.page > totalPages) uiState.page = totalPages;

      const start = (uiState.page - 1) * pageSize;
      const pageItems = filtered.slice(start, start + pageSize);

      if (!pageItems.length) {
        listEl.innerHTML = `<div class="text-muted">No piglets match your filters.</div>`;
      } else {
        listEl.innerHTML = pageItems
          .map((p) => {
            const tag = p?.swine_id || "—";
            const sex = p?.sex || "—";
            const stage = p?.age_stage || p?.current_status || "—";

            const aliveBadge = ctx.isDeadStatus(p?.health_status)
              ? `<span class="badge bg-danger-subtle text-danger">Deceased</span>`
              : `<span class="badge bg-success-subtle text-success">Alive</span>`;

            const selection = normalizeSelection(p?.selection_status);

            return `
              <div class="card border-0 shadow-sm mb-3">
                <div class="card-body d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3">
                  <div class="min-w-0">
                    <div class="fw-semibold"><i class="bi bi-tag me-2"></i>${tag}</div>
                    <div class="text-muted small">${sex} · ${stage}</div>
                    <div class="mt-2">${aliveBadge}</div>
                  </div>

                  <div class="text-md-end">
                    <div class="text-muted small mb-1">Selection</div>
                    <span class="badge bg-light text-dark border">${selection}</span>

                    <div class="mt-3">
                      <button type="button" class="btn btn-success btn-sm" disabled>
                        Open <i class="bi bi-chevron-right ms-1"></i>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            `;
          })
          .join("");
      }

      pagEl.innerHTML = `
        <div class="d-flex justify-content-between align-items-center">
          <button type="button" class="btn btn-sm btn-outline-secondary" id="selectionPrevBtn">Prev</button>
          <span class="small text-muted">Page ${uiState.page} of ${totalPages}</span>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="selectionNextBtn">Next</button>
        </div>
      `;

      const prev = document.getElementById("selectionPrevBtn");
      const next = document.getElementById("selectionNextBtn");
      if (prev) prev.disabled = uiState.page <= 1;
      if (next) next.disabled = uiState.page >= totalPages;

      prev?.addEventListener("click", () => {
        if (uiState.page > 1) {
          uiState.page--;
          render();
        }
      });

      next?.addEventListener("click", () => {
        if (uiState.page < totalPages) {
          uiState.page++;
          render();
        }
      });
    }

    document.querySelectorAll("[data-selection-sex]").forEach((btn) => {
      btn.addEventListener("click", () => {
        uiState.sex = btn.getAttribute("data-selection-sex") || "all";
        uiState.page = 1;

        document.querySelectorAll("[data-selection-sex]").forEach((b) => {
          b.classList.remove("btn-success");
          b.classList.add("btn-outline-success");
        });
        btn.classList.remove("btn-outline-success");
        btn.classList.add("btn-success");

        render();
      });
    });

    searchEl?.addEventListener("input", (e) => {
      uiState.q = e.target.value || "";
      uiState.page = 1;
      render();
    });

    // default active
    const defaultBtn = document.querySelector('[data-selection-sex="all"]');
    if (defaultBtn) {
      document.querySelectorAll("[data-selection-sex]").forEach((b) => {
        b.classList.remove("btn-success");
        b.classList.add("btn-outline-success");
      });
      defaultBtn.classList.remove("btn-outline-success");
      defaultBtn.classList.add("btn-success");
    }

    render();
  }

  return {
    renderBreedingPerformance,
    openSowCycles,
    closeSowDetailView,
    openCycleDetail
  };
}