import { authGuard } from "/js/authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {

  /* ================= AUTH ================= */
  const user = await authGuard(["farm_manager", "encoder"]);
  if (!user) return;

  const token = localStorage.getItem("token");
  if (!token) {
    window.location.assign("/login");
    return;
  }

  const role = user.role;
  const BACKEND_URL = "http://localhost:5000";

  /* ================= STATE ================= */
    let managerId = null;
    let allFarmers = [];
    let filteredFarmers = [];
    let farmerPage = 1;
    let selectedFarmerId = "";

    let activePigCategory = "all";
    let currentFarmerPigs = [];
    let filteredPigList = [];

    let pigPage = 1;
    const PIG_ROWS_PER_PAGE = 5;

    let rawPerformanceData = { morphology: [], deformities: [] };
    let rawAiData = [];
    let rawSelectionData = [];
    let allSwineData = [];

    let litterPage = 1;
    const LITTER_ROWS_PER_PAGE = 5;
    let currentLitterPiglets = [];

    let aiPage = 1;
    const AI_ROWS_PER_PAGE = 3;
    let currentAiRecords = [];

    // ===== BREEDING PERFORMANCE STATE =====
    let breedingChartInstance = null;
    let activeSowForBreeding = null;

    let breedingSowPage = 1;
    const BREEDING_SOWS_PER_PAGE = 4;

    let breedingSowsCache = [];
    let activeCycleForBreeding = null;

    const FARMER_ROWS_PER_PAGE = 5;

    // ===== BREEDING DETAIL STATE =====
    let breedingCyclePage = 1;
    const CYCLES_PER_PAGE = 2;

    let breedingPigletPage = 1;
    const PIGLETS_PER_PAGE = 5;

  /* ================= RESOLVE MANAGER ================= */
  try {
    managerId = role === "farm_manager" ? user.id : user.managerId;
  } catch (err) {
    console.error("Manager resolution failed", err);
    hideGlobalLoader();
    return;
  }

  /* ================= DOM ================= */
  const farmerCardList = document.getElementById("farmerCardList");
  const filtersForm = document.getElementById("filtersForm");
  const filterStatus = document.getElementById("filterStatus");
  const searchFarmer = document.getElementById("searchFarmer");

  const farmerModalEl = document.getElementById("farmerModal");
  const farmerModal = farmerModalEl
    ? new bootstrap.Modal(farmerModalEl)
    : null;

  /* ================= LOAD FARMERS ================= */
  async function loadFarmers() {
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/auth/farmers/${managerId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const data = await res.json();
      allFarmers = data.farmers || [];

      allFarmers.sort((a, b) =>
        (a.first_name || "").localeCompare(b.first_name || "")
      );

      filteredFarmers = [...allFarmers];
      farmerPage = 1;

      renderFarmerCards();
      populateFarmerDropdown();

    } catch (err) {
      console.error("Load farmers failed", err);
    }
  }

    function populateFarmerDropdown() {

    const optionsWrap = document.getElementById("locationOptions");
    if (!optionsWrap) return;

    if (!allFarmers.length) {
        optionsWrap.innerHTML = `
        <div class="text-muted small">
            No farmers found
        </div>`;
        return;
    }

    let html = "";

    allFarmers.forEach(f => {
        html += `
        <div class="dropdown-item farmer-option"
            data-id="${f._id}"
            data-name="${f.first_name} ${f.last_name}">
            ${f.first_name} ${f.last_name}
        </div>
        `;
    });

    optionsWrap.innerHTML = html;
    }

  /* ================= RENDER FARMER CARDS ================= */
  function renderFarmerCards() {
    if (!farmerCardList) return;

    const list = filteredFarmers && filteredFarmers.length ? filteredFarmers : allFarmers;

    const totalPages = Math.max(1, Math.ceil(list.length / FARMER_ROWS_PER_PAGE));
    if (farmerPage > totalPages) farmerPage = totalPages;

    const start = (farmerPage - 1) * FARMER_ROWS_PER_PAGE;
    const pageItems = list.slice(start, start + FARMER_ROWS_PER_PAGE);

    if (!pageItems.length) {
      farmerCardList.innerHTML = `
        <div class="text-center text-muted py-4">
          No farmer records found
        </div>`;
      updatePagination(totalPages);
      return;
    }

    let html = "";

    pageItems.forEach(f => {
      const fullName = `${f.first_name || ""} ${f.last_name || ""}`.trim();
      const status = f.status || "Active";
      const isActive = status === "Active";

      html += `
        <div class="farmer-card-modern" data-farmer-card="${f._id}">
          <div class="farmer-card-top">

            <div class="farmer-card-left">
              <div class="farmer-card-avatar">
                <img src="${f.profile_picture || '/images/default-avatar.png'}" alt="Avatar">
              </div>

              <div class="farmer-card-info">
                <div class="farmer-name">${fullName}</div>

                <div class="farmer-meta">
                  <span class="me-2">Farmer ID:</span>
                  <span class="fw-semibold">${f.farmer_id || f._id}</span>
                </div>

                <div class="farmer-meta">
                  ${f.address || "No address provided"}
                </div>

                <div class="farmer-meta">
                  Pens: ${f.num_of_pens ?? 0} | Capacity: ${f.pen_capacity ?? 0}
                </div>
              </div>
            </div>

            <div class="text-end">
              <span class="farmer-status ${isActive ? "status-active" : "status-inactive"}">
                ${status}
              </span>
            </div>
          </div>

          <!-- Reproduction Snapshot (hydrated later) -->
          <div class="farmer-repro-snapshot mt-3" id="repro-${f._id}">
            <div class="repro-grid">
              ${renderReproMetricSkeleton("bi-gender-female", "Active Sows")}
              ${renderReproMetricSkeleton("bi-patch-check", "Pregnant")}
              ${renderReproMetricSkeleton("bi-hourglass-split", "Observation")}
              ${renderReproMetricSkeleton("bi-collection", "Total Born")}
              ${renderReproMetricSkeleton("bi-activity", "Mortality")}
            </div>
            <div class="small text-muted mt-2" id="reproHint-${f._id}">
              Loading reproduction summary…
            </div>
          </div>

          <div class="farmer-card-bottom">
            <button class="btn btn-outline-primary btn-sm view-farmer-btn" data-id="${f._id}">
              View Profile
            </button>
          </div>
        </div>
      `;
    });

    farmerCardList.innerHTML = html;
    updatePagination(totalPages);
    hydrateFarmerReproSummaries(pageItems);
  }

  /* skeleton card for metrics */
  function renderReproMetricSkeleton(icon, label) {
    return `
      <div class="repro-metric">
        <div class="repro-icon"><i class="bi ${icon}"></i></div>
        <div class="repro-text">
          <div class="repro-value">—</div>
          <div class="repro-label">${label}</div>
        </div>
      </div>
    `;
  }

  /* ================= HYDRATE REPRO SUMMARIES (VISIBLE CARDS ONLY) ================= */
  async function hydrateFarmerReproSummaries(farmersOnPage) {
    try {
      // fetch pigs per farmer (only for visible page)
      const jobs = farmersOnPage.map(async (f) => {
        const summary = await getFarmerReproSummary(f._id);
        applyFarmerReproSummaryToCard(f._id, summary);
      });

      await Promise.all(jobs);
    } catch (err) {
      console.error("hydrateFarmerReproSummaries failed:", err);
    }
  }

  /* ================= GET SUMMARY USING EXISTING ENDPOINTS ================= */
  async function getFarmerReproSummary(farmerId) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/farmer/${farmerId}/pigs`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) throw new Error("Failed to load farmer pigs");

      const data = await res.json();
      const pigs = data.pigs || [];

      // Identify adult sows
      const sows = pigs.filter(p =>
        (p.sex || "").toLowerCase() === "female" &&
        (p.age_stage || "").toLowerCase().includes("adult")
      );

      const sowTags = sows.map(s => (s.swine_id || "").toString().trim()).filter(Boolean);

      // Cycle states based on your cycle model
      let pregnantCount = 0;
      let observationCount = 0;

      sows.forEach(sow => {
        const cycles = sow.breeding_cycles || [];
        cycles.forEach(c => {
          // Pregnant if flagged and not farrowed
          if (c?.is_pregnant && !c?.farrowed) pregnantCount++;

          // Under observation if AI date exists but not yet pregnant/farrowed
          if (c?.ai_service_date && !c?.is_pregnant && !c?.farrowed) observationCount++;
        });
      });

      // Born/Dead from allSwineData (you already have it)
      let totalBorn = 0;
      let totalDead = 0;

      if (Array.isArray(allSwineData) && allSwineData.length && sowTags.length) {
        const piglets = allSwineData.filter(p => sowTags.includes((p.dam_id || "").toString().trim()));
        totalBorn = piglets.length;
        totalDead = piglets.filter(p => (p.health_status || "") !== "Healthy").length;
      }

      const mortalityPct = totalBorn > 0 ? ((totalDead / totalBorn) * 100).toFixed(1) : "0.0";

      // Simple attention logic (tweak as you like)
      const needsAttention =
        observationCount > 0 ||
        (Number(mortalityPct) >= 10); // example threshold

      return {
        activeSows: sows.length,
        pregnant: pregnantCount,
        observation: observationCount,
        totalBorn,
        totalDead,
        mortalityPct,
        needsAttention
      };
    } catch (err) {
      console.error("getFarmerReproSummary error:", err);
      return {
        activeSows: 0,
        pregnant: 0,
        observation: 0,
        totalBorn: 0,
        totalDead: 0,
        mortalityPct: "0.0",
        needsAttention: false,
        error: true
      };
    }
  }

  /* ================= APPLY SUMMARY TO DOM ================= */
  function applyFarmerReproSummaryToCard(farmerId, s) {
    const wrap = document.getElementById(`repro-${farmerId}`);
    const attn = document.getElementById(`attn-${farmerId}`);
    const hint = document.getElementById(`reproHint-${farmerId}`);

    if (!wrap) return;

    // Update attention pill
    if (attn) {
      if (s?.error) {
        attn.textContent = "Repro stats unavailable";
        attn.className = "badge rounded-pill bg-secondary-subtle text-secondary farmer-attn-pill";
      } else if (s.needsAttention) {
        attn.innerHTML = `<i class="bi bi-exclamation-triangle me-1"></i> Needs attention`;
        attn.className = "badge rounded-pill bg-warning-subtle text-warning farmer-attn-pill";
      } else {
        attn.classList.add("d-none"); // hide pill completely
      }
    }

    // Replace snapshot grid with real values
    wrap.querySelector(".repro-grid").innerHTML = `
      ${renderReproMetric("bi-gender-female", s.activeSows, "Active Sows")}
      ${renderReproMetric("bi-patch-check", s.pregnant, "Pregnant")}
      ${renderReproMetric("bi-hourglass-split", s.observation, "Observation")}
      ${renderReproMetric("bi-collection", s.totalBorn, "Total Born")}
      ${renderReproMetric("bi-activity", `${s.mortalityPct}%`, "Mortality")}
    `;

    if (hint) {
      hint.textContent = s?.error
        ? "Open profile to view detailed breeding performance."
        : "Snapshot shows sow status and overall litter outcomes.";
    }
  }

  function renderReproMetric(icon, value, label) {
    return `
      <div class="repro-metric">
        <div class="repro-icon"><i class="bi ${icon}"></i></div>
        <div class="repro-text">
          <div class="repro-value">${value ?? "—"}</div>
          <div class="repro-label">${label}</div>
        </div>
      </div>
    `;
  }


  /* ================= PAGINATION ================= */
  function updatePagination(totalPages) {
    const indicator = document.getElementById("farmerPageIndicator");
    const prevBtn = document.getElementById("farmerPrevBtn");
    const nextBtn = document.getElementById("farmerNextBtn");

    if (indicator) {
      indicator.textContent = `Page ${farmerPage} of ${totalPages}`;
    }

    if (prevBtn) prevBtn.disabled = farmerPage <= 1;
    if (nextBtn) nextBtn.disabled = farmerPage >= totalPages;
  }

  document.getElementById("farmerPrevBtn")
    ?.addEventListener("click", () => {
      if (farmerPage > 1) {
        farmerPage--;
        renderFarmerCards();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });

  document.getElementById("farmerNextBtn")
    ?.addEventListener("click", () => {
      const activeList = filteredFarmers && filteredFarmers.length
        ? filteredFarmers
        : allFarmers;

        const totalPages = Math.ceil(activeList.length / FARMER_ROWS_PER_PAGE);

      if (farmerPage < totalPages) {
        farmerPage++;
        renderFarmerCards();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });

  /* ================= VIEW FARMER ================= */
  async function handleViewFarmer(id) {

    const farmer = allFarmers.find(f => f._id === id);
    if (!farmer) return;

    // show loader (uses your existing globalLoader)
    showGlobalLoader("Opening farmer profile...");

    // set avatar correctly + fallback
    setImage("profileAvatar", farmer.profile_picture);

    // Full Name
    const fullName = `${farmer.first_name || ""} ${farmer.last_name || ""}`.trim();
    setText("profileFarmerName", fullName);

    // Contact Details
    setText("profileFarmerContact", farmer.contact_no || farmer.email || "—");
    setText("profilePhone", farmer.contact_no || "—");
    setText("profileEmail", farmer.email || "—");
    setText("profileAddress", farmer.address || "—");

    // Farmer ID (use farmer_id from schema, not _id)
    setText("profileFarmerId", farmer.farmer_id || farmer._id);
    setText("profileFarmerIdOverview", farmer.farmer_id || farmer._id);

    // Pen Data (correct schema fields)
    const penCount = farmer.num_of_pens ?? 0;
    const penCapacity = farmer.pen_capacity ?? 0;

    setText("profilePenCount", penCount);
    setText("profilePenCountOverview", penCount);

    setText("profilePenCapacity", penCapacity);
    setText("profilePenCapacityOverview", penCapacity);

    // Status Badge
    const badge = document.getElementById("profileFarmerStatus");
    if (badge) {
      const isActive = farmer.status === "Active";
      badge.textContent = farmer.status || "Inactive";
      badge.className =
        `badge rounded-pill px-3 py-1 ${
          isActive
            ? "bg-success-subtle text-success"
            : "bg-secondary-subtle text-secondary"
        }`;
    }

    // reset modal tabs to Overview (prevents “stuck” tab state)
    document.querySelectorAll("#farmerProfileTabs .nav-link")
      .forEach(b => b.classList.remove("active"));

    document.querySelector('#farmerProfileTabs .nav-link[data-target="farmerOverviewTab"]')
      ?.classList.add("active");

    document.querySelectorAll(".farmer-tab")
      .forEach(tab => tab.classList.add("d-none"));

    document.getElementById("farmerOverviewTab")
      ?.classList.remove("d-none");

    // ensure pigs panel is in list mode (not analysis)
    document.getElementById("pigAnalysisPanel")?.classList.add("d-none");
    document.getElementById("linkedPigList")?.classList.remove("d-none");
    document.getElementById("farmerPigCategoryTabs")?.classList.remove("hidden-section");
    document.getElementById("pigFilterSection")?.classList.remove("hidden-section");
    document.getElementById("farmerProfileTabs")?.classList.remove("hidden-section");

    // Show modal
    if (farmerModal) farmerModal.show();

    // Load pigs and hide loader after
    await loadLinkedPigs(id);
    hideGlobalLoader();
  }

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
        rawPerformanceData.morphology = perf.morphology || [];
        rawPerformanceData.deformities = perf.deformities || [];
      }

      if (ai.success) rawAiData = ai.data || [];
      if (sel.success) rawSelectionData = sel.data || [];
      if (swine.success) allSwineData = swine.swine || swine.data || [];

    } catch (err) {
      console.error("Research data load error:", err);
    }
  }


  /* ================= LOAD LINKED PIGS ================= */
  async function loadLinkedPigs(farmerId) {
    // Reset analysis view when switching farmer
    document.getElementById("pigAnalysisPanel")?.classList.add("d-none");
    document.getElementById("linkedPigList")?.classList.remove("d-none");
    document.getElementById("farmerPigCategoryTabs")?.classList.remove("hidden-section");
    document.getElementById("pigFilterSection")?.classList.remove("hidden-section");
    document.getElementById("farmerProfileTabs")?.classList.remove("hidden-section");

    pigPage = 1;
    litterPage = 1;
    aiPage = 1;
    filteredPigList = [];

    const wrap = document.getElementById("linkedPigList");
    if (!wrap) return;

    wrap.innerHTML = `<div class="text-muted text-center py-3">Loading pigs...</div>`;

    try {
      // Make sure allSwineData exists for born/dead stats
      if (!Array.isArray(allSwineData) || allSwineData.length === 0) {
        await loadResearchData();
      }

      const res = await fetch(`${BACKEND_URL}/api/farmer/${farmerId}/pigs`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) throw new Error("Failed request");

      const data = await res.json();
      currentFarmerPigs = data.pigs || [];

      // Snapshot cards
      updateReproSnapshotStats();

      if (!currentFarmerPigs.length) {
        wrap.innerHTML = `<div class="text-muted text-center py-3">No pigs registered under this farmer.</div>`;
        setText("profileTotalPigs", 0);
        return;
      }

      setText("profileTotalPigs", currentFarmerPigs.length);
      renderFarmerPigs(); // ✅ no params
    } catch (err) {
      console.error("Load pigs error:", err);
      wrap.innerHTML = `<div class="text-danger text-center py-3">Failed to load pigs</div>`;
    }
  }


  /* ================= RENDER FAMER PIG LIST ================= */
    function renderFarmerPigs() {

    const wrap = document.getElementById("linkedPigList");
    if (!wrap) return;

    const list = activePigCategory === "all" && filteredPigList.length === 0
      ? currentFarmerPigs
      : filteredPigList;


    const totalPages = Math.max(
        1,
        Math.ceil(list.length / PIG_ROWS_PER_PAGE)
    );

    if (pigPage > totalPages) pigPage = totalPages;

    const start = (pigPage - 1) * PIG_ROWS_PER_PAGE;
    const pageItems = list.slice(start, start + PIG_ROWS_PER_PAGE);

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
                <button
                  class="btn btn-sm btn-outline-primary view-pig-btn"
                  data-id="${p._id}">
                  View
                </button>

                <button
                  class="btn btn-sm btn-success analyze-pig-btn"
                  data-id="${p._id}">
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
        <button class="btn btn-sm btn-outline-secondary" id="pigPrevBtn">
        Prev
        </button>

        <span class="small text-muted">
        Page ${pigPage} of ${totalPages}
        </span>

        <button class="btn btn-sm btn-outline-secondary" id="pigNextBtn">
        Next
        </button>
    `;

    wrap.appendChild(pagination);

    const prevBtn = document.getElementById("pigPrevBtn");
    const nextBtn = document.getElementById("pigNextBtn");

    if (prevBtn) prevBtn.disabled = pigPage <= 1;
    if (nextBtn) nextBtn.disabled = pigPage >= totalPages;

    prevBtn?.addEventListener("click", () => {
        if (pigPage > 1) {
        pigPage--;
        renderFarmerPigs();
        }
    });

    nextBtn?.addEventListener("click", () => {
        if (pigPage < totalPages) {
        pigPage++;
        renderFarmerPigs();
        }
    });
    }

    /* ================= FARMER DROPDOWN SELECT ================= */
    document.addEventListener("click", (e) => {

    const option = e.target.closest(".farmer-option");
    if (!option) return;

    selectedFarmerId = option.dataset.id;

    const dropdownBtn = document.getElementById("locationDropdownBtn");
    if (dropdownBtn) {
        dropdownBtn.textContent = option.dataset.name;
    }
    });

    /* ================= FARMER DROPDOWN SEARCH ================= */
    document.getElementById("locationSearch")
    ?.addEventListener("input", (e) => {

        const term = e.target.value.toLowerCase();

        document.querySelectorAll(".farmer-option")
        .forEach(opt => {

            const name = opt.dataset.name.toLowerCase();
            opt.style.display = name.includes(term)
            ? "block"
            : "none";
        });
    });


  /* ================= FILTER FARMERS ================= */
  filtersForm?.addEventListener("submit", (e) => {
    e.preventDefault();

    let filtered = [...allFarmers];

    // Farmer dropdown filter
    if (selectedFarmerId) {
    filtered = filtered.filter(f => f._id === selectedFarmerId);
    }
    
    const status = filterStatus.value;
    const term = searchFarmer.value.trim().toLowerCase();

    if (status) {
      filtered = filtered.filter(f => f.status === status);
    }

    if (term) {
      filtered = filtered.filter(f =>
        `${f.first_name} ${f.last_name}`
          .toLowerCase()
          .includes(term)
      );
    }

    filteredFarmers = filtered;
    farmerPage = 1;
    renderFarmerCards();
  });

    document.getElementById("resetFilters")
    ?.addEventListener("click", () => {

        filtersForm.reset();

        selectedFarmerId = "";

        const dropdownBtn = document.getElementById("locationDropdownBtn");
        if (dropdownBtn) dropdownBtn.textContent = "Farmer";

        filteredFarmers = [...allFarmers];
        farmerPage = 1;
        renderFarmerCards();
    });


