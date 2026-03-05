// overview.pigs.js
export function initPigsModule(ctx, breedingModule) {
  const { BACKEND_URL, state, dom } = ctx;
  const { setText, setImage, showGlobalLoader, hideGlobalLoader } = ctx;

  // ✅ Always resolve token fresh (prevents stale token issues)
  const getToken = () => ctx.token || localStorage.getItem("token") || "";

  /* =======================================================
     SAFE FALLBACKS (prevents broken calls)
  ======================================================= */
  function isDeadStatusFallback(hs) {
    const s = (hs ?? "").toString().trim().toLowerCase();
    return s === "deceased" || s.includes("deceased") || s.includes("dead") || s.includes("died");
  }
  const isDeadStatus = (hs) =>
    typeof ctx.isDeadStatus === "function" ? !!ctx.isDeadStatus(hs) : isDeadStatusFallback(hs);

  /* ================= LOAD RESEARCH DATA ================= */
  async function loadResearchData({ force = false } = {}) {
    try {
      const headers = { Authorization: `Bearer ${getToken()}` };

      // ✅ Ensure base objects exist (prevents "Cannot set properties of undefined")
      state.rawPerformanceData = state.rawPerformanceData || { morphology: [], deformities: [] };
      state.rawAiData = state.rawAiData || [];
      state.rawSelectionData = state.rawSelectionData || [];
      state.allSwineData = state.allSwineData || [];

      // ✅ If force refresh, always hit endpoints again (avoid stale manager view)
      if (!force) {
        const hasSwine = Array.isArray(state.allSwineData) && state.allSwineData.length > 0;
        const hasSel = Array.isArray(state.rawSelectionData) && state.rawSelectionData.length > 0;
        const hasAi = Array.isArray(state.rawAiData) && state.rawAiData.length > 0;
        const hasPerf =
          state.rawPerformanceData &&
          (Array.isArray(state.rawPerformanceData.morphology) || Array.isArray(state.rawPerformanceData.deformities));

        if (hasSwine && hasSel && hasAi && hasPerf) return;
      }

      const [perfRes, aiRes, selRes, swineRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/reproduction/performance-analytics`, { headers }),
        fetch(`${BACKEND_URL}/api/reproduction/ai-history`, { headers }),
        fetch(`${BACKEND_URL}/api/reproduction/selection-candidates`, { headers }),
        fetch(`${BACKEND_URL}/api/swine/all`, { headers })
      ]);

      const perf = await perfRes.json().catch(() => ({}));
      const ai = await aiRes.json().catch(() => ({}));
      const sel = await selRes.json().catch(() => ({}));
      const swine = await swineRes.json().catch(() => ({}));

      if (perf?.success) {
        state.rawPerformanceData.morphology = perf.morphology || [];
        state.rawPerformanceData.deformities = perf.deformities || [];
      } else {
        state.rawPerformanceData.morphology = state.rawPerformanceData.morphology || [];
        state.rawPerformanceData.deformities = state.rawPerformanceData.deformities || [];
      }

      if (ai?.success) state.rawAiData = ai.data || [];
      else state.rawAiData = state.rawAiData || [];

      if (sel?.success) state.rawSelectionData = sel.data || [];
      else state.rawSelectionData = state.rawSelectionData || [];

      if (swine?.success) state.allSwineData = swine.swine || swine.data || [];
      else state.allSwineData = state.allSwineData || [];
    } catch (err) {
      console.error("Research data load error:", err);
    }
  }

  /* =======================================================
     FLOATING PANEL OVERLAY HELPERS
  ======================================================= */
  function openFarmerPanelOverlay() {
    document.getElementById("farmerPanelOverlay")?.classList.remove("d-none");
    document.getElementById("farmerPanel")?.classList.remove("d-none");
    document.body.classList.add("panel-open");
  }

  function closeFarmerPanelOverlay() {
    document.getElementById("farmerPanel")?.classList.add("d-none");
    document.getElementById("farmerPanelOverlay")?.classList.add("d-none");
    document.body.classList.remove("panel-open");
  }

  /* ================= PANEL SHOW/HIDE (legacy safe) ================= */
  function showFarmerPanel() {
    dom.farmerPanelEmpty?.classList.add("d-none");
    dom.farmerPanel?.classList.remove("d-none");
    openFarmerPanelOverlay();
  }

  /* ================= MANAGER: scrub selection artifacts ONLY in Growth tab ================= */
  function scrubSelectionArtifactsInGrowthTab() {
    // Only scrub inside Growth tab content (NOT selection tab)
    const growthTab = document.getElementById("cycleGrowthTab");
    if (!growthTab) return;
    if (growthTab.classList.contains("d-none")) return;

    // 1) Remove any "System Suggestion" blocks inside Growth tab
    growthTab.querySelectorAll("*").forEach((el) => {
      if (!el || !el.textContent) return;
      const t = el.textContent.trim();
      if (!t) return;

      if (t.includes("System Suggestion:") || t.includes("System Suggestion")) {
        const kill =
          el.closest(".rounded-3.border") ||
          el.closest(".alert") ||
          el.closest(".px-3.py-2.rounded-3") ||
          el;
        if (kill && kill.parentNode) kill.parentNode.removeChild(kill);
      }
    });

    // 2) Remove selection-status pills inside Growth tab only (more strict so we don't kill legit "Status:" badges)
    growthTab.querySelectorAll(".badge").forEach((b) => {
      const raw = (b.textContent || "").trim();
      if (!raw) return;

      const tx = raw.toLowerCase();

      // ✅ only remove badges that are clearly selection-related
      const isSelectionBadge =
        tx.startsWith("selection:") ||
        tx.includes("system suggestion") ||
        tx === "retain for breeding" ||
        tx === "mark for sale" ||
        tx === "pending" ||
        tx === "selection";

      if (isSelectionBadge) b.remove();
    });
  }

  // ✅ Compatibility shim: file previously called scrubSystemSuggestionUI(), but it didn't exist
  // Keep it safe + focused: scrub only the Growth tab artifacts.
  function scrubSystemSuggestionUI() {
    scrubSelectionArtifactsInGrowthTab();
  }

  /* ================= PANEL TAB SWITCH (single, fixed) ================= */
  function activateFarmerPanelTab(targetId) {
    document.querySelectorAll("#farmerPanelTabs .nav-link").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".farmer-panel-tab").forEach((t) => t.classList.add("d-none"));

    document.querySelector(`#farmerPanelTabs .nav-link[data-target="${targetId}"]`)?.classList.add("active");
    document.getElementById(targetId)?.classList.remove("d-none");

    // ✅ scrub ONLY if growth tab is visible
    scrubSelectionArtifactsInGrowthTab();
  }

  /* ================= Keep scrubbing ONLY when panel DOM changes =================
     IMPORTANT FIX:
     - before: observed childList only (tab switching toggles class => NOT detected)
     - now: also observe class attribute changes so switching to Growth triggers scrub
  ================= */
  (function wireSuggestionScrubberOnce() {
    const overlay = document.getElementById("farmerPanelOverlay");
    if (!overlay || overlay.dataset.sugScrubBound === "1") return;
    overlay.dataset.sugScrubBound = "1";

    const obs = new MutationObserver(() => scrubSelectionArtifactsInGrowthTab());
    obs.observe(overlay, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class"]
    });
  })();

  /* ================= VIEW FARMER (opens floating panel) ================= */
  async function handleViewFarmer(id) {
    const farmer = state.allFarmers.find((f) => f._id === id);
    if (!farmer) return;

    showGlobalLoader("Opening farmer panel...");

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

    // card fields
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

    // ✅ IMPORTANT: force refresh research data so sell/retain reflects latest persisted swine status
    await loadResearchData({ force: true });

    await loadLinkedPigs(id);

    wireReproSowFilters();

    hideGlobalLoader();

    scrubSystemSuggestionUI();
    document.querySelector("#farmerPanelOverlay .panel-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ================= LOAD LINKED PIGS ================= */
  async function loadLinkedPigs(farmerId) {
    state.filteredPigList = [];

    state.breedingSowPage = 1;
    state.breedingCyclePage = 1;
    state.activeSowForBreeding = null;

    if (state.breedingChartInstance) {
      state.breedingChartInstance.destroy();
      state.breedingChartInstance = null;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/farmer/${farmerId}/pigs`, {
        headers: { Authorization: `Bearer ${getToken()}` },
        cache: "no-store"
      });

      if (!res.ok) throw new Error("Failed request");

      const data = await res.json();
      state.currentFarmerPigs = data.pigs || [];

      updateReproSnapshotStats();

      breedingModule?.renderBreedingPerformance?.();

      // ✅ manager: remove suggestion UI if it was rendered by shared view
      scrubSystemSuggestionUI();
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

    // ✅ born piglets should be counted by dam_id matching sows (robust swine_id/swine_tag)
    const sowTags = adultSows
      .map((s) => (s.swine_id || s.swine_tag || "").toString().trim())
      .filter(Boolean);

    const bornPiglets = sowTags.length
      ? swineAll.filter((x) => {
          const dam = (x.dam_id || x.mother_id || "").toString().trim();
          return dam && sowTags.includes(dam);
        })
      : [];

    const totalBorn = bornPiglets.length;
    const totalDead = bornPiglets.filter((x) => isDeadStatus(x.health_status)).length;
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
    const form = document.getElementById("reproSowFilterForm");
    if (!form || form.dataset.bound === "1") return;
    form.dataset.bound = "1";

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      state.breedingSowPage = 1;
      breedingModule?.renderBreedingPerformance?.();
      scrubSystemSuggestionUI();
    });

    document.getElementById("reproSowReset")?.addEventListener("click", () => {
      const s = document.getElementById("reproSowSearch");
      const h = document.getElementById("reproSowHealth");
      if (s) s.value = "";
      if (h) h.value = "";
      state.breedingSowPage = 1;
      breedingModule?.renderBreedingPerformance?.();
      scrubSystemSuggestionUI();
    });
  }

  /* =======================================================
     OVERLAY CLOSE WIRING (once)
  ======================================================= */
  (function wireOverlayCloseOnce() {
    const overlay = document.getElementById("farmerPanelOverlay");
    if (!overlay || overlay.dataset.bound === "1") return;
    overlay.dataset.bound = "1";

    overlay.addEventListener("click", (e) => {
      if (e.target && e.target.id === "farmerPanelOverlay") {
        closeFarmerPanelOverlay();
      }
    });

    document.getElementById("closeFarmerPanelBtn")?.addEventListener("click", () => {
      closeFarmerPanelOverlay();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      const ov = document.getElementById("farmerPanelOverlay");
      if (ov && !ov.classList.contains("d-none")) closeFarmerPanelOverlay();
    });
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
      scrubSystemSuggestionUI();
      return;
    }

    const cycleBtn = e.target.closest(".view-cycle-btn") || e.target.closest("[data-cycle-id]");
    if (cycleBtn) {
      const cycleId = cycleBtn.dataset.cycleId || cycleBtn.getAttribute("data-cycle-id");
      const sowId = cycleBtn.dataset.sowId || cycleBtn.getAttribute("data-sow-id");
      if (!cycleId) return;

      if (breedingModule && typeof breedingModule.openCycleDetail === "function") {
        breedingModule.openCycleDetail(cycleId, sowId);

        // ✅ openCycleDetail is async; scrub after DOM paints
        setTimeout(() => scrubSystemSuggestionUI(), 80);
      }
      return;
    }

    // ✅ IMPORTANT: scrub when switching internal cycle tabs to Growth (class toggle isn't childList)
    const growthTabBtn = e.target.closest('#cycleDetailTabs .nav-link[data-target="cycleGrowthTab"]');
    if (growthTabBtn) {
      setTimeout(() => scrubSelectionArtifactsInGrowthTab(), 60);
      return;
    }
  });

  document.getElementById("farmerPanelTabs")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".nav-link");
    if (!btn) return;

    const target = btn.dataset.target;
    if (!target) return;

    activateFarmerPanelTab(target);

    if (target === "farmerPanelReproTab") {
      wireReproSowFilters();
      breedingModule?.renderBreedingPerformance?.();
      scrubSystemSuggestionUI();
    }
  });

  return {
    loadResearchData,
    handleViewFarmer,
    loadLinkedPigs,
    updateReproSnapshotStats,

    openFarmerPanelOverlay,
    closeFarmerPanelOverlay
  };
}