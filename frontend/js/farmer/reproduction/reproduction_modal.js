// /js/farmer/reproduction/reproduction_modal.js
export function initReproModal(helpers) {
  const {
    apiGet,
    safeLower,
    safeText,
    fmtDate,
    computeAgeText,
    normalizeHealth,
    getSwineTag,
    badgeForStage,
    badgeForHealth,
    buildPhotoUrlFromPath,
    pick,
  } = helpers;

  /* =========================
     MODAL REFS (DETAILS)
  ========================= */
  const pigDetailsModalEl = document.getElementById("pigDetailsModal");
  const pigDetailsTitle = document.getElementById("pigDetailsTitle");
  const pigDetailsSub = document.getElementById("pigDetailsSub");
  const pigDetailsStatusBadge = document.getElementById("pigDetailsStatusBadge");

  // top tab
  const tabReproduction = document.getElementById("tabReproduction");

  // inner reveal
  const reproInnerTabsWrap = document.getElementById("reproInnerTabsWrap");
  const reproInnerPlaceholder = document.getElementById("reproInnerPlaceholder");
  const reproCloseCyclePanelBtn = document.getElementById("reproCloseCyclePanelBtn");

  // profile
  const profilePhotoImg = document.getElementById("profilePhotoImg");
  const profilePhotoFallback = document.getElementById("profilePhotoFallback");
  const profileBadges = document.getElementById("profileBadges");
  const profileTag = document.getElementById("profileTag");
  const profileBreed = document.getElementById("profileBreed");
  const profileSexEl = document.getElementById("profileSex");
  const profileAgeStage = document.getElementById("profileAgeStage");
  const profileStatus = document.getElementById("profileStatus");
  const profileHealth = document.getElementById("profileHealth");
  const profileAge = document.getElementById("profileAge");
  const profileBirthDate = document.getElementById("profileBirthDate");

  // cycles
  const aiCycleSelect = document.getElementById("aiCycleSelect");
  const aiRefreshBtn = document.getElementById("aiRefreshBtn");
  const aiCycleCards = document.getElementById("aiCycleCards");
  const aiEmpty = document.getElementById("aiEmpty");

  // ai analysis
  const aiAnalysisStatusBadge = document.getElementById("aiAnalysisStatusBadge");
  const aiAnalysisPlaceholder = document.getElementById("aiAnalysisPlaceholder");
  const aiAnalysisContent = document.getElementById("aiAnalysisContent");

  const aiCycleLabel = document.getElementById("aiCycleLabel");
  const aiDateStarted = document.getElementById("aiDateStarted");
  const aiSowMetrics = document.getElementById("aiSowMetrics");
  const aiPeriodStage = document.getElementById("aiPeriodStage");

  const aiBoarTag = document.getElementById("aiBoarTag");
  const aiBoarBreed = document.getElementById("aiBoarBreed");
  const aiBoarBatch = document.getElementById("aiBoarBatch");
  const aiDate = document.getElementById("aiDate");

  // piglets growth tab host (existing ID)
  const pigletsGrowthTableHost =
    document.getElementById("pigletsGrowthTableHost") ||
    document.getElementById("pigletsGrowthRecordsList") ||
    document.getElementById("pigletsGrowthList") ||
    null;

  const pigletsGrowthEmpty =
    document.getElementById("pigletsGrowthEmpty") ||
    document.getElementById("pigletsGrowthRecordsEmpty") ||
    null;

  const pigletsGrowthRefreshBtn =
    document.getElementById("pigletsGrowthRefreshBtn") ||
    document.getElementById("pigletsGrowthRecordsRefreshBtn") ||
    null;

  // health tab host (new safe IDs)
  const pigletsHealthHost = document.getElementById("pigletsHealthHost") || null;
  const pigletsHealthEmpty = document.getElementById("pigletsHealthEmpty") || null;
  const pigletsHealthRefreshBtn = document.getElementById("pigletsHealthRefreshBtn") || null;

  const hasBootstrap = typeof window.bootstrap !== "undefined" && !!window.bootstrap?.Modal;
  const bsModal = pigDetailsModalEl && hasBootstrap ? window.bootstrap.Modal.getOrCreateInstance(pigDetailsModalEl) : null;

  /* =========================
     MODAL STATE
  ========================= */
  let currentSwine = null;
  let currentSwineId = null;
  let currentSwineTag = null;

  // cycles cache
  let aiLoadedForSwineId = null;
  let aiRecordsRaw = [];
  let aiHistoryCache = null;
  let aiAllCache = null;

  // selected cycle state
  let currentCycleKey = null;     // "Cycle 1" or "1" etc
  let currentCycleNumber = null;  // number when resolvable

  // piglets caches per cycle
  let pigletsLoadedKey = null;
  let pigletsCache = [];

  /* =========================
     SHOW/HIDE INNER DETAILS
  ========================= */
  function hideReproInner() {
    reproInnerTabsWrap?.classList.add("d-none");
    reproInnerPlaceholder?.classList.remove("d-none");

    aiAnalysisStatusBadge?.classList.add("d-none");
    aiAnalysisPlaceholder?.classList.remove("d-none");
    aiAnalysisContent?.classList.add("d-none");

    // reset cycle selection state
    currentCycleKey = null;
    currentCycleNumber = null;
    pigletsLoadedKey = null;
    pigletsCache = [];

    resetPigletsGrowthUI();
    resetPigletsHealthUI();
  }

  function showReproInner() {
    reproInnerTabsWrap?.classList.remove("d-none");
    reproInnerPlaceholder?.classList.add("d-none");
  }

  /* =========================
     FALLBACK MODAL (non-bootstrap)
  ========================= */
  function showModalFallback() {
    if (!pigDetailsModalEl) return;
    pigDetailsModalEl.classList.add("show");
    pigDetailsModalEl.style.display = "block";
    pigDetailsModalEl.removeAttribute("aria-hidden");
    document.body.classList.add("modal-open");
    document.body.style.overflow = "hidden";

    let bd = document.getElementById("reproFallbackBackdrop");
    if (!bd) {
      bd = document.createElement("div");
      bd.id = "reproFallbackBackdrop";
      bd.className = "modal-backdrop fade show";
      document.body.appendChild(bd);
    }
  }

  function hideModalFallback() {
    if (!pigDetailsModalEl) return;
    pigDetailsModalEl.classList.remove("show");
    pigDetailsModalEl.style.display = "none";
    pigDetailsModalEl.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    document.body.style.overflow = "";
    document.getElementById("reproFallbackBackdrop")?.remove();
  }

  document.addEventListener("click", (e) => {
    if (!pigDetailsModalEl) return;
    if (bsModal) return;
    const closeBtn = e.target.closest('[data-bs-dismiss="modal"], .btn-close');
    if (closeBtn) hideModalFallback();
  });

  /* =========================
     PROFILE RENDER
  ========================= */
  function setBadge(text, cls) {
    return `<span class="badge rounded-pill ${cls}">${safeText(text)}</span>`;
  }

  function renderProfile(sw, meta = {}) {
    if (!sw) return;

    const tag = meta.tag || getSwineTag(sw);
    const breed = meta.breed || sw.breed || "Native";
    const sex = meta.sex || sw.sex || "—";
    const ageStage = meta.ageStage || sw.age_stage || "—";
    const stage = meta.stage || sw.current_status || "—";
    const healthStatus = meta.healthStatus || sw.health_status || "—";
    const age = computeAgeText(sw);
    const birthDate = sw.birth_date || sw.birthDate || sw.dob || sw.birthdate || meta.birth_date || "";

    if (pigDetailsTitle) pigDetailsTitle.textContent = `Pig Analysis: ${safeText(tag)}`;
    if (pigDetailsSub) pigDetailsSub.textContent = `${safeText(breed)} · ${safeText(sex)} · ${safeText(ageStage)} · Status: ${safeText(stage)}`;

    if (pigDetailsStatusBadge) {
      pigDetailsStatusBadge.classList.remove(
        "d-none",
        "text-bg-success",
        "text-bg-danger",
        "text-bg-secondary",
        "text-bg-info",
        "text-bg-warning"
      );
      const hs = safeLower(healthStatus);
      if (hs.includes("dead") || hs.includes("deceased")) {
        pigDetailsStatusBadge.classList.add("text-bg-danger");
        pigDetailsStatusBadge.textContent = "Deceased";
      } else if (hs.includes("healthy") || hs.includes("alive") || hs.includes("sick")) {
        pigDetailsStatusBadge.classList.add("text-bg-success");
        pigDetailsStatusBadge.textContent = safeText(healthStatus) || "Alive";
      } else {
        pigDetailsStatusBadge.classList.add("text-bg-secondary");
        pigDetailsStatusBadge.textContent = "Unknown";
      }
      pigDetailsStatusBadge.classList.remove("d-none");
    }

    profileTag && (profileTag.textContent = safeText(tag));
    profileBreed && (profileBreed.textContent = safeText(breed));
    profileSexEl && (profileSexEl.textContent = safeText(sex));
    profileAgeStage && (profileAgeStage.textContent = safeText(ageStage));
    profileStatus && (profileStatus.textContent = safeText(stage));
    profileHealth && (profileHealth.textContent = safeText(healthStatus));
    profileAge && (profileAge.textContent = safeText(age));
    profileBirthDate && (profileBirthDate.textContent = birthDate ? fmtDate(birthDate) : "—");

    if (profileBadges) {
      const healthNorm = normalizeHealth({ health_status: healthStatus });
      const b1 = setBadge(stage, badgeForStage(stage));
      const b2 = setBadge(healthNorm === "dead" ? "Dead" : "Alive", badgeForHealth(healthNorm));
      profileBadges.innerHTML = `${b1} ${b2}`;
    }

    const photoUrl = buildPhotoUrlFromPath(meta.profile_photo || sw.profile_photo);
    if (profilePhotoImg && profilePhotoFallback) {
      if (photoUrl) {
        profilePhotoImg.src = photoUrl;
        profilePhotoImg.classList.remove("d-none");
        profilePhotoFallback.classList.add("d-none");
      } else {
        profilePhotoImg.src = "";
        profilePhotoImg.classList.add("d-none");
        profilePhotoFallback.classList.remove("d-none");
      }
    }
  }

  /* =========================
     AI CYCLES
  ========================= */
  function resolveBoarFromAny(rec) {
    const boarObj = rec?.male_swine || rec?.boar || rec?.boar_info || rec?.boarInfo || null;

    const boarTag =
      pick(rec, ["boar_tag", "boarTag"], null) ||
      pick(boarObj, ["swine_id", "swineId", "tag"], null) ||
      (typeof rec?.male_swine_id === "string" ? rec.male_swine_id : null) ||
      pick(rec?.male_swine_id, ["swine_id", "swineId", "tag"], null) ||
      null;

    const boarBreed =
      pick(rec, ["boar_breed", "boarBreed"], null) ||
      pick(boarObj, ["breed"], null) ||
      pick(rec?.male_swine_id, ["breed"], null) ||
      null;

    const boarBatch =
      pick(rec, ["batch_id", "batchId", "source_id", "sourceId", "semen_batch", "semenBatch"], null) ||
      pick(boarObj, ["batch", "batch_id", "source_id"], null) ||
      null;

    return { boarTag, boarBreed, boarBatch };
  }

  function parseCycleNumberFromLabel(cycleLabelOrKey) {
    const raw = safeText(cycleLabelOrKey || "").trim();
    // Accept: "Cycle 1", "1", "Cycle: 2", "cycle_3"
    const m = raw.match(/(\d+)/);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  }

  function normalizeAIRecord(rec) {
    const id = pick(rec, ["_id", "id", "record_id", "recordId"], null);

    const cycle =
      pick(rec, ["cycle", "cycle_no", "cycleNo", "cycle_number", "cycleNumber"], null) ||
      pick(rec?.heat_report_id, ["breeding_cycle_number"], null) ||
      pick(rec, ["breeding_cycle_number"], null) ||
      "Cycle";

    const cycleLabel = typeof cycle === "number" ? `Cycle ${cycle}` : (cycle?.toString?.() || "Cycle");
    const cycleNumber = typeof cycle === "number" ? cycle : parseCycleNumberFromLabel(cycleLabel);

    const dateStarted =
      pick(rec, ["date_started", "dateStarted", "cycle_start", "cycleStart", "start_date", "startDate"], null) ||
      pick(rec, ["ai_confirmed_at"], null) ||
      pick(rec, ["insemination_date", "date"], null) ||
      pick(rec, ["createdAt"], null);

    const statusRaw = safeLower(pick(rec, ["status"], ""));
    const status =
      statusRaw.includes("complete") ? "completed" :
      statusRaw.includes("ongoing") ? "ongoing" :
      statusRaw.includes("active") ? "ongoing" :
      statusRaw ? statusRaw : "ongoing";

    const aiDateVal =
      pick(rec, ["ai_date", "aiDate", "insemination_date", "inseminationDate", "date"], null) ||
      pick(rec, ["ai_confirmed_at"], null);

    const weight = pick(rec, ["weight", "sow_weight", "sowWeight"], null);
    const length = pick(rec, ["length", "sow_length", "sowLength"], null);
    const girth = pick(rec, ["girth", "sow_girth", "sowGirth"], null);
    const stagePeriod = pick(rec, ["stage", "stage_during", "stageDuring", "current_stage", "currentStage"], null);

    const boar = resolveBoarFromAny(rec);

    return {
      id,
      cycleKey: safeText(cycle),
      cycleLabel,
      cycleNumber,
      dateStarted,
      status,
      aiDate: aiDateVal,
      sow: { weight, length, girth, stagePeriod },
      boar: { boarTag: boar.boarTag, boarBreed: boar.boarBreed, boarBatch: boar.boarBatch },
      raw: rec,
    };
  }

  async function fetchAIHistoryAll() {
    if (aiHistoryCache) return aiHistoryCache;
    const data = await apiGet(`/api/reproduction/ai-history`);
    const arr = data && data.success && Array.isArray(data.data) ? data.data : [];
    aiHistoryCache = arr;
    return arr;
  }

  async function fetchAIAllManager() {
    if (aiAllCache) return aiAllCache;
    const data = await apiGet(`/api/ai/all`);
    const arr =
      (data && data.success && Array.isArray(data.aiRecords) && data.aiRecords) ||
      (data && data.success && Array.isArray(data.records) && data.records) ||
      [];
    aiAllCache = arr;
    return arr;
  }

  async function fetchAIRecords(swMongoId, swTag) {
    const hist = await fetchAIHistoryAll();
    if (hist.length) {
      const filtered = hist.filter((r) => safeLower(r?.sow_tag) === safeLower(swTag));
      if (filtered.length) return filtered;
    }

    const all = await fetchAIAllManager();
    if (all.length) {
      const filtered = all.filter((r) => {
        const pop = r?.swine_id;
        const tagFromPop = pop?.swine_id;
        const idFromPop = pop?._id;

        if (swMongoId && idFromPop && safeText(idFromPop) === safeText(swMongoId)) return true;
        if (swTag && tagFromPop && safeLower(tagFromPop) === safeLower(swTag)) return true;
        return false;
      });
      if (filtered.length) return filtered;
    }

    const candidates = [
      `/api/swine/${swMongoId}/ai`,
      `/api/ai-records/swine/${swMongoId}`,
      `/api/ai/swine/${swMongoId}`,
      `/api/breeding/ai/swine/${swMongoId}`,
      `/api/ai-records/${swMongoId}`,
      `/api/ai/${swMongoId}`,
    ];

    for (const path of candidates) {
      const data = await apiGet(path);
      if (!data) continue;

      const arr =
        (Array.isArray(data.records) && data.records) ||
        (Array.isArray(data.aiRecords) && data.aiRecords) ||
        (Array.isArray(data.data) && data.data) ||
        (Array.isArray(data.items) && data.items) ||
        (Array.isArray(data.ai) && data.ai) ||
        (Array.isArray(data) && data) ||
        null;

      if (arr) return arr;
    }

    return [];
  }

  function buildStatusBadge(status) {
    const s = safeLower(status);
    if (s.includes("complete")) return { cls: "text-bg-secondary", text: "Completed" };
    if (s.includes("success")) return { cls: "text-bg-success", text: "Success" };
    if (s.includes("failed")) return { cls: "text-bg-danger", text: "Failed" };
    if (s.includes("ongoing") || s.includes("active")) return { cls: "text-bg-success", text: "Ongoing" };
    return { cls: "text-bg-secondary", text: safeText(status || "Ongoing") };
  }

  function renderAICycleSelect(records) {
    if (!aiCycleSelect) return;
    const unique = new Map();
    for (const r of records) unique.set(r.cycleKey, r.cycleLabel);

    const opts = [`<option value="">All cycles</option>`].concat(
      [...unique.entries()].map(([k, label]) => `<option value="${encodeURIComponent(k)}">${safeText(label)}</option>`)
    );

    aiCycleSelect.innerHTML = opts.join("");
  }

  function renderAICycleCards(records, cycleKeyFilter = "") {
    if (!aiCycleCards || !aiEmpty) return;

    const filterKey = cycleKeyFilter ? decodeURIComponent(cycleKeyFilter) : "";
    const list = filterKey ? records.filter((r) => r.cycleKey === filterKey) : records;

    aiCycleCards.innerHTML = "";

    if (!list.length) {
      aiEmpty.classList.remove("d-none");
      aiCycleCards.classList.add("d-none");
      return;
    }

    aiEmpty.classList.add("d-none");
    aiCycleCards.classList.remove("d-none");

    aiCycleCards.innerHTML = list
      .map((r) => {
        const b = buildStatusBadge(r.status);
        const subtitle = [
          `Started: <b>${fmtDate(r.dateStarted)}</b>`,
          r.aiDate ? `AI Date: <b>${fmtDate(r.aiDate)}</b>` : null,
          r.boar?.boarTag ? `Boar: <b>${safeText(r.boar.boarTag)}</b>` : null,
        ].filter(Boolean).join(" · ");

        return `
          <div class="card border-0 shadow-sm ai-cycle-card">
            <div class="card-body">
              <div class="d-flex align-items-start justify-content-between gap-2">
                <div class="min-w-0">
                  <div class="fw-bold d-flex align-items-center gap-2">
                    <i class="bi bi-layers"></i>
                    <span class="text-truncate">${safeText(r.cycleLabel)}</span>
                  </div>
                  <div class="small text-muted mt-1">${subtitle || "—"}</div>
                </div>

                <span class="badge rounded-pill ${b.cls}">${b.text}</span>
              </div>

              <div class="d-flex justify-content-end mt-3">
                <button
                  class="btn btn-success btn-sm"
                  type="button"
                  data-action="ai-analyze"
                  data-id="${encodeURIComponent(r.id || "")}"
                  data-cycle="${encodeURIComponent(r.cycleKey)}"
                >
                  <i class="bi bi-eye me-1"></i>Open Cycle
                </button>
              </div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function setAIAnalysis(record) {
    if (!record) return;

    if (aiAnalysisStatusBadge) {
      const b = buildStatusBadge(record.status);
      aiAnalysisStatusBadge.className = `badge rounded-pill ${b.cls}`;
      aiAnalysisStatusBadge.textContent = b.text;
      aiAnalysisStatusBadge.classList.remove("d-none");
    }

    aiAnalysisPlaceholder?.classList.add("d-none");
    aiAnalysisContent?.classList.remove("d-none");

    aiCycleLabel && (aiCycleLabel.textContent = safeText(record.cycleLabel));
    aiDateStarted && (aiDateStarted.textContent = fmtDate(record.dateStarted));

    const w = record.sow?.weight != null ? `${record.sow.weight} kg` : "—";
    const l = record.sow?.length != null ? `${record.sow.length} cm` : "—";
    const g = record.sow?.girth != null ? `${record.sow.girth} cm` : "—";
    aiSowMetrics && (aiSowMetrics.textContent = `Weight: ${w} · Length: ${l} · Girth: ${g}`);

    aiPeriodStage && (aiPeriodStage.textContent = safeText(record.sow?.stagePeriod || "—"));

    aiBoarTag && (aiBoarTag.textContent = safeText(record.boar?.boarTag || "—"));
    aiBoarBreed && (aiBoarBreed.textContent = safeText(record.boar?.boarBreed || "—"));
    aiBoarBatch && (aiBoarBatch.textContent = safeText(record.boar?.boarBatch || "—"));
    aiDate && (aiDate.textContent = fmtDate(record.aiDate));
  }

  function resetAIUI() {
    aiRecordsRaw = [];
    if (aiCycleSelect) aiCycleSelect.innerHTML = `<option value="">All cycles</option>`;
    if (aiCycleCards) {
      aiCycleCards.innerHTML =
        `<div class="card border-0 shadow-sm"><div class="card-body text-muted small">Loading cycles...</div></div>`;
    }
    aiEmpty?.classList.add("d-none");

    aiAnalysisStatusBadge?.classList.add("d-none");
    aiAnalysisPlaceholder?.classList.remove("d-none");
    aiAnalysisContent?.classList.add("d-none");
  }

  async function loadAIForCurrentSwine(force = false) {
    if (!currentSwineId) return;
    if (!force && aiLoadedForSwineId === currentSwineId) return;

    resetAIUI();
    hideReproInner();

    const swTag = currentSwineTag || getSwineTag(currentSwine || {});
    const raw = await fetchAIRecords(currentSwineId, swTag);
    const normalized = (Array.isArray(raw) ? raw : []).map(normalizeAIRecord);

    normalized.sort((a, b) => {
      const da = new Date(a.dateStarted || a.aiDate || 0).getTime();
      const db = new Date(b.dateStarted || b.aiDate || 0).getTime();
      return db - da;
    });

    aiRecordsRaw = normalized;
    aiLoadedForSwineId = currentSwineId;

    renderAICycleSelect(aiRecordsRaw);
    renderAICycleCards(aiRecordsRaw, aiCycleSelect?.value || "");
  }

  /* =========================
     PIGLETS BY CYCLE
     Uses new route: GET /api/piglets/by-cycle?damTag=...&cycleNumber=...
  ========================= */
  function resetPigletsGrowthUI() {
    if (!pigletsGrowthTableHost) return;
    pigletsGrowthEmpty?.classList.add("d-none");
    pigletsGrowthTableHost.innerHTML = `<div class="text-muted small">Select a cycle to load piglets...</div>`;
  }

  function resetPigletsHealthUI() {
    if (!pigletsHealthHost) return;
    pigletsHealthEmpty?.classList.add("d-none");
    pigletsHealthHost.innerHTML = `<div class="text-muted small">Select a cycle to load piglets...</div>`;
  }

  async function fetchPigletsForCycle(damTag, cycleNumber) {
    if (!damTag || !cycleNumber) return [];
    const url = `/api/piglets/by-cycle?damTag=${encodeURIComponent(damTag)}&cycleNumber=${encodeURIComponent(cycleNumber)}`;
    const data = await apiGet(url);
    if (!data || !data.success) return [];
    return Array.isArray(data.piglets) ? data.piglets : [];
  }

  function getLatestPerf(piglet) {
    const arr = Array.isArray(piglet?.performance_records) ? piglet.performance_records : [];
    if (!arr.length) return null;
    return arr[arr.length - 1] || null;
  }

  function renderPigletsGrowthCards(piglets) {
    if (!pigletsGrowthTableHost) return;

    const list = Array.isArray(piglets) ? piglets : [];
    if (!list.length) {
      pigletsGrowthEmpty?.classList.remove("d-none");
      pigletsGrowthTableHost.innerHTML = "";
      return;
    }

    pigletsGrowthEmpty?.classList.add("d-none");

    pigletsGrowthTableHost.innerHTML = `
      <div class="row g-3">
        ${list.map((p) => {
          const tag = safeText(p.swine_id || "—");
          const photo = buildPhotoUrlFromPath(p.profile_photo);
          const perf = getLatestPerf(p);

          const weight = perf?.weight != null ? `${perf.weight} kg` : "—";
          const len = perf?.body_length != null ? `${perf.body_length} cm` : "—";
          const girth = perf?.heart_girth != null ? `${perf.heart_girth} cm` : "—";
          const recDate = perf?.record_date ? fmtDate(perf.record_date) : "—";

          return `
            <div class="col-12 col-md-6 col-xl-4">
              <div class="card piglet-card border-0 shadow-sm h-100">
                <div class="card-body">
                  <div class="d-flex align-items-start gap-3">
                    <div class="piglet-avatar flex-shrink-0">
                      ${
                        photo
                          ? `<img src="${photo}" alt="Piglet Photo" class="piglet-avatar-img">`
                          : `<div class="piglet-avatar-fallback"><i class="bi bi-piggy-bank"></i></div>`
                      }
                    </div>

                    <div class="min-w-0 flex-grow-1">
                      <div class="d-flex align-items-start justify-content-between gap-2">
                        <div class="min-w-0">
                          <div class="piglet-title text-truncate">${tag}</div>
                          <div class="piglet-sub small text-muted text-truncate">
                            Latest record: ${recDate}
                          </div>
                        </div>
                        <span class="badge rounded-pill text-bg-light piglet-stage-pill">
                          ${safeText(p.current_status || "—")}
                        </span>
                      </div>

                      <div class="piglet-metrics mt-3">
                        <div class="piglet-metric">
                          <div class="k">Weight</div>
                          <div class="v">${weight}</div>
                        </div>
                        <div class="piglet-metric">
                          <div class="k">Length</div>
                          <div class="v">${len}</div>
                        </div>
                        <div class="piglet-metric">
                          <div class="k">Girth</div>
                          <div class="v">${girth}</div>
                        </div>
                      </div>

                    </div>
                  </div>
                </div>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderPigletsHealthCards(piglets) {
    if (!pigletsHealthHost) return;

    const list = Array.isArray(piglets) ? piglets : [];
    if (!list.length) {
      pigletsHealthEmpty?.classList.remove("d-none");
      pigletsHealthHost.innerHTML = "";
      return;
    }

    pigletsHealthEmpty?.classList.add("d-none");

    pigletsHealthHost.innerHTML = `
      <div class="row g-3">
        ${list.map((p) => {
          const tag = safeText(p.swine_id || "—");
          const photo = buildPhotoUrlFromPath(p.profile_photo);
          const health = safeText(p.health_status || "—");
          const healthNorm = normalizeHealth({ health_status: health });
          const healthCls = healthNorm === "dead" ? "text-bg-danger" : (healthNorm === "alive" ? "text-bg-success" : "text-bg-secondary");

          const perf = getLatestPerf(p);
          const deformities = Array.isArray(perf?.deformities) ? perf.deformities.filter(Boolean) : [];
          const defText = deformities.length ? deformities.join(", ") : "None";
          const leg = perf?.leg_conformation ? safeText(perf.leg_conformation) : "—";
          const teatCount = perf?.teat_count != null ? `${perf.teat_count}` : "—";
          const teatAlign = perf?.teat_alignment ? safeText(perf.teat_alignment) : "—";

          const hasDef = deformities.some((d) => safeLower(d) !== "none");
          const defBadge = hasDef ? "text-bg-warning" : "text-bg-success";
          const defLabel = hasDef ? "Has Defect" : "No Defect";

          return `
            <div class="col-12 col-md-6 col-xl-4">
              <div class="card piglet-card border-0 shadow-sm h-100">
                <div class="card-body">
                  <div class="d-flex align-items-start gap-3">
                    <div class="piglet-avatar flex-shrink-0">
                      ${
                        photo
                          ? `<img src="${photo}" alt="Piglet Photo" class="piglet-avatar-img">`
                          : `<div class="piglet-avatar-fallback"><i class="bi bi-piggy-bank"></i></div>`
                      }
                    </div>

                    <div class="min-w-0 flex-grow-1">
                      <div class="d-flex align-items-start justify-content-between gap-2">
                        <div class="min-w-0">
                          <div class="piglet-title text-truncate">${tag}</div>
                          <div class="small text-muted text-truncate">
                            Stage: ${safeText(p.current_status || "—")}
                          </div>
                        </div>

                        <div class="d-flex flex-wrap gap-2 justify-content-end">
                          <span class="badge rounded-pill ${healthCls}">${healthNorm === "dead" ? "Deceased" : safeText(health)}</span>
                          <span class="badge rounded-pill ${defBadge}">${defLabel}</span>
                        </div>
                      </div>

                      <div class="piglet-health mt-3">
                        <div class="repro-kv repro-kv-compact">
                          <div class="repro-kv-label">Deformities</div>
                          <div class="repro-kv-value">${safeText(defText)}</div>
                        </div>

                        <div class="repro-kv-grid repro-kv-grid-compact mt-2">
                          <div class="repro-kv repro-kv-compact">
                            <div class="repro-kv-label">Leg</div>
                            <div class="repro-kv-value">${leg}</div>
                          </div>
                          <div class="repro-kv repro-kv-compact">
                            <div class="repro-kv-label">Teat Count</div>
                            <div class="repro-kv-value">${teatCount}</div>
                          </div>
                          <div class="repro-kv repro-kv-compact">
                            <div class="repro-kv-label">Teat Alignment</div>
                            <div class="repro-kv-value">${teatAlign}</div>
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>
                </div>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  async function loadPigletsForCurrentCycle(force = false) {
    const damTag = currentSwineTag || getSwineTag(currentSwine || {});
    if (!damTag) return;
    if (!currentCycleNumber) return;

    const key = `${damTag}::${currentCycleNumber}`;
    if (!force && pigletsLoadedKey === key) {
      renderPigletsGrowthCards(pigletsCache);
      renderPigletsHealthCards(pigletsCache);
      return;
    }

    pigletsLoadedKey = key;
    resetPigletsGrowthUI();
    resetPigletsHealthUI();

    const piglets = await fetchPigletsForCycle(damTag, currentCycleNumber);
    pigletsCache = piglets;

    renderPigletsGrowthCards(pigletsCache);
    renderPigletsHealthCards(pigletsCache);
  }

  /* =========================
     OPEN DETAILS MODAL
  ========================= */
  function openDetailsModal(payloadStr) {
    let data = null;
    try {
      data = JSON.parse(decodeURIComponent(payloadStr));
    } catch (e) {
      console.error("Invalid payload", e);
      return;
    }

    currentSwine = data?.raw || null;
    currentSwineId = data?.mongoId || currentSwine?._id || null;
    currentSwineTag = data?.tag || getSwineTag(currentSwine || {});

    aiLoadedForSwineId = null;

    hideReproInner();
    resetPigletsGrowthUI();
    resetPigletsHealthUI();

    renderProfile(currentSwine || {}, data);

    if (bsModal) bsModal.show();
    else showModalFallback();
  }

  /* =========================
     EVENTS
  ========================= */
  aiCycleSelect?.addEventListener("change", () => {
    renderAICycleCards(aiRecordsRaw, aiCycleSelect.value || "");
    hideReproInner();
  });

  aiRefreshBtn?.addEventListener("click", () => {
    aiHistoryCache = null;
    aiAllCache = null;
    loadAIForCurrentSwine(true);
  });

  // Open a cycle: reveal inner tabs + set analysis + load piglets for that cycle
  aiCycleCards?.addEventListener("click", async (e) => {
    const btn = e.target.closest('button[data-action="ai-analyze"]');
    if (!btn) return;

    const cycleKey = btn.getAttribute("data-cycle") ? decodeURIComponent(btn.getAttribute("data-cycle")) : "";
    const id = btn.getAttribute("data-id") ? decodeURIComponent(btn.getAttribute("data-id")) : "";

    let rec = null;
    if (id) rec = aiRecordsRaw.find((r) => safeText(r.id) === id) || null;
    if (!rec && cycleKey) rec = aiRecordsRaw.find((r) => r.cycleKey === cycleKey) || null;
    if (!rec) rec = aiRecordsRaw[0] || null;
    if (!rec) return;

    currentCycleKey = rec.cycleKey || cycleKey || null;
    currentCycleNumber = rec.cycleNumber || parseCycleNumberFromLabel(rec.cycleLabel) || parseCycleNumberFromLabel(rec.cycleKey) || null;

    showReproInner();
    setAIAnalysis(rec);

    // load piglets for this cycle (cards)
    await loadPigletsForCurrentCycle(true);

    // activate AI tab by default
    document.getElementById("tabAI")?.click();
  });

  // Close details panel
  reproCloseCyclePanelBtn?.addEventListener("click", () => {
    hideReproInner();
    // scroll modal body to top of details section for clarity
    try {
      document.getElementById("reproInnerPlaceholder")?.scrollIntoView({ block: "nearest" });
    } catch (_) {}
  });

  // Piglets refresh (growth)
  pigletsGrowthRefreshBtn?.addEventListener("click", () => loadPigletsForCurrentCycle(true));

  // Health refresh
  pigletsHealthRefreshBtn?.addEventListener("click", () => loadPigletsForCurrentCycle(true));

  // Load cycles when reproduction tab is opened
  tabReproduction?.addEventListener("shown.bs.tab", () => loadAIForCurrentSwine(false));
  tabReproduction?.addEventListener("click", () => setTimeout(() => loadAIForCurrentSwine(false), 120));

  // If user switches to Piglets/Health tabs after opening a cycle
  document.getElementById("tabPiglets")?.addEventListener("shown.bs.tab", () => loadPigletsForCurrentCycle(false));
  document.getElementById("tabHealth")?.addEventListener("shown.bs.tab", () => loadPigletsForCurrentCycle(false));

  return {
    openDetailsModal,
    onModalStateChanged: () => {},
  };
}