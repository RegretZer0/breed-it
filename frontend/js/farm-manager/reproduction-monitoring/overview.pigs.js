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
      if (ai.success) state.rawAiData = ai.data || [];
      if (sel.success) state.rawSelectionData = sel.data || [];
      if (swine.success) state.allSwineData = swine.swine || swine.data || [];
    } catch (err) {
      console.error("Research data load error:", err);
    }
  }

  /* =======================================================
     FLOATING PANEL OVERLAY HELPERS
     - overlay id: #farmerPanelOverlay (from table.ejs)
     - panel id:   #farmerPanel (existing)
  ======================================================= */
  function openFarmerPanelOverlay() {
    document.getElementById("farmerPanelOverlay")?.classList.remove("d-none");
    document.getElementById("farmerPanel")?.classList.remove("d-none");
    document.body.classList.add("panel-open"); // optional (CSS can lock scroll)
  }

  function closeFarmerPanelOverlay() {
    document.getElementById("farmerPanel")?.classList.add("d-none");
    document.getElementById("farmerPanelOverlay")?.classList.add("d-none");
    document.body.classList.remove("panel-open");
  }

  /* ================= PANEL SHOW/HIDE (legacy safe) ================= */
  // Keep these for compatibility with your current code flow
  function showFarmerPanel() {
    // if you had empty state blocks earlier, keep it safe
    dom.farmerPanelEmpty?.classList.add("d-none");
    dom.farmerPanel?.classList.remove("d-none"); // may be undefined; overlay handles actual show
    openFarmerPanelOverlay(); // ✅ ensures overlay + panel are visible
  }

  function activateFarmerPanelTab(targetId) {
    document.querySelectorAll("#farmerPanelTabs .nav-link").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".farmer-panel-tab").forEach((t) => t.classList.add("d-none"));

    document.querySelector(`#farmerPanelTabs .nav-link[data-target="${targetId}"]`)?.classList.add("active");
    document.getElementById(targetId)?.classList.remove("d-none");
  }

  /* ================= VIEW FARMER (opens floating panel) ================= */
  async function handleViewFarmer(id) {
    const farmer = state.allFarmers.find((f) => f._id === id);
    if (!farmer) return;

    showGlobalLoader("Opening farmer panel...");

    // ✅ Open overlay + panel
    showFarmerPanel();
    activateFarmerPanelTab("farmerPanelOverviewTab");

    // header
    setImage("profileAvatar", farmer.profile_picture);

    const fullName = `${farmer.first_name || ""} ${farmer.last_name || ""}`.trim();
    setText("profileFarmerName", fullName);

    setText("profileFarmerContact", farmer.contact_no || farmer.email || "—");

    // hidden ids (still updated for compatibility)
    setText("profilePhone", farmer.contact_no || "—");
    setText("profileEmail", farmer.email || "—");
    setText("profileAddress", farmer.address || "—");

    setText("profileFarmerId", farmer.farmer_id || farmer._id);
    setText("profileFarmerIdOverview", farmer.farmer_id || farmer._id);

    const penCount = farmer.num_of_pens ?? 0;
    const penCapacity = farmer.pen_capacity ?? 0;

    setText("profilePenCountOverview", penCount);
    setText("profilePenCapacityOverview", penCapacity);

    // ✅ ALSO update your "card" fields (these exist in table.ejs)
    setText("profileFarmerIdCard", farmer.farmer_id || farmer._id);
    setText("profilePenCountCard", penCount);
    setText("profilePenCapacityCard", penCapacity);
    setText("profilePhoneCard", farmer.contact_no || "—");
    setText("profileEmailCard", farmer.email || "—");
    setText("profileAddressCard", farmer.address || "—");

    // status badge
    const badge = document.getElementById("profileFarmerStatus");
    if (badge) {
      const isActive = farmer.status === "Active";
      badge.textContent = farmer.status || "Inactive";
      badge.className = `badge rounded-pill px-3 py-1 ${
        isActive ? "bg-success-subtle text-success" : "bg-secondary-subtle text-secondary"
      }`;
    }

    // load pigs then compute stats + render sow list (repro)
    await loadLinkedPigs(id);

    // after data loads, ensure sow filters are wired
    wireReproSowFilters();

    hideGlobalLoader();

    // optional: scroll within overlay to top on mobile
    document.querySelector("#farmerPanelOverlay .panel-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ================= LOAD LINKED PIGS ================= */
  async function loadLinkedPigs(farmerId) {
    state.filteredPigList = [];

    // reset breeding pagination/state per farmer
    state.breedingSowPage = 1;
    state.breedingCyclePage = 1;
    state.activeSowForBreeding = null;

    if (state.breedingChartInstance) {
      state.breedingChartInstance.destroy();
      state.breedingChartInstance = null;
    }

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

      // Render sow list in reproduction view (still uses existing IDs)
      breedingModule?.renderBreedingPerformance?.();
    } catch (err) {
      console.error("Load pigs error:", err);
    }
  }

  /* ================= REPRO SNAPSHOT (panel stats) ================= */
  function updateReproSnapshotStats() {
    const pigs = Array.isArray(state.currentFarmerPigs) ? state.currentFarmerPigs : [];
    const swineAll = Array.isArray(state.allSwineData) ? state.allSwineData : [];

    const totalPigs = pigs.length;

    const adultSows = pigs.filter((p) => {
      const sex = (p.sex || "").toLowerCase();
      const stage = (p.age_stage || "").toLowerCase();
      return sex === "female" && stage.includes("adult");
    });

    const adultBoars = pigs.filter((p) => {
      const sex = (p.sex || "").toLowerCase();
      const stage = (p.age_stage || "").toLowerCase();
      return sex === "male" && stage.includes("adult");
    });

    const pigletsUnderFarmer = pigs.filter((p) => {
      const stage = (p.age_stage || "").toLowerCase();
      return stage.includes("piglet");
    });

    let pregnantSows = 0;
    let observationSows = 0;
    let activeCycles = 0;

    adultSows.forEach((sow) => {
      const cycles = Array.isArray(sow.breeding_cycles) ? sow.breeding_cycles : [];
      activeCycles += cycles.filter((c) => c && c.farrowed !== true).length;

      cycles.forEach((c) => {
        if (!c) return;
        if (c.is_pregnant && !c.farrowed) pregnantSows++;
        if (c.ai_service_date && !c.is_pregnant && !c.farrowed) observationSows++;
      });
    });

    const sowTags = adultSows
      .map((s) => (s.swine_id || "").toString().trim())
      .filter(Boolean);

    const bornPiglets = sowTags.length
      ? swineAll.filter((x) => sowTags.includes((x.dam_id || "").toString().trim()))
      : [];

    const totalBorn = bornPiglets.length;
    const totalDead = bornPiglets.filter((x) => ctx.isDeadStatus(x.health_status)).length;

    const mortalityPct = totalBorn > 0 ? ((totalDead / totalBorn) * 100).toFixed(1) : "0.0";

    setText("statTotalPigs", totalPigs);
    setText("statPiglets", pigletsUnderFarmer.length);
    setText("statAdultSows", adultSows.length);
    setText("statAdultBoars", adultBoars.length);
    setText("statPregnant", pregnantSows);
    setText("statMortality", `${mortalityPct}%`);

    // keep hidden ids updated
    setText("statObservation", observationSows);
    setText("statActiveCycles", activeCycles);
    setText("statTotalBorn", totalBorn);
  }

  /* ================= REPRO SOW FILTERS (MVP) ================= */
  function wireReproSowFilters() {
    // prevent duplicate listeners
    const form = document.getElementById("reproSowFilterForm");
    if (!form || form.dataset.bound === "1") return;
    form.dataset.bound = "1";

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      state.breedingSowPage = 1;
      breedingModule?.renderBreedingPerformance?.();
    });

    document.getElementById("reproSowReset")?.addEventListener("click", () => {
      const s = document.getElementById("reproSowSearch");
      const h = document.getElementById("reproSowHealth");
      if (s) s.value = "";
      if (h) h.value = "";
      state.breedingSowPage = 1;
      breedingModule?.renderBreedingPerformance?.();
    });
  }

  /* =======================================================
     OVERLAY CLOSE WIRING (once)
     - Close button
     - Click outside
     - ESC
  ======================================================= */
  (function wireOverlayCloseOnce() {
    const overlay = document.getElementById("farmerPanelOverlay");
    if (overlay && overlay.dataset.bound !== "1") {
      overlay.dataset.bound = "1";

      // click outside panel (overlay background)
      overlay.addEventListener("click", (e) => {
        if (e.target && e.target.id === "farmerPanelOverlay") {
          closeFarmerPanelOverlay();
        }
      });

      // Close button
      document.getElementById("closeFarmerPanelBtn")?.addEventListener("click", () => {
        closeFarmerPanelOverlay();
      });

      // ESC
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeFarmerPanelOverlay();
      });
    }
  })();

  /* ================= EVENT WIRING ================= */
  document.addEventListener("click", (e) => {
    const farmerBtn = e.target.closest(".view-farmer-btn");
    if (farmerBtn) {
      handleViewFarmer(farmerBtn.dataset.id);
      return;
    }

    const sowBtn = e.target.closest(".view-sow-cycles-btn");
    if (sowBtn) {
      breedingModule?.openSowCycles?.(sowBtn.dataset.id);
      return;
    }

    const cycleBtn = e.target.closest(".view-cycle-btn") || e.target.closest("[data-cycle-id]");
    if (cycleBtn) {
      const cycleId = cycleBtn.dataset.cycleId || cycleBtn.getAttribute("data-cycle-id");
      const sowId = cycleBtn.dataset.sowId || cycleBtn.getAttribute("data-sow-id");
      if (!cycleId) return;

      if (breedingModule && typeof breedingModule.openCycleDetail === "function") {
        breedingModule.openCycleDetail(cycleId, sowId);
      }
      return;
    }
  });

  // middle panel tab switch
  document.getElementById("farmerPanelTabs")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".nav-link");
    if (!btn) return;

    const target = btn.dataset.target;
    if (!target) return;

    activateFarmerPanelTab(target);

    if (target === "farmerPanelReproTab") {
      wireReproSowFilters();
      breedingModule?.renderBreedingPerformance?.();
    }
  });

  return {
    loadResearchData,
    handleViewFarmer,
    loadLinkedPigs,
    updateReproSnapshotStats,

    // optional exports if you want to call from elsewhere
    openFarmerPanelOverlay,
    closeFarmerPanelOverlay
  };
}