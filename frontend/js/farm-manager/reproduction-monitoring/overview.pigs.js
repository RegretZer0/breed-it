// overview.pigs.js
export function initPigsModule(ctx, breedingModule) {
  const { BACKEND_URL, token, state, dom } = ctx;
  const { setText, setImage, showGlobalLoader, hideGlobalLoader } = ctx;

  /* ================= LOAD RESEARCH DATA ================= */
  async function loadResearchData() {
    try {
      const [perfRes, aiRes, selRes, swineRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/reproduction/performance-analytics`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${BACKEND_URL}/api/reproduction/ai-history`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${BACKEND_URL}/api/reproduction/selection-candidates`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${BACKEND_URL}/api/swine/all`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      const perf = await perfRes.json();
      const ai = await aiRes.json();
      const sel = await selRes.json();
      const swine = await swineRes.json();

      if (perf.success) {
        state.rawPerformanceData.morphology = perf.morphology || [];
        state.rawPerformanceData.deformities = perf.deformities || [];
      }

      // reproductionRoute.js returns { success:true, data:[...] }
      if (ai.success) state.rawAiData = ai.data || [];
      if (sel.success) state.rawSelectionData = sel.data || [];
      if (swine.success) state.allSwineData = swine.swine || swine.data || [];
    } catch (err) {
      console.error("Research data load error:", err);
    }
  }

  /* ================= VIEW FARMER ================= */
  async function handleViewFarmer(id) {
    const farmer = state.allFarmers.find(f => f._id === id);
    if (!farmer) return;

    showGlobalLoader("Opening farmer profile...");

    setImage("profileAvatar", farmer.profile_picture);

    const fullName = `${farmer.first_name || ""} ${farmer.last_name || ""}`.trim();
    setText("profileFarmerName", fullName);

    setText("profileFarmerContact", farmer.contact_no || farmer.email || "—");
    setText("profilePhone", farmer.contact_no || "—");
    setText("profileEmail", farmer.email || "—");
    setText("profileAddress", farmer.address || "—");

    setText("profileFarmerId", farmer.farmer_id || farmer._id);
    setText("profileFarmerIdOverview", farmer.farmer_id || farmer._id);

    const penCount = farmer.num_of_pens ?? 0;
    const penCapacity = farmer.pen_capacity ?? 0;

    setText("profilePenCount", penCount);
    setText("profilePenCountOverview", penCount);

    setText("profilePenCapacity", penCapacity);
    setText("profilePenCapacityOverview", penCapacity);

    const badge = document.getElementById("profileFarmerStatus");
    if (badge) {
      const isActive = farmer.status === "Active";
      badge.textContent = farmer.status || "Inactive";
      badge.className =
        `badge rounded-pill px-3 py-1 ${
          isActive ? "bg-success-subtle text-success" : "bg-secondary-subtle text-secondary"
        }`;
    }

    // reset modal tabs to Overview
    document.querySelectorAll("#farmerProfileTabs .nav-link")
      .forEach(b => b.classList.remove("active"));

    document.querySelector('#farmerProfileTabs .nav-link[data-target="farmerOverviewTab"]')
      ?.classList.add("active");

    document.querySelectorAll(".farmer-tab")
      .forEach(tab => tab.classList.add("d-none"));

    document.getElementById("farmerOverviewTab")
      ?.classList.remove("d-none");

    // ensure pigs panel is in list mode
    closePigAnalysisView();

    if (dom.farmerModal) dom.farmerModal.show();

    await loadLinkedPigs(id);
    hideGlobalLoader();
  }

  /* ================= LOAD LINKED PIGS ================= */
  async function loadLinkedPigs(farmerId) {
    // Reset analysis view when switching farmer
    closePigAnalysisView();

    state.pigPage = 1;
    state.litterPage = 1;
    state.aiPage = 1;
    state.filteredPigList = [];

    // reset breeding pagination/state per farmer
    state.breedingSowPage = 1;
    state.breedingCyclePage = 1;
    state.breedingPigletPage = 1;
    state.activeSowForBreeding = null;
    if (state.breedingChartInstance) {
      state.breedingChartInstance.destroy();
      state.breedingChartInstance = null;
    }

    const wrap = document.getElementById("linkedPigList");
    if (!wrap) return;

    wrap.innerHTML = `<div class="text-muted text-center py-3">Loading pigs...</div>`;

    try {
      if (!Array.isArray(state.allSwineData) || state.allSwineData.length === 0) {
        await loadResearchData();
      }

      const res = await fetch(`${BACKEND_URL}/api/farmer/${farmerId}/pigs`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) throw new Error("Failed request");

      const data = await res.json();
      state.currentFarmerPigs = data.pigs || [];

      updateReproSnapshotStats();

      if (!state.currentFarmerPigs.length) {
        wrap.innerHTML = `<div class="text-muted text-center py-3">No pigs registered under this farmer.</div>`;
        setText("profileTotalPigs", 0);
        return;
      }

      setText("profileTotalPigs", state.currentFarmerPigs.length);

      // compute initial filtered list for "all"
      state.filteredPigList = [];
      renderFarmerPigs();
    } catch (err) {
      console.error("Load pigs error:", err);
      wrap.innerHTML = `<div class="text-danger text-center py-3">Failed to load pigs</div>`;
    }
  }

  /* ================= RENDER FARMER PIG LIST ================= */
  function renderFarmerPigs() {
    const wrap = document.getElementById("linkedPigList");
    if (!wrap) return;

    // prevent "No pigs found" when category != all but filters not applied yet
    const list =
      (state.filteredPigList && state.filteredPigList.length)
        ? state.filteredPigList
        : (state.activePigCategory === "all" ? state.currentFarmerPigs : []);

    const totalPages = Math.max(1, Math.ceil(list.length / state.PIG_ROWS_PER_PAGE));
    if (state.pigPage > totalPages) state.pigPage = totalPages;

    const start = (state.pigPage - 1) * state.PIG_ROWS_PER_PAGE;
    const pageItems = list.slice(start, start + state.PIG_ROWS_PER_PAGE);

    if (!pageItems.length) {
      wrap.innerHTML = `
        <div class="text-muted text-center py-3">
          No pigs found
        </div>`;
      renderPigPagination(totalPages);
      return;
    }

    let html = "";

    pageItems.forEach(p => {
      const statusClass =
        p.health_status === "Healthy"
          ? "bg-success-subtle text-success"
          : "bg-secondary-subtle text-secondary";

      html += `
        <div class="linked-pig-item d-flex justify-content-between align-items-center">
          <div>
            <div class="pig-name">${p.swine_id}</div>
            <div class="pig-meta">
              ${p.breed || "Native"} · ${p.sex || "—"}
            </div>
          </div>

          <div class="d-flex align-items-center gap-2">
            <span class="badge ${statusClass}">
              ${p.health_status || "Active"}
            </span>

            <div class="d-flex gap-2 linked-actions">
              <button class="btn btn-sm btn-outline-primary view-pig-btn" data-id="${p._id}">
                View
              </button>

              <button class="btn btn-sm btn-success analyze-pig-btn" data-id="${p._id}">
                Analyze
              </button>
            </div>
          </div>
        </div>
      `;
    });

    wrap.innerHTML = html;
    renderPigPagination(totalPages);
  }

  function renderPigPagination(totalPages) {
    const wrap = document.getElementById("linkedPigList");
    if (!wrap) return;

    const pagination = document.createElement("div");
    pagination.className = "d-flex justify-content-between align-items-center mt-3";

    pagination.innerHTML = `
      <button class="btn btn-sm btn-outline-secondary" id="pigPrevBtn">Prev</button>
      <span class="small text-muted">Page ${state.pigPage} of ${totalPages}</span>
      <button class="btn btn-sm btn-outline-secondary" id="pigNextBtn">Next</button>
    `;

    wrap.appendChild(pagination);

    const prevBtn = document.getElementById("pigPrevBtn");
    const nextBtn = document.getElementById("pigNextBtn");

    if (prevBtn) prevBtn.disabled = state.pigPage <= 1;
    if (nextBtn) nextBtn.disabled = state.pigPage >= totalPages;

    prevBtn?.addEventListener("click", () => {
      if (state.pigPage > 1) {
        state.pigPage--;
        renderFarmerPigs();
      }
    });

    nextBtn?.addEventListener("click", () => {
      if (state.pigPage < totalPages) {
        state.pigPage++;
        renderFarmerPigs();
      }
    });
  }

  /* ================= APPLY PIG FILTERS ================= */
  function applyPigFilters() {
    let filtered = [...state.currentFarmerPigs];

    const tag =
      document.getElementById("pigSearchTag")?.value.trim().toLowerCase() || "";

    const status =
      document.getElementById("pigStatusFilter")?.value || "";

    if (state.activePigCategory !== "all") {
      filtered = filtered.filter(p => {
        const stage = (p.age_stage || "").toString().trim().toLowerCase();
        const sex = (p.sex || "").toString().trim().toLowerCase();

        switch (state.activePigCategory) {
          case "piglet":
            return stage.includes("piglet");
          case "sow":
            return sex === "female" && stage.includes("adult");
          case "boar":
            return sex === "male" && stage.includes("adult");
          default:
            return true;
        }
      });
    }

    if (tag) filtered = filtered.filter(p => p.swine_id?.toLowerCase().includes(tag));
    if (status) filtered = filtered.filter(p => p.health_status === status);

    state.filteredPigList = filtered;
    state.pigPage = 1;
    renderFarmerPigs();
  }

  /* ================= PIG ANALYSIS ================= */
  function closePigAnalysisView() {
    document.getElementById("pigAnalysisPanel")?.classList.add("d-none");
    document.getElementById("linkedPigList")?.classList.remove("d-none");

    document.getElementById("farmerPigCategoryTabs")?.classList.remove("hidden-section");
    document.getElementById("pigFilterSection")?.classList.remove("hidden-section");
    document.getElementById("farmerProfileTabs")?.classList.remove("hidden-section");
  }

  function openPigAnalysis(pigId) {
    const pig = state.currentFarmerPigs.find(p => (p._id || "").toString() === (pigId || "").toString());
    if (!pig) return;

    // Ensure research data exists for analysis tabs
    if ((!state.rawAiData || !state.rawAiData.length) &&
        (!state.rawPerformanceData?.morphology || !state.rawPerformanceData.morphology.length) &&
        (!state.rawSelectionData || !state.rawSelectionData.length)) {
      // fire and forget; UI still opens and will show "No data" until fetched
      loadResearchData().catch(() => {});
    }

    // switch UI
    document.getElementById("linkedPigList")?.classList.add("d-none");
    document.getElementById("farmerPigCategoryTabs")?.classList.add("hidden-section");
    document.getElementById("pigFilterSection")?.classList.add("hidden-section");
    document.getElementById("farmerProfileTabs")?.classList.add("hidden-section");

    const panel = document.getElementById("pigAnalysisPanel");
    if (!panel) return;
    panel.classList.remove("d-none");

    // header meta
    setText("analysisPigTitle", `Pig Analysis: ${pig.swine_id || "—"}`);
    setText(
      "analysisPigMeta",
      `${pig.breed || "Native"} · ${pig.sex || "—"} · ${pig.age_stage || "—"} · Status: ${pig.health_status || "—"}`
    );

    // reset tabs -> Profile
    document.querySelectorAll("#pigAnalysisTabs .nav-link").forEach(b => b.classList.remove("active"));
    document.querySelector('#pigAnalysisTabs .nav-link[data-target="pigProfileTab"]')?.classList.add("active");

    document.querySelectorAll(".pig-analysis-tab").forEach(t => t.classList.add("d-none"));
    document.getElementById("pigProfileTab")?.classList.remove("d-none");

    // render content
    renderPigProfileTab(pig);
    renderPigBreedingTab(pig);
    renderPigPerformanceTab(pig);
    renderPigHealthTab(pig);
    renderPigSelectionTab(pig);

    // back button
    document.getElementById("backToPigList")?.addEventListener("click", () => {
      closePigAnalysisView();
    }, { once: true });
  }

  function renderCardBlock(title, bodyHtml) {
    return `
      <div class="card border-0 shadow-sm mb-3">
        <div class="card-body">
          <div class="d-flex align-items-center justify-content-between mb-2">
            <h6 class="mb-0 fw-semibold">${title}</h6>
          </div>
          ${bodyHtml}
        </div>
      </div>
    `;
  }

  function renderKeyValueRows(rows = []) {
    return rows.map(r => `
      <div class="d-flex justify-content-between gap-3 py-2 border-bottom" style="border-color: rgba(233,237,243,.85) !important;">
        <span class="text-muted">${r.label}</span>
        <span class="fw-semibold text-end">${r.value ?? "—"}</span>
      </div>
    `).join("") + `<div class="pt-2"></div>`;
  }

  function safeDate(d) {
    if (!d) return "—";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "—";
    return dt.toLocaleDateString();
  }

  // ✅ FIX: match against your actual route payloads
  function matchByPig(pig, rec) {
    const pigMongoId = (pig?._id || "").toString().trim();
    const pigTag = (pig?.swine_id || "").toString().trim();

    // ai-history: sow_tag
    // performance-analytics: swine_tag
    // selection-candidates: swine_tag
    const candidates = [
      rec?.swine_tag,
      rec?.sow_tag,
      rec?.swine_id,     // if ever sent as raw swine tag
      rec?.swine_code,
      rec?.pig_id,
      rec?.swineId,
      rec?._id,
      rec?.id
    ].map(x => (x ?? "").toString().trim()).filter(Boolean);

    return candidates.includes(pigTag) || candidates.includes(pigMongoId);
  }

  function renderPigProfileTab(pig) {
    const el = document.getElementById("pigProfileTab");
    if (!el) return;

    el.innerHTML = renderCardBlock(
      `<i class="bi bi-person-vcard me-2"></i>Profile`,
      renderKeyValueRows([
        { label: "Swine ID", value: pig.swine_id },
        { label: "Breed", value: pig.breed || "Native" },
        { label: "Sex", value: pig.sex },
        { label: "Age Stage", value: pig.age_stage },
        { label: "Current Status", value: pig.current_status || "—" },
        { label: "Health Status", value: pig.health_status },
        { label: "Dam ID", value: pig.dam_id || "—" },
        { label: "Sire ID", value: pig.sire_id || "—" },
        { label: "Birth Date", value: safeDate(pig.birth_date) }
      ])
    );
  }

  function renderPigBreedingTab(pig) {
    const el = document.getElementById("pigBreedingTab");
    if (!el) return;

    const records = Array.isArray(state.rawAiData)
      ? state.rawAiData.filter(r => matchByPig(pig, r))
      : [];

    if (!records.length) {
      el.innerHTML = renderCardBlock(
        `<i class="bi bi-droplet-half me-2"></i>Artificial Insemination Record`,
        `<div class="text-muted">No AI records found for this pig.</div>`
      );
      return;
    }

    const list = records.slice(0, 10).map(r => `
      <div class="py-2 border-bottom" style="border-color: rgba(233,237,243,.85) !important;">
        <div class="fw-semibold">AI Record</div>
        <div class="small text-muted">
          Date: ${safeDate(r.date)} · Boar: ${r.boar_tag || "N/A"} · Status: ${r.status || "—"}
        </div>
      </div>
    `).join("");

    el.innerHTML = renderCardBlock(
      `<i class="bi bi-droplet-half me-2"></i>Artificial Insemination Record`,
      `
        <div class="small text-muted mb-2">Showing latest ${Math.min(records.length, 10)} record(s).</div>
        ${list}
      `
    );
  }

  function renderPigPerformanceTab(pig) {
    const el = document.getElementById("pigPerformanceTab");
    if (!el) return;

    const morph = Array.isArray(state.rawPerformanceData?.morphology)
      ? state.rawPerformanceData.morphology.filter(r => matchByPig(pig, r))
      : [];

    if (!morph.length) {
      el.innerHTML = renderCardBlock(
        `<i class="bi bi-graph-up me-2"></i>Piglets Growth Records`,
        `<div class="text-muted">No growth/performance records found.</div>`
      );
      return;
    }

    const latest = morph
      .slice()
      .sort((a, b) => new Date(b?.morphology?.date || 0) - new Date(a?.morphology?.date || 0))[0];

    const m = latest?.morphology || {};

    el.innerHTML = renderCardBlock(
      `<i class="bi bi-graph-up me-2"></i>Piglets Growth Records`,
      `
        <div class="small text-muted mb-2">Latest record</div>
        ${renderKeyValueRows([
          { label: "Stage", value: m.stage || "—" },
          { label: "Date", value: safeDate(m.date) },
          { label: "Weight (kg)", value: m.weight ?? "—" },
          { label: "Body Length (cm)", value: m.body_length ?? "—" },
          { label: "Heart Girth (cm)", value: m.heart_girth ?? "—" },
          { label: "Teat Count", value: m.teat_count ?? "—" },
          { label: "Teeth", value: m.teeth ?? "—" }
        ])}
      `
    );
  }

  function renderPigHealthTab(pig) {
    const el = document.getElementById("pigHealthTab");
    if (!el) return;

    const defs = Array.isArray(state.rawPerformanceData?.deformities)
      ? state.rawPerformanceData.deformities.filter(r => matchByPig(pig, r))
      : [];

    const meds = Array.isArray(pig.medical_records) ? pig.medical_records : [];

    const defectsBlock = !defs.length
      ? `<div class="text-muted">No deformity records found.</div>`
      : defs.slice(0, 10).map(d => `
          <div class="py-2 border-bottom" style="border-color: rgba(233,237,243,.85) !important;">
            <div class="fw-semibold">${d.deformity_types || "Deformity"}</div>
            <div class="small text-muted">Date detected: ${safeDate(d.date_detected)}</div>
          </div>
        `).join("");

    const medsBlock = !meds.length
      ? `<div class="text-muted">No medical records found.</div>`
      : meds.slice().reverse().slice(0, 10).map(m => `
          <div class="py-2 border-bottom" style="border-color: rgba(233,237,243,.85) !important;">
            <div class="fw-semibold">${m.treatment_type || "Treatment"}</div>
            <div class="small text-muted">
              Medicine: ${m.medicine_name || "—"} · Dosage: ${m.dosage || "—"} · Date: ${safeDate(m.admin_date)}
            </div>
            ${m.remarks ? `<div class="small text-muted">Remarks: ${m.remarks}</div>` : ""}
          </div>
        `).join("");

    el.innerHTML = `
      ${renderCardBlock(`<i class="bi bi-bug me-2"></i>Defects`, defectsBlock)}
      ${renderCardBlock(`<i class="bi bi-shield-check me-2"></i>Medical Records`, medsBlock)}
    `;
  }

  function renderPigSelectionTab(pig) {
    const el = document.getElementById("pigSelectionTab");
    if (!el) return;

    const sel = Array.isArray(state.rawSelectionData)
      ? state.rawSelectionData.find(r => matchByPig(pig, r))
      : null;

    if (!sel) {
      el.innerHTML = renderCardBlock(
        `<i class="bi bi-award me-2"></i>Selection Status`,
        `<div class="text-muted">No selection status found for this pig.</div>`
      );
      return;
    }

    el.innerHTML = renderCardBlock(
      `<i class="bi bi-award me-2"></i>Selection Status`,
      renderKeyValueRows([
        { label: "Current Stage", value: sel.current_stage ?? "—" },
        { label: "Can Promote", value: sel.can_promote === true ? "Yes" : sel.can_promote === false ? "No" : "—" },
        { label: "Recommendation", value: sel.recommendation ?? "—" }
      ])
    );
  }

  /* ================= REPRO SNAPSHOT (MODAL STATS) ================= */
  function updateReproSnapshotStats() {
    const pigs = Array.isArray(state.currentFarmerPigs) ? state.currentFarmerPigs : [];
    const swineAll = Array.isArray(state.allSwineData) ? state.allSwineData : [];

    const totalPigs = pigs.length;

    const adultSows = pigs.filter(p => {
      const sex = (p.sex || "").toLowerCase();
      const stage = (p.age_stage || "").toLowerCase();
      return sex === "female" && stage.includes("adult");
    });

    const adultBoars = pigs.filter(p => {
      const sex = (p.sex || "").toLowerCase();
      const stage = (p.age_stage || "").toLowerCase();
      return sex === "male" && stage.includes("adult");
    });

    const pigletsUnderFarmer = pigs.filter(p => {
      const stage = (p.age_stage || "").toLowerCase();
      return stage.includes("piglet");
    });

    let pregnantSows = 0;
    let observationSows = 0;
    let activeCycles = 0;

    adultSows.forEach(sow => {
      const cycles = Array.isArray(sow.breeding_cycles) ? sow.breeding_cycles : [];
      activeCycles += cycles.filter(c => c && c.farrowed !== true).length;

      cycles.forEach(c => {
        if (!c) return;
        if (c.is_pregnant && !c.farrowed) pregnantSows++;
        if (c.ai_service_date && !c.is_pregnant && !c.farrowed) observationSows++;
      });
    });

    const sowTags = adultSows
      .map(s => (s.swine_id || "").toString().trim())
      .filter(Boolean);

    const bornPiglets = sowTags.length
      ? swineAll.filter(x => sowTags.includes((x.dam_id || "").toString().trim()))
      : [];

    const totalBorn = bornPiglets.length;

    // true deaths only
    const totalDead = bornPiglets.filter(x => ctx.isDeadStatus(x.health_status)).length;

    const mortalityPct = totalBorn > 0
      ? ((totalDead / totalBorn) * 100).toFixed(1)
      : "0.0";

    setText("statTotalPigs", totalPigs);
    setText("statPiglets", pigletsUnderFarmer.length);
    setText("statAdultSows", adultSows.length);
    setText("statAdultBoars", adultBoars.length);

    setText("statPregnant", pregnantSows);
    setText("statObservation", observationSows);
    setText("statActiveCycles", activeCycles);

    setText("statTotalBorn", totalBorn);
    setText("statMortality", `${mortalityPct}%`);
  }

  /* ================= EVENT WIRING ================= */

  // Global click handler
  document.addEventListener("click", (e) => {
    const farmerBtn = e.target.closest(".view-farmer-btn");
    if (farmerBtn) {
      handleViewFarmer(farmerBtn.dataset.id);
      return;
    }

    const pigBtn = e.target.closest(".view-pig-btn");
    if (pigBtn) {
      localStorage.setItem("openPigId", pigBtn.dataset.id);
      window.location.assign("/farm-manager/pig-management/swine-list");
      return;
    }

    const analyzeBtn = e.target.closest(".analyze-pig-btn");
    if (analyzeBtn) {
      openPigAnalysis(analyzeBtn.dataset.id);
      return;
    }

    const sowBtn = e.target.closest(".view-sow-cycles-btn");
    if (sowBtn) {
      breedingModule.openSowCycles(sowBtn.dataset.id);
      return;
    }

    const boarBtn = e.target.closest(".view-boar-btn");
    if (boarBtn) {
      const boarTag = boarBtn.dataset.tag;
      const boar = state.allSwineData.find(s => s.swine_id === boarTag);
      if (boar) {
        localStorage.setItem("openPigId", boar._id);
        window.location.assign("/farm-manager/pig-management/swine-list");
      }
      return;
    }

    const growthBtn = e.target.closest(".view-growth-btn");
    if (growthBtn) {
      localStorage.setItem("openPigId", growthBtn.dataset.id);
      localStorage.setItem("openPigTab", "performanceTab");
      window.location.assign("/farm-manager/pig-management/swine-list");
      return;
    }
  });

  // Farmer tab switch
  document.querySelectorAll("#farmerProfileTabs .nav-link")
    .forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#farmerProfileTabs .nav-link")
          .forEach(b => b.classList.remove("active"));

        btn.classList.add("active");

        document.querySelectorAll(".farmer-tab")
          .forEach(tab => tab.classList.add("d-none"));

        const target = btn.dataset.target;
        document.getElementById(target)?.classList.remove("d-none");

        if (target === "breedingPerformanceTab") {
          breedingModule.renderBreedingPerformance();
        }
      });
    });

  // Pig category tabs
  document.getElementById("farmerPigCategoryTabs")
    ?.addEventListener("click", (e) => {
      const btn = e.target.closest(".nav-link");
      if (!btn) return;

      document.querySelectorAll("#farmerPigCategoryTabs .nav-link")
        .forEach(b => b.classList.remove("active"));

      btn.classList.add("active");

      state.activePigCategory = btn.dataset.type;
      applyPigFilters();
    });

  // Pig filters
  document.getElementById("farmerPigFilters")
    ?.addEventListener("submit", (e) => {
      e.preventDefault();
      applyPigFilters();
    });

  document.getElementById("resetPigFilters")
    ?.addEventListener("click", () => {
      document.getElementById("pigSearchTag").value = "";
      document.getElementById("pigStatusFilter").value = "";

      state.activePigCategory = "all";
      state.pigPage = 1;

      document.querySelectorAll("#farmerPigCategoryTabs .nav-link")
        .forEach(b => b.classList.remove("active"));

      document.querySelector('[data-type="all"]')?.classList.add("active");

      state.filteredPigList = [];
      renderFarmerPigs();
    });

  // Pig analysis tab switch (inside analysis panel)
  document.getElementById("pigAnalysisTabs")
    ?.addEventListener("click", (e) => {
      const btn = e.target.closest(".nav-link");
      if (!btn) return;

      document.querySelectorAll("#pigAnalysisTabs .nav-link")
        .forEach(b => b.classList.remove("active"));

      btn.classList.add("active");

      document.querySelectorAll(".pig-analysis-tab")
        .forEach(tab => tab.classList.add("d-none"));

      const target = btn.dataset.target;
      document.getElementById(target)?.classList.remove("d-none");
    });

  return {
    loadResearchData,
    handleViewFarmer,
    loadLinkedPigs,
    renderFarmerPigs,
    applyPigFilters,
    updateReproSnapshotStats
  };
}