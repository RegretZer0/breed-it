// overview.breeding.js
import { PerformanceHelper } from "/js/performance_helper.js";

export function initBreedingModule(ctx) {
  const { state } = ctx;

  /* =========================================================
     API HELPERS
  ========================================================= */
  const API_BASE = (ctx.BACKEND_URL || "").replace(/\/$/, "");
  const getToken = () => ctx.token || localStorage.getItem("token") || "";

  async function apiJson(path, opts = {}) {
    const base = (API_BASE || "").replace(/\/$/, "");
    const rel = String(path || "");

    // If BACKEND_URL already contains "/api", don't double it.
    const baseHasApi = /\/api\/?$/i.test(base) || /\/api\//i.test(base);
    const pathHasApi = /^\/?api\//i.test(rel);

    let url = "";
    if (rel.startsWith("http")) {
      url = rel;
    } else {
      let p = rel.startsWith("/") ? rel : `/${rel}`;
      if (baseHasApi && pathHasApi) p = p.replace(/^\/api/i, "");
      url = `${base}${p}`;
    }

    const headers = {
      ...(opts.headers || {}),
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${getToken()}`
    };

    const res = await fetch(url, {
      ...opts,
      headers,
      credentials: opts.credentials || "include" // ✅ ADD THIS
    });

    let data = null;
    try {
      data = await res.json();
    } catch (_) {}

    if (!res.ok) {
      const msg = data?.message || data?.error || `Request failed (${res.status})`;
      console.warn("API ERROR:", res.status, url, msg);
      throw new Error(msg);
    }
    return data;
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

  // ✅ FIX: missing esc() was breaking some renders
  function esc(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  /* =========================================================
     SELECTION HELPERS (suggestion detection + status + UI rules)
  ========================================================= */

  function findSelectionCandidateByTag(tag) {
    const t = normStr(tag);
    if (!t) return null;

    const list = Array.isArray(state.rawSelectionData) ? state.rawSelectionData : [];

    return (
      list.find((x) => {
        const a = normStr(x?.swine_id || x?.swine_tag || x?.tag);
        const b = normStr(x?.swine?.swine_id || x?.swine?.swine_tag || x?.swine?.tag);
        const c = normStr(x?.piglet?.swine_id || x?.piglet?.swine_tag || x?.piglet?.tag);
        const d = normStr(x?.piglet_id || x?.swineId || x?.swineID);
        return a === t || b === t || c === t || d === t;
      }) || null
    );
  }

  function normalizeSuggestionValue(v) {
    const s = normStr(v);
    if (!s) return "";
    const l = s.toLowerCase();

    // Normalize to the two farmer actions where possible
    if (l === "retain" || l.includes("retain") || l.includes("breeding") || l.includes("keep"))
      return "Retain for Breeding";

    if (
      l === "sale" ||
      l.includes("sale") ||
      l.includes("sell") ||
      l.includes("market") ||
      l.includes("cull") ||
      l.includes("culled") ||
      l.includes("culling")
    )
      return "Mark for Sale";

    if (l === "pending") return "Pending";

    return s;
  }

  function getCandidateSuggestion(cand) {
    if (!cand) return "";

    const raw =
      cand?.system_suggestion ||
      cand?.ai_suggestion ||
      cand?.suggestion ||
      cand?.recommendation ||
      cand?.recommended_action ||
      cand?.recommendedAction ||
      cand?.systemSuggestion ||
      cand?.aiSuggestion ||
      cand?.recommend ||
      cand?.prediction ||
      cand?.predicted_action ||
      cand?.meta?.system_suggestion ||
      cand?.meta?.suggestion ||
      cand?.ai?.suggestion ||
      cand?.ai?.recommendation ||
      cand?.model_output?.suggestion ||
      cand?.model_output?.recommendation ||
      cand?.result?.suggestion ||
      cand?.result?.recommendation ||
      cand?.selection?.suggestion ||
      "";

    return normalizeSuggestionValue(raw);
  }

  function getCandidateStatus(cand) {
    if (!cand) return "";
    const raw =
      cand?.selection_status ||
      cand?.final_decision ||
      cand?.decision ||
      cand?.status ||
      cand?.selectionStatus ||
      cand?.finalDecision ||
      cand?.selection?.status ||
      cand?.selection?.decision ||
      "";

    // Some backends return "approved/rejected"
    const r = normLower(raw);
    if (r === "approved") return "Retain for Breeding";
    if (r === "rejected") return "Mark for Sale";

    return normalizeSuggestionValue(raw);
  }

  function normalizeSelection(v) {
    const s = normalizeSuggestionValue(v);
    return s || "Pending";
  }

  function classifySelection(rowOrStatus) {
    const row = rowOrStatus && typeof rowOrStatus === "object" ? rowOrStatus : null;

    const raw =
      (row
        ? (row.selection_status ??
            row.recommendation ??
            row.decision ??
            row.status ??
            row.action ??
            row.result ??
            "")
        : rowOrStatus ?? "") || "";

    const s = String(raw).trim().toLowerCase();

    if (!s) return "pending";

    // ✅ RETAIN keywords (match your other module)
    if (
      s.includes("retain") ||
      s.includes("breeding") ||
      s.includes("keep") ||
      s.includes("selected") ||
      s.includes("for breeding") ||
      s.includes("active") // ✅ counts Active as retain
    ) {
      return "retain";
    }

    // ✅ SALE keywords
    if (
      s.includes("sell") ||
      s.includes("sale") ||
      s.includes("market") ||
      s.includes("culled") ||
      s.includes("cull") ||
      s.includes("sold")
    ) {
      return "sale";
    }

    // ✅ PENDING keywords (explicit)
    if (s.includes("pending") || s.includes("undecided") || s.includes("no decision")) {
      return "pending";
    }

    // fallback
    return "pending";
  }

  function isLockedSelection(v) {
    const cls = classifySelection(v);
    return cls === "retain" || cls === "sale";
  }

  /* =========================================================
   PERFORMANCE HELPER FALLBACK (CLIENT-SIDE SYSTEM SUGGESTION)
  ========================================================= */
  function computeHelperSuggestionForPiglet(piglet) {
    if (!PerformanceHelper || typeof PerformanceHelper.getSelectionStatus !== "function") return "";

    const tag = normStr(piglet?.swine_id || piglet?.swine_tag || piglet?.tag);
    if (!tag) return "";

    // Use analytics morphology as "performance_records"
    const records = getGrowthRecordsForPiglet(piglet);
    const defs = getDeformitiesForPiglet(piglet);

    const perfRecords = records.map((r) => ({
      date: r.date,
      weight: Number.isFinite(r.weight) ? r.weight : 0,
      deformities: defs.length ? defs : ["None"]
    }));

    // ✅ FIX 2: Use ONLY stage (not lifecycle status)
    const stage =
      piglet?.age_stage ||
      piglet?.current_stage ||
      piglet?.growth_stage ||
      "";

    const swine = {
      swine_id: tag,
      swine_tag: tag,
      sex: normStr(piglet?.sex || "").toLowerCase() === "female" ? "Female" : "Male",

      // ✅ CRITICAL FIX
      current_status: stage,
      age_stage: stage,

      performance_records: perfRecords
    };

    // PerformanceHelper also checks global deformity list by swine_tag
    const deformitiesAnalytics = Array.isArray(state.rawPerformanceData?.deformities)
      ? state.rawPerformanceData.deformities
      : [];

    // ✅ FIX 1: prevent false promotion when no real data
    if (!perfRecords.length) {
      return "Continue monitoring and record growth updates";
    }

    const out = PerformanceHelper.getSelectionStatus(swine, deformitiesAnalytics);

    const raw = normStr(out?.suggestion);
    if (!raw) return "";

    const normalized = normalizeSuggestionValue(raw);

    // If helper returns informational message, keep it
    if (normalized === raw && !/retain|sale|sell|market|cull/i.test(raw)) return raw;

    return normalized || raw;
  }

  function enrichPigletsWithSelectionMeta(piglets) {
    const out = Array.isArray(piglets) ? piglets : [];

    out.forEach((p) => {
      const tag = normStr(p?.swine_id || p?.swine_tag || p?.tag);
      const cand = findSelectionCandidateByTag(tag || p?.swine_id);

      // 1) status (persisted decision)
      const st = getCandidateStatus(cand);
      if (st && (!normStr(p?.selection_status) || normLower(p.selection_status) === "pending")) {
        p.selection_status = st;
      }

      // 2) suggestion (prefer backend candidate suggestion)
      const sugFromCand = getCandidateSuggestion(cand);

      // 3) fallback: compute via PerformanceHelper if none found
      const sugFromHelper = sugFromCand ? "" : computeHelperSuggestionForPiglet(p);

      const finalSug = sugFromCand || sugFromHelper || "";

      if (!normStr(p?.system_suggestion) && finalSug) p.system_suggestion = finalSug;
    });

    return out;
  }

  /* =========================================================
     COMPAT / FALLBACK HELPERS
  ========================================================= */
  function isDeadStatusFallback(hs) {
    const s = (hs ?? "").toString().trim().toLowerCase();
    return s === "deceased" || s === "deceased (before weaning)" || s.includes("deceased") || s.includes("dead");
  }

  const isDeadStatus = (hs) =>
    typeof ctx.isDeadStatus === "function" ? !!ctx.isDeadStatus(hs) : isDeadStatusFallback(hs);

  async function ensureAllSwineDataLoaded() {
    if (Array.isArray(state.allSwineData) && state.allSwineData.length) return true;

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

  async function ensurePerformanceAnalyticsLoaded() {
    const hasMorph = Array.isArray(state.rawPerformanceData?.morphology) && state.rawPerformanceData.morphology.length;
    const hasDefs = Array.isArray(state.rawPerformanceData?.deformities) && state.rawPerformanceData.deformities.length;
    if (hasMorph || hasDefs) return true;

    try {
      const resp = await apiJson(`/api/reproduction/performance-analytics`, { method: "GET" });
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

  async function ensureSelectionCandidatesLoaded() {
    if (Array.isArray(state.rawSelectionData) && state.rawSelectionData.length) return true;

    const tryPaths = [
      "/api/reproduction/selection-candidates",
      "/api/reproduction/selectionCandidates",
      "/api/reproduction/selection/candidates",
      "/api/reproduction/get-selection-candidates",
      "/api/selection/candidates",
      "/api/swine/selection-candidates"
    ];

    for (const p of tryPaths) {
      try {
        const resp = await apiJson(p, { method: "GET" });
        const list =
          (Array.isArray(resp?.data) && resp.data) ||
          (Array.isArray(resp?.candidates) && resp.candidates) ||
          (Array.isArray(resp?.selectionCandidates) && resp.selectionCandidates) ||
          (Array.isArray(resp?.items) && resp.items) ||
          (Array.isArray(resp) && resp) ||
          [];

        if (Array.isArray(list)) {
          state.rawSelectionData = list;
          return list.length > 0;
        }
      } catch (e) {
        // keep trying
      }
    }

    console.warn("No selection candidates endpoint matched. state.rawSelectionData remains empty.");
    state.rawSelectionData = [];
    return false;
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
  function deriveSelectionStatusFromSwine(p) {
    const direct =
      p?.selection_status ||
      p?.selectionStatus ||
      p?.selection_decision ||
      p?.selectionDecision ||
      p?.final_selection ||
      p?.finalSelection;

    if (direct) return normStr(direct);

    const st = normLower(p?.current_status || p?.currentStatus || "");
      if (!st) return "Pending";

      // ✅ Treat Active as retained/breeder (common backend value after "breeding" action)
      if (
        st.includes("retain") ||
        st.includes("breeding") ||
        st.includes("breeder") ||
        st === "active" ||
        st.includes("active")
      ) {
        return "Retain for Breeding";
      }

      if (
        st.includes("sale") ||
        st.includes("sold") ||
        st.includes("market") ||
        st.includes("cull") ||
        st.includes("culled")
      ) {
        return "Mark for Sale";
      }

      return "Pending";
    }

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
      current_status: p?.current_status || p?.current_stage || p?.currentStatus,
      age_stage: p?.age_stage || p?.current_stage,

      deformities: p?.deformities || [],
      last_medical: p?.last_medical || null,
      latest_growth: p?.latest_growth || null,

      selection_status: deriveSelectionStatusFromSwine(p),

      // may be empty; will be filled by enrich() using candidates or PerformanceHelper
      system_suggestion: normStr(p?.system_suggestion || p?.suggestion || p?.ai_suggestion || p?.recommendation || "")
    };
  }

  async function fetchPigletsByCycle({ damTag, cycleNumber }) {
    const dam = normStr(damTag);
    const cyc = normStr(cycleNumber);

    async function normalizeList(resp) {
      const raw =
        (Array.isArray(resp?.data) && resp.data) ||
        (Array.isArray(resp?.piglets) && resp.piglets) ||
        (Array.isArray(resp?.swine) && resp.swine) ||
        (Array.isArray(resp?.items) && resp.items) ||
        (Array.isArray(resp) && resp) ||
        [];
      return raw.map(normalizePigletFromApi);
    }

    const q = `dam_id=${encodeURIComponent(dam)}&cycle_number=${encodeURIComponent(cyc)}`;

    const tryPaths = [
      `/api/reproduction/piglets/by-cycle?${q}`,
      `/api/reproduction/piglets-by-cycle?${q}`,
      `/api/reproduction/piglets/cycle?${q}`,
      `/api/reproduction/piglets?${q}`,
      `/api/swine/piglets/by-cycle?${q}`,
      `/api/swine/piglets?${q}`
    ];

    for (const p of tryPaths) {
      try {
        const resp = await apiJson(p, { method: "GET" });
        const list = await normalizeList(resp);
        if (Array.isArray(list)) return list;
      } catch (e) {}
    }

    console.warn("fetchPigletsByCycle: all endpoints failed, falling back to local cache.");

    await ensureAllSwineDataLoaded();
    const all = Array.isArray(state.allSwineData) ? state.allSwineData : [];
    const filtered = all.filter((p) => {
      const damId = normStr(p?.dam_id || p?.mother_id);
      const cno = normStr(p?.birth_cycle_number ?? p?.cycle_number ?? p?.cycle ?? p?.batch_no);
      return damId === dam && cno === cyc;
    });

    return filtered.map(normalizePigletFromApi);
  }

  /* =========================================================
     VIEW HELPERS (HIDE/SHOW UNRELATED FILTERS + PANELS)
  ========================================================= */
  function toggleSowFilter(shouldShow) {
    const explicit = document.getElementById("reproSowFilterCard");
    const form = document.getElementById("reproSowFilterForm");
    const fallbackCard = form?.closest(".card") || form?.closest(".page-card") || null;

    const el = explicit || fallbackCard;
    if (!el) return;

    el.classList.toggle("d-none", !shouldShow);
  }

  function toggleGrowthDetailMode(isDetail) {
    document.getElementById("growthDetailPanel")?.classList.toggle("d-none", !isDetail);
    document.getElementById("growthList")?.classList.toggle("d-none", isDetail);
    document.getElementById("growthPagination")?.classList.toggle("d-none", isDetail);
    document.getElementById("growthSearchInput")?.classList.toggle("d-none", isDetail);

    const tab = document.getElementById("cycleGrowthTab");
    tab?.querySelectorAll("[data-growth-sex]")?.forEach((b) => b.classList.toggle("d-none", isDetail));
    tab?.querySelector(".btn-group[aria-label='Growth sex filter']")?.classList.toggle("d-none", isDetail);
  }

  function toggleSelectionDetailMode(isDetail) {
    document.getElementById("selectionDetailPanel")?.classList.toggle("d-none", !isDetail);
    document.getElementById("selectionList")?.classList.toggle("d-none", isDetail);
    document.getElementById("selectionPagination")?.classList.toggle("d-none", isDetail);
    document.getElementById("selectionSearchInput")?.classList.toggle("d-none", isDetail);

    const tab = document.getElementById("cycleSelectionTab");
    tab?.querySelectorAll(".row.g-3.mb-3")?.forEach((row) => row.classList.toggle("d-none", isDetail));

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
     SHARED: piglet list rendering
  ========================================================= */
  function buildPigletCardRow(p, opts = {}) {
    const tag = p?.swine_id || "—";
    const sex = p?.sex || "—";
    const stage = p?.age_stage || p?.current_status || "—";
    const hs = p?.health_status || "—";

    const aliveBadge = isDeadStatus(hs)
      ? `<span class="badge bg-danger-subtle text-danger">Deceased</span>`
      : `<span class="badge bg-success-subtle text-success">Alive</span>`;

    const extraBadges = opts.badgesHtml || "";

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
              ${extraBadges}
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
    GROWTH DATA + CHART (also used by PerformanceHelper fallback)
  ========================================================= */
  function getGrowthRecordsForPiglet(piglet) {
    const tag = normStr(piglet?.swine_id);

    const records = Array.isArray(state.rawPerformanceData?.morphology)
      ? state.rawPerformanceData.morphology
      : [];

    const filtered = records.filter((r) => {
      const rTag = normStr(r?.swine_id || r?.swine_tag || r?.tag || r?.pig_id);
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
      .filter(
        (x) =>
          x.date &&
          (!Number.isNaN(x.weight) || !Number.isNaN(x.length) || !Number.isNaN(x.girth))
      )
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (!normalized.length && piglet?.latest_growth) {
      const g = piglet.latest_growth;

      const weight = Number(g?.weight ?? g?.weight_kg ?? NaN);

      if (!Number.isNaN(weight) && weight > 0) {
        normalized.push({
          date: g?.date || g?.createdAt || g?.recorded_at || new Date().toISOString(),
          weight: weight,
          length: Number(g?.body_length ?? g?.length ?? NaN),
          girth: Number(g?.heart_girth ?? g?.girth ?? NaN)
        });
      }
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
     SELECTION UPDATE (supports OLD endpoint too)
  ========================================================= */
  async function updateSelectionStatus({ swine_id, swine_db_id, selection_status }) {
    const tag = normStr(swine_id);
    const mongoId = normStr(swine_db_id);

    // Determine action from label
    const s = normLower(selection_status);
    const act = s.includes("retain") || s.includes("breeding") ? "breeding" : "sell";

    const isObjectId = /^[a-f\d]{24}$/i.test(mongoId);
    if (!isObjectId) {
      throw new Error(
        "Missing valid Mongo ObjectId for selection action. " +
          "Pass the piglet Mongo _id (not the tag)."
      );
    }

    // 1) Try piglet-action first (this is what your working module uses)
    try {
      return await apiJson(`/api/reproduction/piglet-action`, {
        method: "POST",
        body: JSON.stringify({ swineId: mongoId, action: act })
      });
    } catch (e1) {
      const msg = String(e1?.message || "");
      const isEnumError =
        /not a valid enum value/i.test(msg) ||
        /validation failed/i.test(msg) ||
        /current_status/i.test(msg);

      if (!isEnumError) throw e1;

      // 2) Fallback: update swine via valid enums (same pattern as your working module)
      const fallbackStatus = act === "breeding" ? "Active" : "Culled/Sold";
      const fallbackAgeStage = act === "breeding" ? "adult" : undefined;

      // 2a) Resolve swine_id from mongo id
      const lookup = await apiJson(`/api/swine/by-mongo-id/${encodeURIComponent(mongoId)}`, { method: "GET" });
      const swineCode = normStr(lookup?.swine?.swine_id);

      if (!swineCode) {
        throw new Error(
          "Selection action hit invalid enum, and fallback lookup failed to resolve swine_id."
        );
      }

      // 2b) Update swine using your swine update route
      const update = await apiJson(`/api/swine/update/${encodeURIComponent(swineCode)}`, {
        method: "PUT",
        body: JSON.stringify({
          current_status: fallbackStatus,
          ...(fallbackAgeStage ? { age_stage: fallbackAgeStage } : {})
        })
      });

      return {
        success: true,
        message: `Fallback applied: ${swineCode} → "${fallbackStatus}"`,
        fallbackUsed: true,
        raw: { lookup, update }
      };
    }
  }

  /* =========================================================
     SOW LIST
  ========================================================= */
  async function renderBreedingPerformance() {
    const wrap = document.getElementById("breedingSowList");
    const kpiWrap = document.getElementById("breedingKpiSection");
    if (!wrap || !kpiWrap) return;

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
      `<option value="">All Cycles</option>` + unique.map((c) => `<option value="${c}">Cycle / Batch ${c}</option>`).join("");
  }

  function renderCycleCards(sow) {
    const wrap = document.getElementById("cycleCardsContainer");
    const pagWrap = document.getElementById("cyclePaginationWrap");
    if (!wrap || !pagWrap) return;

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
     CYCLE DETAIL
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

    await ensureAllSwineDataLoaded();
    await ensurePerformanceAnalyticsLoaded();

    // ✅ CRITICAL FIX: load selection candidates BEFORE enrich()
    await ensureSelectionCandidatesLoaded();

    let piglets = await fetchPigletsByCycle({ damTag: sowTag, cycleNumber: cycleKey });

    if (!Array.isArray(piglets) || piglets.length === 0) {
      const cacheA = Array.isArray(state.allSwineData) ? state.allSwineData : [];
      const cacheB = Array.isArray(state.currentFarmerPigs) ? state.currentFarmerPigs : [];
      const combined = cacheA.length ? cacheA : cacheB;

      const sowId2 = normStr(sow?._id);
      const sowTag2 = normStr(sow?.swine_id);

      let fromCache = combined.filter((p) => {
        const dam = normStr(p?.dam_id || p?.mother_id);
        const cyc = normStr(p?.birth_cycle_number ?? p?.cycle_number ?? p?.cycle ?? p?.batch_no);
        const damMatch = dam && (dam === sowTag2 || dam === sowId2);
        const cycleMatch = cyc && cyc === cycleKey;
        return damMatch && cycleMatch;
      });

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

    // ✅ FIX: ensure selection meta (suggestion/status) is applied before tabs render
    piglets = enrichPigletsWithSelectionMeta(piglets);

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
        <ul class="nav nav-pills nav-sm flex-nowrap gap-2" id="cycleDetailTabs" role="tablist" aria-label="Cycle detail tabs">
          <li class="nav-item"><button type="button" class="nav-link active" data-target="cycleOverviewTab">
            <i class="bi bi-info-circle me-1"></i> Overview
          </button></li>

          <li class="nav-item"><button type="button" class="nav-link" data-target="cycleAiTab">
            <i class="bi bi-journal-text me-1"></i> Artificial Insemination Record
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

    setReproView("DETAIL");

    document.getElementById("cycleDetailTabs")?.addEventListener("click", (e) => {
      const btn = e.target.closest(".nav-link");
      if (!btn) return;

      document.querySelectorAll("#cycleDetailTabs .nav-link").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      document.querySelectorAll(".cycle-tab").forEach((t) => t.classList.add("d-none"));
      const target = btn.dataset.target;
      document.getElementById(target)?.classList.remove("d-none");

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
        // ✅ DO NOT show suggestion/selection pills here
        listEl.innerHTML = items
          .map((p) =>
            buildPigletCardRow(p, {
              badgesHtml: ``,
              button: { className: "btn-view-perf-piglet", icon: "bi-chevron-right", label: "Open" }
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
                    .map((d) => `<span class="badge bg-warning-subtle text-warning border">${esc(d)}</span>`)
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
      toggleGrowthDetailMode(false);

      const filtered = applyFilters(list);
      const { page, pages, items } = paginateList(filtered, uiState.page, pageSize);
      uiState.page = page;

      if (!items.length) {
        listEl.innerHTML = `<div class="text-muted">No piglets match your filters.</div>`;
      } else {
        // ✅ Growth tab: no suggestion/status pills
        listEl.innerHTML = items
          .map((p) =>
            buildPigletCardRow(p, {
              badgesHtml: ``,
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
            <div class="col-12 col-md-3">
              <div class="card border-0 shadow-sm h-100">
                <div class="card-body">
                  <div class="text-muted small">Total in Selection</div>
                  <div class="fs-4 fw-bold" id="selTotalInSelection">0</div>
                </div>
              </div>
            </div>

            <div class="col-12 col-md-3">
              <div class="card border-0 shadow-sm h-100">
                <div class="card-body">
                  <div class="text-muted small">Pending</div>
                  <div class="fs-4 fw-bold" id="selPending">0</div>
                </div>
              </div>
            </div>

            <div class="col-12 col-md-3">
              <div class="card border-0 shadow-sm h-100">
                <div class="card-body">
                  <div class="text-muted small">Retain for Breeding</div>
                  <div class="fs-4 fw-bold" id="selRetainForBreeding">0</div>
                </div>
              </div>
            </div>

            <div class="col-12 col-md-3">
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

  function renderSelectionDetail(piglet) {
    const panel = document.getElementById("selectionDetailPanel");
    if (!panel) return;

    toggleSowFilter(false);
    toggleSelectionDetailMode(true);

    const tag = piglet?.swine_id || "—";
    const sex = piglet?.sex || "—";
    const stage = piglet?.age_stage || piglet?.current_status || "—";
    const selection = normalizeSelection(piglet?.selection_status);

    const cand = findSelectionCandidateByTag(tag);
    const suggestion =
      normStr(piglet?.system_suggestion) ||
      getCandidateSuggestion(cand) ||
      computeHelperSuggestionForPiglet(piglet) ||
      "";

    const locked = isLockedSelection(selection);

    panel.innerHTML = `
      <div class="modal fade" id="selectionOverrideModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Override selection?</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              This piglet already has a saved decision (<b>${esc(selection)}</b>).
              <div class="text-muted small mt-2">Only override if you really need to change the decision.</div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="button" class="btn btn-danger" id="confirmOverrideBtn">
                Yes, override
              </button>
            </div>
          </div>
        </div>
      </div>

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
              Current: <span class="fw-semibold">${esc(selection)}</span>
            </span>
            ${
              suggestion
                ? `<span class="badge bg-info-subtle text-info border">
                    <i class="bi bi-cpu me-1"></i> System Suggestion: <span class="fw-semibold">${esc(suggestion)}</span>
                  </span>`
                : `<span class="badge bg-secondary-subtle text-secondary border">
                    <i class="bi bi-info-circle me-1"></i> No system suggestion found
                  </span>`
            }
          </div>

          ${
            locked
              ? `
                <div class="alert alert-success d-flex align-items-start gap-2" role="alert">
                  <i class="bi bi-shield-check mt-1"></i>
                  <div class="min-w-0">
                    <div class="fw-semibold">Decision already saved.</div>
                    <div class="small">To change this decision, click <b>Override Decision</b>.</div>
                  </div>
                </div>
              `
              : `
                <div class="alert alert-info d-flex align-items-start gap-2" role="alert">
                  <i class="bi bi-info-circle mt-1"></i>
                  <div class="min-w-0">
                    <div class="fw-semibold">No decision yet.</div>
                    <div class="small">Choose one action below to save the selection decision.</div>
                  </div>
                </div>
              `
          }

          <div class="d-flex flex-column flex-md-row gap-2">

            <div class="flex-grow-1">
              <button type="button" class="btn btn-success w-100 selection-btn"
                data-action="retain" id="btnSelRetain" disabled>
                <i class="bi bi-check-circle me-1"></i> Retain for Breeding
              </button>
            </div>

            <!-- 🆕 PENDING -->
            <div class="flex-grow-1">
              <button type="button" class="btn btn-outline-secondary w-100 selection-btn"
                data-action="pending" id="btnSelPending" disabled>
                <i class="bi bi-arrow-counterclockwise me-1"></i> Set to Pending
              </button>
            </div>

            <div class="flex-grow-1">
              <button type="button" class="btn btn-outline-danger w-100 selection-btn"
                data-action="sale" id="btnSelSale" disabled>
                <i class="bi bi-tag-fill me-1"></i> Mark for Sale
              </button>
            </div>

          </div>

          <div class="d-flex justify-content-end mt-2">
            <button type="button" class="btn btn-warning btn-sm" id="btnOverrideDecision">
              <i class="bi bi-unlock me-1"></i> Override Decision
            </button>
          </div>

          <div class="text-muted small mt-3" id="selectionActionHint">
            ${locked ? `Selection is locked to prevent double changes.` : `Actions update selection status for this piglet.`}
          </div>
        </div>
      </div>
    `;

    document.getElementById("closeSelectionDetailBtn")?.addEventListener("click", () => {
      toggleSelectionDetailMode(false);
      toggleSowFilter(state.__reproView === "SOWS");
    });

    // OVERRIDE → unlock buttons
    document.getElementById("btnOverrideDecision")?.addEventListener("click", () => {
      document.querySelectorAll(".selection-btn").forEach(btn => {
        btn.disabled = false;
      });

      const btn = document.getElementById("btnOverrideDecision");
      btn.classList.remove("btn-warning");
      btn.classList.add("btn-success");
      btn.innerHTML = `<i class="bi bi-check-circle me-1"></i> Override Active`;
    });

    // ACTION BUTTONS
    document.querySelectorAll(".selection-btn").forEach(btn => {
      btn.addEventListener("click", async () => {

        const action = btn.dataset.action;

        // PENDING = RESET ONLY (no API)
        if (action === "pending") {
          document.querySelectorAll(".selection-btn").forEach(b => b.disabled = true);
          return;
        }

        let finalStatus = "Pending";
        if (action === "retain") finalStatus = "Retain for Breeding";
        if (action === "sale") finalStatus = "Mark for Sale";

        try {
          await updateSelectionStatus({
            swine_id: piglet.swine_id,
            swine_db_id: piglet._id,
            selection_status: finalStatus
          });

          // lock again after action
          document.querySelectorAll(".selection-btn").forEach(b => b.disabled = true);

          state.__selectionRender?.(true);

        } catch (err) {
          console.error(err);
          alert("Failed to update selection");
        }
      });
    });

    const hint = document.getElementById("selectionActionHint");
    const btnRetain = document.getElementById("btnSelRetain");
    const btnSale = document.getElementById("btnSelSale");
    const btnOverride = document.getElementById("btnOverrideDecision");

    if (locked) {
      if (btnRetain) btnRetain.disabled = true;
      if (btnSale) btnSale.disabled = true;
    }

    function setButtonsEnabled(enabled) {
      if (btnRetain) btnRetain.disabled = !enabled;
      if (btnSale) btnSale.disabled = !enabled;
    }

    btnOverride?.addEventListener("click", () => {
      if (!window.bootstrap) return;
      const modalEl = document.getElementById("selectionOverrideModal");
      if (!modalEl) return;
      const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
      modal.show();
    });

    document.getElementById("confirmOverrideBtn")?.addEventListener("click", () => {
      setButtonsEnabled(true);
      if (hint) hint.textContent = "Override enabled. Choose a new decision.";
      btnOverride?.classList.add("d-none");

      const modalEl = document.getElementById("selectionOverrideModal");
      if (modalEl && window.bootstrap) bootstrap.Modal.getOrCreateInstance(modalEl).hide();
    });

    // Action buttons (ONLY retain/sale)
    panel.querySelectorAll("[data-action]")?.forEach((btn) => {
      btn.addEventListener("click", async () => {
        const action = btn.getAttribute("data-action");
        if (!action) return;

        const nextStatus = action === "retain" ? "Retain for Breeding" : "Mark for Sale";

        // If still locked (safety), do nothing
        if (isLockedSelection(piglet?.selection_status) && (btnRetain?.disabled || btnSale?.disabled)) return;

        // ✅ Resolve a REAL Mongo ObjectId:
        // - prefer piglet._id if it's ObjectId
        // - otherwise pull it from selection-candidates record
        const isObjectId = (v) => /^[a-f\d]{24}$/i.test(String(v || "").trim());

        const cand = findSelectionCandidateByTag(tag);

        const mongoId =
          (isObjectId(piglet?._id) ? String(piglet._id).trim() : "") ||
          (isObjectId(cand?._id) ? String(cand._id).trim() : "") ||
          (isObjectId(cand?.piglet?._id) ? String(cand.piglet._id).trim() : "") ||
          (isObjectId(cand?.swine?._id) ? String(cand.swine._id).trim() : "") ||
          "";

        if (!mongoId) {
          if (hint) {
            hint.textContent =
              "Cannot save decision: missing Mongo _id. " +
              "Ensure selection-candidates includes _id for this piglet (not only swine_tag).";
          }
          return;
        }

        try {
          if (hint) hint.textContent = "Saving selection status...";

          await updateSelectionStatus({
            swine_id: tag,
            swine_db_id: mongoId,
            selection_status: nextStatus
          });

          // ✅ refresh candidates so future renders/KPIs use updated backend state
          await ensureSelectionCandidatesLoaded();

          piglet.selection_status = nextStatus;

          // Update caches
          const all = Array.isArray(state.allSwineData) ? state.allSwineData : [];
          const hit = all.find(
            (x) =>
              String(x?._id || "").trim() === mongoId ||
              normStr(x?.swine_id || x?.swine_tag) === normStr(tag)
          );
          if (hit) hit.selection_status = nextStatus;

          const cand2 = findSelectionCandidateByTag(tag);
          if (cand2) {
            cand2.selection_status = nextStatus;
            // keep id attached so next click always works
            if (!cand2._id && mongoId) cand2._id = mongoId;
          }

          // lock again
          setButtonsEnabled(false);
          if (btnOverride) btnOverride.classList.remove("d-none");
          if (hint) hint.textContent = `Saved: ${nextStatus}. Selection locked to prevent double changes.`;

          // re-render list/kpis
          if (typeof state.__selectionRender === "function") state.__selectionRender(true);

          // refresh detail UI
          renderSelectionDetail(piglet);
        } catch (e) {
          console.warn("updateSelectionStatus failed:", e?.message || e);
          if (hint) hint.textContent = `Failed to update: ${e?.message || "check your route"}`;
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

    function updateKpis(items) {
      // ✅ De-dupe so one piglet doesn’t get counted twice
      // Prefer Mongo _id, fallback to swine_tag/swine_id/tag
      const seen = new Set();
      const unique = [];

      for (const p of items || []) {
        const key = String(p?._id || p?.id || p?.swine_tag || p?.swine_id || p?.tag || "").trim();
        if (key && seen.has(key)) continue;
        if (key) seen.add(key);
        unique.push(p);
      }

      let pending = 0;
      let retain = 0;
      let sale = 0;

      for (const p of unique) {
        const cls = classifySelection(p); // ✅ pass the WHOLE record
        if (cls === "retain") retain++;
        else if (cls === "sale") sale++;
        else pending++;
      }

      const total = unique.length;

      const setKpi = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = String(val);
      };

      setKpi("selTotalInSelection", total);
      setKpi("selPending", pending);            // (your new card)
      setKpi("selRetainForBreeding", retain);
      setKpi("selMarkForSale", sale);
    }
    
    function render(forceKeepPage = false) {
      toggleSelectionDetailMode(false);

      // re-enrich here too, now with PerformanceHelper fallback
      enrichPigletsWithSelectionMeta(list);

      // ALWAYS use FULL list for KPIs
      updateKpis(list);

      // Use filtered list only for display
      const filtered = applyFilters(list);

      if (!forceKeepPage) uiState.page = Number(uiState.page || 1);

      const { page, pages, items } = paginateList(filtered, uiState.page, pageSize);
      uiState.page = page;

      if (!items.length) {
        listEl.innerHTML = `<div class="text-muted">No piglets match your filters.</div>`;
      } else {
        listEl.innerHTML = items
          .map((p) => {
            const sug = normStr(p?.system_suggestion);
            const sel = normalizeSelection(p?.selection_status);

            const sugBadge = sug
              ? `<span class="badge bg-info-subtle text-info border">System Suggestion: ${esc(sug)}</span>`
              : "";
            const selBadge = sel
              ? `<span class="badge bg-success-subtle text-success border">Selection: ${esc(sel)}</span>`
              : "";

            return buildPigletCardRow(p, {
              badgesHtml: `${sugBadge}${selBadge}`,
              button: { className: "btn-selection-open", icon: "bi-chevron-right", label: "Open" }
            });
          })
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

  // Return public API
  return {
    renderBreedingPerformance,
    openSowCycles,
    closeSowDetailView,
    openCycleDetail
  };
}