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

  // =========================
  // MODAL REFS (DETAILS)
  // =========================
  const pigDetailsModalEl = document.getElementById("pigDetailsModal");
  const pigDetailsTitle = document.getElementById("pigDetailsTitle");
  const pigDetailsSub = document.getElementById("pigDetailsSub");
  const pigDetailsStatusBadge = document.getElementById("pigDetailsStatusBadge");

  // TOP tabs
  const tabReproduction = document.getElementById("tabReproduction");

  // Repro panels wrap (NEW)
  const reproCyclesPanelsWrap = document.getElementById("reproCyclesPanelsWrap");
  const reproCycleDetailsPanel = document.getElementById("reproCycleDetailsPanel");

  // Close cycle button (NEW)
  const reproCloseCycleBtn = document.getElementById("reproCloseCycleBtn");

  // Repro inner reveal
  const reproInnerTabsWrap = document.getElementById("reproInnerTabsWrap");
  const reproInnerPlaceholder = document.getElementById("reproInnerPlaceholder");

  // Profile tab
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

  // AI (Cycles)
  const aiCycleSelect = document.getElementById("aiCycleSelect");
  const aiRefreshBtn = document.getElementById("aiRefreshBtn");
  const aiCycleCards = document.getElementById("aiCycleCards");
  const aiEmpty = document.getElementById("aiEmpty");

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

  // Piglets Growth Records (defensive)
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

  const hasBootstrap = typeof window.bootstrap !== "undefined" && !!window.bootstrap?.Modal;
  const bsModal = pigDetailsModalEl && hasBootstrap ? window.bootstrap.Modal.getOrCreateInstance(pigDetailsModalEl) : null;

  // =========================
  // MODAL STATE
  // =========================
  let currentSwine = null;
  let currentSwineId = null;
  let currentSwineTag = null;

  // AI cache
  let aiLoadedForSwineId = null;
  let aiRecordsRaw = [];
  let aiHistoryCache = null;
  let aiAllCache = null;

  // Piglets growth cache
  let pigletsGrowthLoadedForSwineId = null;
  let pigletsGrowthCacheAll = null;

  // =========================
  // VIEW MODE HELPERS (Panels vs Solo Cycle)
  // =========================
  function setSoloCycleMode(isSolo) {
    if (!pigDetailsModalEl) return;
    pigDetailsModalEl.classList.toggle("repro-solo-cycle", !!isSolo);

    // optional: keep scroll sane
    try {
      const body = pigDetailsModalEl.querySelector(".repro-modal-body");
      if (body) body.scrollTop = 0;
    } catch (_) {}
  }

  function showCyclesPanels() {
    setSoloCycleMode(false);
  }

  function showCycleDetailsOnly() {
    setSoloCycleMode(true);
  }

  // =========================
  // SHOW/HIDE INNER DETAILS
  // =========================
  function hideReproInner() {
    reproInnerTabsWrap?.classList.add("d-none");
    reproInnerPlaceholder?.classList.remove("d-none");

    aiAnalysisStatusBadge?.classList.add("d-none");
    aiAnalysisPlaceholder?.classList.remove("d-none");
    aiAnalysisContent?.classList.add("d-none");
  }

  function showReproInner() {
    reproInnerTabsWrap?.classList.remove("d-none");
    reproInnerPlaceholder?.classList.add("d-none");
  }

  // =========================
  // MODAL FALLBACK
  // =========================
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

  // =========================
  // PROFILE RENDER
  // =========================
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

  // =========================
  // AI TAB (Cycles)
  // =========================
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

  function normalizeAIRecord(rec) {
    const id = pick(rec, ["_id", "id", "record_id", "recordId"], null);

    const cycle =
      pick(rec, ["cycle", "cycle_no", "cycleNo", "cycle_number", "cycleNumber"], null) ||
      pick(rec?.heat_report_id, ["breeding_cycle_number"], null) ||
      pick(rec, ["breeding_cycle_number"], null) ||
      "Cycle";

    const cycleLabel = typeof cycle === "number" ? `Cycle ${cycle}` : (cycle?.toString?.() || "Cycle");

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
    if (s.includes("ongoing") || s.includes("active")) return { cls: "text-bg-success", text: "Ongoing" };
    return { cls: "text-bg-info", text: safeText(status || "Ongoing") };
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

        const subtitleParts = [
          `Started: <b>${fmtDate(r.dateStarted)}</b>`,
          r.aiDate ? `AI Date: <b>${fmtDate(r.aiDate)}</b>` : null,
          r.boar?.boarTag ? `Boar: <b>${safeText(r.boar.boarTag)}</b>` : null,
        ].filter(Boolean);

        return `
          <div class="card border-0 shadow-sm ai-cycle-card">
            <div class="card-body">
              <div class="d-flex align-items-start justify-content-between gap-2">
                <div class="min-w-0">
                  <div class="fw-bold d-flex align-items-center gap-2">
                    <i class="bi bi-layers"></i>
                    <span class="text-truncate">${safeText(r.cycleLabel)}</span>
                  </div>

                  <div class="repro-cycle-subtitle">
                    ${subtitleParts.map((x) => `<span>${x}</span>`).join("")}
                  </div>
                </div>

                <span class="badge rounded-pill ${b.cls}">${b.text}</span>
              </div>

              <div class="repro-cycle-cta">
                <button
                  class="btn btn-success btn-sm"
                  type="button"
                  data-action="ai-analyze"
                  data-id="${encodeURIComponent(r.id || "")}"
                  data-cycle="${encodeURIComponent(r.cycleKey)}"
                >
                  <i class="bi bi-graph-up me-1"></i>Open Cycle
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
    showCyclesPanels(); // always start in panels view when loading

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

  // =========================
  // PIGLETS GROWTH TAB (unchanged)
  // =========================
  function normalizeGrowthRow(r) {
    const pigletTag =
      pick(r, ["piglet_tag", "pigletTag", "piglet_id", "pigletId", "swine_id", "swineId", "tag"], null) ||
      pick(r?.piglet, ["swine_id", "tag", "piglet_tag"], null) ||
      "—";

    const recordDate = pick(r, ["record_date", "recordDate", "date", "measured_at", "measuredAt", "createdAt"], null);
    const ageDays = pick(r, ["age_days", "ageDays", "days_old", "daysOld"], null);
    const weight = pick(r, ["weight", "weight_kg", "weightKg"], null);
    const length = pick(r, ["length", "length_cm", "lengthCm"], null);
    const girth = pick(r, ["girth", "girth_cm", "girthCm"], null);
    const remarks = pick(r, ["remarks", "note", "notes", "comment"], "");

    return {
      pigletTag: safeText(pigletTag),
      recordDate,
      ageDays,
      weight,
      length,
      girth,
      remarks: safeText(remarks || "—"),
      raw: r,
    };
  }

  async function fetchPigletsGrowthAllMaybe() {
    if (pigletsGrowthCacheAll) return pigletsGrowthCacheAll;

    const candidatesAll = [
      `/api/piglets-growth/all`,
      `/api/piglets/growth/all`,
      `/api/growth-records/all`,
      `/api/piglet-growth/all`,
    ];

    for (const path of candidatesAll) {
      const data = await apiGet(path);
      if (!data) continue;

      const arr =
        (data.success && Array.isArray(data.records) && data.records) ||
        (data.success && Array.isArray(data.data) && data.data) ||
        (Array.isArray(data.records) && data.records) ||
        (Array.isArray(data.data) && data.data) ||
        (Array.isArray(data.items) && data.items) ||
        (Array.isArray(data) && data) ||
        null;

      if (arr) {
        pigletsGrowthCacheAll = arr;
        return arr;
      }
    }

    pigletsGrowthCacheAll = [];
    return [];
  }

  async function fetchPigletsGrowthForSow(swMongoId, swTag) {
    const candidates = [
      `/api/piglets-growth/sow/${swMongoId}`,
      `/api/piglets-growth/swine/${swMongoId}`,
      `/api/piglets/growth/sow/${swMongoId}`,
      `/api/piglets/growth/swine/${swMongoId}`,
      `/api/growth-records/sow/${swMongoId}`,
      `/api/growth-records/swine/${swMongoId}`,
      `/api/piglet-growth/sow/${swMongoId}`,
      `/api/piglet-growth/swine/${swMongoId}`,
      `/api/piglets-growth?sow_tag=${encodeURIComponent(swTag || "")}`,
      `/api/piglets/growth?sow_tag=${encodeURIComponent(swTag || "")}`,
      `/api/growth-records?sow_tag=${encodeURIComponent(swTag || "")}`,
    ];

    for (const path of candidates) {
      const data = await apiGet(path);
      if (!data) continue;

      const arr =
        (data.success && Array.isArray(data.records) && data.records) ||
        (data.success && Array.isArray(data.data) && data.data) ||
        (Array.isArray(data.records) && data.records) ||
        (Array.isArray(data.data) && data.data) ||
        (Array.isArray(data.items) && data.items) ||
        (Array.isArray(data) && data) ||
        null;

      if (arr) return arr;
    }

    const all = await fetchPigletsGrowthAllMaybe();
    if (!all.length) return [];

    const filtered = all.filter((r) => {
      const sowTag =
        pick(r, ["sow_tag", "sowTag"], null) ||
        pick(r?.sow, ["swine_id", "tag"], null) ||
        pick(r, ["mother_tag", "motherTag"], null) ||
        null;

      const sowId =
        pick(r, ["sow_id", "sowId", "mother_id", "motherId"], null) ||
        pick(r?.sow, ["_id", "id"], null) ||
        null;

      if (swMongoId && sowId && safeText(sowId) === safeText(swMongoId)) return true;
      if (swTag && sowTag && safeLower(sowTag) === safeLower(swTag)) return true;
      return false;
    });

    return filtered;
  }

  function renderPigletsGrowth(records) {
    if (!pigletsGrowthTableHost) return;

    const rows = (Array.isArray(records) ? records : []).map(normalizeGrowthRow);

    if (!rows.length) {
      pigletsGrowthEmpty?.classList.remove("d-none");
      pigletsGrowthTableHost.innerHTML = `
        <div class="card border-0 shadow-sm">
          <div class="card-body text-muted small">
            No piglets growth records found for this sow.
          </div>
        </div>
      `;
      return;
    }

    pigletsGrowthEmpty?.classList.add("d-none");

    rows.sort((a, b) => {
      const da = new Date(a.recordDate || 0).getTime();
      const db = new Date(b.recordDate || 0).getTime();
      return db - da;
    });

    pigletsGrowthTableHost.innerHTML = `
      <div class="card border-0 shadow-sm">
        <div class="card-body">
          <div class="d-flex align-items-center justify-content-between gap-2 mb-3">
            <div class="fw-bold">
              <i class="bi bi-bar-chart-line me-2"></i>Piglets Growth Records
            </div>
            <button class="btn btn-outline-success btn-sm" type="button" id="pigletsGrowthRefreshBtnInline">
              <i class="bi bi-arrow-clockwise me-1"></i>Refresh
            </button>
          </div>

          <div class="table-responsive">
            <table class="table table-sm align-middle mb-0">
              <thead class="table-light">
                <tr>
                  <th>Piglet Tag</th>
                  <th>Record Date</th>
                  <th class="text-nowrap">Age (days)</th>
                  <th class="text-nowrap">Weight</th>
                  <th class="text-nowrap">Length</th>
                  <th class="text-nowrap">Girth</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map((r) => `
                  <tr>
                    <td class="fw-semibold">${safeText(r.pigletTag)}</td>
                    <td>${fmtDate(r.recordDate)}</td>
                    <td>${r.ageDays ?? "—"}</td>
                    <td>${r.weight != null ? `${r.weight}` : "—"}</td>
                    <td>${r.length != null ? `${r.length}` : "—"}</td>
                    <td>${r.girth != null ? `${r.girth}` : "—"}</td>
                    <td class="text-muted">${safeText(r.remarks)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>

          <div class="small text-muted mt-3">
            Showing <b>${rows.length}</b> record(s).
          </div>
        </div>
      </div>
    `;

    document.getElementById("pigletsGrowthRefreshBtnInline")?.addEventListener("click", () => {
      pigletsGrowthCacheAll = null;
      loadPigletsGrowthForCurrentSwine(true);
    });
  }

  function resetPigletsGrowthUI() {
    if (!pigletsGrowthTableHost) return;
    pigletsGrowthEmpty?.classList.add("d-none");
    pigletsGrowthTableHost.innerHTML = `
      <div class="card border-0 shadow-sm">
        <div class="card-body text-muted small">
          Loading piglets growth records...
        </div>
      </div>
    `;
  }

  async function loadPigletsGrowthForCurrentSwine(force = false) {
    if (!currentSwineId) return;
    if (!pigletsGrowthTableHost) return;
    if (!force && pigletsGrowthLoadedForSwineId === currentSwineId) return;

    resetPigletsGrowthUI();

    const swTag = currentSwineTag || getSwineTag(currentSwine || {});
    const raw = await fetchPigletsGrowthForSow(currentSwineId, swTag);

    pigletsGrowthLoadedForSwineId = currentSwineId;
    renderPigletsGrowth(raw || []);
  }

  // =========================
  // OPEN DETAILS MODAL
  // =========================
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
    pigletsGrowthLoadedForSwineId = null;

    hideReproInner();
    showCyclesPanels(); // start with panels visible

    renderProfile(currentSwine || {}, data);

    if (bsModal) bsModal.show();
    else showModalFallback();
  }

  // =========================
  // EVENTS (Cycles + Inner reveal)
  // =========================
  aiCycleSelect?.addEventListener("change", () => {
    renderAICycleCards(aiRecordsRaw, aiCycleSelect.value || "");
    hideReproInner();
    showCyclesPanels();
  });

  aiRefreshBtn?.addEventListener("click", () => {
    aiHistoryCache = null;
    aiAllCache = null;
    loadAIForCurrentSwine(true);
  });

  // Open cycle -> show only cycle details panel
  aiCycleCards?.addEventListener("click", (e) => {
    const btn = e.target.closest('button[data-action="ai-analyze"]');
    if (!btn) return;

    const cycleKey = btn.getAttribute("data-cycle") ? decodeURIComponent(btn.getAttribute("data-cycle")) : "";
    const id = btn.getAttribute("data-id") ? decodeURIComponent(btn.getAttribute("data-id")) : "";

    let rec = null;
    if (id) rec = aiRecordsRaw.find((r) => safeText(r.id) === id) || null;
    if (!rec && cycleKey) rec = aiRecordsRaw.find((r) => r.cycleKey === cycleKey) || null;
    if (!rec) rec = aiRecordsRaw[0] || null;
    if (!rec) return;

    // SOLO VIEW
    showCycleDetailsOnly();

    showReproInner();
    setAIAnalysis(rec);

    // activate inner AI tab
    document.getElementById("tabAI")?.click();
  });

  // Close cycle details -> go back to panels
  reproCloseCycleBtn?.addEventListener("click", () => {
    hideReproInner();
    showCyclesPanels();
  });

  // Piglets refresh
  pigletsGrowthRefreshBtn?.addEventListener("click", () => {
    pigletsGrowthCacheAll = null;
    loadPigletsGrowthForCurrentSwine(true);
  });

  // Load AI cycles when "Reproduction" top tab is opened
  tabReproduction?.addEventListener("shown.bs.tab", () => loadAIForCurrentSwine(false));
  tabReproduction?.addEventListener("click", () => setTimeout(() => loadAIForCurrentSwine(false), 120));

  // Keep your existing tab hooks
  document.getElementById("tabAI")?.addEventListener("shown.bs.tab", () => loadAIForCurrentSwine(false));
  document.getElementById("tabAI")?.addEventListener("click", () => setTimeout(() => loadAIForCurrentSwine(false), 150));

  const pigletsTabIds = ["tabPigletsGrowth", "tabPigletsGrowthRecords", "tabPiglets", "tabPigletsGrowthRec"];
  pigletsTabIds.forEach((id) => {
    const el = document.getElementById(id);
    el?.addEventListener("shown.bs.tab", () => loadPigletsGrowthForCurrentSwine(false));
    el?.addEventListener("click", () => setTimeout(() => loadPigletsGrowthForCurrentSwine(false), 150));
  });

  return {
    openDetailsModal,
    onModalStateChanged: () => {},
  };
}