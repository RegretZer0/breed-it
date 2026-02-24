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
    document.getElementById("pigAnalysisPanel")?.classList.add("d-none");
    document.getElementById("linkedPigList")?.classList.remove("d-none");
    document.getElementById("farmerPigCategoryTabs")?.classList.remove("hidden-section");
    document.getElementById("pigFilterSection")?.classList.remove("hidden-section");
    document.getElementById("farmerProfileTabs")?.classList.remove("hidden-section");

    if (dom.farmerModal) dom.farmerModal.show();

    await loadLinkedPigs(id);
    hideGlobalLoader();
  }

  /* ================= LOAD LINKED PIGS ================= */
  async function loadLinkedPigs(farmerId) {
    // Reset analysis view when switching farmer
    document.getElementById("pigAnalysisPanel")?.classList.add("d-none");
    document.getElementById("linkedPigList")?.classList.remove("d-none");
    document.getElementById("farmerPigCategoryTabs")?.classList.remove("hidden-section");
    document.getElementById("pigFilterSection")?.classList.remove("hidden-section");
    document.getElementById("farmerProfileTabs")?.classList.remove("hidden-section");

    state.pigPage = 1;
    state.litterPage = 1;
    state.aiPage = 1;
    state.filteredPigList = [];

    // ✅ FIX: reset breeding pagination/state per farmer
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

    // ✅ FIX: prevent "No pigs found" when category != all but filters not applied yet
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

            <div class="d-flex gap-2">
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

    if (tag) {
      filtered = filtered.filter(p => p.swine_id?.toLowerCase().includes(tag));
    }

    if (status) {
      filtered = filtered.filter(p => p.health_status === status);
    }

    state.filteredPigList = filtered;
    state.pigPage = 1;
    renderFarmerPigs();
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

    // ✅ FIX: true deaths only
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

  // Global click handler (kept your behavior)
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
      // keep your openPigAnalysis flow if it exists in your full file
      // (this snippet version doesn’t include the full analysis renderer)
      console.warn("openPigAnalysis() not included in this module snippet.");
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

  // Farmer tab switch (kept)
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

  return {
    loadResearchData,
    handleViewFarmer,
    loadLinkedPigs,
    renderFarmerPigs,
    applyPigFilters,
    updateReproSnapshotStats
  };
}