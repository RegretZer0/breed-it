// overview.breeding.js
export function initBreedingModule(ctx) {
  const { state } = ctx;

  /* =========================================================
     API HELPERS
  ========================================================= */
  const API_BASE = (ctx.BACKEND_URL || "").replace(/\/$/, "");
  const getToken = () => ctx.token || localStorage.getItem("token") || "";

  async function apiJson(path, opts = {}) {
    const url = path.startsWith("http") ? path : `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;

    // IMPORTANT: don't force JSON content-type on GET without body
    const headers = {
      ...(opts.headers || {}),
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${getToken()}`
    };

    const res = await fetch(url, { ...opts, headers });
    let data = null;
    try {
      data = await res.json();
    } catch (_) {
      // ignore non-json
    }
    if (!res.ok) {
      const msg = data?.message || data?.error || `Request failed (${res.status})`;
      throw new Error(msg);
    }
    return data;
  }

  /* =========================================================
     COMPAT / FALLBACK HELPERS (fix "dead/broken" funcs)
  ========================================================= */
  function isDeadStatusFallback(hs) {
    const s = (hs ?? "").toString().trim().toLowerCase();
    // Match your old working logic
    return s === "deceased" || s === "deceased (before weaning)" || s.includes("deceased") || s.includes("dead");
  }

  // Use ctx.isDeadStatus if available; otherwise fallback
  const isDeadStatus = (hs) =>
    typeof ctx.isDeadStatus === "function" ? !!ctx.isDeadStatus(hs) : isDeadStatusFallback(hs);

  // Ensure state.allSwineData exists (your new module relies on this for cycle counts + fallbacks)
  async function ensureAllSwineDataLoaded() {
    if (Array.isArray(state.allSwineData) && state.allSwineData.length) return true;

    // Try the same endpoint used in the old working module
    try {
      const resp = await apiJson(`/api/swine/all`, { method: "GET" });
      const list = resp?.swine || resp?.data || [];
      if (Array.isArray(list)) state.allSwineData = list;
      return Array.isArray(state.allSwineData) && state.allSwineData.length > 0;
    } catch (e) {
      console.warn("ensureAllSwineDataLoaded failed:", e?.message || e);
      return false;
    }
  }

  // Ensure performance analytics data exists for charts/deformities
  async function ensurePerformanceAnalyticsLoaded() {
    const hasMorph = Array.isArray(state.rawPerformanceData?.morphology) && state.rawPerformanceData.morphology.length;
    const hasDefs = Array.isArray(state.rawPerformanceData?.deformities) && state.rawPerformanceData.deformities.length;
    if (hasMorph || hasDefs) return true;

    try {
      const resp = await apiJson(`/api/reproduction/performance-analytics`, { method: "GET" });
      // old: { success, morphology, deformities } — but be flexible
      const morphology = resp?.morphology || resp?.data?.morphology || [];
      const deformities = resp?.deformities || resp?.data?.deformities || [];
      state.rawPerformanceData = state.rawPerformanceData || { morphology: [], deformities: [] };
      if (Array.isArray(morphology)) state.rawPerformanceData.morphology = morphology;
      if (Array.isArray(deformities)) state.rawPerformanceData.deformities = deformities;
      return true;
    } catch (e) {
      console.warn("ensurePerformanceAnalyticsLoaded failed:", e?.message || e);
      state.rawPerformanceData = state.rawPerformanceData || { morphology: [], deformities: [] };
      return false;
    }
  }

  /* =========================================================
     SMALL HELPERS
  ========================================================= */
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
    const sex = normLower(p?.sex || p?.swine_sex);
    const stage = normLower(p?.age_stage || p?.current_stage);
    return sex === "female" && stage.includes("adult");
  }

  function getCycleByNumber(sow, cycleNumber) {
    const cycles = Array.isArray(sow?.breeding_cycles) ? sow.breeding_cycles : [];
    return cycles.find((c) => normStr(c?.cycle_number) === normStr(cycleNumber)) || null;
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

  // Fallback grouping (used only if farrowing_results is missing)
  function groupPigletsByCycleFromCache(sow) {
    const sowTag = normStr(sow?.swine_id || sow?.swine_tag);
    const piglets = (Array.isArray(state.allSwineData) ? state.allSwineData : []).filter(
      (p) => normStr(p?.dam_id || p?.mother_id) === sowTag
    );

    const grouped = {};
    piglets.forEach((p) => {
      const cycle = p.birth_cycle_number ?? p?.cycle_number ?? "Unknown";
      const key = normStr(cycle) || "Unknown";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(p);
    });

    return grouped;
  }

  function computeCycleCounts(sow, cycle) {
    const fr = cycle?.farrowing_results || null;
    const total = Number(fr?.total_piglets ?? NaN);
    const dead = Number(fr?.mortality_count ?? NaN);

    if (Number.isFinite(total) && total >= 0) {
      const d = Number.isFinite(dead) && dead >= 0 ? dead : 0;
      const mortality = total > 0 ? ((d / total) * 100).toFixed(1) : "0.0";
      return { born: total, dead: d, mortality };
    }

    // Fallback: count from cached swine list (requires state.allSwineData)
    const sowTag = normStr(sow?.swine_id || sow?.swine_tag);
    const cycleNumber = cycle?.cycle_number ?? "—";

    const piglets = (Array.isArray(state.allSwineData) ? state.allSwineData : []).filter((p) => {
      const dam = normStr(p?.dam_id || p?.mother_id);
      const cyc = normStr(p?.birth_cycle_number ?? p?.cycle_number);
      return dam === sowTag && cyc === normStr(cycleNumber);
    });

    const born2 = piglets.length;
    const dead2 = piglets.filter((p) => isDeadStatus(p.health_status)).length;
    const mortality2 = born2 > 0 ? ((dead2 / born2) * 100).toFixed(1) : "0.0";
    return { born: born2, dead: dead2, mortality: mortality2 };
  }

  /* =========================================================
     PIGLETS FETCH (ROBUST + BACKEND COMPAT)
  ========================================================= */
  function normalizePigletFromApi(p) {
    const id = p?._id || p?.id || p?.piglet_id || null;
    const tag = p?.swine_tag || p?.swine_id || p?.tag || p?.pig_id || "—";

    return {
      _id: id || tag,
      swine_id: tag,
      sex: p?.sex || p?.swine_sex,
      breed: p?.breed,
      profile_photo: p?.profile_photo,
      birth_date: p?.birth_date,
      dam_id: p?.dam_id || p?.mother_id,
      sire_id: p?.sire_id || p?.father_id,
      birth_cycle_number: p?.birth_cycle_number ?? p?.cycle_number ?? p?.cycle ?? null,
      health_status: p?.health_status,
      current_status: p?.current_status || p?.current_stage,
      age_stage: p?.age_stage || p?.current_stage,
      deformities: p?.deformities || [],
      last_medical: p?.last_medical || null,
      latest_growth: p?.latest_growth || null,
      selection_status: p?.selection_status || "Pending"
    };
  }

  async function fetchPigletsByCycle({ damTag, cycleNumber }) {
    const dam = normStr(damTag);
    const cyc = normStr(cycleNumber);

    async function tryFetch(path) {
      const resp = await apiJson(path, { method: "GET" });
      const raw =
        (Array.isArray(resp?.data) && resp.data) ||
        (Array.isArray(resp?.piglets) && resp.piglets) ||
        (Array.isArray(resp?.swine) && resp.swine) ||
        (Array.isArray(resp) && resp) ||
        [];
      return raw.map(normalizePigletFromApi);
    }

    // 1) Try your new endpoint first
    try {
      const q = `dam_id=${encodeURIComponent(dam)}&cycle_number=${encodeURIComponent(cyc)}`;
      let list = await tryFetch(`/api/reproduction/piglets/by-cycle?${q}`);

      // 2) lenient variant
      if (Array.isArray(list) && list.length === 0) {
        list = await tryFetch(`/api/reproduction/piglets/by-cycle?${q}&include_all=1`);
      }

      if (Array.isArray(list) && list.length) return list;
    } catch (e) {
      console.warn("fetchPigletsByCycle (by-cycle) failed:", e?.message || e);
    }

    // 3) Old-working style fallback: load all swine then filter client-side
    await ensureAllSwineDataLoaded();
    const all = Array.isArray(state.allSwineData) ? state.allSwineData : [];
    const filtered = all.filter((p) => {
      const damId = normStr(p?.dam_id || p?.mother_id);
      const cno = normStr(p?.birth_cycle_number ?? p?.cycle_number);
      return damId === dam && cno === cyc;
    });

    return filtered.map(normalizePigletFromApi);
  }

  /* =========================================================
     VIEW HELPERS (HIDE/SHOW UNRELATED FILTERS + PANELS)
  ========================================================= */

  // Hide/show the SOW filter row (Search Sow Tag / Health Status / Apply / Reset)
  // We DO NOT require an explicit #reproSowFilterCard; we find it safely even if
  // the EJS didn't wrap it with that ID.
  function toggleSowFilter(shouldShow) {
    const explicit = document.getElementById("reproSowFilterCard");

    // fallback: find the card that contains #reproSowFilterForm
    const form = document.getElementById("reproSowFilterForm");
    const fallbackCard = form?.closest(".card") || form?.closest(".page-card") || null;

    const el = explicit || fallbackCard;
    if (!el) return;

    el.classList.toggle("d-none", !shouldShow);
  }

  // In growth/selection piglet "detail", replace content by hiding list/pagination/search controls
  function toggleGrowthDetailMode(isDetail) {
    document.getElementById("growthDetailPanel")?.classList.toggle("d-none", !isDetail);
    document.getElementById("growthList")?.classList.toggle("d-none", isDetail);
    document.getElementById("growthPagination")?.classList.toggle("d-none", isDetail);
    document.getElementById("growthSearchInput")?.classList.toggle("d-none", isDetail);

    // header controls: sex filter buttons live inside cycleGrowthTab; hide them when in detail mode
    const tab = document.getElementById("cycleGrowthTab");
    tab?.querySelectorAll("[data-growth-sex]")?.forEach((b) => b.classList.toggle("d-none", isDetail));
    tab?.querySelector(".btn-group[aria-label='Growth sex filter']")?.classList.toggle("d-none", isDetail);
  }

  function toggleSelectionDetailMode(isDetail) {
    document.getElementById("selectionDetailPanel")?.classList.toggle("d-none", !isDetail);
    document.getElementById("selectionList")?.classList.toggle("d-none", isDetail);
    document.getElementById("selectionPagination")?.classList.toggle("d-none", isDetail);
    document.getElementById("selectionSearchInput")?.classList.toggle("d-none", isDetail);

    // KPIs are useful on list view only
    const tab = document.getElementById("cycleSelectionTab");
    tab?.querySelectorAll("#selTotalInSelection, #selRetainForBreeding, #selMarkForSale")?.forEach((_) => {});
    tab?.querySelectorAll(".row.g-3.mb-3")?.forEach((row) => row.classList.toggle("d-none", isDetail));

    // sex filter buttons hide in detail
    tab?.querySelectorAll("[data-selection-sex]")?.forEach((b) => b.classList.toggle("d-none", isDetail));
    tab?.querySelector(".btn-group[aria-label='Selection sex filter']")?.classList.toggle("d-none", isDetail);
  }

  /* =========================================================
     VIEW STATE FOR REPRO AREA
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

    const cycleFilterCard = document.getElementById("cycleFilterCard");

    // ✅ SOW FILTER visibility:
    // Show only on SOWS view, hide on CYCLES and DETAIL
    toggleSowFilter(mode === "SOWS");

    if (mode === "SOWS") {
      sowList?.classList.remove("d-none");
      kpi?.classList.remove("d-none");
      panel?.classList.add("d-none");

      if (cycleFilterCard) cycleFilterCard.classList.add("d-none");
      return;
    }

    sowList?.classList.add("d-none");
    kpi?.classList.add("d-none");
    panel?.classList.remove("d-none");

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

    if (mode === "CYCLES") {
      cards?.classList.remove("d-none");
      pag?.classList.remove("d-none");
      detail?.classList.add("d-none");
      if (cycleFilterCard) cycleFilterCard.classList.remove("d-none");
    } else if (mode === "DETAIL") {
      cards?.classList.add("d-none");
      pag?.classList.add("d-none");
      detail?.classList.remove("d-none");
      if (cycleFilterCard) cycleFilterCard.classList.add("d-none");
    }
  }

  /* =========================================================
     SHARED: piglet list rendering (1 row = 1 card)
  ========================================================= */
  function buildPigletCardRow(p, opts = {}) {
    const tag = p?.swine_id || "—";
    const sex = p?.sex || "—";
    const stage = p?.age_stage || p?.current_status || "—";
    const hs = p?.health_status || "—";

    const aliveBadge = isDeadStatus(hs)
      ? `<span class="badge bg-danger-subtle text-danger">Deceased</span>`
      : `<span class="badge bg-success-subtle text-success">Alive</span>`;

    const btnHtml = opts.button
      ? `<button type="button" class="btn btn-success btn-sm ${opts.button.className || ""}" data-piglet-id="${normStr(
          p?._id || tag
        )}">
          <i class="bi ${opts.button.icon || "bi-eye"} me-1"></i>${opts.button.label || "Open"}
        </button>`
      : "";

    return `
      <div class="card border-0 shadow-sm mb-3">
        <div class="card-body d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3">
          <div class="min-w-0">
            <div class="fw-semibold text-truncate"><i class="bi bi-tag me-2"></i>${tag}</div>
            <div class="text-muted small text-truncate">${sex} · ${stage}</div>
            <div class="mt-2 d-flex flex-wrap gap-2">
              ${aliveBadge}
              <span class="badge bg-light text-dark border">Status: ${hs}</span>
            </div>
          </div>

          <div class="d-flex align-items-center gap-2 flex-shrink-0">
            ${btnHtml}
          </div>
        </div>
      </div>
    `;
  }

  function paginateList(items, page, pageSize) {
    const total = items.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(Math.max(1, page), pages);
    const start = (safePage - 1) * pageSize;
    return { page: safePage, pages, total, items: items.slice(start, start + pageSize) };
  }

  /* =========================================================
     GROWTH DATA + CHART
  ========================================================= */
  function getGrowthRecordsForPiglet(piglet) {
    const tag = normStr(piglet?.swine_id);

    const records = Array.isArray(state.rawPerformanceData?.morphology) ? state.rawPerformanceData.morphology : [];

    const filtered = records.filter((r) => {
      // old backend uses swine_tag inside morphology payloads sometimes
      const rTag = normStr(r?.swine_id || r?.swine_tag || r?.tag || r?.pig_id);
      // some payloads nest morphology
      const nestedTag = normStr(r?.swine_tag || r?.morphology?.swine_tag || r?.morphology?.swine_id);
      return (rTag && rTag === tag) || (nestedTag && nestedTag === tag);
    });

    const normalized = filtered
      .map((r) => {
        const m = r?.morphology || r;
        return {
          date: m?.date || r?.date || r?.createdAt || r?.recorded_at || r?.record_date || null,
          weight: Number(m?.weight ?? r?.weight ?? r?.weight_kg ?? r?.body_weight ?? NaN),
          length: Number(m?.body_length ?? r?.body_length ?? r?.length ?? NaN),
          girth: Number(m?.heart_girth ?? r?.heart_girth ?? r?.girth ?? NaN)
        };
      })
      .filter((x) => x.date && (!Number.isNaN(x.weight) || !Number.isNaN(x.length) || !Number.isNaN(x.girth)))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (!normalized.length && piglet?.latest_growth) {
      const g = piglet.latest_growth;
      const d = g?.date || g?.createdAt || g?.recorded_at || new Date().toISOString();
      normalized.push({
        date: d,
        weight: Number(g?.weight ?? g?.weight_kg ?? NaN),
        length: Number(g?.body_length ?? g?.length ?? NaN),
        girth: Number(g?.heart_girth ?? g?.girth ?? NaN)
      });
    }

    return normalized;
  }

  function getDeformitiesForPiglet(piglet) {
    const fromPig = Array.isArray(piglet?.deformities) ? piglet.deformities : [];
    const defs = Array.isArray(state.rawPerformanceData?.deformities) ? state.rawPerformanceData.deformities : [];
    const tag = normStr(piglet?.swine_id);

    const fromAnalytics = defs
      .filter((d) => normStr(d?.swine_id || d?.swine_tag || d?.tag || d?.pig_id) === tag)
      .map((d) => d?.deformity || d?.name || d?.type || d?.deformity_types || d)
      .flatMap((x) => (typeof x === "string" ? x.split(",") : [x]))
      .map((x) => normStr(x))
      .filter(Boolean);

    const merged = [...fromPig, ...fromAnalytics].map((x) => normStr(x)).filter(Boolean);
    return Array.from(new Set(merged));
  }

  function destroyChartIfExists(key) {
    const inst = state.__charts?.[key];
    if (inst && typeof inst.destroy === "function") inst.destroy();
    if (state.__charts) delete state.__charts[key];
  }

  function renderGrowthChart(canvasEl, records, chartKey) {
    if (!window.Chart || !canvasEl) return false;

    destroyChartIfExists(chartKey);
    state.__charts = state.__charts || {};

    const labels = records.map((r) => safeDate(r.date));
    const weight = records.map((r) => (Number.isFinite(r.weight) ? r.weight : null));
    const length = records.map((r) => (Number.isFinite(r.length) ? r.length : null));
    const girth = records.map((r) => (Number.isFinite(r.girth) ? r.girth : null));

    const ctx2d = canvasEl.getContext("2d");
    state.__charts[chartKey] = new window.Chart(ctx2d, {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "Weight (kg)", data: weight, tension: 0.35 },
          { label: "Length (cm)", data: length, tension: 0.35 },
          { label: "Girth (cm)", data: girth, tension: 0.35 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true } },
        scales: { y: { beginAtZero: true } }
      }
    });

    return true;
  }

  /* =========================================================
     SELECTION UPDATE (FIXED: supports OLD endpoint too)
  ========================================================= */
  async function updateSelectionStatus({ swine_id, selection_status }) {
    // 1) Try new endpoint (your redesigned module)
    try {
      return await apiJson(`/api/reproduction/selection-status`, {
        method: "PATCH",
        body: JSON.stringify({ swine_id, selection_status })
      });
    } catch (e1) {
      // 2) Backward compatible with old working core:
      // PUT /api/reproduction/process-selection  { swineId, isApproved }
      try {
        const s = normLower(selection_status);
        const isApproved = s.includes("retain") || s.includes("breeding");
        return await apiJson(`/api/reproduction/process-selection`, {
          method: "PUT",
          body: JSON.stringify({ swineId: swine_id, isApproved })
        });
      } catch (e2) {
        // 3) Last-resort guess (some APIs use /api/swine/selection-status)
        return apiJson(`/api/swine/selection-status`, {
          method: "PATCH",
          body: JSON.stringify({ swine_id, selection_status })
        });
      }
    }
  }

  /* =========================================================
     SOW LIST (main reproduction tab list)
  ========================================================= */
  async function renderBreedingPerformance() {
    const wrap = document.getElementById("breedingSowList");
    const kpiWrap = document.getElementById("breedingKpiSection");
    if (!wrap || !kpiWrap) return;

    // Ensure fallback cache is available for counts/piglets if backend lacks farrowing_results
    await ensureAllSwineDataLoaded();

    state.BREEDING_SOWS_PER_PAGE = Number(state.BREEDING_SOWS_PER_PAGE || 6);
    state.breedingSowPage = Number(state.breedingSowPage || 1);

    wrap.innerHTML = "";

    let sows = (Array.isArray(state.currentFarmerPigs) ? state.currentFarmerPigs : []).filter(isFemaleAdult);

    const term = (document.getElementById("reproSowSearch")?.value || "").trim().toLowerCase();
    const health = (document.getElementById("reproSowHealth")?.value || "").trim();

    if (term) sows = sows.filter((s) => (s.swine_id || s.swine_tag || "").toString().toLowerCase().includes(term));
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
          const dead = piglets.filter((p) => isDeadStatus(p.health_status)).length;
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
                <div class="fw-semibold">${sow.swine_id || sow.swine_tag || "—"}</div>
                <span class="badge ${hsBadge}">${hs || "—"}</span>
              </div>

              <div class="small text-muted">
                Breed: ${sow.breed || "Native"} · Stage: ${sow.age_stage || sow.current_stage || "—"}
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

  /* =========================================================
     SOW -> CYCLES VIEW
  ========================================================= */
  function openSowCycles(sowId) {
    const sow = (Array.isArray(state.currentFarmerPigs) ? state.currentFarmerPigs : []).find(
      (p) => (p._id || "").toString() === (sowId || "").toString()
    );
    if (!sow) return;

    state.activeSowForBreeding = sow;
    state.activeCycleForBreeding = null;
    state.breedingCyclePage = 1;
    state.CYCLES_PER_PAGE = Number(state.CYCLES_PER_PAGE || 5);

    const panel = document.getElementById("breedingCyclePanel");
    if (!panel) return;

    panel.classList.remove("d-none");

    panel.innerHTML = `
      <div class="card shadow-sm border-0 mb-3" id="breedingContextBar">
        <div class="card-body py-2 d-flex justify-content-between align-items-center flex-wrap gap-2">
          <div class="d-flex align-items-center gap-2">
            <button type="button" class="btn btn-sm btn-outline-secondary" id="breedingBackBtn">
              <i class="bi bi-arrow-left me-1"></i> Back
            </button>
          </div>

          <div class="fw-semibold min-w-0 text-truncate">
            <i class="bi bi-folder2-open me-2"></i>
            Breeding Cycles — Sow: ${sow.swine_id || sow.swine_tag || "—"}
          </div>

          <div class="d-none d-md-flex align-items-center gap-2" id="breedingContextRight">
            <span class="badge bg-light text-dark border">
              ${sow.breed || "Native"}
            </span>
            <span class="badge bg-light text-dark border">
              ${sow.age_stage || sow.current_stage || "—"}
            </span>
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

    // ✅ Ensure unrelated SOW filter is hidden as soon as cycles view opens
    setReproView("CYCLES");

    document.getElementById("breedingBackBtn")?.addEventListener("click", () => {
      const mode = document.getElementById("breedingBackBtn")?.dataset.mode;
      if (mode === "toCycles") setReproView("CYCLES");
      else closeSowDetailView();
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

  function renderCycleCards(sow) {
    const wrap = document.getElementById("cycleCardsContainer");
    const pagWrap = document.getElementById("cyclePaginationWrap");
    if (!wrap || !pagWrap) return;

    // ✅ Always hide sow filter in cycles view
    setReproView("CYCLES");

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
  }

  /* =========================================================
     CYCLE DETAIL (tabs: overview, AI, performance, growth, selection)
  ========================================================= */
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

    const sowTag = normStr(sow?.swine_id || sow?.swine_tag);
    const cycleKey = normStr(cycleId);

    // Make sure caches exist for robust fallbacks
    await ensureAllSwineDataLoaded();
    await ensurePerformanceAnalyticsLoaded();

    // --- Fetch piglets (API first; then robust fallback) ---
    let piglets = await fetchPigletsByCycle({ damTag: sowTag, cycleNumber: cycleKey });

    // If API failed, or returns empty, fallback to cache lists
    if (!Array.isArray(piglets) || piglets.length === 0) {
      const cacheA = Array.isArray(state.allSwineData) ? state.allSwineData : [];
      const cacheB = Array.isArray(state.currentFarmerPigs) ? state.currentFarmerPigs : [];
      const combined = cacheA.length ? cacheA : cacheB;

      const sowId2 = normStr(sow?._id);
      const sowTag2 = normStr(sow?.swine_id);

      // 1) strict: dam match + cycle match (try multiple keys)
      let fromCache = combined.filter((p) => {
        const dam = normStr(p?.dam_id || p?.mother_id);
        const cyc = normStr(p?.birth_cycle_number ?? p?.cycle_number ?? p?.cycle ?? p?.batch_no);
        const damMatch = dam && (dam === sowTag2 || dam === sowId2);
        const cycleMatch = cyc && cyc === cycleKey;
        return damMatch && cycleMatch;
      });

      // 2) relaxed: dam match only
      if (!fromCache.length) {
        fromCache = combined.filter((p) => {
          const dam = normStr(p?.dam_id || p?.mother_id);
          return dam && (dam === sowTag2 || dam === sowId2);
        });

        fromCache = fromCache.map((p) => ({
          ...p,
          birth_cycle_number: p?.birth_cycle_number ?? p?.cycle_number ?? p?.cycle ?? "Unknown"
        }));
      }

      piglets = fromCache.map(normalizePigletFromApi);
    }

    const born = piglets.length;
    const dead = piglets.filter((p) => isDeadStatus(p?.health_status)).length;
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
                <i class="bi bi-folder2-open me-1"></i> Sow:
                <span class="fw-semibold">${sow.swine_id || sow.swine_tag || "—"}</span>
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
        <!-- ✅ one-row tabs: flex-nowrap + horizontal scroll if needed -->
        <ul class="nav nav-pills nav-sm flex-nowrap gap-2" id="cycleDetailTabs" role="tablist" aria-label="Cycle detail tabs">
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

    // ✅ Hide unrelated sow filter in detail view
    setReproView("DETAIL");

    document.getElementById("cycleDetailTabs")?.addEventListener("click", (e) => {
      const btn = e.target.closest(".nav-link");
      if (!btn) return;

      document.querySelectorAll("#cycleDetailTabs .nav-link").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      document.querySelectorAll(".cycle-tab").forEach((t) => t.classList.add("d-none"));
      const target = btn.dataset.target;
      document.getElementById(target)?.classList.remove("d-none");

      // reset detail modes when switching tabs
      if (target !== "cycleGrowthTab") toggleGrowthDetailMode(false);
      if (target !== "cycleSelectionTab") toggleSelectionDetailMode(false);

      if (target === "cycleGrowthTab" || target === "cycleSelectionTab") {
        ensurePerformanceAnalyticsLoaded();
      }
    });

    bindPerformanceUI(piglets);
    bindGrowthUI(piglets);
    bindSelectionUI(piglets);
  }

  /* =========================================================
     DETAIL TAB BUILDERS
  ========================================================= */
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
              <div class="d-flex justify-content-between py-2 border-bottom"><span class="text-muted">Sow</span><span class="fw-semibold">${sow.swine_id || sow.swine_tag || "—"}</span></div>
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

    const boar = normStr(cycle?.cycle_sire_id || cycle?.sire_id) || "—";
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
              <div class="fw-semibold mb-3">${sow?.swine_id || sow?.swine_tag || "—"}</div>

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
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /* ================= PERFORMANCE TAB (list + pagination) ================= */
  function buildPerformanceTabHtml() {
    return `
      <div class="card border-0 shadow-sm">
        <div class="card-body">
          <div class="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-2 mb-3">
            <div class="min-w-0">
              <div class="fw-semibold"><i class="bi bi-bar-chart-line me-2"></i>Breeding Performance</div>
              <div class="text-muted small">Piglets born in this cycle.</div>
            </div>
          </div>

          <div id="perfPigletList"></div>
          <div id="perfPigletPagination" class="mt-3"></div>
        </div>
      </div>
    `;
  }

  function bindPerformanceUI(piglets) {
    const list = Array.isArray(piglets) ? piglets : [];
    const listEl = document.getElementById("perfPigletList");
    const pagEl = document.getElementById("perfPigletPagination");
    if (!listEl || !pagEl) return;

    const uiState = (state.__perfUI = state.__perfUI || { page: 1 });
    const pageSize = 6;

    function render() {
      const { page, pages, items } = paginateList(list, uiState.page, pageSize);
      uiState.page = page;

      if (!items.length) {
        listEl.innerHTML = `<div class="text-muted">No piglets found in this cycle.</div>`;
      } else {
        listEl.innerHTML = items
          .map((p) =>
            buildPigletCardRow(p, {
              button: { className: "btn-view-perf-piglet", icon: "bi-eye", label: "View" }
            })
          )
          .join("");
      }

      pagEl.innerHTML = `
        <div class="d-flex justify-content-between align-items-center">
          <button type="button" class="btn btn-sm btn-outline-secondary" id="perfPrevBtn">Prev</button>
          <span class="small text-muted">Page ${uiState.page} of ${pages}</span>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="perfNextBtn">Next</button>
        </div>
      `;

      const prev = document.getElementById("perfPrevBtn");
      const next = document.getElementById("perfNextBtn");
      if (prev) prev.disabled = uiState.page <= 1;
      if (next) next.disabled = uiState.page >= pages;

      prev?.addEventListener("click", () => {
        if (uiState.page > 1) {
          uiState.page--;
          render();
        }
      });
      next?.addEventListener("click", () => {
        if (uiState.page < pages) {
          uiState.page++;
          render();
        }
      });
    }

    listEl.onclick = (e) => {
      const btn = e.target.closest(".btn-view-perf-piglet");
      if (!btn) return;

      // ✅ switch tab then open growth detail
      document.querySelector('#cycleDetailTabs [data-target="cycleGrowthTab"]')?.click();

      const pid = btn.dataset.pigletId;
      if (pid) {
        state.__openGrowthPigletId = pid;
        setTimeout(() => {
          document.querySelector(`#growthList .btn-growth-open[data-piglet-id="${CSS.escape(pid)}"]`)?.click();
        }, 60);
      }
    };

    render();
  }

  /* ================= GROWTH TAB (list + details + chart) ================= */
  function buildGrowthTabHtml() {
    return `
      <div class="card border-0 shadow-sm">
        <div class="card-body">

          <div class="d-flex flex-column flex-lg-row justify-content-between align-items-lg-start gap-3 mb-3">
            <div class="min-w-0">
              <div class="fw-semibold"><i class="bi bi-graph-up me-2"></i>Growth Monitoring</div>
              <div class="text-muted small">Select a piglet to view growth records and deformities.</div>
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

          <div id="growthDetailPanel" class="d-none mb-3"></div>

          <div id="growthList"></div>
          <div id="growthPagination" class="mt-3"></div>
        </div>
      </div>
    `;
  }

  function renderGrowthDetail(piglet) {
    const panel = document.getElementById("growthDetailPanel");
    if (!panel) return;

    // ✅ hide unrelated sow filter + replace view (hide list/search/pagination)
    toggleSowFilter(false);
    toggleGrowthDetailMode(true);

    const tag = piglet?.swine_id || "—";
    const sex = piglet?.sex || "—";
    const stage = piglet?.age_stage || piglet?.current_status || "—";

    const records = getGrowthRecordsForPiglet(piglet);
    const defs = getDeformitiesForPiglet(piglet);

    const latest = records.length ? records[records.length - 1] : null;

    panel.innerHTML = `
      <div class="card border-0 shadow-sm">
        <div class="card-body">
          <div class="d-flex flex-column flex-lg-row justify-content-between align-items-lg-start gap-3">
            <div class="min-w-0">
              <div class="fw-semibold"><i class="bi bi-activity me-2"></i>${tag}</div>
              <div class="text-muted small">${sex} · ${stage}</div>
            </div>
            <div class="d-flex gap-2">
              <button type="button" class="btn btn-outline-secondary btn-sm" id="closeGrowthDetailBtn">
                <i class="bi bi-arrow-left me-1"></i> Back
              </button>
            </div>
          </div>

          <hr class="my-3">

          <div class="row g-3 mb-2">
            <div class="col-12 col-md-4">
              <div class="card border-0 shadow-sm h-100">
                <div class="card-body">
                  <div class="text-muted small">Weight (kg)</div>
                  <div class="fs-5 fw-bold">${latest && Number.isFinite(latest.weight) ? latest.weight : "—"}</div>
                </div>
              </div>
            </div>
            <div class="col-12 col-md-4">
              <div class="card border-0 shadow-sm h-100">
                <div class="card-body">
                  <div class="text-muted small">Length (cm)</div>
                  <div class="fs-5 fw-bold">${latest && Number.isFinite(latest.length) ? latest.length : "—"}</div>
                </div>
              </div>
            </div>
            <div class="col-12 col-md-4">
              <div class="card border-0 shadow-sm h-100">
                <div class="card-body">
                  <div class="text-muted small">Girth (cm)</div>
                  <div class="fs-5 fw-bold">${latest && Number.isFinite(latest.girth) ? latest.girth : "—"}</div>
                </div>
              </div>
            </div>
          </div>

          <div class="mt-3">
            <div class="fw-semibold mb-2"><i class="bi bi-graph-up-arrow me-2"></i>Trend</div>
            <div class="border rounded-4 p-2" style="height:260px;">
              <canvas id="growthTrendCanvas"></canvas>
            </div>
            <div class="text-muted small mt-2" id="growthChartHint"></div>
          </div>

          <div class="mt-3 pt-3 border-top">
            <div class="fw-semibold mb-2"><i class="bi bi-exclamation-diamond me-2"></i>Deformities</div>
            ${
              defs.length
                ? `<div class="d-flex flex-wrap gap-2">${defs
                    .map((d) => `<span class="badge bg-warning-subtle text-warning border">${d}</span>`)
                    .join("")}</div>`
                : `<div class="text-muted small">No deformities recorded.</div>`
            }
          </div>
        </div>
      </div>
    `;

    document.getElementById("closeGrowthDetailBtn")?.addEventListener("click", () => {
      destroyChartIfExists(`growth:${tag}`);
      toggleGrowthDetailMode(false);

      // return to current repro view’s sow filter rule
      toggleSowFilter(state.__reproView === "SOWS");
    });

    const canvas = document.getElementById("growthTrendCanvas");
    const hint = document.getElementById("growthChartHint");

    if (!records.length) {
      if (hint) hint.textContent = "No growth records found for this piglet yet.";
      return;
    }

    const ok = renderGrowthChart(canvas, records, `growth:${tag}`);
    if (!ok && hint) {
      hint.innerHTML = `Chart library not detected. If you want graphs, make sure <b>Chart.js</b> is loaded globally.`;
    } else if (hint) {
      hint.textContent = "Weight, length, and girth over time.";
    }
  }

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

      if (uiState.sex !== "all") out = out.filter((p) => normLower(p?.sex) === uiState.sex);

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
      // ✅ ensure list mode visible when rendering list
      toggleGrowthDetailMode(false);

      const filtered = applyFilters(list);
      const { page, pages, items } = paginateList(filtered, uiState.page, pageSize);
      uiState.page = page;

      if (!items.length) {
        listEl.innerHTML = `<div class="text-muted">No piglets match your filters.</div>`;
      } else {
        listEl.innerHTML = items
          .map((p) =>
            buildPigletCardRow(p, {
              button: { className: "btn-growth-open", icon: "bi-graph-up", label: "View Growth" }
            })
          )
          .join("");
      }

      pagEl.innerHTML = `
        <div class="d-flex justify-content-between align-items-center">
          <button type="button" class="btn btn-sm btn-outline-secondary" id="growthPrevBtn">Prev</button>
          <span class="small text-muted">Page ${uiState.page} of ${pages}</span>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="growthNextBtn">Next</button>
        </div>
      `;

      const prev = document.getElementById("growthPrevBtn");
      const next = document.getElementById("growthNextBtn");
      if (prev) prev.disabled = uiState.page <= 1;
      if (next) next.disabled = uiState.page >= pages;

      prev?.addEventListener("click", () => {
        if (uiState.page > 1) {
          uiState.page--;
          render();
        }
      });
      next?.addEventListener("click", () => {
        if (uiState.page < pages) {
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

    listEl.onclick = (e) => {
      const btn = e.target.closest(".btn-growth-open");
      if (!btn) return;
      const pid = btn.dataset.pigletId;

      const piglet = list.find((p) => normStr(p?._id || p?.swine_id) === normStr(pid)) || null;
      if (piglet) renderGrowthDetail(piglet);

      document.getElementById("growthDetailPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

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

    if (state.__openGrowthPigletId) {
      const pid = state.__openGrowthPigletId;
      state.__openGrowthPigletId = null;
      const piglet = list.find((p) => normStr(p?._id || p?.swine_id) === normStr(pid)) || null;
      if (piglet) {
        renderGrowthDetail(piglet);
        document.getElementById("growthDetailPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }

  /* ================= SELECTION TAB (list + details + actions) ================= */
  function buildSelectionTabHtml() {
    return `
      <div class="card border-0 shadow-sm">
        <div class="card-body">
          <div class="d-flex flex-column flex-lg-row justify-content-between align-items-lg-start gap-3 mb-3">
            <div class="min-w-0">
              <div class="fw-semibold"><i class="bi bi-check2-circle me-2"></i>Selection Process</div>
              <div class="text-muted small">Open a piglet to view info and actions.</div>
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

          <div id="selectionDetailPanel" class="d-none mb-3"></div>

          <div id="selectionList"></div>
          <div id="selectionPagination" class="mt-3"></div>
        </div>
      </div>
    `;
  }

  function normalizeSelection(v) {
    const s = normLower(v);
    if (!s) return "Pending";
    return normStr(v);
  }

  function classifySelection(v) {
    const s = normLower(v);
    if (!s || s === "pending") return "in";
    if (s.includes("retain") || s.includes("breeding")) return "retain";
    if (s.includes("sale") || s.includes("cull")) return "sale";
    if (s.includes("selection")) return "in";
    return "in";
  }

  function renderSelectionDetail(piglet) {
    const panel = document.getElementById("selectionDetailPanel");
    if (!panel) return;

    // ✅ hide unrelated sow filter + replace view (hide list/search/pagination/kpis)
    toggleSowFilter(false);
    toggleSelectionDetailMode(true);

    const tag = piglet?.swine_id || "—";
    const sex = piglet?.sex || "—";
    const stage = piglet?.age_stage || piglet?.current_status || "—";
    const selection = normalizeSelection(piglet?.selection_status);

    panel.innerHTML = `
      <div class="card border-0 shadow-sm">
        <div class="card-body">
          <div class="d-flex flex-column flex-lg-row justify-content-between align-items-lg-start gap-3">
            <div class="min-w-0">
              <div class="fw-semibold"><i class="bi bi-tag me-2"></i>${tag}</div>
              <div class="text-muted small">${sex} · ${stage}</div>
            </div>

            <div class="d-flex gap-2">
              <button type="button" class="btn btn-outline-secondary btn-sm" id="closeSelectionDetailBtn">
                <i class="bi bi-arrow-left me-1"></i> Back
              </button>
            </div>
          </div>

          <hr class="my-3">

          <div class="d-flex flex-wrap gap-2 mb-3">
            <span class="badge bg-light text-dark border">
              Current: <span class="fw-semibold">${selection}</span>
            </span>
          </div>

          <div class="row g-2">
            <div class="col-12 col-md-4">
              <button type="button" class="btn btn-success w-100" data-action="retain">
                <i class="bi bi-check-circle me-1"></i> Retain for Breeding
              </button>
            </div>
            <div class="col-12 col-md-4">
              <button type="button" class="btn btn-outline-success w-100" data-action="pending">
                <i class="bi bi-hourglass-split me-1"></i> Set Pending
              </button>
            </div>
            <div class="col-12 col-md-4">
              <button type="button" class="btn btn-outline-danger w-100" data-action="sale">
                <i class="bi bi-tag-fill me-1"></i> Mark for Sale
              </button>
            </div>
          </div>

          <div class="text-muted small mt-3" id="selectionActionHint">
            Actions update selection status for this piglet.
          </div>
        </div>
      </div>
    `;

    document.getElementById("closeSelectionDetailBtn")?.addEventListener("click", () => {
      toggleSelectionDetailMode(false);
      toggleSowFilter(state.__reproView === "SOWS");
    });

    panel.querySelectorAll("[data-action]")?.forEach((btn) => {
      btn.addEventListener("click", async () => {
        const hint = document.getElementById("selectionActionHint");
        const action = btn.getAttribute("data-action");

        const nextStatus =
          action === "retain" ? "Retain for Breeding" : action === "sale" ? "Mark for Sale" : "Pending";

        try {
          if (hint) hint.textContent = "Saving selection status...";
          await updateSelectionStatus({ swine_id: tag, selection_status: nextStatus });
          piglet.selection_status = nextStatus;
          if (hint) hint.textContent = `Updated: ${nextStatus}`;

          if (typeof state.__selectionRender === "function") state.__selectionRender(true);
        } catch (e) {
          console.warn("updateSelectionStatus failed:", e?.message || e);
          if (hint) hint.textContent = `Failed to update (check your route).`;
        }
      });
    });
  }

  function bindSelectionUI(piglets) {
    const list = Array.isArray(piglets) ? piglets : [];
    const listEl = document.getElementById("selectionList");
    const pagEl = document.getElementById("selectionPagination");
    const searchEl = document.getElementById("selectionSearchInput");
    if (!listEl || !pagEl) return;

    const pageSize = 5;
    const uiState = (state.__selectionUI = state.__selectionUI || { sex: "all", q: "", page: 1 });

    function applyFilters(items) {
      let out = items.slice();

      if (uiState.sex !== "all") out = out.filter((p) => normLower(p?.sex) === uiState.sex);

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

    function render(forceKeepPage = false) {
      // ✅ ensure list mode visible when rendering list
      toggleSelectionDetailMode(false);

      const filtered = applyFilters(list);
      updateKpis(filtered);

      if (!forceKeepPage) uiState.page = Number(uiState.page || 1);

      const { page, pages, items } = paginateList(filtered, uiState.page, pageSize);
      uiState.page = page;

      if (!items.length) {
        listEl.innerHTML = `<div class="text-muted">No piglets match your filters.</div>`;
      } else {
        listEl.innerHTML = items
          .map((p) =>
            buildPigletCardRow(p, {
              button: { className: "btn-selection-open", icon: "bi-chevron-right", label: "Open" }
            })
          )
          .join("");
      }

      pagEl.innerHTML = `
        <div class="d-flex justify-content-between align-items-center">
          <button type="button" class="btn btn-sm btn-outline-secondary" id="selectionPrevBtn">Prev</button>
          <span class="small text-muted">Page ${uiState.page} of ${pages}</span>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="selectionNextBtn">Next</button>
        </div>
      `;

      const prev = document.getElementById("selectionPrevBtn");
      const next = document.getElementById("selectionNextBtn");
      if (prev) prev.disabled = uiState.page <= 1;
      if (next) next.disabled = uiState.page >= pages;

      prev?.addEventListener("click", () => {
        if (uiState.page > 1) {
          uiState.page--;
          render(true);
        }
      });

      next?.addEventListener("click", () => {
        if (uiState.page < pages) {
          uiState.page++;
          render(true);
        }
      });
    }

    // expose render so selection actions can refresh reliably
    state.__selectionRender = (keepPage) => render(!!keepPage);

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

    listEl.onclick = (e) => {
      const btn = e.target.closest(".btn-selection-open");
      if (!btn) return;
      const pid = btn.dataset.pigletId;

      const piglet = list.find((p) => normStr(p?._id || p?.swine_id) === normStr(pid)) || null;
      if (piglet) renderSelectionDetail(piglet);

      document.getElementById("selectionDetailPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

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