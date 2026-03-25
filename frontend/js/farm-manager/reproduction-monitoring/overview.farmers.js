// overview.farmers.js
export function initFarmersModule(ctx, pigsModule) {
  const { BACKEND_URL, state, dom } = ctx;
  const { resolveImageUrl, isDeadStatus } = ctx;

  // ✅ Always resolve token fresh (prevents stale token issues)
  const getToken = () => ctx.token || localStorage.getItem("token") || "";

  /* ================= LOAD FARMERS ================= */
  async function loadFarmers() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/farmers/${state.managerId}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });

      const data = await res.json();
      state.allFarmers = data.farmers || [];

      state.allFarmers.sort((a, b) => (a.first_name || "").localeCompare(b.first_name || ""));

      state.filteredFarmers = [...state.allFarmers];
      state.farmerPage = 1;

      renderFarmerCards();
      populateFarmerDropdown();
    } catch (err) {
      console.error("Load farmers failed", err);
    }
  }

  /* ================= DROPDOWN POPULATION ================= */
  function populateFarmerDropdown() {
    const optionsWrap = document.getElementById("locationOptions");
    if (!optionsWrap) return;

    if (!state.allFarmers.length) {
      optionsWrap.innerHTML = `
        <div class="text-muted small">
          No farmers found
        </div>`;
      return;
    }

    let html = "";
    state.allFarmers.forEach((f) => {
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
    if (!dom.farmerCardList) return;

    const list =
      state.filteredFarmers && state.filteredFarmers.length
        ? state.filteredFarmers
        : state.allFarmers;

    const totalPages = Math.max(1, Math.ceil(list.length / state.FARMER_ROWS_PER_PAGE));
    if (state.farmerPage > totalPages) state.farmerPage = totalPages;

    const start = (state.farmerPage - 1) * state.FARMER_ROWS_PER_PAGE;
    const pageItems = list.slice(start, start + state.FARMER_ROWS_PER_PAGE);

    if (!pageItems.length) {
      dom.farmerCardList.innerHTML = `
        <div class="text-center text-muted py-4">
          No farmer records found
        </div>`;
      updatePagination(totalPages);
      return;
    }

    let html = "";

    pageItems.forEach((f) => {
      const fullName = `${f.first_name || ""} ${f.last_name || ""}`.trim();
      const status = f.status || "Active";
      const isActive = status === "Active";

      function pickProfilePicture(f) {
        return (
          f?.profile_picture ||
          f?.profile_photo ||
          f?.profileImage ||
          f?.avatar ||
          f?.photo ||
          ""
        );
      }

      const avatarSrc = resolveImageUrl(pickProfilePicture(f));

      html += `
        <div class="farmer-card-modern" data-farmer-card="${f._id}">
          <div class="farmer-card-top">

            <div class="farmer-card-left">
              <div class="farmer-card-avatar">
                <img src="${avatarSrc}" alt="Avatar" loading="lazy">
              </div>

              <div class="farmer-card-info min-w-0">
                <div class="farmer-name text-truncate">${fullName}</div>

                <div class="farmer-meta">
                  <span class="me-2">Farmer ID:</span>
                  <span class="fw-semibold">${f.farmer_id || f._id}</span>
                </div>

                <div class="farmer-meta text-truncate">
                  ${f.address || "No address provided"}
                </div>

                <div class="farmer-meta">
                  Pens: ${f.num_of_pens ?? 0} | Capacity: ${f.pen_capacity ?? 0}
                </div>
              </div>
            </div>

            <div class="text-end">
              <span id="attn-${f._id}" class="badge rounded-pill farmer-attn-pill d-none"></span>

              <span class="farmer-status ${isActive ? "status-active" : "status-inactive"}">
                ${status}
              </span>
            </div>
          </div>

          <!-- Reproduction Snapshot -->
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
            <!-- ✅ Keep class name used by global click handler -->
            <button class="btn btn-outline-primary btn-sm view-farmer-btn" data-id="${f._id}">
              <i class="bi bi-layout-text-window-reverse me-1"></i>
              Open Panel
            </button>
          </div>
        </div>
      `;
    });

    dom.farmerCardList.innerHTML = html;
    updatePagination(totalPages);

    // Hydrate summaries after render
    hydrateFarmerReproSummaries(pageItems);
  }

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

  /* ================= HYDRATE REPRO SUMMARIES ================= */
  async function hydrateFarmerReproSummaries(farmersOnPage) {
    try {
      const jobs = farmersOnPage.map(async (f) => {
        const summary = await getFarmerReproSummary(f._id);
        applyFarmerReproSummaryToCard(f._id, summary);
      });

      await Promise.all(jobs);
    } catch (err) {
      console.error("hydrateFarmerReproSummaries failed:", err);
    }
  }

  // ✅ decision helpers (match farmer-side persisted logic)
  function decisionFromSwineStatus(sw) {
    const st = String(sw?.current_status || "").toLowerCase();
    const stage = String(sw?.age_stage || "").toLowerCase();

    if (st === "active" || st.includes("breeding") || st.includes("breeder") || st.includes("active breeder")) {
      return "retain";
    }
    if (st.includes("culled") || st.includes("sold") || st.includes("marked for sale") || st.includes("sale") || st.includes("market")) {
      return "sell";
    }
    if (stage === "adult" && st && !st.includes("sold") && !st.includes("culled") && !st.includes("marked for sale")) {
      return "retain";
    }
    return "pending";
  }

  // NOTE: uses state.allSwineData if available; otherwise only sow-cycle based KPIs
  async function getFarmerReproSummary(farmerId) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/farmer/${farmerId}/pigs`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });

      if (!res.ok) throw new Error("Failed to load farmer pigs");

      const data = await res.json();
      const pigs = Array.isArray(data.pigs) ? data.pigs : [];

      // adult sows
      const sows = pigs.filter(
        (p) =>
          (p.sex || "").toString().toLowerCase() === "female" &&
          (p.age_stage || "").toString().toLowerCase().includes("adult")
      );

      const sowTags = sows
        .map((s) => (s.swine_id || s.swine_tag || "").toString().trim())
        .filter(Boolean);

      // Pregnancy / observation counts from sow breeding cycles
      let pregnantCount = 0;
      let observationCount = 0;

      sows.forEach((sow) => {
        const cycles = Array.isArray(sow.breeding_cycles) ? sow.breeding_cycles : [];
        cycles.forEach((c) => {
          if (!c) return;
          if (c.is_pregnant && !c.farrowed) pregnantCount++;
          if (c.ai_service_date && !c.is_pregnant && !c.farrowed) observationCount++;
        });
      });

      // Born/Dead from allSwineData if we have it
      let totalBorn = 0;
      let totalDead = 0;

      if (Array.isArray(state.allSwineData) && state.allSwineData.length && sowTags.length) {
        const piglets = state.allSwineData.filter((p) =>
          sowTags.includes((p.dam_id || p.mother_id || "").toString().trim())
        );
        totalBorn = piglets.length;
        totalDead = piglets.filter((p) => isDeadStatus(p.health_status)).length;
      }

      const mortalityPct = totalBorn > 0 ? ((totalDead / totalBorn) * 100).toFixed(1) : "0.0";

      // ✅ NEW: selection mismatch fix for manager cards (derive from persisted swine status)
      // Treat "piglets" as offspring records under this farmer (non-adult sow/boar)
      const pigletsUnderFarmer = pigs.filter((p) => {
        const stage = String(p?.age_stage || "").toLowerCase();
        return stage.includes("piglet") || stage.includes("wean") || stage.includes("monitor") || stage.includes("growing");
      });

      let sellCount = 0;
      let retainCount = 0;
      let pendingCount = 0;

      for (const p of pigletsUnderFarmer) {
        const d = decisionFromSwineStatus(p);
        if (d === "sell") sellCount++;
        else if (d === "retain") retainCount++;
        else pendingCount++;
      }

      const needsAttention = observationCount > 0 || Number(mortalityPct) >= 10 || sellCount > 0;

      return {
        activeSows: sows.length,
        pregnant: pregnantCount,
        observation: observationCount,
        totalBorn,
        totalDead,
        mortalityPct,
        needsAttention,

        // exposed if you want to show later
        selection: { retain: retainCount, sell: sellCount, pending: pendingCount }
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

  function applyFarmerReproSummaryToCard(farmerId, s) {
    const wrap = document.getElementById(`repro-${farmerId}`);
    const attn = document.getElementById(`attn-${farmerId}`);
    const hint = document.getElementById(`reproHint-${farmerId}`);

    if (!wrap) return;

    if (attn) {
      if (s?.error) {
        attn.classList.remove("d-none");
        attn.textContent = "Repro stats unavailable";
        attn.className = "badge rounded-pill bg-secondary-subtle text-secondary farmer-attn-pill";
      } else if (s.needsAttention) {
        attn.classList.remove("d-none");
        attn.innerHTML = `<i class="bi bi-exclamation-triangle me-1"></i> Needs attention`;
        attn.className = "badge rounded-pill bg-warning-subtle text-warning farmer-attn-pill";
      } else {
        attn.classList.add("d-none");
        attn.textContent = "";
      }
    }

    const grid = wrap.querySelector(".repro-grid");
    if (grid) {
      grid.innerHTML = `
        ${renderReproMetric("bi-gender-female", s.activeSows, "Active Sows")}
        ${renderReproMetric("bi-patch-check", s.pregnant, "Pregnant")}
        ${renderReproMetric("bi-hourglass-split", s.observation, "Observation")}
        ${renderReproMetric("bi-collection", s.totalBorn, "Total Born")}
        ${renderReproMetric("bi-activity", `${s.mortalityPct}%`, "Mortality")}
      `;
    }

    if (hint) {
      hint.textContent = s?.error
        ? "Open panel to view detailed reproduction."
        : "Snapshot shows sow status and overall outcomes.";
    }
  }

  /* ================= PAGINATION ================= */
  function updatePagination(totalPages) {
    const indicator = document.getElementById("farmerPageIndicator");
    const prevBtn = document.getElementById("farmerPrevBtn");
    const nextBtn = document.getElementById("farmerNextBtn");

    if (indicator) indicator.textContent = `Page ${state.farmerPage} of ${totalPages}`;
    if (prevBtn) prevBtn.disabled = state.farmerPage <= 1;
    if (nextBtn) nextBtn.disabled = state.farmerPage >= totalPages;
  }

  // NOTE: These are attached once (file loaded once) and just rerender list
  document.getElementById("farmerPrevBtn")?.addEventListener("click", () => {
    if (state.farmerPage > 1) {
      state.farmerPage--;
      renderFarmerCards();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });

  document.getElementById("farmerNextBtn")?.addEventListener("click", () => {
    const activeList =
      state.filteredFarmers && state.filteredFarmers.length ? state.filteredFarmers : state.allFarmers;

    const totalPages = Math.ceil(activeList.length / state.FARMER_ROWS_PER_PAGE);

    if (state.farmerPage < totalPages) {
      state.farmerPage++;
      renderFarmerCards();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });

  /* ================= FARMER DROPDOWN SELECT ================= */
  document.addEventListener("click", (e) => {
    const option = e.target.closest(".farmer-option");
    if (!option) return;

    state.selectedFarmerId = option.dataset.id;

    const dropdownBtn = document.getElementById("locationDropdownBtn");
    if (dropdownBtn) dropdownBtn.textContent = option.dataset.name;
  });

  /* ================= FARMER DROPDOWN SEARCH ================= */
  document.getElementById("locationSearch")?.addEventListener("input", (e) => {
    const term = e.target.value.toLowerCase();
    document.querySelectorAll(".farmer-option").forEach((opt) => {
      const name = (opt.dataset.name || "").toLowerCase();
      opt.style.display = name.includes(term) ? "block" : "none";
    });
  });

  /* ================= FILTER FARMERS ================= */
  dom.filtersForm?.addEventListener("submit", (e) => {
    e.preventDefault();

    let filtered = [...state.allFarmers];

    if (state.selectedFarmerId) {
      filtered = filtered.filter((f) => f._id === state.selectedFarmerId);
    }

    const status = dom.filterStatus?.value || "";
    const term = dom.searchFarmer?.value.trim().toLowerCase() || "";

    if (status) filtered = filtered.filter((f) => f.status === status);

    if (term) {
      filtered = filtered.filter((f) => `${f.first_name} ${f.last_name}`.toLowerCase().includes(term));
    }

    state.filteredFarmers = filtered;
    state.farmerPage = 1;
    renderFarmerCards();
  });

  document.getElementById("resetFilters")?.addEventListener("click", () => {
    dom.filtersForm?.reset();

    state.selectedFarmerId = "";
    const dropdownBtn = document.getElementById("locationDropdownBtn");
    if (dropdownBtn) dropdownBtn.textContent = "Farmer";

    state.filteredFarmers = [...state.allFarmers];
    state.farmerPage = 1;
    renderFarmerCards();
  });

  return {
    loadFarmers,
    renderFarmerCards,
    hydrateFarmerReproSummaries
  };
}