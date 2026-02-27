// /js/farmer/reproduction/reproduction_list.js
export function initReproList({
  apiGet,
  safeLower,
  safeText,
  computeAgeText,
  normalizeHealth,
  normalizeSex,
  normalizeAgeStage,
  getSwineTag,
  isSowOnly,
  badgeForStage,
  badgeForHealth,
  buildPhotoUrlFromPath,
  onOpenDetails,
}) {
  // =========================
  // UI REFS (LIST PAGE)
  // =========================
  const pigGrid = document.getElementById("pigCardsGrid");
  const pigEmpty = document.getElementById("pigCardsEmpty");

  const prevBtn = document.getElementById("pigPrevPageBtn");
  const nextBtn = document.getElementById("pigNextPageBtn");
  const pageLabel = document.getElementById("pigPageLabel");

  const searchInput = document.getElementById("reproductionSearch");
  const clearSearchBtn = document.getElementById("reproSearchClearBtn");

  const filterHealth = document.getElementById("filterHealthStatus");
  const filterStage = document.getElementById("filterCurrentStage");
  const filterSex = document.getElementById("filterSex");

  const applyBtn = document.getElementById("applyFiltersBtn");
  const resetBtn = document.getElementById("resetFiltersBtn");
  const quickTabs = document.getElementById("reproQuickTabs");

  // =========================
  // STATE
  // =========================
  let allSwineData = [];
  let filteredSwine = [];
  const PAGE_SIZE = 6;
  let page = 1;
  let quickStage = "";

  // =========================
  // LIST: FILTERS + PAGINATION
  // =========================
  function paginate(list) {
    const start = (page - 1) * PAGE_SIZE;
    return list.slice(start, start + PAGE_SIZE);
  }

  function updatePager(total) {
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (page > totalPages) page = totalPages;
    if (pageLabel) pageLabel.textContent = `Page ${page} of ${totalPages}`;
    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page >= totalPages;
  }

  function applyFilters() {
    const term = safeLower(searchInput?.value);
    const healthVal = safeLower(filterHealth?.value);
    const stageVal = safeLower(filterStage?.value);
    const sexVal = safeLower(filterSex?.value);

    filteredSwine = allSwineData.filter((sw) => {
      if (!isSowOnly(sw)) return false;

      const tag = safeLower(getSwineTag(sw));
      const stage = safeLower(sw.current_status || sw.current_stage || "");
      const health = normalizeHealth(sw);
      const sex = safeLower(sw.sex || "");

      const matchesTerm =
        !term ||
        tag.includes(term) ||
        stage.includes(term) ||
        safeLower(sw.breed).includes(term);

      const matchesHealth = !healthVal || health === healthVal;

      const effectiveStage = quickStage || stageVal;
      const matchesStage = !effectiveStage || stage.includes(effectiveStage);

      const matchesSex = !sexVal || sex === sexVal;

      return matchesTerm && matchesHealth && matchesStage && matchesSex;
    });

    page = 1;
    renderPigCards();
  }

  function resetFilters() {
    if (searchInput) searchInput.value = "";
    if (filterHealth) filterHealth.value = "";
    if (filterStage) filterStage.value = "";
    if (filterSex) filterSex.value = "";

    quickStage = "";
    if (quickTabs) {
      [...quickTabs.querySelectorAll(".nav-link")].forEach((btn) => btn.classList.remove("active"));
      document.getElementById("tabAll")?.classList.add("active");
    }

    page = 1;
    applyFilters();
  }

  // =========================
  // LIST: RENDER CARDS
  // =========================
  function renderPigCards() {
    if (!pigGrid) return;

    const list = filteredSwine;
    const view = paginate(list);

    updatePager(list.length);
    pigGrid.innerHTML = "";

    if (!list.length) {
      pigEmpty?.classList.remove("d-none");
      return;
    }
    pigEmpty?.classList.add("d-none");

    pigGrid.innerHTML = view
      .map((sw) => {
        const tag = getSwineTag(sw);
        const age = computeAgeText(sw);
        const stage = sw.current_status || "—";
        const healthNorm = normalizeHealth(sw);
        const breed = sw.breed || "Native";
        const sex = sw.sex || "Female";
        const ageStage = sw.age_stage || "adult";

        const stageBadge = badgeForStage(stage);
        const healthBadge = badgeForHealth(healthNorm);

        const photo = buildPhotoUrlFromPath(sw.profile_photo);

        const payload = encodeURIComponent(
          JSON.stringify({
            mongoId: sw._id,
            tag,
            breed,
            sex,
            ageStage,
            stage,
            healthStatus: sw.health_status || "",
            profile_photo: sw.profile_photo || "",
            birth_date: sw.birth_date || sw.birthDate || sw.dob || sw.birthdate || "",
            raw: sw,
          })
        );

        return `
          <div class="col-12">
            <div class="card pig-card h-100">
              <div class="card-body">

                <!-- Top row -->
                <div class="d-flex align-items-start gap-3">

                  <!-- Avatar -->
                  <div class="pig-avatar overflow-hidden flex-shrink-0">
                    ${
                      photo
                        ? `<img src="${photo}" alt="Pig Photo" class="pig-avatar-img">`
                        : `<div class="pig-avatar-fallback"><i class="bi bi-piggy-bank"></i></div>`
                    }
                  </div>

                  <!-- Main -->
                  <div class="flex-grow-1 min-w-0">

                    <!-- Title + badges -->
                    <div class="d-flex align-items-start justify-content-between gap-2 flex-wrap">
                      <div class="min-w-0">
                        <div class="d-flex align-items-center gap-2 flex-wrap">
                          <h6 class="pig-title mb-0 text-truncate">${safeText(tag)}</h6>
                        </div>

                        <div class="pig-meta mt-1">
                          <span class="pig-meta-item">
                            <i class="bi bi-hourglass-split me-1"></i><b>Age:</b> ${safeText(age)}
                          </span>
                        </div>
                      </div>

                      <div class="d-flex align-items-center gap-2 flex-wrap justify-content-end">
                        <span class="badge pig-badge ${stageBadge}">
                          ${safeText(stage)}
                        </span>
                        <span class="badge pig-badge ${healthBadge}">
                          ${healthNorm === "dead" ? "Dead" : "Alive"}
                        </span>
                      </div>
                    </div>

                    <!-- Details chips -->
                    <div class="pig-chips mt-3">
                      <span class="pig-chip">
                        <i class="bi bi-award me-1"></i>${safeText(breed)}
                      </span>
                      <span class="pig-chip">
                        <i class="bi bi-gender-ambiguous me-1"></i>${safeText(sex)}
                      </span>
                      <span class="pig-chip">
                        <i class="bi bi-diagram-2 me-1"></i>${safeText(ageStage)}
                      </span>
                    </div>

                  </div>
                </div>

                <!-- CTA bar -->
                <div class="pig-cta mt-3">
                  <button
                    class="btn btn-success btn-sm w-100 pig-cta-btn"
                    type="button"
                    data-payload="${payload}"
                    data-action="view-details"
                  >
                    <i class="bi bi-eye me-1"></i>View Details
                  </button>
                </div>

              </div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  // =========================
  // EVENTS
  // =========================
  applyBtn?.addEventListener("click", applyFilters);
  resetBtn?.addEventListener("click", resetFilters);

  prevBtn?.addEventListener("click", () => {
    page = Math.max(1, page - 1);
    renderPigCards();
  });

  nextBtn?.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(filteredSwine.length / PAGE_SIZE));
    page = Math.min(totalPages, page + 1);
    renderPigCards();
  });

  searchInput?.addEventListener("input", applyFilters);

  clearSearchBtn?.addEventListener("click", () => {
    if (searchInput) searchInput.value = "";
    applyFilters();
  });

  quickTabs?.addEventListener("click", (e) => {
    const btn = e.target.closest(".repro-seg, .nav-link");
    if (!btn) return;

    [...quickTabs.querySelectorAll(".repro-seg, .nav-link")].forEach((x) => x.classList.remove("active"));
    btn.classList.add("active");

    quickStage = safeLower(btn.getAttribute("data-stage") || "");
    applyFilters();
  });

  pigGrid?.addEventListener("click", (e) => {
    const btn = e.target.closest('button[data-action="view-details"]');
    if (!btn) return;
    onOpenDetails?.(btn.getAttribute("data-payload"));
  });

  // =========================
  // INIT LOAD
  // =========================
  async function loadSows() {
    const data = await apiGet(`/api/swine/all?sex=Female&age_stage=adult`);

    if (!data || !data.success) {
      allSwineData = [];
      filteredSwine = [];
      renderPigCards();
      return;
    }

    const list = Array.isArray(data.swine) ? data.swine : [];
    allSwineData = list.filter(isSowOnly);

    allSwineData.sort((a, b) => {
      const da = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const db = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return db - da;
    });

    filteredSwine = [...allSwineData];
    renderPigCards();
  }

  return {
    loadSows,
    applyFilters,
    resetFilters,
  };
}