/* ================= GLOBAL CLICK HANDLER ================= */
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

  const litterBtn = e.target.closest(".view-litter-performance-btn");
  if (litterBtn) {
    openPigletPerformance(litterBtn.dataset.id);
    return;
  }

  const growthBtn = e.target.closest(".view-growth-btn");
  if (growthBtn) {
    localStorage.setItem("openPigId", growthBtn.dataset.id);
    localStorage.setItem("openPigTab", "performanceTab");
    window.location.assign("/farm-manager/pig-management/swine-list");
    return;
  }

  const boarBtn = e.target.closest(".view-boar-btn");
  if (boarBtn) {

    const boarTag = boarBtn.dataset.tag;

    const boar = allSwineData.find(
      s => s.swine_id === boarTag
    );

    if (boar) {
      localStorage.setItem("openPigId", boar._id);
      window.location.assign("/farm-manager/pig-management/swine-list");
    }

    return;
  }

  const sowBtn = e.target.closest(".view-sow-cycles-btn");
  if (sowBtn) {
    openSowCycles(sowBtn.dataset.id);
    return;
  }

});

  /* ================= FARMER TAB SWITCH ================= */
    document
    .querySelectorAll("#farmerProfileTabs .nav-link")
    .forEach(btn => {

        btn.addEventListener("click", () => {

        // Remove active from all
        document
            .querySelectorAll("#farmerProfileTabs .nav-link")
            .forEach(b => b.classList.remove("active"));

        // Add active to clicked
        btn.classList.add("active");

        // Hide all tab content
        document
            .querySelectorAll(".farmer-tab")
            .forEach(tab => tab.classList.add("d-none"));

        // Show selected
        const target = btn.dataset.target;
        const targetEl = document.getElementById(target);
        if (targetEl) targetEl.classList.remove("d-none");

        // Render Breeding Performance when tab opens
        if (target === "breedingPerformanceTab") {
          renderBreedingPerformance();
        }

        });

    });

    /* ================= PIG CATEGORY TABS ================= */
    document.getElementById("farmerPigCategoryTabs")
    ?.addEventListener("click", (e) => {

        const btn = e.target.closest(".nav-link");
        if (!btn) return;

        // Remove active state
        document
        .querySelectorAll("#farmerPigCategoryTabs .nav-link")
        .forEach(b => b.classList.remove("active"));

        btn.classList.add("active");

        activePigCategory = btn.dataset.type;
        applyPigFilters();
    });


    /* ================= ANALYSIS TAB SWITCH ================= */
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

      document.getElementById(target)
        ?.classList.remove("d-none");
    });


    /* ================= PIG FILTER FORM ================= */
    document.getElementById("farmerPigFilters")
    ?.addEventListener("submit", (e) => {
        e.preventDefault();
        applyPigFilters();
    });

    /* ================= RESET PIG FILTERS ================= */
    document.getElementById("resetPigFilters")
    ?.addEventListener("click", () => {

        document.getElementById("pigSearchTag").value = "";
        document.getElementById("pigStatusFilter").value = "";

        activePigCategory = "all";
        pigPage = 1;

        document
        .querySelectorAll("#farmerPigCategoryTabs .nav-link")
        .forEach(b => b.classList.remove("active"));

        document
        .querySelector('[data-type="all"]')
        ?.classList.add("active");

        filteredPigList = [...currentFarmerPigs];
        renderFarmerPigs();
    });

    /* ================= APPLY PIG FILTERS ================= */
    function applyPigFilters() {

    let filtered = [...currentFarmerPigs];

    const tag =
        document.getElementById("pigSearchTag")?.value
        .trim()
        .toLowerCase() || "";

    const status =
        document.getElementById("pigStatusFilter")?.value || "";

    /* CATEGORY FILTER */
    if (activePigCategory !== "all") {

      filtered = filtered.filter(p => {

        const stage = (p.age_stage || "").toString().trim().toLowerCase();
        const sex = (p.sex || "").toString().trim().toLowerCase();

        switch (activePigCategory) {

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

    /* TAG FILTER */
    if (tag) {
        filtered = filtered.filter(p =>
        p.swine_id?.toLowerCase().includes(tag)
        );
    }

    /* STATUS FILTER */
    if (status) {
        filtered = filtered.filter(p =>
        p.health_status === status
        );
    }

    filteredPigList = filtered;
    pigPage = 1;
    renderFarmerPigs();
    }

    /* ================= GENETIC EVALUATION ENGINE ================= */
    function evaluateGenetics(pig) {

      const result = {
        eligibility: "Unknown",
        reason: "",
        badgeClass: "bg-secondary"
      };

      const stage = pig.age_stage?.toLowerCase();
      const sex = pig.sex?.toLowerCase();

      // Basic Disqualifiers
      if (pig.deformities && pig.deformities !== "None") {
        result.eligibility = "Cull – Structural Defect";
        result.reason = "Has recorded deformities";
        result.badgeClass = "bg-danger";
        return result;
      }

      if (sex === "female" && pig.teat_count && pig.teat_count < 12) {
        result.eligibility = "Cull – Low Teat Count";
        result.reason = "Teat count below breeding standard";
        result.badgeClass = "bg-danger";
        return result;
      }

      // Stage-based logic
      if (stage === "piglet") {
        result.eligibility = "Under Evaluation";
        result.reason = "Too young for breeding";
        result.badgeClass = "bg-warning text-dark";
        return result;
      }

      if (stage === "adult") {
        result.eligibility = "Breeding Eligible";
        result.reason = "Meets baseline requirements";
        result.badgeClass = "bg-success";
        return result;
      }

      return result;
    }

    /* ================= STAGE-BASED TAB VISIBILITY ================= */
    function applyStageBasedTabVisibility(pig) {

      const stage = pig.age_stage?.toLowerCase();
      const sex = pig.sex?.toLowerCase();

      // Reset all tabs first
      document.querySelectorAll("#pigAnalysisTabs .nav-item")
        .forEach(tab => tab.classList.remove("d-none"));

      // Hide Breeding & Litter for piglets
      if (stage === "piglet") {
        hideAnalysisTab("pigBreedingTab");
        hideAnalysisTab("pigPerformanceTab");
      }

      // Hide Litter Performance for Boars
      if (sex === "male") {
        hideAnalysisTab("pigPerformanceTab");
      }
    }

    function hideAnalysisTab(tabId) {
      const button = document.querySelector(
        `#pigAnalysisTabs [data-target="${tabId}"]`
      );
      if (button) {
        button.closest(".nav-item")?.classList.add("d-none");
      }
    }

    /* ================= OPEN PIG ANALYSIS ================= */
    function openPigAnalysis(pigId) {

    const pig = currentFarmerPigs.find(p => p._id === pigId);
    if (!pig) return;

    // Hide normal pig UI
    document.getElementById("linkedPigList")
      ?.classList.add("d-none");

    document.getElementById("farmerPigCategoryTabs")
      ?.classList.add("hidden-section");

    document.getElementById("pigFilterSection")
      ?.classList.add("hidden-section");

    document.getElementById("farmerProfileTabs")
      ?.classList.add("hidden-section");

    // Show analysis panel
    document.getElementById("pigAnalysisPanel")
      ?.classList.remove("d-none");

    // Reset active tab to Profile
    document.querySelectorAll("#pigAnalysisTabs .nav-link")
      .forEach(b => b.classList.remove("active"));

    document.querySelector("#pigAnalysisTabs .nav-link")
      ?.classList.add("active");

    document.querySelectorAll(".pig-analysis-tab")
      .forEach(tab => tab.classList.add("d-none"));

    document.getElementById("pigProfileTab")
      ?.classList.remove("d-none");

    // Set header
    setText("analysisPigTitle", pig.swine_id);
    setText("analysisPigMeta",
      `${pig.breed || "Native"} · ${pig.sex || "—"} · ${pig.age_stage || "—"}`
    );

    const genetics = evaluateGenetics(pig);

    renderPigProfile(pig, genetics);
    renderPigBreeding(pig);
    renderPigPerformance(pig);
    renderPigGrowth(pig);
    renderPigHealth(pig);
    renderPigSelection(pig, genetics);

    applyStageBasedTabVisibility(pig);
  }

  document.getElementById("backToPigList")
  ?.addEventListener("click", () => {

  document.getElementById("pigAnalysisPanel")
    ?.classList.add("d-none");

  document.getElementById("linkedPigList")
    ?.classList.remove("d-none");

  document.getElementById("farmerPigCategoryTabs")
    ?.classList.remove("hidden-section");

  document.getElementById("pigFilterSection")
    ?.classList.remove("hidden-section");

  document.getElementById("farmerProfileTabs")
    ?.classList.remove("hidden-section");
});

  //Profile
  function renderPigProfile(pig, genetics) {

    const wrap = document.getElementById("pigProfileTab");
    if (!wrap) return;

    wrap.innerHTML = `
      <div class="analysis-card">

        <div class="d-flex justify-content-between align-items-center mb-3">
          <h6 class="mb-0">Genetic Evaluation</h6>
          <span class="badge ${genetics.badgeClass}">
            ${genetics.eligibility}
          </span>
        </div>

        <div class="analysis-row">
          <span class="analysis-label">Reason</span>
          <span class="analysis-value">${genetics.reason || "—"}</span>
        </div>

        <hr>

        <div class="analysis-row">
          <span class="analysis-label">Tag</span>
          <span class="analysis-value">${pig.swine_id}</span>
        </div>

        <div class="analysis-row">
          <span class="analysis-label">Breed</span>
          <span class="analysis-value">${pig.breed || "Native"}</span>
        </div>

        <div class="analysis-row">
          <span class="analysis-label">Sex</span>
          <span class="analysis-value">${pig.sex}</span>
        </div>

        <div class="analysis-row">
          <span class="analysis-label">Stage</span>
          <span class="analysis-value">${pig.age_stage}</span>
        </div>

        <div class="analysis-row">
          <span class="analysis-label">Mother</span>
          <span class="analysis-value">${pig.sow_tag || "—"}</span>
        </div>

        <div class="analysis-row">
          <span class="analysis-label">Father</span>
          <span class="analysis-value">${pig.boar_tag || "—"}</span>
        </div>

      </div>
    `;
  }


  //Breeding
  function renderPigBreeding(pig) {

    const wrap = document.getElementById("pigBreedingTab");
    if (!wrap) return;

    // Reset page when opening new pig
    aiPage = 1;

    currentAiRecords = rawAiData.filter(r =>
      r.sow_tag === pig.swine_id ||
      r.boar_tag === pig.swine_id
    );

    if (!currentAiRecords.length) {
      wrap.innerHTML = `
        <div class="analysis-card text-center text-muted">
          No artificial insemination records found.
        </div>
      `;
      return;
    }

    renderAiCards(pig);
  }

  function renderAiCards(pig) {

    const wrap = document.getElementById("pigBreedingTab");
    if (!wrap) return;

    const totalPages = Math.max(
      1,
      Math.ceil(currentAiRecords.length / AI_ROWS_PER_PAGE)
    );

    if (aiPage > totalPages) aiPage = totalPages;

    const start = (aiPage - 1) * AI_ROWS_PER_PAGE;
    const pageItems = currentAiRecords.slice(start, start + AI_ROWS_PER_PAGE);

    let html = `<div class="analysis-card">`;

    pageItems.forEach(r => {

      const isSow = r.sow_tag === pig.swine_id;
      const partnerTag = isSow ? r.boar_tag : r.sow_tag;

      // STATUS LOGIC
      let status = r.status || "Completed";

      let statusClass = {
        "Completed": "bg-success-subtle text-success",
        "Ongoing": "bg-warning-subtle text-warning",
        "Failed": "bg-danger-subtle text-danger"
      }[status] || "bg-secondary-subtle text-secondary";

      html += `
        <div class="border rounded p-3 mb-3">

          <div class="d-flex justify-content-between align-items-start mb-2">
            <div>
              <div class="fw-semibold">
                Partner: ${partnerTag || "—"}
              </div>
              <div class="small text-muted">
                Started Date:
                ${r.date ? new Date(r.date).toLocaleDateString() : "—"}
              </div>
            </div>

            <span class="badge rounded-pill px-3 ${statusClass}">
              ${status}
            </span>
          </div>

          <div class="row g-3 mt-1">

            <div class="col-md-4">
              <div class="small text-muted">Expected Farrowing</div>
              <div>
                ${
                  r.expected_farrowing_date
                    ? new Date(r.expected_farrowing_date).toLocaleDateString()
                    : "—"
                }
              </div>
            </div>

            <div class="col-md-4">
              <div class="small text-muted">Actual Farrowing</div>
              <div>
                ${
                  r.actual_farrowing_date
                    ? new Date(r.actual_farrowing_date).toLocaleDateString()
                    : "—"
                }
              </div>
            </div>

            <div class="col-md-4 text-end">
              ${
                isSow
                  ? `
                    <button
                      class="btn btn-sm btn-outline-primary view-boar-btn"
                      data-tag="${partnerTag}">
                      View Boar
                    </button>
                  `
                  : ""
              }
            </div>

          </div>

        </div>
      `;
    });

    html += `
      <div class="d-flex justify-content-between align-items-center mt-3">
        <button class="btn btn-sm btn-outline-secondary" id="aiPrevBtn">
          Prev
        </button>

        <span class="small text-muted">
          Page ${aiPage} of ${totalPages}
        </span>

        <button class="btn btn-sm btn-outline-secondary" id="aiNextBtn">
          Next
        </button>
      </div>
    `;

    html += `</div>`;

    wrap.innerHTML = html;

    document.getElementById("aiPrevBtn").disabled = aiPage <= 1;
    document.getElementById("aiNextBtn").disabled = aiPage >= totalPages;

    document.getElementById("aiPrevBtn")
      ?.addEventListener("click", () => {
        if (aiPage > 1) {
          aiPage--;
          renderAiCards(pig);
        }
      });

    document.getElementById("aiNextBtn")
      ?.addEventListener("click", () => {
        if (aiPage < totalPages) {
          aiPage++;
          renderAiCards(pig);
        }
      });
  }



  // Performance
  function renderPigPerformance(pig) {

    const wrap = document.getElementById("pigPerformanceTab");
    if (!wrap) return;

    const sex = (pig.sex || "").toLowerCase();
    const stage = (pig.age_stage || "").toLowerCase();

    // Only adult female should have litter view
    if (!(sex === "female" && stage.includes("adult"))) {
      wrap.innerHTML = `<div class="analysis-card">No litter data available.</div>`;
      return;
    }

    // Get piglets under this sow
    currentLitterPiglets = allSwineData.filter(child => {

      const damId = (child.dam_id || child.mother_id || "").toString().trim();
      const pigId = (pig.swine_id || "").toString().trim();

      return damId === pigId;
    });

    if (!currentLitterPiglets.length) {
      wrap.innerHTML = `<div class="analysis-card">No piglets found for this sow.</div>`;
      return;
    }

    renderLitterCards();
  }

  //Litter Card
  function renderLitterCards() {

  const wrap = document.getElementById("pigPerformanceTab");
  if (!wrap) return;

  const totalPages = Math.max(
    1,
    Math.ceil(currentLitterPiglets.length / LITTER_ROWS_PER_PAGE)
  );

  if (litterPage > totalPages) litterPage = totalPages;

  const start = (litterPage - 1) * LITTER_ROWS_PER_PAGE;
  const pageItems = currentLitterPiglets.slice(start, start + LITTER_ROWS_PER_PAGE);

  let html = `<div class="analysis-card">`;

  pageItems.forEach(piglet => {

    html += `
      <div class="litter-card d-flex justify-content-between align-items-center mb-3 p-3 border rounded">

        <div>
          <div><strong>${piglet.swine_id}</strong></div>
          <div class="small text-muted">
            ${piglet.sex} · ${piglet.age_stage}
          </div>
          <div class="small text-muted">
            Batch: ${piglet.batch_id || "N/A"}
          </div>
        </div>

        <button
          class="btn btn-sm btn-outline-primary view-growth-btn"
          data-id="${piglet._id}">
          View
        </button>
      </div>
    `;
  });

  html += `
    <div class="d-flex justify-content-between align-items-center mt-3">
      <button class="btn btn-sm btn-outline-secondary" id="litterPrevBtn">
        Prev
      </button>

      <span class="small text-muted">
        Page ${litterPage} of ${totalPages}
      </span>

      <button class="btn btn-sm btn-outline-secondary" id="litterNextBtn">
        Next
      </button>
    </div>
  `;

  html += `</div>`;

  wrap.innerHTML = html;

  document.getElementById("litterPrevBtn").disabled = litterPage <= 1;
  document.getElementById("litterNextBtn").disabled = litterPage >= totalPages;

  document.getElementById("litterPrevBtn")
    .addEventListener("click", () => {
      if (litterPage > 1) {
        litterPage--;
        renderLitterCards();
      }
    });

  document.getElementById("litterNextBtn")
    .addEventListener("click", () => {
      if (litterPage < totalPages) {
        litterPage++;
        renderLitterCards();
      }
    });
}



  //Growth
  function renderPigGrowth(pig) {
    const wrap = document.getElementById("pigGrowthTab");
    if (!wrap) return;

    wrap.innerHTML = `
      <div class="profile-card">
        <div class="profile-row"><span>Weight</span><span>${pig.weight || 0} kg</span></div>
        <div class="profile-row"><span>Body Length</span><span>${pig.body_length || 0} cm</span></div>
        <div class="profile-row"><span>Heart Girth</span><span>${pig.heart_girth || 0} cm</span></div>
      </div>
    `;
  }

  //Health
  function renderPigHealth(pig) {

    const wrap = document.getElementById("pigHealthTab");
    if (!wrap) return;

    const deformities = rawPerformanceData.deformities
      .filter(d => d.swine_tag === pig.swine_id);

    if (!deformities.length) {
      wrap.innerHTML = `
        <div class="analysis-card">
          <span class="text-success">No deformities recorded.</span>
        </div>`;
      return;
    }

    wrap.innerHTML = `
      <div class="analysis-card">
        ${deformities.map(d => `
          <div class="analysis-row">
            <span class="analysis-label">Defect</span>
            <span class="analysis-value text-danger">
              ${d.deformity_types}
            </span>
          </div>
          <div class="analysis-row">
            <span class="analysis-label">Logged</span>
            <span class="analysis-value">
              ${new Date(d.date_detected).toLocaleDateString()}
            </span>
          </div>
          <hr>
        `).join("")}
      </div>
    `;
  }


  //Selection
  function renderPigSelection(pig, genetics) {

    const wrap = document.getElementById("pigSelectionTab");
    if (!wrap) return;

    wrap.innerHTML = `
      <div class="analysis-card">

        <div class="analysis-row">
          <span class="analysis-label">Selection Classification</span>
          <span class="analysis-value">${genetics.eligibility}</span>
        </div>

        <div class="analysis-row">
          <span class="analysis-label">Research Notes</span>
          <span class="analysis-value">${pig.selection_notes || genetics.reason || "—"}</span>
        </div>

        <div class="analysis-row">
          <span class="analysis-label">Market Channel</span>
          <span class="analysis-value">
            ${
              genetics.eligibility.includes("Cull")
                ? "For Market"
                : "Breeding Pool"
            }
          </span>
        </div>

      </div>
    `;
  }

  /* ================= LITTER DETAIL VIEW ================= */
  function openPigletPerformance(pigletId) {

    const piglet = currentLitterPiglets.find(p => p._id === pigletId);
    if (!piglet) return;

    const wrap = document.getElementById("pigPerformanceTab");

    const records = rawPerformanceData.morphology
      .filter(m => m.swine_tag === piglet.swine_id);

    if (!records.length) {
      wrap.innerHTML = `
        <div class="analysis-card">
          <button class="btn btn-sm btn-outline-secondary mb-3" id="backToLitterList">
            ← Back
          </button>
          No performance records found.
        </div>
      `;
      return;
    }

    wrap.innerHTML = `
      <div class="analysis-card">

        <button class="btn btn-sm btn-outline-secondary mb-3" id="backToLitterList">
          ← Back
        </button>

        <h6>${piglet.swine_id} Performance</h6>
        <hr>

        ${records.map(r => `
          <div class="analysis-row">
            <span class="analysis-label">Stage</span>
            <span class="analysis-value">${r.morphology.stage}</span>
          </div>
          <div class="analysis-row">
            <span class="analysis-label">Weight</span>
            <span class="analysis-value">${r.morphology.weight} kg</span>
          </div>
          <div class="analysis-row">
            <span class="analysis-label">Body Length</span>
            <span class="analysis-value">${r.morphology.body_length} cm</span>
          </div>
          <div class="analysis-row">
            <span class="analysis-label">Date</span>
            <span class="analysis-value">
              ${new Date(r.morphology.date).toLocaleDateString()}
            </span>
          </div>
          <hr>
        `).join("")}

      </div>
    `;

    document.getElementById("backToLitterList")
      .addEventListener("click", () => {
        renderLitterCards();
      });
  }


    function groupPigletsByCycle(sow) {

      const piglets = allSwineData.filter(p =>
        (p.dam_id || "").trim() === sow.swine_id
      );

      const grouped = {};

      piglets.forEach(p => {

        const cycle = p.birth_cycle_number || "Unknown";

        if (!grouped[cycle]) grouped[cycle] = [];
        grouped[cycle].push(p);
      });

      return grouped;
    }


  function renderBreedingPerformance() {

    const wrap = document.getElementById("breedingSowList");
    const kpiWrap = document.getElementById("breedingKpiSection");

    if (!wrap || !kpiWrap) return;

    wrap.innerHTML = "";

    // 1️⃣ FILTER SOWS
    breedingSowsCache = currentFarmerPigs.filter(p =>
      p.sex?.toLowerCase() === "female" &&
      p.age_stage?.toLowerCase().includes("adult")
    );

    if (!breedingSowsCache.length) {
      wrap.innerHTML = `<div class="text-muted">No adult sows found.</div>`;
      return;
    }

    // 2️⃣ PAGINATION
    const totalPages = Math.max(
      1,
      Math.ceil(breedingSowsCache.length / BREEDING_SOWS_PER_PAGE)
    );

    if (breedingSowPage > totalPages)
      breedingSowPage = totalPages;

    const start = (breedingSowPage - 1) * BREEDING_SOWS_PER_PAGE;
    const pageItems = breedingSowsCache.slice(
      start,
      start + BREEDING_SOWS_PER_PAGE
    );

    // 3️⃣ KPI ACCUMULATORS
    let totalBornAll = 0;
    let totalDeadAll = 0;
    let totalCycles = 0;

    // 4️⃣ RENDER PAGE SOWS
    pageItems.forEach(sow => {

      const cycles = groupPigletsByCycle(sow);
      const cycleKeys = Object.keys(cycles);

      totalCycles += cycleKeys.length;

      let sowBorn = 0;
      let sowDead = 0;

      cycleKeys.forEach(c => {
        const piglets = cycles[c];
        const born = piglets.length;
        const dead = piglets.filter(p => p.health_status !== "Healthy").length;

        sowBorn += born;
        sowDead += dead;
      });

      totalBornAll += sowBorn;
      totalDeadAll += sowDead;

      const mortality = sowBorn > 0
        ? ((sowDead / sowBorn) * 100).toFixed(1)
        : 0;

      wrap.insertAdjacentHTML("beforeend", `
        <div class="card shadow-sm border-0 mb-3">
          <div class="card-body d-flex justify-content-between align-items-center">

            <div>
              <div class="fw-semibold">${sow.swine_id}</div>
              <div class="small text-muted">
                Cycles: ${cycleKeys.length} |
                Total Born: ${sowBorn} |
                Mortality: ${mortality}%
              </div>
            </div>

            <button
              class="btn btn-sm btn-outline-primary view-sow-cycles-btn"
              data-id="${sow._id}">
              View Cycles
            </button>

          </div>
        </div>
      `);
    });

    // 5️⃣ PAGINATION BUTTONS (OUTSIDE LOOP)
    wrap.insertAdjacentHTML("beforeend", `
      <div class="d-flex justify-content-between align-items-center mt-3">
        <button class="btn btn-sm btn-outline-secondary" id="breedingPrevBtn">
          Prev
        </button>

        <span class="small text-muted">
          Page ${breedingSowPage} of ${totalPages}
        </span>

        <button class="btn btn-sm btn-outline-secondary" id="breedingNextBtn">
          Next
        </button>
      </div>
    `);

    document.getElementById("breedingPrevBtn").disabled =
      breedingSowPage <= 1;

    document.getElementById("breedingNextBtn").disabled =
      breedingSowPage >= totalPages;

    document.getElementById("breedingPrevBtn")
      ?.addEventListener("click", () => {
        if (breedingSowPage > 1) {
          breedingSowPage--;
          renderBreedingPerformance();
        }
      });

    document.getElementById("breedingNextBtn")
      ?.addEventListener("click", () => {
        if (breedingSowPage < totalPages) {
          breedingSowPage++;
          renderBreedingPerformance();
        }
      });

    // 6️⃣ KPI SECTION
    const overallMortality = totalBornAll > 0
      ? ((totalDeadAll / totalBornAll) * 100).toFixed(1)
      : 0;

    kpiWrap.innerHTML = `
      <div class="col-md-3">
        <div class="card text-center p-3 shadow-sm border-0">
          <div class="small text-muted">Total Sows</div>
          <div class="fs-4 fw-bold">${breedingSowsCache.length}</div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card text-center p-3 shadow-sm border-0">
          <div class="small text-muted">Total Cycles</div>
          <div class="fs-4 fw-bold">${totalCycles}</div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card text-center p-3 shadow-sm border-0">
          <div class="small text-muted">Total Piglets</div>
          <div class="fs-4 fw-bold">${totalBornAll}</div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card text-center p-3 shadow-sm border-0">
          <div class="small text-muted">Avg Mortality</div>
          <div class="fs-4 fw-bold text-danger">${overallMortality}%</div>
        </div>
      </div>
    `;
  }

  /* ================= BREEDING DETAIL VIEW ================= */
  function closeSowDetailView() {

    document.getElementById("breedingCyclePanel")
      ?.classList.add("d-none");

    document.getElementById("breedingSowList")
      ?.classList.remove("d-none");

    document.getElementById("breedingKpiSection")
      ?.classList.remove("d-none");
  }

  /* ================= OPEN SOW CYCLE LIST ================= */
  function openSowCycles(sowId) {

    const sow = currentFarmerPigs.find(p => p._id === sowId);
    if (!sow) return;

    activeSowForBreeding = sow;

    // Hide list & KPI
    document.getElementById("breedingSowList")?.classList.add("d-none");
    document.getElementById("breedingKpiSection")?.classList.add("d-none");

    // Show detail panel
    const panel = document.getElementById("breedingCyclePanel");
    if (!panel) return;

    panel.classList.remove("d-none");

    panel.innerHTML = `
      <div class="mb-3">
        <button class="btn btn-sm btn-outline-secondary" id="backToSowList">
          ← Back to Sow List
        </button>
      </div>

      <div class="card shadow-sm border-0 mb-4">
        <div class="card-body d-flex justify-content-between align-items-center">

          <div>
            <h5 class="mb-1">Sow: ${sow.swine_id}</h5>
            <div class="text-muted small">
              Breed: ${sow.breed || "Native"}
            </div>
          </div>

          <button
            class="btn btn-sm btn-outline-dark"
            id="toggleSowAnalyticsBtn">
            <i class="bi bi-bar-chart-line"></i>
            View Analytics
          </button>

        </div>
      </div>

      <div id="sowAnalyticsContainer" class="mb-4 d-none"></div>


      <div id="cycleCardsContainer"></div>
    `;

    document.getElementById("backToSowList")
      ?.addEventListener("click", () => {
        closeSowDetailView();
      });

    document.getElementById("toggleSowAnalyticsBtn")
      ?.addEventListener("click", () => {
        toggleSowAnalytics(sow);
      });

    const cycles = groupPigletsByCycle(sow);
    const cycleNumbers = Object.keys(cycles)
      .filter(c => c !== "Unknown")
      .sort((a,b)=> b - a);

    renderCycleCards(sow);
  }

  /* ================= OPEN CYCLE DETAIL ================= */
  function openCycleDetail(sow, cycleNumber) {

    const panel = document.getElementById("breedingCyclePanel");
    if (!panel) return;

    const cycle = sow.breeding_cycles.find(
      c => c.cycle_number == cycleNumber
    );

    if (!cycle) return;
    breedingPigletPage = 1;
    let boar = allSwineData.find(
      s => String(s._id) === String(cycle.cycle_sire_id)
    );

    if (!boar) {
      boar = allSwineData.find(
        s => s.swine_id === cycle.cycle_sire_id
      );
    }

    const piglets = allSwineData.filter(p =>
      String(p.dam_id) === String(sow.swine_id) &&
      String(p.birth_cycle_number) === String(cycleNumber)
    );


    panel.innerHTML = `
      <div class="mb-3">
        <button class="btn btn-sm btn-outline-secondary" id="backToCycleList">
          ← Back to Cycles
        </button>
      </div>

      ${renderParentCard("Mother (Sow)", sow)}
      ${renderParentCard("Father (Boar)", boar)}

      <div class="card shadow-sm border-0 mt-4">
        <div class="card-body">
          <h6>Piglets</h6>
          ${renderPigletList(piglets)}
        </div>
      </div>
    `;

    document.getElementById("backToCycleList")
      ?.addEventListener("click", () => {
        openSowCycles(sow._id);
      });
  }

  /* ================= RENDER CYCLE CARDS ================= */
  function renderCycleCards(sow) {

    const wrap = document.getElementById("cycleCardsContainer");
    if (!wrap) return;

    const cycles = sow.breeding_cycles
      ?.sort((a,b)=> b.cycle_number - a.cycle_number) || [];

    if (!cycles.length) {
      wrap.innerHTML = `
        <div class="text-muted">
          No breeding cycles found.
        </div>
      `;
      return;
    }

    let html = "";

    cycles.forEach(cycle => {

      const cycleNumber = cycle.cycle_number;

      // Determine Status Dynamically
      let status = "Heat Stage";

      if (cycle.farrowed) status = "Completed";
      else if (cycle.is_pregnant) status = "Pregnant";
      else if (cycle.ai_service_date) status = "Under Observation";

      const statusClass = {
        "Completed": "bg-success-subtle text-success",
        "Pregnant": "bg-primary-subtle text-primary",
        "Under Observation": "bg-warning-subtle text-warning",
        "Heat Stage": "bg-secondary-subtle text-secondary"
      }[status];

      const piglets = allSwineData.filter(p =>
        p.dam_id === sow.swine_id &&
        p.birth_cycle_number === cycleNumber
      );

      const born = piglets.length;
      const dead = piglets.filter(p =>
        p.health_status !== "Healthy"
      ).length;

      const mortality = born > 0
        ? ((dead/born)*100).toFixed(1)
        : 0;

      html += `
        <div class="card shadow-sm border-0 mb-3">
          <div class="card-body d-flex justify-content-between align-items-center">

            <div>
              <div class="fw-semibold">
                Cycle / Batch ${cycleNumber}
              </div>
              <div class="small text-muted">
                AI Date: ${
                  cycle.ai_service_date
                    ? new Date(cycle.ai_service_date).toLocaleDateString()
                    : "—"
                }
              </div>
              <div class="small text-muted">
                Born: ${born} |
                Mortality: ${mortality}%
              </div>
            </div>

            <div class="d-flex align-items-center gap-3">
              <span class="badge ${statusClass}">
                ${status}
              </span>

              <button
                class="btn btn-sm btn-outline-primary open-cycle-btn"
                data-cycle="${cycleNumber}">
                View
              </button>
            </div>

          </div>
        </div>
      `;
    });

    wrap.innerHTML = html;

    document.querySelectorAll(".open-cycle-btn")
      .forEach(btn => {
        btn.addEventListener("click", () => {
          openCycleDetail(sow, btn.dataset.cycle);
        });
      });
  }

  /* ================= TOGGLE SOW ANALYTICS ================= */
  function toggleSowAnalytics(sow) {

    const container = document.getElementById("sowAnalyticsContainer");
    if (!container) return;

    if (!container.classList.contains("d-none")) {
      container.classList.add("d-none");
      return;
    }

    const cycles = groupPigletsByCycle(sow);
    const cycleNumbers = Object.keys(cycles)
      .filter(c => c !== "Unknown")
      .sort((a,b) => a - b);

    if (!cycleNumbers.length) {
      container.innerHTML = `
        <div class="card shadow-sm border-0 p-4 text-center text-muted">
          No cycle data available.
        </div>
      `;
      container.classList.remove("d-none");
      return;
    }

    let totalBorn = 0;
    let totalDead = 0;

    cycleNumbers.forEach(c => {
      const born = cycles[c].length;
      const dead = cycles[c].filter(p => p.health_status !== "Healthy").length;
      totalBorn += born;
      totalDead += dead;
    });

    const avgMortality = totalBorn > 0
      ? ((totalDead / totalBorn) * 100).toFixed(1)
      : 0;

    container.innerHTML = `
      <div class="card shadow-sm border-0 mb-4">
        <div class="card-body">

          <div class="row text-center mb-4">

            <div class="col-md-3">
              <div class="small text-muted">
                <i class="bi bi-repeat"></i> Total Cycles
              </div>
              <div class="fs-4 fw-bold">${cycleNumbers.length}</div>
            </div>

            <div class="col-md-3">
              <div class="small text-muted">
                <i class="bi bi-egg"></i> Total Born
              </div>
              <div class="fs-4 fw-bold">${totalBorn}</div>
            </div>

            <div class="col-md-3">
              <div class="small text-muted">
                <i class="bi bi-x-circle"></i> Total Dead
              </div>
              <div class="fs-4 fw-bold text-danger">${totalDead}</div>
            </div>

            <div class="col-md-3">
              <div class="small text-muted">
                <i class="bi bi-activity"></i> Avg Mortality
              </div>
              <div class="fs-4 fw-bold text-danger">${avgMortality}%</div>
            </div>

          </div>

          <canvas id="breedingLifetimeChart" height="120"></canvas>

        </div>
      </div>
    `;

    container.classList.remove("d-none");

    renderLifetimeMortalityChart(cycleNumbers, cycles);
  }

  /* ================= RENDER PARENT CARDS ================= */
  function renderParentCard(title, parent) {

    if (!parent) {
      return `
        <div class="card shadow-sm border-0 mb-4">
          <div class="card-body">
            <h6>${title}</h6>
            <div class="text-muted">Unknown</div>
          </div>
        </div>
      `;
    }

    const latestPerf = parent.performance_records?.[
      parent.performance_records.length - 1
    ];

    return `
      <div class="card shadow-sm border-0 mb-4">
        <div class="card-body">

          <div class="d-flex justify-content-between align-items-center mb-2">
            <h6 class="mb-0">${title}</h6>
            <span class="badge ${
              parent.health_status === "Healthy"
                ? "bg-success-subtle text-success"
                : "bg-danger-subtle text-danger"
            }">
              ${parent.health_status}
            </span>
          </div>

          <div class="row g-3">

            <div class="col-md-3">
              <div class="small text-muted">ID</div>
              <div>${parent.swine_id}</div>
            </div>

            <div class="col-md-3">
              <div class="small text-muted">Breed</div>
              <div>${parent.breed || "Native"}</div>
            </div>

            <div class="col-md-2">
              <div class="small text-muted">Sex</div>
              <div>${parent.sex}</div>
            </div>

            <div class="col-md-2">
              <div class="small text-muted">Stage</div>
              <div>${parent.age_stage}</div>
            </div>

            <div class="col-md-2">
              <div class="small text-muted">Weight</div>
              <div>${latestPerf?.weight || "—"} kg</div>
            </div>

          </div>

        </div>
      </div>
    `;
  }

  /* ================= RENDER PIGLETS LIST ================= */
  function renderPigletList(piglets) {

    const totalPages = Math.max(1,
      Math.ceil(piglets.length / PIGLETS_PER_PAGE)
    );

    const start = (breedingPigletPage - 1) * PIGLETS_PER_PAGE;
    const pageItems = piglets.slice(start, start + PIGLETS_PER_PAGE);

    let html = "";

    pageItems.forEach(p => {

      const alive = p.health_status === "Healthy";

      html += `
        <div class="d-flex justify-content-between border rounded p-2 mb-2">
          <div>
            <strong>${p.swine_id}</strong>
            <div class="small text-muted">
              ${p.sex} · ${p.age_stage}
            </div>
          </div>
          <span class="badge ${
            alive
              ? "bg-success-subtle text-success"
              : "bg-danger-subtle text-danger"
          }">
            ${alive ? "Alive" : "Dead"}
          </span>
        </div>
      `;
    });

    return html;
  }

  /* ================= LIFETIME MORTALITY LINE CHART ================= */
  function renderLifetimeMortalityChart(cycleNumbers, cycles) {

    const ctx = document.getElementById("breedingLifetimeChart");
    if (!ctx) return;

    const mortalityRates = cycleNumbers.map(cycle => {

      const piglets = cycles[cycle];
      const born = piglets.length;
      const dead = piglets.filter(p => p.health_status !== "Healthy").length;

      return born > 0
        ? ((dead/born)*100).toFixed(1)
        : 0;
    });

    if (breedingChartInstance)
      breedingChartInstance.destroy();

        breedingChartInstance = new Chart(ctx, {
          type: "bar",
          data: {
            labels: cycleNumbers.map(c => `Cycle ${c}`),
            datasets: [{
              label: "Mortality Rate (%)",
              data: mortalityRates,
              backgroundColor: "rgba(220,53,69,0.6)"
            }]
          },
          options: {
            responsive: true,
            scales: {
              y: {
                beginAtZero: true,
                max: 100
              }
            }
          }
        });
  }

  /* ================= HELPERS ================= */
  function setText(id, value = "—") {
    const el = document.getElementById(id);
    if (el) el.textContent = value || "—";
  }

  function updateReproSnapshotStats() {
    const pigs = Array.isArray(currentFarmerPigs) ? currentFarmerPigs : [];
    const swineAll = Array.isArray(allSwineData) ? allSwineData : [];

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

    // cycle-based stats
    let pregnantSows = 0;
    let observationSows = 0;
    let activeCycles = 0;

    adultSows.forEach(sow => {
      const cycles = Array.isArray(sow.breeding_cycles) ? sow.breeding_cycles : [];

      // "active cycle" = not farrowed yet
      activeCycles += cycles.filter(c => c && c.farrowed !== true).length;

      cycles.forEach(c => {
        if (!c) return;
        if (c.is_pregnant && !c.farrowed) pregnantSows++;
        if (c.ai_service_date && !c.is_pregnant && !c.farrowed) observationSows++;
      });
    });

    // born/dead piglets across ALL swine collection (uses dam_id matching sow swine_id)
    const sowTags = adultSows
      .map(s => (s.swine_id || "").toString().trim())
      .filter(Boolean);

    const bornPiglets = sowTags.length
      ? swineAll.filter(x => sowTags.includes((x.dam_id || "").toString().trim()))
      : [];

    const totalBorn = bornPiglets.length;
    const totalDead = bornPiglets.filter(x => (x.health_status || "") !== "Healthy").length;

    const mortalityPct = totalBorn > 0 ? ((totalDead / totalBorn) * 100).toFixed(1) : "0.0";

    // update DOM (make sure these IDs exist in your modal HTML)
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


  /* ================= IMAGE HELPERS ================= */
  function resolveImageUrl(path) {
    if (!path) return "/images/default-avatar.png";
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    if (path.startsWith("/")) return path;

    // If your backend stores images in a different folder, change this path:
    return `/uploads/profiles/${path}`;
  }

  function setImage(id, src) {
    const el = document.getElementById(id);
    if (!el) return;

    const finalSrc = resolveImageUrl(src);

    // cache-bust for overwritten images
    const cacheBust = finalSrc.includes("?") ? "&" : "?";
    el.src = `${finalSrc}${cacheBust}v=${Date.now()}`;

    el.onerror = () => {
      el.onerror = null;
      el.src = "/images/default-avatar.png";
    };
  }

  /* ================= GLOBAL LOADER ================= */
  function showGlobalLoader(text = "Opening farmer profile...") {
    const loader = document.getElementById("globalLoader");
    if (!loader) return;

    const label = loader.querySelector(".loader-text");
    if (label) label.textContent = text;

    loader.classList.remove("d-none");
  }

  function hideGlobalLoader() {
    document.getElementById("globalLoader")?.classList.add("d-none");
  }


  /* ================= INIT ================= */
    await Promise.all([
    loadFarmers(),
    loadResearchData()
  ]);
});
