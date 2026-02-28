// /js/reproduction/reproduction.views.js

export function createReproViews({ repo, state, ui }) {
  const { esc, fmtDate, fmtShortDate, badge, sexLabel, normSex } = ui;

  // ---------------------------------------------------------
  // Shared small helpers
  // ---------------------------------------------------------
  function paginate(list, page, pageSize) {
    const total = list.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(Math.max(1, page), pages);
    const start = (safePage - 1) * pageSize;
    return { page: safePage, pages, total, items: list.slice(start, start + pageSize) };
  }

  function filterPiglets(piglets, term) {
    const t = (term || "").trim().toLowerCase();
    if (!t) return piglets;
    return piglets.filter((p) => {
      const tag = (p?.swine_id || p?.swine_tag || "").toLowerCase();
      const st = (p?.age_stage || p?.current_status || p?.current_stage || "").toLowerCase();
      return tag.includes(t) || st.includes(t);
    });
  }

  function filterPigletsBySex(piglets, sexFilter) {
    const f = String(sexFilter || "all").toLowerCase();
    if (f === "all") return piglets;
    return piglets.filter((p) => {
      const s = normSex(p?.sex);
      if (f === "male") return s.startsWith("m");
      if (f === "female") return s.startsWith("f");
      return true;
    });
  }

  // ---------------------------------------------------------
  // Sow helpers (for Overview tab)
  // ---------------------------------------------------------
  function getSowByIdOrTag(sowId) {
    return (
      repo.store.sowMap?.get?.(sowId) ||
      repo.store.allSwineData?.find?.((x) => (x?.swine_id || x?.swine_tag) === sowId) ||
      null
    );
  }

  function getLatestPerf(swine) {
    const list = Array.isArray(swine?.performance_records) ? swine.performance_records : [];
    // Most systems append newest last; if yours is newest first, switch to list[0]
    return list.length ? list[list.length - 1] : null;
  }

  // ---------------------------------------------------------
  // Left list rendering
  // ---------------------------------------------------------
  function renderListLoading() {
    state.dom.sowCardsWrap.innerHTML = `<div class="text-muted small">Loading sows...</div>`;
    state.dom.sowPager.innerHTML = "";
  }

  function renderListError(
    message = "Unable to load your swine data",
    sub = "Your session may have expired, or the server failed to respond."
  ) {
    state.dom.sowCardsWrap.innerHTML = `
      <div class="text-center text-muted py-4">
        <div class="mb-2"><i class="bi bi-wifi-off"></i></div>
        <div class="fw-bold">${esc(message)}</div>
        <div class="small">${esc(sub)}</div>
        <div class="d-flex justify-content-center gap-2 mt-3">
          <button class="btn btn-outline-success btn-sm" data-act="retryLoad">
            <i class="bi bi-arrow-clockwise me-1"></i> Retry
          </button>
          <button class="btn btn-success btn-sm" data-act="goLogin">
            <i class="bi bi-box-arrow-in-right me-1"></i> Login
          </button>
        </div>
      </div>
    `;
    state.dom.sowPager.innerHTML = "";
  }

  function renderListNoData() {
    state.dom.sowCardsWrap.innerHTML = `
      <div class="text-center text-muted py-4">
        <i class="bi bi-info-circle me-1"></i> No sows found in your account yet.
      </div>
    `;
    state.dom.sowPager.innerHTML = "";
  }

  function getFilteredSows() {
    const term = (state.sowTerm || "").trim().toLowerCase();
    const list = repo.store.sows || [];
    if (!term) return list;

    return list.filter((s) => {
      const sowId = (s?.swine_id || s?.swine_tag || "").toLowerCase();
      const stage = (s?.age_stage || s?.current_status || s?.current_stage || "").toLowerCase();
      return sowId.includes(term) || stage.includes(term);
    });
  }

  function renderSowPagination(meta) {
    state.dom.sowPager.innerHTML = `
      <div class="d-flex align-items-center justify-content-between gap-2">
        <button class="btn btn-sm btn-outline-success" ${meta.page <= 1 ? "disabled" : ""} data-act="sowPrev">
          <i class="bi bi-chevron-left"></i> Prev
        </button>
        <div class="small text-muted">
          Page <b>${meta.page}</b> of <b>${meta.pages}</b> • <b>${meta.total}</b> sows
        </div>
        <button class="btn btn-sm btn-outline-success" ${meta.page >= meta.pages ? "disabled" : ""} data-act="sowNext">
          Next <i class="bi bi-chevron-right"></i>
        </button>
      </div>
    `;
  }

  function sowCardHtml(s) {
    const sowId = s?.swine_id || s?.swine_tag || "N/A";
    const stage = s?.age_stage || s?.current_status || s?.current_stage || "N/A";
    const breed = s?.breed || "N/A";
    const dob = s?.birth_date ? fmtDate(s.birth_date) : "N/A";

    const stats = repo.computeBreedingStatsForSow(sowId);
    const alive = stats.aliveMale + stats.aliveFemale;
    const isActive = state.activeSowId && state.activeSowId === sowId;

    return `
      <div class="repro-card card shadow-sm border-0 ${isActive ? "repro-card-active" : ""}">
        <div class="card-body">
          <div class="d-flex align-items-start justify-content-between gap-2">
            <div class="min-w-0">
              <div class="d-flex align-items-center gap-2">
                <span class="repro-pill"><i class="bi bi-heart-pulse"></i></span>
                <h6 class="mb-0 text-truncate">${esc(sowId)}</h6>
              </div>
              <div class="small text-muted mt-1 text-truncate">
                Stage: <b>${esc(stage)}</b> • Breed: <b>${esc(breed)}</b>
              </div>
              <div class="small text-muted text-truncate">
                DOB: ${esc(dob)}
              </div>
            </div>

            <div class="text-end">
              <div class="small text-muted">Piglets</div>
              <div class="fw-bold">${alive} alive</div>
              <div class="small text-danger">${stats.deceased} dead</div>
            </div>
          </div>

          <div class="d-flex gap-2 mt-3">
            <button class="btn btn-success btn-sm flex-grow-1" data-act="openSow" data-sow="${esc(sowId)}">
              View <i class="bi bi-arrow-right-circle ms-1"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function renderSowCards() {
    if (!repo.store.loaded?.swine) return void renderListLoading();
    if ((repo.store.sows || []).length === 0) return void renderListNoData();

    const list = getFilteredSows();
    const meta = paginate(list, state.sowPage, state.PAGE_SIZE);
    state.sowPage = meta.page;

    if (meta.total === 0 && (state.sowTerm || "").trim()) {
      state.dom.sowCardsWrap.innerHTML = `
        <div class="text-center text-muted py-4">
          <i class="bi bi-search me-1"></i> No sows match your filter.
        </div>`;
      state.dom.sowPager.innerHTML = `<div class="small text-muted text-center">0 sows</div>`;
      return;
    }

    state.dom.sowCardsWrap.innerHTML = meta.items.length ? meta.items.map(sowCardHtml).join("") : "";
    renderSowPagination(meta);
  }

  // ---------------------------------------------------------
  // Cycle dropdown / list (fixed)
  // ---------------------------------------------------------
  function getCyclesForSowSafe(sowId) {
    const cycles = repo.getCyclesForSow(sowId) || [];
    const ids = new Set(cycles.map((c) => String(c?.id)));
    if (state.cycleFilterId !== "all" && !ids.has(String(state.cycleFilterId))) {
      state.cycleFilterId = "all";
    }
    return cycles;
  }

  function getFilteredCyclesForSow(sowId) {
    const cycles = getCyclesForSowSafe(sowId);
    if (state.cycleFilterId === "all") return cycles;
    const want = String(state.cycleFilterId);
    return cycles.filter((c) => String(c?.id) === want);
  }

  function renderCycleFilterDropdown(sowId) {
    const cycles = getCyclesForSowSafe(sowId);
    if (!cycles.length) return "";

    const opts =
      `<option value="all"${state.cycleFilterId === "all" ? " selected" : ""}>All cycles</option>` +
      cycles
        .map((c, idx) => {
          const label = c?.date ? fmtDate(c.date) : `Cycle ${idx + 1}`;
          const val = String(c?.id ?? "");
          return `<option value="${esc(val)}"${String(state.cycleFilterId) === val ? " selected" : ""}>${esc(label)}</option>`;
        })
        .join("");

    return `
      <div class="d-flex align-items-center justify-content-between gap-2 flex-wrap mb-3">
        <div class="min-w-0">
          <div class="fw-bold"><i class="bi bi-diagram-3 me-1"></i> Cycles</div>
          <div class="small text-muted">Choose a cycle to view records.</div>
        </div>

        <div class="d-flex align-items-center gap-2">
          <div class="small text-muted">Cycle</div>
          <select class="form-select form-select-sm" style="min-width:220px" id="cycleFilterSelect">
            ${opts}
          </select>
        </div>
      </div>
    `;
  }

  function cycleCardHtml(cycle) {
    const isActive = state.activeCycleId && String(state.activeCycleId) === String(cycle.id);
    return `
      <div class="card repro-subcard shadow-sm border-0 ${isActive ? "repro-card-active" : ""}">
        <div class="card-body">
          <div class="d-flex align-items-start justify-content-between gap-2">
            <div class="min-w-0">
              <div class="fw-bold text-truncate">
                <i class="bi bi-calendar2-week me-1"></i> ${esc(fmtDate(cycle.date))}
              </div>
              <div class="small text-muted text-truncate">
                Boar: <b>${esc(cycle.boarCode)}</b>
              </div>
            </div>

            <div class="text-end">
              ${badge(cycle.status, cycle.status === "Failed" ? "danger" : "light")}
            </div>
          </div>

          <div class="d-flex gap-2 mt-3">
            <button class="btn btn-success btn-sm" data-act="openCycle" data-cycle="${esc(String(cycle.id))}" data-sow="${esc(cycle.sowCode)}">
              Open Cycle <i class="bi bi-chevron-right ms-1"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function renderCycleList(sowId) {
    const cycles = getCyclesForSowSafe(sowId);
    if (!cycles.length) {
      return `
        <div class="text-muted small">
          <i class="bi bi-info-circle me-1"></i> No AI records yet for this sow.
        </div>
      `;
    }

    const filtered = getFilteredCyclesForSow(sowId);

    return `
      ${renderCycleFilterDropdown(sowId)}
      <div class="vstack gap-3" id="cycleCardsWrap">
        ${
          filtered.length
            ? filtered.map((c) => cycleCardHtml(c)).join("")
            : `<div class="text-muted small"><i class="bi bi-info-circle me-1"></i>No cycles match.</div>`
        }
      </div>
    `;
  }

  // ---------------------------------------------------------
  // Reduce stacking in Reproduction tab: single mount
  // ---------------------------------------------------------
  function getReproTabMount(mountRoot) {
    return mountRoot?.querySelector?.("#reproReproMount") || document.getElementById("reproReproMount");
  }

  function renderReproTabBodyHtml(sowId) {
    if (state.cycleView !== "detail" || !state.activeCycleId) {
      return renderCycleList(sowId);
    }

    // Context-aware Back behavior
    const activeTab = state.activeCycleTabTarget || "#cycleAI";
    const isGrowthDetail = activeTab === "#cycleGrowth" && state.growthView === "detail";
    const isSelectionDetail = activeTab === "#cycleSelect" && state.selectionView === "detail";

    let backAct = "cycleBack";
    let backLabel = "Back to Cycles";

    if (isGrowthDetail) {
      backAct = "growthBack";
      backLabel = "Back to Piglets";
    } else if (isSelectionDetail) {
      backAct = "selectionBack";
      backLabel = "Back to Piglets";
    }

    return `
      <div class="d-flex align-items-center justify-content-between gap-2 flex-wrap">
        <div class="min-w-0">
          <div class="fw-bold text-truncate">
            <i class="bi bi-folder2-open me-1"></i> Cycle Details
          </div>
          <div class="small text-muted text-truncate">
            AI record • performance • growth • selection
          </div>
        </div>

        <button type="button" class="btn btn-outline-success btn-sm" data-act="${backAct}">
          <i class="bi bi-arrow-left me-1"></i> ${backLabel}
        </button>
      </div>

      <hr class="my-3"/>

      <div id="cyclePanelMount"></div>
    `;
  }

  function renderReproTabInto(mountRoot) {
    const m = getReproTabMount(mountRoot);
    if (!m) return;

    if (!state.activeSowId) {
      m.innerHTML = `<div class="text-muted small">Select a sow to view cycles.</div>`;
      return;
    }

    // validate filter against current cycles (fix broken dropdown)
    getCyclesForSowSafe(state.activeSowId);

    m.innerHTML = renderReproTabBodyHtml(state.activeSowId);

    if (state.cycleView === "detail" && state.activeCycleId) {
      renderCyclePanel(state.activeSowId, state.activeCycleId);
    }
  }

  // ---------------------------------------------------------
  // Cycle Panel (tabs)
  // ---------------------------------------------------------
  function getCurrentActiveCycleTabTarget() {
    const activeBtn = document.querySelector(".repro-tabs .nav-link.active");
    const t = activeBtn?.getAttribute("data-bs-target");
    if (t && state.CYCLE_TABS.includes(t)) return t;
    return state.activeCycleTabTarget || "#cycleAI";
  }

  function setCycleTabTarget(nextTarget) {
    if (nextTarget && state.CYCLE_TABS.includes(nextTarget)) state.activeCycleTabTarget = nextTarget;
  }

  function renderCycleAIRecord(sowId, cycle) {
    const boarId = cycle.boarCode;
    const boar = repo.store.allSwineData.find((x) => (x?.swine_id || x?.swine_tag) === boarId);
    const boarOwner = boar?.farmer_id?.name || boar?.farmer_name || boar?.owner_name || "N/A";

    return `
      <div class="row g-3">
        <div class="col-12 col-lg-6">
          <div class="card repro-subcard h-100 shadow-sm border-0">
            <div class="card-body">
              <div class="small text-muted mb-1">Sow</div>
              <div class="fw-bold">${esc(sowId)}</div>
              <div class="small text-muted mt-2">Cycle Date</div>
              <div class="fw-bold">${esc(fmtDate(cycle.date))}</div>
              <div class="small text-muted mt-2">Status</div>
              <div>${badge(cycle.status, cycle.status === "Failed" ? "danger" : "light")}</div>
            </div>
          </div>
        </div>

        <div class="col-12 col-lg-6">
          <div class="card repro-subcard h-100 shadow-sm border-0">
            <div class="card-body">
              <div class="small text-muted mb-1">Boar</div>
              <div class="fw-bold">${esc(boarId)}</div>
              <div class="small text-muted mt-2">Origin / Owner</div>
              <div class="fw-bold">${esc(boarOwner)}</div>

              <div class="small text-muted mt-2">Result</div>
              <div class="text-muted small">
                If you track completed/pending/failed later, we’ll map it to a badge automatically.
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderCyclePerformance(sowId, piglets) {
    const stats = repo.computeBreedingStatsForSow(sowId);

    const rows = piglets
      .map((p) => {
        const tag = p?.swine_id || p?.swine_tag || "N/A";
        const sex = sexLabel(p?.sex);
        const stage = p?.age_stage || p?.current_status || p?.current_stage || "N/A";
        const hs = p?.health_status || "N/A";
        const isDead = String(hs).toLowerCase().includes("deceased") || String(hs).toLowerCase().includes("dead");
        return `
          <div class="list-group-item d-flex align-items-center justify-content-between gap-2">
            <div class="min-w-0">
              <div class="fw-semibold text-truncate">${esc(tag)}</div>
              <div class="small text-muted text-truncate">${esc(sex)} • ${esc(stage)}</div>
            </div>
            <div>${isDead ? badge("Deceased", "danger") : badge("Alive", "success")}</div>
          </div>
        `;
      })
      .join("");

    return `
      <div class="row g-3">
        <div class="col-12">
          <div class="row g-2">
            <div class="col-12 col-md-4">
              <div class="card repro-stat h-100 shadow-sm border-0">
                <div class="card-body">
                  <div class="small text-muted">Alive Male</div>
                  <div class="h4 mb-0">${stats.aliveMale}</div>
                </div>
              </div>
            </div>
            <div class="col-12 col-md-4">
              <div class="card repro-stat h-100 shadow-sm border-0">
                <div class="card-body">
                  <div class="small text-muted">Alive Female</div>
                  <div class="h4 mb-0">${stats.aliveFemale}</div>
                </div>
              </div>
            </div>
            <div class="col-12 col-md-4">
              <div class="card repro-stat-danger h-100 shadow-sm border-0">
                <div class="card-body">
                  <div class="small text-muted">Deceased</div>
                  <div class="h4 mb-0">${stats.deceased}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="col-12">
          <div class="card repro-subcard shadow-sm border-0">
            <div class="card-body">
              <div class="fw-bold mb-2"><i class="bi bi-list-ul me-1"></i> Piglets</div>
              <div class="list-group list-group-flush repro-list">
                ${rows || `<div class="text-muted small">No piglets found for this sow.</div>`}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function pigletCardHtml(p, ctx) {
    const tag = p?.swine_id || p?.swine_tag || "N/A";
    const sex = sexLabel(p?.sex);
    const stage = p?.age_stage || p?.current_status || p?.current_stage || "N/A";
    const hs = p?.health_status || "N/A";
    const isDead = String(hs).toLowerCase().includes("deceased") || String(hs).toLowerCase().includes("dead");
    const btnAct = ctx === "growth" ? "openPigletGrowth" : "openPigletSelection";

    const sel = repo.getSelectionForPiglet(tag);
    const rec = sel?.recommendation || "Pending";

    return `
      <div class="card repro-subcard shadow-sm border-0">
        <div class="card-body">
          <div class="d-flex align-items-start justify-content-between gap-2">
            <div class="min-w-0">
              <div class="fw-bold text-truncate">
                <i class="bi bi-tag me-1"></i>${esc(tag)}
              </div>
              <div class="small text-muted text-truncate">${esc(sex)} • ${esc(stage)}</div>
              <div class="small mt-1">${isDead ? badge("Deceased", "danger") : badge("Alive", "success")}</div>
            </div>
            <div class="text-end">
              <div class="small text-muted">Selection</div>
              <div>${badge(rec, rec.toLowerCase().includes("cull") ? "danger" : "light")}</div>
            </div>
          </div>

          <div class="d-flex gap-2 mt-3">
            <button class="btn btn-success btn-sm" data-act="${btnAct}" data-piglet="${esc(tag)}">
              Open <i class="bi bi-chevron-right ms-1"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function renderPagerHtml(which, meta) {
    return `
      <div class="d-flex align-items-center justify-content-between gap-2">
        <button class="btn btn-sm btn-outline-success" ${meta.page <= 1 ? "disabled" : ""} data-act="${which}Prev">
          <i class="bi bi-chevron-left"></i>
        </button>
        <div class="small text-muted">
          Page <b>${meta.page}</b> of <b>${meta.pages}</b> • <b>${meta.total}</b> items
        </div>
        <button class="btn btn-sm btn-outline-success" ${meta.page >= meta.pages ? "disabled" : ""} data-act="${which}Next">
          <i class="bi bi-chevron-right"></i>
        </button>
      </div>
    `;
  }

  function renderSexPills(active, actPrefix) {
    const opts = [
      { k: "all", label: "All" },
      { k: "male", label: "Male" },
      { k: "female", label: "Female" },
    ];
    return `
      <div class="d-flex gap-2 flex-wrap">
        ${opts
          .map(
            (o) => `
          <button
            type="button"
            class="btn btn-sm ${String(active) === o.k ? "btn-success" : "btn-outline-success"}"
            data-act="${actPrefix}"
            data-sex="${o.k}"
          >
            ${o.label}
          </button>
        `
          )
          .join("")}
      </div>
    `;
  }

  

  function renderCycleGrowth(sowId, piglets) {
    const bySex = filterPigletsBySex(piglets, state.growthSexFilter);
    const filtered = filterPiglets(bySex, state.pigletGrowthFilter);
    const meta = paginate(filtered, state.pigletPageGrowth, state.PAGE_SIZE);
    state.pigletPageGrowth = meta.page;

    const listHtml = meta.items.map((p) => pigletCardHtml(p, "growth")).join("");

    return `
      <div class="card repro-subcard shadow-sm border-0">
        <div class="card-body">

          ${
            state.growthView === "detail" && state.selectedPigletTagForGrowth
              ? `
                <div class="d-flex align-items-center justify-content-between gap-2 flex-wrap">
                  <div class="min-w-0">
                    <div class="fw-bold text-truncate"><i class="bi bi-activity me-1"></i> Weight Trend</div>
                    <div class="small text-muted text-truncate">Auto-updated based on recorded morphology entries</div>
                  </div>
                  <button type="button" class="btn btn-outline-success btn-sm" data-act="growthBack">
                    <i class="bi bi-arrow-left me-1"></i> Back
                  </button>
                </div>

                <div class="mt-3" id="growthDetailMount">
                  <div class="text-muted small">Loading...</div>
                </div>
              `
              : `
                <div class="d-flex align-items-start justify-content-between gap-2 flex-wrap">
                  <div class="min-w-0">
                    <div class="fw-bold mb-1"><i class="bi bi-graph-up-arrow me-1"></i> Growth Monitoring</div>
                    <div class="text-muted small">Filter piglets, then open one to view chart and deformities.</div>
                  </div>
                  <div class="text-end">
                    <div class="small text-muted">Sex Filter</div>
                    ${renderSexPills(state.growthSexFilter, "growthSexFilter")}
                  </div>
                </div>

                <div class="mt-3">
                  <input
                    class="form-control form-control-sm"
                    id="growthFilterInput"
                    placeholder="Filter piglets by tag or stage..."
                    value="${esc(state.pigletGrowthFilter)}"
                  />
                </div>

                <div class="vstack gap-3 mt-3" id="growthPigletCards">
                  ${listHtml || `<div class="text-muted small">No piglets match.</div>`}
                </div>

                <div class="mt-3" id="growthPager">
                  ${renderPagerHtml("growthPiglet", meta)}
                </div>
              `
          }

        </div>
      </div>
    `;
  }

  function renderSelectionSummaryCards() {
    const sum = repo.getSelectionSummary ? repo.getSelectionSummary() : { total: 0, retain: 0, sell: 0 };

    // These are the placeholders (IDs) your controller can update if needed,
    // but we already render actual values here too.
    return `
      <div class="row g-2 mt-2">
        <div class="col-12 col-md-4">
          <div class="card repro-stat h-100 shadow-sm border-0">
            <div class="card-body">
              <div class="small text-muted">Total in Selection</div>
              <div class="h4 mb-0" id="selectionStatTotal">${sum.total}</div>
            </div>
          </div>
        </div>

        <div class="col-12 col-md-4">
          <div class="card repro-stat h-100 shadow-sm border-0">
            <div class="card-body">
              <div class="small text-muted">Retain for Breeding</div>
              <div class="h4 mb-0" id="selectionStatRetain">${sum.retain}</div>
            </div>
          </div>
        </div>

        <div class="col-12 col-md-4">
          <div class="card repro-stat-danger h-100 shadow-sm border-0">
            <div class="card-body">
              <div class="small text-muted">Mark for Sale</div>
              <div class="h4 mb-0" id="selectionStatSell">${sum.sell}</div>
            </div>
          </div>
        </div>
      </div>
  `;
}

  function renderCycleSelection(sowId, piglets) {
    const bySex = filterPigletsBySex(piglets, state.selectionSexFilter);
    const filtered = filterPiglets(bySex, state.pigletSelectionFilter);
    const meta = paginate(filtered, state.pigletPageSelection, state.PAGE_SIZE);
    state.pigletPageSelection = meta.page;

    const listHtml = meta.items.map((p) => pigletCardHtml(p, "selection")).join("");

    return `
      <div class="card repro-subcard shadow-sm border-0">
        <div class="card-body">

          ${
            state.selectionView === "detail" && state.selectedPigletTagForSelection
              ? `
                <div class="d-flex align-items-center justify-content-between gap-2 flex-wrap">
                  <div class="min-w-0">
                    <div class="fw-bold text-truncate"><i class="bi bi-person-check me-1"></i> Selection Details</div>
                    <div class="small text-muted text-truncate">Status and recommendation</div>
                  </div>
                  <button type="button" class="btn btn-outline-success btn-sm" data-act="selectionBack">
                    <i class="bi bi-arrow-left me-1"></i> Back
                  </button>
                </div>

                <div class="mt-3" id="selectionDetailMount">
                  <div class="text-muted small">Loading...</div>
                </div>
              `
              : `
                <div class="d-flex align-items-start justify-content-between gap-2 flex-wrap">
                  <div class="min-w-0">
                    <div class="fw-bold mb-1"><i class="bi bi-check2-circle me-1"></i> Selection Process</div>
                    <div class="text-muted small">Filter piglets, then open one to view selection status.</div>
                  </div>
                  <div class="text-end">
                    <div class="small text-muted">Sex Filter</div>
                    ${renderSexPills(state.selectionSexFilter, "selectionSexFilter")}
                  </div>
                </div>

                ${renderSelectionSummaryCards()}

                <div class="mt-3">
                  <input
                    class="form-control form-control-sm"
                    id="selectionFilterInput"
                    placeholder="Filter piglets by tag or stage..."
                    value="${esc(state.pigletSelectionFilter)}"
                  />
                </div>

                <div class="vstack gap-3 mt-3" id="selectionPigletCards">
                  ${listHtml || `<div class="text-muted small">No piglets match.</div>`}
                </div>

                <div class="mt-3" id="selectionPager">
                  ${renderPagerHtml("selectionPiglet", meta)}
                </div>
              `
          }

        </div>
      </div>
    `;
  }

  function renderPigletSelectionDetail(pigletTag) {
    const mount = document.getElementById("selectionDetailMount");
    if (!mount) return;

    const sel = repo.getSelectionForPiglet(pigletTag);
    const rec = sel?.recommendation || "Pending";
    const stage = sel?.current_stage || "N/A";
    const date = sel?.updatedAt || sel?.date || sel?.createdAt || null;

    mount.innerHTML = `
      <div class="d-flex align-items-start justify-content-between gap-2 flex-wrap">
        <div class="min-w-0">
          <div class="fw-bold text-truncate"><i class="bi bi-tag me-1"></i>${esc(pigletTag)}</div>
          <div class="small text-muted">Stage: <b>${esc(stage)}</b></div>
          <div class="small text-muted">Last update: <b>${esc(fmtDate(date))}</b></div>
        </div>
        <div>${badge(rec, rec.toLowerCase().includes("cull") ? "danger" : "light")}</div>
      </div>

      <hr class="my-3"/>

      <div class="small text-muted">
        This panel displays the selection info from your existing selection-candidates endpoint.
      </div>
    `;
  }

  function renderPigletGrowthDetail(pigletTag) {
    const mount = document.getElementById("growthDetailMount");
    if (!mount) return;

    const history = repo.getMorphHistoryForPiglet(pigletTag);
    const deformities = repo.getDeformitiesForPiglet(pigletTag);

    const points = history
      .map((h) => ({ x: h.date, y: Number(h.weight || 0) }))
      .filter((p) => p.x && Number.isFinite(p.y))
      .sort((a, b) => new Date(a.x) - new Date(b.x));

    const first = points[0];
    const last = points[points.length - 1];
    const delta = first && last ? (last.y - first.y).toFixed(1) : "0.0";

    mount.innerHTML = `
      <div class="d-flex align-items-start justify-content-between gap-2 flex-wrap">
        <div class="min-w-0">
          <div class="fw-bold text-truncate"><i class="bi bi-tag me-1"></i>${esc(pigletTag)}</div>
          <div class="small text-muted">Entries: <b>${points.length}</b></div>
        </div>
        ${
          first && last
            ? `<div class="text-end">
                 <div class="small text-muted">${esc(fmtShortDate(first.x))} → ${esc(fmtShortDate(last.x))}</div>
                 <div class="badge bg-success-subtle text-success border">Δ ${esc(delta)} kg</div>
               </div>`
            : `<div class="small text-muted">No weight summary.</div>`
        }
      </div>

      <div class="mt-3">
        <canvas id="growthChartCanvas" style="width:100%; height:240px;" height="240"></canvas>
      </div>

      <hr class="my-3"/>

      <div class="fw-bold mb-2"><i class="bi bi-exclamation-triangle me-1"></i> Deformities</div>
      ${
        deformities.length
          ? deformities
              .map(
                (d) => `
            <div class="repro-alert-item">
              <div class="fw-semibold">${esc(d.swine_tag)}</div>
              <div class="small text-muted">${esc(d.deformity_types || "N/A")}</div>
            </div>`
              )
              .join("")
          : `<div class="text-success small"><i class="bi bi-check-circle me-1"></i>No deformities found.</div>`
      }
    `;

    ui.drawAreaLineChart("growthChartCanvas", points);
  }

  function renderCyclePanel(sowId, cycleId, keepTabTarget = null) {
    const mount = document.getElementById("cyclePanelMount");
    if (!mount) return;

    const cycles = getCyclesForSowSafe(sowId);
    const cycle = cycles.find((c) => String(c.id) === String(cycleId));
    if (!cycle) {
      mount.innerHTML = `<div class="text-muted small">Cycle not found.</div>`;
      return;
    }

    const piglets = repo.getPigletsForSow(sowId);

    const target = keepTabTarget || getCurrentActiveCycleTabTarget();
    setCycleTabTarget(target);

    const isActive = (t) => String(target) === String(t);
    const tabBtnClass = (t) => `nav-link${isActive(t) ? " active" : ""}`;
    const tabPaneClass = (t) => `tab-pane fade${isActive(t) ? " show active" : ""}`;

    mount.innerHTML = `
      <div class="card repro-subcard shadow-sm border-0">
        <div class="card-body">
          <div class="fw-bold">
            <i class="bi bi-folder2-open me-1"></i> Cycle • ${esc(fmtDate(cycle.date))}
          </div>
          <div class="small text-muted">
            Boar: <b>${esc(cycle.boarCode)}</b> • ${badge(cycle.status)}
          </div>

          <ul class="nav nav-tabs mt-3 repro-tabs" role="tablist">
            <li class="nav-item" role="presentation">
              <button class="${tabBtnClass("#cycleAI")}" data-bs-toggle="tab" data-bs-target="#cycleAI" type="button" role="tab">
                <i class="bi bi-journal-text me-1"></i> Artificial Insemination Record
              </button>
            </li>
            <li class="nav-item" role="presentation">
              <button class="${tabBtnClass("#cyclePerf")}" data-bs-toggle="tab" data-bs-target="#cyclePerf" type="button" role="tab">
                <i class="bi bi-bar-chart-line me-1"></i> Breeding Performance
              </button>
            </li>
            <li class="nav-item" role="presentation">
              <button class="${tabBtnClass("#cycleGrowth")}" data-bs-toggle="tab" data-bs-target="#cycleGrowth" type="button" role="tab">
                <i class="bi bi-graph-up-arrow me-1"></i> Growth Monitoring
              </button>
            </li>
            <li class="nav-item" role="presentation">
              <button class="${tabBtnClass("#cycleSelect")}" data-bs-toggle="tab" data-bs-target="#cycleSelect" type="button" role="tab">
                <i class="bi bi-check2-circle me-1"></i> Selection Process
              </button>
            </li>
          </ul>

          <div class="tab-content pt-3">
            <div class="${tabPaneClass("#cycleAI")}" id="cycleAI" role="tabpanel">
              ${renderCycleAIRecord(sowId, cycle)}
            </div>
            <div class="${tabPaneClass("#cyclePerf")}" id="cyclePerf" role="tabpanel">
              ${renderCyclePerformance(sowId, piglets)}
            </div>
            <div class="${tabPaneClass("#cycleGrowth")}" id="cycleGrowth" role="tabpanel">
              ${renderCycleGrowth(sowId, piglets)}
            </div>
            <div class="${tabPaneClass("#cycleSelect")}" id="cycleSelect" role="tabpanel">
              ${renderCycleSelection(sowId, piglets)}
            </div>
          </div>
        </div>
      </div>
    `;

    if (isActive("#cycleGrowth") && state.growthView === "detail" && state.selectedPigletTagForGrowth) {
      setTimeout(() => renderPigletGrowthDetail(state.selectedPigletTagForGrowth), 0);
    }
    if (isActive("#cycleSelect") && state.selectionView === "detail" && state.selectedPigletTagForSelection) {
      setTimeout(() => renderPigletSelectionDetail(state.selectedPigletTagForSelection), 0);
    }
  }

  // ---------------------------------------------------------
  // Main panel (sow modal content)
  // ---------------------------------------------------------
  function renderSowPanel(sowId, mountEl) {
    const mount = mountEl || state.getPanelMount();
    if (!mount) return;

    const s = repo.store.sowMap.get(sowId);
    if (!s) {
      mount.innerHTML = `<div class="text-muted small">Sow not found.</div>`;
      return;
    }

    const stage = s?.age_stage || s?.current_status || s?.current_stage || "N/A";
    const breed = s?.breed || "N/A";
    const dob = s?.birth_date ? fmtDate(s.birth_date) : "N/A";
    const stats = repo.computeBreedingStatsForSow(sowId);

    // ---------------------------------------------------------
    // Overview extra fields (health, status, measurements)
    // ---------------------------------------------------------
    const sowObj = getSowByIdOrTag(sowId) || s;

    const hs = sowObj?.health_status || "N/A";
    const cs = sowObj?.current_status || sowObj?.current_stage || sowObj?.age_stage || stage || "N/A";
    const parity = Number.isFinite(Number(sowObj?.parity)) ? Number(sowObj.parity) : "N/A";
    const sex = sowObj?.sex ? sexLabel(sowObj.sex) : "N/A";

    const latestPerf = getLatestPerf(sowObj);
    const latestDate = latestPerf?.record_date || latestPerf?.date || latestPerf?.createdAt || null;

    const latestWeight = latestPerf?.weight ?? null;
    const latestBodyLength = latestPerf?.body_length ?? null;
    const latestHeartGirth = latestPerf?.heart_girth ?? null;
    const latestTeat = latestPerf?.teat_count ?? null;
    const latestTeeth = latestPerf?.teeth_count ?? latestPerf?.teeth ?? null;

    mount.innerHTML = `
      <div class="card shadow-sm repro-panel-card border-0">
        <div class="card-body">
          <div class="d-flex align-items-start justify-content-between gap-2 flex-wrap">
            <div class="min-w-0">
              <div class="d-flex align-items-center gap-2">
                <span class="repro-pill lg"><i class="bi bi-heart-pulse"></i></span>
                <div>
                  <h5 class="mb-0 text-truncate">${esc(sowId)}</h5>
                  <div class="small text-muted text-truncate">
                    Stage: <b>${esc(stage)}</b> • Breed: <b>${esc(breed)}</b> • DOB: ${esc(dob)}
                  </div>
                </div>
              </div>
            </div>
            <div class="d-flex gap-2">
              <span class="badge bg-success-subtle text-success border">Alive: <b>${stats.aliveMale + stats.aliveFemale}</b></span>
              <span class="badge bg-danger-subtle text-danger border">Dead: <b>${stats.deceased}</b></span>
            </div>
          </div>

          <hr class="my-3"/>

          <ul class="nav nav-pills repro-pills" role="tablist">
            <li class="nav-item" role="presentation">
              <button class="nav-link active" data-bs-toggle="pill" data-bs-target="#tabOverview" type="button" role="tab">
                <i class="bi bi-clipboard-data me-1"></i> Overview
              </button>
            </li>
            <li class="nav-item" role="presentation">
              <button class="nav-link" data-bs-toggle="pill" data-bs-target="#tabReproduction" type="button" role="tab">
                <i class="bi bi-diagram-3 me-1"></i> Reproduction
              </button>
            </li>
          </ul>

          <div class="tab-content mt-3">
            <div class="tab-pane fade show active" id="tabOverview" role="tabpanel">
              <div class="row g-3">

                <div class="col-12 col-lg-4">
                  <div class="card repro-subcard h-100 shadow-sm border-0">
                    <div class="card-body">
                      <div class="fw-bold mb-2"><i class="bi bi-clipboard-heart me-1"></i> Sow Information</div>

                      <div class="small text-muted">Current Status</div>
                      <div class="fw-semibold">${esc(cs)}</div>

                      <div class="small text-muted mt-2">Health</div>
                      <div class="fw-semibold">${esc(hs)}</div>

                      <div class="small text-muted mt-2">Sex</div>
                      <div class="fw-semibold">${esc(sex)}</div>

                      <div class="small text-muted mt-2">Parity</div>
                      <div class="fw-semibold">${esc(parity)}</div>
                    </div>
                  </div>
                </div>

                <div class="col-12 col-lg-8">
                  <div class="card repro-subcard h-100 shadow-sm border-0">
                    <div class="card-body">
                      <div class="fw-bold mb-2"><i class="bi bi-rulers me-1"></i> Latest Measurements</div>

                      <div class="small text-muted mb-2">
                        Last record: <b>${esc(fmtDate(latestDate))}</b>
                      </div>

                      <div class="row g-2">
                        <div class="col-6 col-md-4">
                          <div class="repro-mini-stat">
                            <div class="small text-muted">Weight</div>
                            <div class="fw-bold">${latestWeight != null ? esc(latestWeight) + " kg" : "N/A"}</div>
                          </div>
                        </div>

                        <div class="col-6 col-md-4">
                          <div class="repro-mini-stat">
                            <div class="small text-muted">Body Length</div>
                            <div class="fw-bold">${latestBodyLength != null ? esc(latestBodyLength) + " cm" : "N/A"}</div>
                          </div>
                        </div>

                        <div class="col-6 col-md-4">
                          <div class="repro-mini-stat">
                            <div class="small text-muted">Heart Girth</div>
                            <div class="fw-bold">${latestHeartGirth != null ? esc(latestHeartGirth) + " cm" : "N/A"}</div>
                          </div>
                        </div>

                        <div class="col-6 col-md-4">
                          <div class="repro-mini-stat">
                            <div class="small text-muted">Teat Count</div>
                            <div class="fw-bold">${latestTeat != null ? esc(latestTeat) : "N/A"}</div>
                          </div>
                        </div>

                        <div class="col-12 col-md-8">
                          <div class="repro-mini-stat">
                            <div class="small text-muted">Teeth</div>
                            <div class="fw-bold">${latestTeeth != null ? esc(latestTeeth) : "N/A"}</div>
                          </div>
                        </div>
                      </div>

                      <div class="text-muted small mt-3">
                        Measurements are pulled from the latest <code>performance_records</code> entry (if available).
                      </div>
                    </div>
                  </div>
                </div>

                <div class="col-12 col-lg-4">
                  <div class="card repro-subcard h-100 shadow-sm border-0">
                    <div class="card-body">
                      <div class="small text-muted mb-1">Piglet Summary</div>
                      <div class="d-flex gap-2 flex-wrap">
                        <span class="badge bg-success-subtle text-success border">Alive Male: <b>${stats.aliveMale}</b></span>
                        <span class="badge bg-success-subtle text-success border">Alive Female: <b>${stats.aliveFemale}</b></span>
                        <span class="badge bg-danger-subtle text-danger border">Dead: <b>${stats.deceased}</b></span>
                      </div>
                      <div class="small text-muted mt-2">
                        Total piglets recorded: <b>${stats.total}</b>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="col-12 col-lg-8">
                  <div class="card repro-subcard h-100 shadow-sm border-0">
                    <div class="card-body">
                      <div class="small text-muted mb-1">Quick Actions</div>
                      <div class="d-flex flex-wrap gap-2">
                        <button class="btn btn-outline-success btn-sm" data-act="jumpRepro">
                          <i class="bi bi-arrow-down-right-circle me-1"></i> View Cycles
                        </button>
                        <button class="btn btn-outline-success btn-sm" data-act="jumpSelection">
                          <i class="bi bi-check2-square me-1"></i> Selection Process
                        </button>
                      </div>
                      <div class="text-muted small mt-2">
                        Use the Reproduction tab to open a cycle and manage piglets.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Single mount for reproduction content -->
            <div class="tab-pane fade" id="tabReproduction" role="tabpanel">
              <div id="reproReproMount"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    renderReproTabInto(mount);
  }

  return {
    // list
    renderListLoading,
    renderListError,
    renderListNoData,
    renderSowCards,

    // cycle
    getCyclesForSowSafe,
    renderReproTabInto,
    renderCyclePanel,

    // sow panel
    renderSowPanel,

    // details
    renderPigletGrowthDetail,
    renderPigletSelectionDetail,

    // expose for controller
    setCycleTabTarget,
  };
}