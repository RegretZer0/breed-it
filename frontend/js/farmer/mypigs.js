// /js/mypigs.js
import { authGuard } from "/js/authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  /* =========================================================
     AUTH + BASE DOM REFS
  ========================================================= */
  const user = await authGuard("farmer");
  if (!user) return;

  const token = localStorage.getItem("token");
  const pigList = document.getElementById("pigList");
  const loadingMessage = document.getElementById("loadingMessage");
  const pigModal = document.getElementById("pigModal");
  const modalBody = document.getElementById("modalBody");
  const closeModal = document.getElementById("closeModal");

  // Ensure modal is hidden on refresh
  pigModal?.classList.remove("show");
  document.body.style.overflow = "";

  const BACKEND_URL = "http://localhost:5000";

  let currentSwineData = [];
  let currentPage = 1;
  let itemsPerPage = 5;
  let currentTypeFilter = "all";
  let weightChartInstance = null;
  let offspringChartInstance = null;

  /* =========================================================
     SUMMARY STATS
  ========================================================= */
  function updateSummaryStats() {
    const totalEl = document.getElementById("totalCount");
    const healthyEl = document.getElementById("healthyCount");
    const sickEl = document.getElementById("sickCount");

    if (totalEl) totalEl.textContent = String(currentSwineData.length);

    const healthyCount = currentSwineData.filter((p) => p.health_status === "Healthy").length;
    const sickCount = currentSwineData.filter((p) => p.health_status === "Sick").length;

    if (healthyEl) healthyEl.textContent = String(healthyCount);
    if (sickEl) sickEl.textContent = String(sickCount);
  }

  /* =========================================================
     FATHER ID RESOLVER (ObjectId -> swine_id)
  ========================================================= */
  const swineIdCache = new Map();

  function looksLikeObjectId(v) {
    return typeof v === "string" && /^[a-f0-9]{24}$/i.test(v.trim());
  }

  async function resolveSwineId(idOrCode) {
    const raw = (idOrCode || "").toString().trim();
    if (!raw) return "—";

    // If already a swine_id like "CE0B-BOAR-0001", just return it
    if (!looksLikeObjectId(raw)) return raw;

    // Cached
    if (swineIdCache.has(raw)) return swineIdCache.get(raw) || raw;

    try {
      const res = await fetch(`${BACKEND_URL}/api/swine/by-mongo-id/${raw}`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      const data = await res.json();

      const swineId = data?.swine?.swine_id || raw;
      swineIdCache.set(raw, swineId);
      return swineId;
    } catch (err) {
      console.error("resolveSwineId failed:", err);
      swineIdCache.set(raw, raw);
      return raw;
    }
  }

  /* =========================================================
     MODAL CONTROLS (VIEW MODAL)
  ========================================================= */
  closeModal?.addEventListener("click", () => {
    pigModal.classList.remove("show");
    document.body.style.overflow = "";
  });

  pigModal?.addEventListener("click", (e) => {
    if (e.target === pigModal) {
      pigModal.classList.remove("show");
      document.body.style.overflow = "";
    }
  });

  /* =========================================================
     MODAL CONTROLS (EDIT MODAL)
  ========================================================= */
  const editModal = document.getElementById("editPigModal");
  const closeEditModal = document.getElementById("closeEditModal");
  const editForm = document.getElementById("editPigForm");

  closeEditModal?.addEventListener("click", () => {
    editModal?.classList.remove("show");
    document.body.style.overflow = "";
  });

  editModal?.addEventListener("click", (e) => {
    if (e.target === editModal) {
      editModal.classList.remove("show");
      document.body.style.overflow = "";
    }
  });

  /* =========================================================
     EDIT FORM SUBMIT (UPDATE PIG INFO)
  ========================================================= */
  editForm?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const swineId = document.getElementById("editPigId")?.value || "";
    const health = document.getElementById("editHealth")?.value || "";
    const status = document.getElementById("editStatus")?.value || "";
    const notes = document.getElementById("editNotes")?.value || "";

    try {
      const response = await fetch(`${BACKEND_URL}/api/swine/update/${swineId}`, {
        method: "PUT",
        credentials: "include",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          health_status: health,
          current_status: status,
          notes: notes,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        alert(data.message || "Update failed.");
        return;
      }

      alert("Pig information updated successfully.");

      editModal?.classList.remove("show");
      document.body.style.overflow = "";

      // Refresh swine list
      location.reload();
    } catch (err) {
      console.error(err);
      alert("Update failed.");
    }
  });

  /* =========================================================
     SHARED HELPERS (DISPLAY + COMPUTATIONS)
  ========================================================= */
  function formatStageDisplay(stage) {
    const mapping = {
      "Monitoring (Day 1-30)": "Piglet",
      "Weaned (Monitoring 3 Months)": "Weaner",
      "Final Selection": "Selection",
      adult: "Adult",
      piglet: "Piglet",
    };
    return mapping[stage] || stage || "-";
  }

  function getStatusClass(status) {
    switch (status) {
      case "Healthy":
        return "healthy";
      case "Sick":
        return "sick";
      case "Deceased":
      case "Deceased (Before Weaning)":
        return "deceased";
      case "Monitoring":
        return "monitoring";
      default:
        return "";
    }
  }

  function getLatestPerformance(records = []) {
    if (!records.length) return {};
    return [...records].sort((a, b) => new Date(b.record_date) - new Date(a.record_date))[0];
  }

  function calculateADG(records = []) {
    if (records.length < 2) return "N/A";
    const last = records[records.length - 1];
    const prev = records[records.length - 2];
    const days =
      (new Date(last.record_date) - new Date(prev.record_date)) / (1000 * 60 * 60 * 24);
    if (days <= 0) return "N/A";
    return ((last.weight - prev.weight) / days).toFixed(3) + " kg/day";
  }

  function toNum(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function isAliveStatus(s) {
    const v = (s || "").toString().toLowerCase();
    return v.includes("alive") || v === "live" || v === "living";
  }

  function isDeadStatus(s) {
    const v = (s || "").toString().toLowerCase();
    return v.includes("dead") || v.includes("deceased") || v.includes("stillborn");
  }

  /* =========================================================
     OFFSPRING: FIND PIGLETS FROM LOADED SWINE DATA
  ========================================================= */
  function getPigletsFromLoadedSwine(motherPig, cycle) {
    if (!motherPig || !cycle) return [];

    const motherId = String(motherPig.swine_id || "").trim();
    const cycleNumber = Number(cycle.cycle_number || 0);

    if (!motherId || !cycleNumber) return [];

    return (currentSwineData || [])
      .filter((p) => {
        const damId = String(p.dam_id || "").trim();
        const birthCycle = Number(p.birth_cycle_number || 0);

        return damId === motherId && birthCycle === cycleNumber;
      })
      .sort((a, b) => {
        const aId = String(a.swine_id || "");
        const bId = String(b.swine_id || "");
        return aId.localeCompare(bId, undefined, { numeric: true, sensitivity: "base" });
      })
      .map((p) => ({
        ...p,
        piglet_id: p.swine_id,
        status: p.health_status || p.current_status || "Unknown",
      }));
  }

  /* =========================================================
     OFFSPRING: EXTRACT PIGLETS LIST FROM CYCLE
  ========================================================= */
  function extractCyclePiglets(cycleObj) {
    if (!cycleObj) return [];

    if (Array.isArray(cycleObj.piglets)) return cycleObj.piglets;
    if (Array.isArray(cycleObj.piglet_list)) return cycleObj.piglet_list;
    if (Array.isArray(cycleObj.pigletRecords)) return cycleObj.pigletRecords;
    if (Array.isArray(cycleObj.offspring)) return cycleObj.offspring;
    if (Array.isArray(cycleObj.offspring_list)) return cycleObj.offspring_list;

    if (cycleObj.farrowing_results && Array.isArray(cycleObj.farrowing_results.piglets)) {
      return cycleObj.farrowing_results.piglets;
    }

    return [];
  }

  /* =========================================================
     OFFSPRING: NORMALIZE BREEDING CYCLES (FALLBACKS)
  ========================================================= */
  function normalizeCycles(pig) {
    const raw = Array.isArray(pig?.breeding_cycles) ? pig.breeding_cycles : [];

    const cycles = raw
      .map((c, idx) => {
        const cycleNum = toNum(c.cycle_number || idx + 1);

        const results = c.farrowing_results || {};
        const totalFromResults = toNum(results.total_piglets);
        const liveFromResults = toNum(results.live_piglets);
        const deadFromResults = toNum(results.mortality_count);

        const piglets = extractCyclePiglets(c);
        const pigletsTotal = piglets.length;

        const liveFromPiglets = piglets.filter((p) =>
          isAliveStatus(p.status || p.life_status || p.health_status)
        ).length;
        const deadFromPiglets = piglets.filter((p) =>
          isDeadStatus(p.status || p.life_status || p.health_status)
        ).length;

        const total = totalFromResults || pigletsTotal || 0;
        const live = liveFromResults || liveFromPiglets || 0;
        const dead = deadFromResults || deadFromPiglets || Math.max(total - live, 0);

        return {
          cycle_number: cycleNum,
          actual_farrowing_date: c.actual_farrowing_date || null,
          total,
          live,
          dead,
          mother_id: pig.swine_id,
          father_id:
            c.cycle_sire_id ||
            c.boar_id ||
            c.sire_id ||
            c.male_swine_id ||
            c.partner_boar ||
            c.father_id ||
            null,
          piglets: piglets,
          raw: c,
        };
      })
      .sort((a, b) => (b.cycle_number || 0) - (a.cycle_number || 0));

    return cycles.filter((c) => c.cycle_number > 0);
  }

  /* =========================================================
     OFFSPRING: PIGLET BADGE MAPPER
  ========================================================= */
  function badgeForPigletStatus(piglet) {
    const status =
      piglet?.status ||
      piglet?.life_status ||
      piglet?.health_status ||
      piglet?.current_status ||
      "";

    if (isDeadStatus(status)) return { text: "Dead", cls: "dead" };

    if (
      isAliveStatus(status) ||
      status === "Healthy" ||
      status === "Monitoring (Day 1-30)" ||
      status === "Weaning" ||
      status === "3-Month Monitoring" ||
      status === "Final Selection"
    ) {
      return { text: "Alive", cls: "alive" };
    }

    if (status === "Unrecorded") {
      return { text: "Unrecorded", cls: "neutral" };
    }

    return { text: status || "Unknown", cls: "neutral" };
  }

  /* =========================================================
     OFFSPRING: BUILD PER-CYCLE BAR CHART
  ========================================================= */
  function buildOffspringCycleChart(cycles) {
    const canvas = document.getElementById("offspringCycleChart");
    if (!canvas) return;

    if (offspringChartInstance) {
      offspringChartInstance.destroy();
      offspringChartInstance = null;
    }

    const sorted = [...cycles].sort((a, b) => (a.cycle_number || 0) - (b.cycle_number || 0));
    const labels = sorted.map((c) => `C${c.cycle_number}`);
    const live = sorted.map((c) => toNum(c.live));
    const dead = sorted.map((c) => toNum(c.dead));

    offspringChartInstance = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Live",
            data: live,
            backgroundColor: "rgba(31,167,116,0.65)",
            borderRadius: 10,
          },
          {
            label: "Dead",
            data: dead,
            backgroundColor: "rgba(220,38,38,0.55)",
            borderRadius: 10,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });
  }

  /* =========================================================
     OFFSPRING: DISPLAY PIGLETS (PLACEHOLDERS WHEN NEEDED)
  ========================================================= */
    function getDisplayPiglets(motherPig, cycle) {
      const embeddedList = extractCyclePiglets(cycle?.raw || cycle);
      if (embeddedList && embeddedList.length) return embeddedList;

      const linkedPiglets = getPigletsFromLoadedSwine(motherPig, cycle);
      if (linkedPiglets && linkedPiglets.length) return linkedPiglets;

      const total = toNum(cycle?.total);
      if (total > 0) {
        return Array.from({ length: total }, (_, i) => ({
          piglet_id: `Piglet ${i + 1}`,
          status: "Unrecorded",
        }));
      }

      return [];
    }

  /* =========================================================
     OFFSPRING: NORMALIZE PIGLET SEX LABEL
     PURPOSE:
       Standardize piglet sex values for filter tabs.
  ========================================================= */
  function normalizePigletSex(value) {
    const v = String(value || "").trim().toLowerCase();
    if (v === "male") return "male";
    if (v === "female") return "female";
    return "unknown";
  }

  /* =========================================================
     OFFSPRING: PAGINATE ARRAY
     PURPOSE:
       Reusable client-side pagination helper.
  ========================================================= */
  function paginateItems(items = [], page = 1, perPage = 5) {
    const safePage = Math.max(1, Number(page) || 1);
    const safePerPage = Math.max(1, Number(perPage) || 5);
    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / safePerPage));
    const currentPage = Math.min(safePage, totalPages);
    const start = (currentPage - 1) * safePerPage;
    const paginated = items.slice(start, start + safePerPage);

    return {
      items: paginated,
      currentPage,
      totalPages,
      total,
      perPage: safePerPage,
    };
  }

  /* =========================================================
     OFFSPRING: RENDER PIGLET FILTER TABS
     PURPOSE:
       Render All / Male / Female tabs with counts.
  ========================================================= */
  function renderPigletFilterTabs(piglets = [], activeFilter = "all") {
    const maleCount = piglets.filter((p) => normalizePigletSex(p.sex) === "male").length;
    const femaleCount = piglets.filter((p) => normalizePigletSex(p.sex) === "female").length;

    const tabs = [
      { key: "all", label: "All", count: piglets.length, icon: "bi-grid-1x2" },
      { key: "male", label: "Male", count: maleCount, icon: "bi-gender-male" },
      { key: "female", label: "Female", count: femaleCount, icon: "bi-gender-female" },
    ];

    return `
      <div class="piglet-filter-tabs" role="tablist" aria-label="Piglet sex filter">
        ${tabs
          .map(
            (tab) => `
              <button
                type="button"
                class="piglet-filter-tab ${activeFilter === tab.key ? "active" : ""}"
                data-piglet-filter="${tab.key}"
                role="tab"
                aria-selected="${activeFilter === tab.key ? "true" : "false"}"
              >
                <i class="bi ${tab.icon}"></i>
                <span>${tab.label}</span>
                <strong>${tab.count}</strong>
              </button>
            `
          )
          .join("")}
      </div>
    `;
  }

  /* =========================================================
     OFFSPRING: RENDER PIGLET CARD
     PURPOSE:
       Display one piglet card with compact details and view action.
  ========================================================= */
  function renderPigletCard(piglet, index = 0) {
    const badge = badgeForPigletStatus(piglet);
    const pigletId = piglet.swine_id || piglet.piglet_id || piglet.tag_id || `Piglet ${index + 1}`;
    const sex = piglet.sex || "Unknown";
    const stage = formatStageDisplay(piglet.age_stage || piglet.current_status || "-");
    const birthDate = piglet.birth_date
      ? new Date(piglet.birth_date).toLocaleDateString()
      : "Not recorded";

    const latest = getLatestPerformance(piglet.performance_records || []);
    const weightLabel =
      latest && latest.weight != null && latest.weight !== ""
        ? `${latest.weight} kg`
        : "-";

    return `
      <article class="piglet-mini-card" data-piglet-card-id="${pigletId}">
        <div class="piglet-mini-card-top">
          <div class="piglet-mini-identity">
            <div class="piglet-mini-icon">
              <i class="bi bi-piggy-bank"></i>
            </div>

            <div class="piglet-mini-main">
              <h5 class="piglet-mini-id mb-0">${pigletId}</h5>
              <div class="piglet-mini-sub">
                <span><i class="bi bi-gender-ambiguous"></i> ${sex}</span>
                <span><i class="bi bi-calendar3"></i> ${birthDate}</span>
              </div>
            </div>
          </div>

          <span class="piglet-badge ${badge.cls}">${badge.text}</span>
        </div>

        <div class="piglet-mini-grid">
          <div class="piglet-mini-stat">
            <small>Stage</small>
            <strong>${stage}</strong>
          </div>

          <div class="piglet-mini-stat">
            <small>Weight</small>
            <strong>${weightLabel}</strong>
          </div>

          <div class="piglet-mini-stat">
            <small>Health</small>
            <strong>${piglet.health_status || "-"}</strong>
          </div>

          <div class="piglet-mini-stat">
            <small>Status</small>
            <strong>${piglet.current_status || "-"}</strong>
          </div>
        </div>

        <div class="piglet-mini-actions">
          <button
            type="button"
            class="piglet-view-btn"
            data-view-piglet-id="${piglet.swine_id || piglet.piglet_id || ""}"
          >
            <i class="bi bi-eye"></i>
            <span>View</span>
          </button>
        </div>
      </article>
    `;
  }

  /* =========================================================
     OFFSPRING: BIND PIGLET CARD ACTIONS
     PURPOSE:
       Open the selected piglet in the main pig detail modal.
  ========================================================= */
  function bindPigletCardActions() {
    document.querySelectorAll("[data-view-piglet-id]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const targetId = btn.getAttribute("data-view-piglet-id");
        if (!targetId) return;

        const targetPig = (currentSwineData || []).find((p) => String(p.swine_id || "") === String(targetId));
        if (!targetPig) {
          alert("Piglet details could not be found.");
          return;
        }

        const latest = getLatestPerformance(targetPig.performance_records || []);
        const adg = calculateADG(targetPig.performance_records || []);
        openPigDetails(targetPig, latest, adg);
      });
    });
  }

  /* =========================================================
     OFFSPRING: BIND PIGLET FILTER TABS
     PURPOSE:
       Switch between All / Male / Female piglet views.
  ========================================================= */
  function bindPigletFilterTabs(onChange) {
    document.querySelectorAll("[data-piglet-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const filter = btn.getAttribute("data-piglet-filter") || "all";
        onChange(filter);
      });
    });
  }

  /* =========================================================
     OFFSPRING: BIND PIGLET PAGINATION
     PURPOSE:
       Handle previous and next controls for the piglet card list.
  ========================================================= */
  function bindPigletPagination(onChange) {
    const prevBtn = document.getElementById("pigletPrevPageBtn");
    const nextBtn = document.getElementById("pigletNextPageBtn");

    prevBtn?.addEventListener("click", () => onChange("prev"));
    nextBtn?.addEventListener("click", () => onChange("next"));
  }
    
  /* =========================================================
     OFFSPRING: CYCLE DETAILS (FULL MODAL VIEW)
     Note: Kept for compatibility even if you primarily use inline details view.
  ========================================================= */
  function openCycleDetailsModal(motherPig, cycle) {
    const pm = document.getElementById("pigModal");
    const mb = document.getElementById("modalBody");
    if (!pm || !mb) return;

    const mother = cycle.mother_id || motherPig?.swine_id || "—";
    const piglets = extractCyclePiglets(cycle?.raw || cycle);

    const pigletListHtml = piglets.length
      ? piglets
          .map((p, idx) => {
            const pid = p.swine_id || p.piglet_id || p.tag_id || `Piglet ${idx + 1}`;
            const b = badgeForPigletStatus(p);
            return `
              <div class="piglet-row">
                <div class="piglet-left">
                  <i class="bi bi-dot"></i>
                  <div class="piglet-id">${pid}</div>
                </div>
                <span class="piglet-badge ${b.cls}">${b.text}</span>
              </div>
            `;
          })
          .join("")
      : `
        <div class="empty-state">
          <i class="bi bi-list-check"></i>
          <p>No piglet list recorded for this cycle yet.</p>
        </div>
      `;

    mb.innerHTML = `
      <div class="cycle-details">

        <div class="d-flex align-items-start justify-content-between gap-3 mb-2">
          <div class="min-w-0">
            <h3 class="mb-0">Cycle ${cycle.cycle_number} Details</h3>
            <small class="modal-subtitle d-block">Parents and piglet outcomes</small>
          </div>
        </div>

        <div class="details-grid mb-3">
          <div class="info-card"><small>Total</small><strong>${cycle.total}</strong></div>
          <div class="info-card"><small>Live</small><strong>${cycle.live}</strong></div>
          <div class="info-card"><small>Dead</small><strong>${cycle.dead}</strong></div>
          <div class="info-card"><small>Date</small>
            <strong>${
              cycle.actual_farrowing_date
                ? new Date(cycle.actual_farrowing_date).toLocaleDateString()
                : "—"
            }</strong>
          </div>
        </div>

        <div class="parents-card mb-3">
          <div class="parent-item">
            <small>Mother</small>
            <div class="mono">${mother}</div>
          </div>
          <div class="parent-item">
            <small>Father</small>
            <div class="mono" id="fatherDetailsLabel2">Loading...</div>
          </div>
        </div>

        <div class="piglets-card">
          <div class="piglets-title">
            <h4 class="mb-0">Piglets</h4>
            <small>${piglets.length ? `${piglets.length} record(s)` : "No list recorded"}</small>
          </div>
          <div class="piglets-list">
            ${pigletListHtml}
          </div>
        </div>

      </div>
    `;

    pm.classList.add("show");
    document.body.style.overflow = "hidden";
  }

  /* =========================================================
     OFFSPRING: INIT UI (CHART + SELECT + CARDS + DETAILS VIEW)
  ========================================================= */
  function initializeOffspringUI(pig) {
    const cycles = normalizeCycles(pig);
    if (!cycles.length) return;

    const cycleSelect = document.getElementById("cycleSelect");
    const cycleCardsArea = document.getElementById("cycleCardsArea");
    const jumpLatestBtn = document.getElementById("jumpLatestCycleBtn");

    const latestCycleNum = Math.max(...cycles.map((c) => c.cycle_number || 0));

    if (cycleSelect) cycleSelect.value = String(latestCycleNum);

    buildOffspringCycleChart(cycles);

    // Render cycle details inside cycleCardsArea
    function showCycleDetails(cycle) {
      if (!cycleCardsArea) return;

      cycleCardsArea.innerHTML = renderCycleDetailsView(pig, cycle);

      const fatherEl2 = document.getElementById("fatherDetailsLabel2");
      if (fatherEl2) {
        resolveSwineId(cycle.father_id).then((v) => {
          fatherEl2.textContent = v || "—";
        });
      }

      renderPigletCardSection(pig, cycle, {
        filter: "all",
        page: 1,
      });

      const backBtn = document.getElementById("backToOffspringBtn");
      backBtn?.addEventListener("click", () => {
        const currentVal = toNum(cycleSelect?.value);
        renderSelectedCycle(currentVal || latestCycleNum);
      });
    }

    // Render summary card for selected cycle
    function renderSelectedCycle(cycleNum) {
      if (!cycleCardsArea) return;

      const selected = cycles.find((c) => c.cycle_number === cycleNum);
      if (!selected) {
        cycleCardsArea.innerHTML = `
          <div class="empty-state">
            <i class="bi bi-exclamation-triangle"></i>
            <p>No data found for this cycle.</p>
          </div>
        `;
        return;
      }

      const dateLabel = selected.actual_farrowing_date
        ? new Date(selected.actual_farrowing_date).toLocaleDateString()
        : "Date not recorded";

      cycleCardsArea.innerHTML = `
        <div class="cycle-card modern-cycle-card" id="cycleCardClickable" role="button" tabindex="0" aria-label="Open cycle details">
          <div class="cycle-card-top">
            <div class="min-w-0">
              <strong>Cycle ${selected.cycle_number}</strong>
              <small class="d-block text-truncate">${dateLabel}</small>
            </div>

            <div class="cycle-badges">
              <span class="mini-badge total"><i class="bi bi-collection"></i> ${selected.total}</span>
              <span class="mini-badge live"><i class="bi bi-heart-pulse"></i> ${selected.live}</span>
              <span class="mini-badge dead"><i class="bi bi-x-circle"></i> ${selected.dead}</span>
            </div>
          </div>

          <div class="cycle-card-bottom">
            <div class="cycle-mini">
              <small>Mother</small>
              <div class="mono">${selected.mother_id || "-"}</div>
            </div>
            <div class="cycle-mini">
              <small>Father</small>
              <div class="mono" id="fatherCycleLabel">Loading...</div>
            </div>
          </div>
        </div>
      `;

      const fatherEl = document.getElementById("fatherCycleLabel");
      if (fatherEl) {
        resolveSwineId(selected.father_id).then((v) => {
          fatherEl.textContent = v || "—";
        });
      }

      const clickable = document.getElementById("cycleCardClickable");
      const openDetails = () => showCycleDetails(selected);

      clickable?.addEventListener("click", openDetails);
      clickable?.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openDetails();
        }
      });
    }

    renderSelectedCycle(latestCycleNum);

    cycleSelect?.addEventListener("change", (e) => {
      renderSelectedCycle(toNum(e.target.value));
    });

    jumpLatestBtn?.addEventListener("click", () => {
      if (!cycleSelect) return;
      cycleSelect.value = String(latestCycleNum);
      renderSelectedCycle(latestCycleNum);
    });
  }

  /* =========================================================
     API: UPDATE HEALTH STATUS
  ========================================================= */
  async function updateHealthStatus(swineId, newStatus) {
    try {
      const response = await fetch(`${BACKEND_URL}/api/swine/update/${swineId}`, {
        method: "PUT",
        credentials: "include",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ health_status: newStatus }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        alert(data.message || "Failed to update.");
        return;
      }

      const pig = currentSwineData.find((p) => p.swine_id === swineId);
      if (pig) pig.health_status = newStatus;

      updateSummaryStats();
      renderSwine();
      pigModal.classList.remove("show");
    } catch (err) {
      console.error(err);
      alert("Update failed.");
    }
  }

  /* =========================================================
     UI: MONTHLY UPDATE MODAL (GROWTH FORM)
  ========================================================= */
  function openMonthlyUpdateModal(pig) {
    if (!modalBody) return;

    // Bootstrap-aligned markup while keeping all IDs used by logic
    modalBody.innerHTML = `
      <div class="monthly-section">
        <div class="d-flex align-items-start justify-content-between gap-3 mb-3">
          <div class="min-w-0">
            <h4 class="section-title mb-1">
              <i class="bi bi-graph-up"></i> Monthly Growth
            </h4>
            <div class="pig-ref mb-0">${pig.swine_id}</div>
          </div>
        </div>

        <form id="growthForm" class="modern-form">
          <div class="row g-3">
            <div class="col-12 col-md-6">
              <div class="form-group mb-0">
                <label>Weight (kg)</label>
                <input type="number" step="0.01" required name="weight" />
              </div>
            </div>

            <div class="col-12 col-md-6">
              <div class="form-group mb-0">
                <label>Body Length (cm)</label>
                <input type="number" step="0.1" required name="body_length" />
              </div>
            </div>

            <div class="col-12 col-md-6">
              <div class="form-group mb-0">
                <label>Heart Girth (cm)</label>
                <input type="number" step="0.1" required name="heart_girth" />
              </div>
            </div>

            <div class="col-12 col-md-6">
              <div class="form-group mb-0">
                <label>Teeth Count</label>
                <input type="number" required name="teeth_count" />
              </div>
            </div>

            <div class="col-12">
              <button type="submit" class="primary-btn full-width">
                <i class="bi bi-check-circle"></i> Save Update
              </button>
            </div>
          </div>
        </form>
      </div>
    `;

    const formEl = modalBody.querySelector("#growthForm");
    if (formEl) {
      formEl.onsubmit = async (e) => {
        e.preventDefault();
        const form = e.target;

        const payload = {
          performance_records: {
            weight: Number(form.weight.value),
            body_length: Number(form.body_length.value),
            heart_girth: Number(form.heart_girth.value),
            teeth_count: Number(form.teeth_count.value),
            stage: pig.current_status,
          },
        };

        await fetch(`${BACKEND_URL}/api/swine/update/${pig.swine_id}`, {
          method: "PUT",
          credentials: "include",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        alert("Update saved!");
        pigModal.classList.remove("show");
        document.body.style.overflow = "";
      };
    }

    pigModal.classList.add("show");
    document.body.style.overflow = "hidden";
  }

  /* =========================================================
     UI: DETAILS TABS (OVERVIEW / GROWTH / OFFSPRING)
  ========================================================= */
  function generateTabs(pig) {
    const stage = (pig.age_stage || "").toLowerCase();
    const isPiglet = stage.includes("piglet") || stage.includes("monitoring");
    const isFemale = (pig.sex || "").toLowerCase() === "female";

    let tabs = `
      <button class="details-tab active" data-tab="overview" type="button">Overview</button>
      <button class="details-tab" data-tab="growth" type="button">Growth</button>
    `;

    if (!isPiglet && isFemale) {
      tabs += `<button class="details-tab" data-tab="offspring" type="button">Offspring</button>`;
    }

    return `<div class="details-tabs">${tabs}</div>`;
  }

  /* =========================================================
     UI: OPEN PIG DETAILS MODAL
  ========================================================= */
  function openPigDetails(pig, latest = {}, adg = "N/A") {
    if (!modalBody) return;

    // Bootstrap-friendly layout inside your existing modal shell
    // IDs must stay the same for linked logic
    modalBody.innerHTML = `
      <div class="pig-details">

        <div class="details-header">
          <div class="min-w-0">
            <h2 class="mb-0">${pig.swine_id}</h2>
            <small class="d-block text-truncate">${pig.breed || "-"} • ${pig.sex || "-"}</small>
          </div>

          <span class="health-badge ${getStatusClass(pig.health_status)}">
            ${pig.health_status || "-"}
          </span>
        </div>

        <div class="details-grid">
          <div class="info-card">
            <small>Age Group</small>
            <strong>${formatStageDisplay(pig.age_stage)}</strong>
          </div>

          <div class="info-card">
            <small>Latest Weight</small>
            <strong>${latest.weight ? `${latest.weight} kg` : "-"}</strong>
          </div>

          <div class="info-card">
            <small>Current Stage</small>
            <strong>${pig.current_status || "-"}</strong>
          </div>

          <div class="info-card">
            <small>Sex</small>
            <strong>${pig.sex || "-"}</strong>
          </div>
        </div>

        ${generateTabs(pig)}

        <div class="details-content" id="detailsContent">
          ${renderOverviewTab(pig, latest, adg)}
        </div>

      </div>
    `;

    initializeTabSwitching(pig, latest, adg);

    pigModal.classList.add("show");
    document.body.style.overflow = "hidden";
  }

  /* =========================================================
     UI: OVERVIEW TAB CONTENT
  ========================================================= */
  function renderOverviewTab(pig, latest = {}, adg = "N/A") {
    return `
      <div class="overview-section">

        <div class="d-flex align-items-center justify-content-between mb-2">
          <h4 class="mb-0">Pig Information</h4>
        </div>

        <div class="condition-list">
          <div><span>Status</span><span>${pig.current_status || "-"}</span></div>
          <div><span>Health</span><span>${pig.health_status || "-"}</span></div>
          <div><span>Age Group</span><span>${formatStageDisplay(pig.age_stage)}</span></div>
          <div><span>Sex</span><span>${pig.sex || "-"}</span></div>
        </div>

        <div class="d-flex align-items-center justify-content-between mt-3 mb-2">
          <h4 class="mb-0">Latest Growth Record</h4>
        </div>

        <div class="condition-list">
          <div><span>Weight</span><span>${latest.weight ? `${latest.weight} kg` : "-"}</span></div>
          <div><span>Daily Gain (ADG)</span><span>${adg}</span></div>
          <div><span>Body Length</span><span>${latest.body_length || "-"}</span></div>
          <div><span>Heart Girth</span><span>${latest.heart_girth || "-"}</span></div>
        </div>

        <div class="overview-actions mt-3">
          <button class="secondary-btn full-btn" id="updateInfoBtn" type="button">
            <i class="bi bi-pencil-square"></i> Update Pig Info
          </button>

          <button class="primary-btn full-btn" id="monthlyUpdateBtn" type="button">
            <i class="bi bi-graph-up"></i> Add Monthly Growth
          </button>
        </div>

      </div>
    `;
  }

  /* =========================================================
     UI: DEFAULT TAB FALLBACK
  ========================================================= */
  function renderComingSoon() {
    return `
      <div class="empty-state">
        <i class="bi bi-hourglass-split"></i>
        <p>Feature coming soon.</p>
      </div>
    `;
  }

  /* =========================================================
     UI: GROWTH TAB CONTENT
  ========================================================= */
  function renderGrowthTab(pig) {
    const records = [...(pig.performance_records || [])]
      .filter((r) => r.weight)
      .sort((a, b) => new Date(a.record_date) - new Date(b.record_date));

    if (!records.length) {
      return `
        <div class="empty-state">
          <i class="bi bi-graph-up"></i>
          <p>No growth records yet.</p>
        </div>
      `;
    }

    return `
      <div class="growth-section">

        <button class="back-btn" id="backToOverviewGrowth" type="button">
          <i class="bi bi-arrow-left"></i> Back
        </button>

        <div class="chart-card">
          <div class="chart-header">
            <h4 class="mb-0">Weight Trend</h4>
            <small class="d-block">Auto-updated</small>
          </div>
          <canvas id="weightChart"></canvas>
        </div>

        <div class="summary-card-light">
          <div class="d-flex align-items-center justify-content-between gap-2 mb-2">
            <h4 class="mb-0">Monthly Growth Summary</h4>
          </div>

          <div class="growth-filter-card">
            <div class="growth-filter-left">
              <div class="growth-filter-label">
                <i class="bi bi-calendar3"></i>
                <span>Select Year</span>
              </div>

              <div class="growth-select-box">
                <select id="yearFilter"></select>
                <i class="bi bi-chevron-down select-arrow"></i>
              </div>
            </div>
          </div>

          <div id="monthlySummary"></div>
        </div>

      </div>
    `;
  }

  /* =========================================================
     UI: GROWTH CHART INITIALIZATION
  ========================================================= */
  function initializeGrowthChart(pig) {
    const records = [...(pig.performance_records || [])]
      .filter((r) => r.weight && r.record_date)
      .sort((a, b) => new Date(a.record_date) - new Date(b.record_date));

    const ctx = document.getElementById("weightChart");
    if (!ctx) return;

    if (weightChartInstance) {
      weightChartInstance.destroy();
      weightChartInstance = null;
    }

    if (!records.length) return;

    const labels = records.map((r) =>
      new Date(r.record_date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    );

    const weights = records.map((r) => Number(r.weight));

    weightChartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Weight (kg)",
            data: weights,
            borderColor: "#1FA774",
            backgroundColor: "rgba(31,167,116,0.15)",
            fill: true,
            tension: 0.3,
            pointRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        devicePixelRatio: window.devicePixelRatio,
        layout: { padding: { bottom: 30 } },
        plugins: { legend: { display: false } },
        scales: {
          x: {
            ticks: { autoSkip: false, maxRotation: 0, padding: 20 },
          },
          y: {
            ticks: {
              callback: (value) => value + " kg",
              padding: 8,
            },
          },
        },
      },
    });

    generateMonthlySummary(records);
  }

  /* =========================================================
     UI: MONTHLY SUMMARY (YEAR FILTER + COLLAPSIBLE MONTHS)
  ========================================================= */
  function generateMonthlySummary(records) {
    const container = document.getElementById("monthlySummary");
    const yearFilter = document.getElementById("yearFilter");
    if (!container || !yearFilter) return;

    const years = [...new Set(records.map((r) => new Date(r.record_date).getFullYear()))].sort(
      (a, b) => b - a
    );

    yearFilter.innerHTML = years.map((y) => `<option value="${y}">${y}</option>`).join("");

    function render(year) {
      const monthly = {};

      records
        .filter((r) => new Date(r.record_date).getFullYear() == year)
        .forEach((r) => {
          const date = new Date(r.record_date);
          const monthIndex = date.getMonth();
          const monthName = date.toLocaleString("default", { month: "long" });

          if (!monthly[monthIndex]) {
            monthly[monthIndex] = { name: monthName, records: [] };
          }

          monthly[monthIndex].records.push(r);
        });

      const sortedMonths = Object.keys(monthly)
        .map((m) => parseInt(m, 10))
        .sort((a, b) => b - a);

      container.innerHTML = sortedMonths
        .map((monthIndex) => {
          const monthData = monthly[monthIndex];
          const data = monthData.records.sort(
            (a, b) => new Date(a.record_date) - new Date(b.record_date)
          );

          const start = data[0].weight;
          const end = data[data.length - 1].weight;
          const diff = (end - start).toFixed(1);

          return `
            <div class="month-card">
              <div class="month-header">
                <strong>${monthData.name} ${year}</strong>
                <div class="month-right">
                  <span>${start} → ${end} kg</span>
                  <span class="gain-badge ${diff > 0 ? "positive" : "neutral"}">
                    ${diff > 0 ? "+" : ""}${diff} kg
                  </span>
                </div>
              </div>

              <button class="month-toggle-btn" type="button">
                View ${data.length} update(s)
              </button>

              <div class="month-details hidden">
                ${data
                  .map(
                    (r) => `
                      <div class="month-row">
                        <div>${new Date(r.record_date).toLocaleDateString()}</div>
                        <div>
                          Weight <strong>${r.weight}</strong> kg
                          &nbsp; Length ${r.body_length || "-"} cm
                          &nbsp; Girth ${r.heart_girth || "-"} cm
                        </div>
                      </div>
                    `
                  )
                  .join("")}
              </div>
            </div>
          `;
        })
        .join("");

      attachMonthToggle();
    }

    if (years.length) render(years[0]);

    yearFilter.addEventListener("change", (e) => render(e.target.value));
  }

  /* =========================================================
     UI: MONTH TOGGLE BINDINGS
  ========================================================= */
  function attachMonthToggle() {
    document.querySelectorAll(".month-toggle-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const details = btn.nextElementSibling;
        if (!details) return;

        details.classList.toggle("hidden");

        btn.textContent = details.classList.contains("hidden")
          ? btn.textContent.replace("Hide", "View")
          : "Hide";
      });
    });
  }

  /* =========================================================
     UI: OFFSPRING TAB CONTENT
  ========================================================= */
  function renderOffspringTab(pig) {
    const isFemale = (pig.sex || "").toLowerCase() === "female";
    if (!isFemale) {
      return `
        <div class="empty-state">
          <i class="bi bi-gender-male"></i>
          <p>Offspring records are available for female pigs only.</p>
        </div>
      `;
    }

    const cycles = normalizeCycles(pig);
    if (!cycles.length) {
      return `
        <div class="empty-state">
          <i class="bi bi-egg-fried"></i>
          <p>No farrowing cycles recorded yet.</p>
        </div>
      `;
    }

    const totals = cycles.reduce(
      (acc, c) => {
        acc.total += c.total;
        acc.live += c.live;
        acc.dead += c.dead;
        acc.cycles += 1;
        return acc;
      },
      { total: 0, live: 0, dead: 0, cycles: 0 }
    );

    const cycleOptions = cycles
      .map((c) => `<option value="${c.cycle_number}">Cycle ${c.cycle_number}</option>`)
      .join("");

    return `
      <div class="offspring-section">

        <div class="offspring-top">
          <div>
            <h4 class="offspring-title">Offspring Overview</h4>
            <small class="offspring-sub">Cycle summary, outcomes, and piglet list</small>
          </div>
        </div>

        <div class="offspring-stats">
          <div class="o-stat">
            <small>Total Piglets</small>
            <strong>${totals.total}</strong>
          </div>
          <div class="o-stat live">
            <small>Live</small>
            <strong>${totals.live}</strong>
          </div>
          <div class="o-stat dead">
            <small>Dead</small>
            <strong>${totals.dead}</strong>
          </div>
          <div class="o-stat">
            <small>Cycles</small>
            <strong>${totals.cycles}</strong>
          </div>
        </div>

        <div class="chart-card offspring-chart-card">
          <div class="chart-header">
            <h4 class="mb-0">Piglets per Cycle</h4>
            <small class="d-block">Alive vs Dead comparison</small>
          </div>
          <canvas id="offspringCycleChart"></canvas>
        </div>

        <div class="cycle-filter-card">
          <div class="cycle-filter-label">
            <i class="bi bi-funnel"></i>
            <span>Select Cycle</span>
          </div>

          <div class="cycle-filter-row">
            <div class="cycle-select-box">
              <i class="bi bi-repeat"></i>
              <select id="cycleSelect">
                ${cycleOptions}
              </select>
              <i class="bi bi-chevron-down cycle-select-arrow"></i>
            </div>

            <button class="cycle-latest-btn" id="jumpLatestCycleBtn" type="button">
              <i class="bi bi-arrow-clockwise"></i>
              <span>Latest</span>
            </button>
          </div>
        </div>

        <div id="cycleCardsArea" class="cycle-cards-area"></div>

        <div class="offspring-hint">
          <i class="bi bi-info-circle"></i>
          <span>Tip: Click a cycle card to view mother, father, and piglet list.</span>
        </div>

      </div>
    `;
  }

  /* =========================================================
     UI: CYCLE DETAILS VIEW (INLINE, NOT NEW MODAL)
  ========================================================= */
  function renderCycleDetailsView(pig, cycle) {
    const mother = cycle.mother_id || pig?.swine_id || "—";
    const allPiglets = getDisplayPiglets(pig, cycle);

    const dateLabel = cycle.actual_farrowing_date
      ? new Date(cycle.actual_farrowing_date).toLocaleDateString()
      : "Date not recorded";

    const liveRate = cycle.total ? Math.round((cycle.live / cycle.total) * 100) : 0;

    return `
      <div class="cycle-details-view" id="cycleDetailsViewRoot">
        <div class="cycle-back-wrap">
          <button class="back-btn cycle-back-btn" id="backToOffspringBtn" type="button">
            <span class="back-btn-icon">
              <i class="bi bi-arrow-left"></i>
            </span>
            <span class="back-btn-text">
              <small>Back to</small>
              <strong>Offspring</strong>
            </span>
          </button>
        </div>

        <div class="cycle-details-head">
          <div class="min-w-0">
            <h4 class="cycle-details-title mb-0">Cycle ${cycle.cycle_number}</h4>
            <small class="cycle-details-sub d-block text-truncate">${dateLabel}</small>
          </div>

          <div class="cycle-details-pill">
            <i class="bi bi-activity"></i>
            <span>${liveRate}% Live Rate</span>
          </div>
        </div>

        <div class="offspring-stats details-mini-stats">
          <div class="o-stat">
            <small>Total</small>
            <strong>${cycle.total}</strong>
          </div>
          <div class="o-stat live">
            <small>Live</small>
            <strong>${cycle.live}</strong>
          </div>
          <div class="o-stat dead">
            <small>Dead</small>
            <strong>${cycle.dead}</strong>
          </div>
        </div>

        <div class="parents-card">
          <div class="parent-item">
            <small>Mother</small>
            <div class="mono">${mother}</div>
          </div>
          <div class="parent-item">
            <small>Father</small>
            <div class="mono" id="fatherDetailsLabel2">Loading...</div>
          </div>
        </div>

        <div
          class="piglets-card"
          id="pigletsCardRoot"
          data-cycle-number="${cycle.cycle_number}"
          data-mother-id="${pig.swine_id || ""}"
        >
          <div class="piglets-title piglets-title-modern">
            <div>
              <h4 class="mb-0">Piglets</h4>
              <small>${allPiglets.length ? `${allPiglets.length} record(s)` : "No list recorded"}</small>
            </div>

            <div class="piglets-title-chip">
              <i class="bi bi-grid"></i>
              <span>Card View</span>
            </div>
          </div>

          <div id="pigletCardsMount"></div>
        </div>

        <div class="offspring-hint">
          <i class="bi bi-info-circle"></i>
          <span>Use the tabs to filter piglets, then click View to open a piglet record.</span>
        </div>
      </div>
    `;
  }

  /* =========================================================
     UI: RENDER PIGLET CARD SECTION
     PURPOSE:
       Render tabs, card list, and pagination for the selected cycle.
  ========================================================= */
  function renderPigletCardSection(motherPig, cycle, options = {}) {
    const mount = document.getElementById("pigletCardsMount");
    if (!mount) return;

    const activeFilter = options.filter || "all";
    const page = Number(options.page) || 1;

    const allPiglets = getDisplayPiglets(motherPig, cycle);

    let filteredPiglets = [...allPiglets];
    if (activeFilter === "male") {
      filteredPiglets = filteredPiglets.filter((p) => normalizePigletSex(p.sex) === "male");
    } else if (activeFilter === "female") {
      filteredPiglets = filteredPiglets.filter((p) => normalizePigletSex(p.sex) === "female");
    }

    const pager = paginateItems(filteredPiglets, page, 5);

    const cardsHtml = pager.items.length
      ? pager.items.map((piglet, idx) => renderPigletCard(piglet, idx)).join("")
      : `
        <div class="empty-state">
          <i class="bi bi-grid"></i>
          <p>No piglets found for this filter.</p>
        </div>
      `;

    mount.innerHTML = `
      <div class="piglet-section-shell">
        ${renderPigletFilterTabs(allPiglets, activeFilter)}

        <div class="piglet-cards-grid">
          ${cardsHtml}
        </div>

        ${
          filteredPiglets.length
            ? `
              <div class="piglet-pagination">
                <button
                  type="button"
                  class="piglet-page-btn"
                  id="pigletPrevPageBtn"
                  ${pager.currentPage <= 1 ? "disabled" : ""}
                >
                  <i class="bi bi-chevron-left"></i>
                </button>

                <div class="piglet-page-info">
                  Page ${pager.currentPage} of ${pager.totalPages}
                </div>

                <button
                  type="button"
                  class="piglet-page-btn"
                  id="pigletNextPageBtn"
                  ${pager.currentPage >= pager.totalPages ? "disabled" : ""}
                >
                  <i class="bi bi-chevron-right"></i>
                </button>
              </div>
            `
            : ""
        }
      </div>
    `;

    bindPigletFilterTabs((nextFilter) => {
      renderPigletCardSection(motherPig, cycle, {
        filter: nextFilter,
        page: 1,
      });
    });

    bindPigletPagination((direction) => {
      const nextPage =
        direction === "prev" ? pager.currentPage - 1 : pager.currentPage + 1;

      renderPigletCardSection(motherPig, cycle, {
        filter: activeFilter,
        page: nextPage,
      });
    });

    bindPigletCardActions();
  }

  /* =========================================================
     UI: RENDER SWINE LIST (CARDS + PAGINATION)
  ========================================================= */
  function renderSwine() {
    if (!pigList) return;

    pigList.innerHTML = "";

    let filtered = [...currentSwineData];

    // Type filtering
    if (currentTypeFilter !== "all") {
      filtered = filtered.filter((p) => {
        const stage = (p.age_stage || "").toLowerCase();
        const sex = (p.sex || "").toLowerCase();

        if (currentTypeFilter === "piglet") {
          return stage.includes("piglet") || stage.includes("monitoring");
        }

        if (currentTypeFilter === "sow") {
          return sex === "female" && stage.includes("adult");
        }

        if (currentTypeFilter === "boar") {
          return sex === "male" && stage.includes("adult");
        }

        return true;
      });
    }

    // Sort sick first
    filtered.sort((a, b) => {
      if (a.health_status === "Sick") return -1;
      if (b.health_status === "Sick") return 1;
      return 0;
    });

    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    if (currentPage > totalPages) currentPage = totalPages || 1;

    const start = (currentPage - 1) * itemsPerPage;
    const paginatedItems = filtered.slice(start, start + itemsPerPage);

    paginatedItems.forEach((pig) => {
      const latest = getLatestPerformance(pig.performance_records);
      const adg = calculateADG(pig.performance_records);

      const card = document.createElement("div");
      card.className = "pig-card";

      // More structured, still compatible with your CSS theme
      card.innerHTML = `
        <div class="pig-card-top">
          <div class="pig-id">
            <i class="bi bi-piggy-bank"></i> ${pig.swine_id}
          </div>
          <span class="status-badge ${getStatusClass(pig.health_status)}">
            ${pig.health_status || "-"}
          </span>
        </div>

        <div class="pig-card-meta">
          ${formatStageDisplay(pig.age_stage)} • ${pig.current_status || "-"}
        </div>
      `;

      card.addEventListener("click", () => {
        openPigDetails(pig, latest, adg);
      });

      pigList.appendChild(card);
    });

    // Update pagination UI
    const pageInfo = document.getElementById("pageInfo");
    const prevBtn = document.getElementById("prevPage");
    const nextBtn = document.getElementById("nextPage");

    if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${totalPages || 1}`;
    if (prevBtn) prevBtn.disabled = currentPage === 1;
    if (nextBtn) nextBtn.disabled = currentPage === totalPages;
  }

  /* =========================================================
     UI: TYPE TAB FILTER BINDINGS
  ========================================================= */
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      currentTypeFilter = btn.dataset.type;
      currentPage = 1;
      renderSwine();
    });
  });

  /* =========================================================
     DATA: LOAD SWINE (FARMER)
  ========================================================= */
  try {
    if (loadingMessage) loadingMessage.textContent = "Loading your pigs...";

    const response = await fetch(`${BACKEND_URL}/api/swine/farmer`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      credentials: "include",
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      if (loadingMessage) loadingMessage.textContent = data.message || "Failed to load pigs.";
      return;
    }

    currentSwineData = data.swine || [];
    if (loadingMessage) loadingMessage.textContent = "";

    updateSummaryStats();
    renderSwine();
  } catch (err) {
    console.error(err);
    if (loadingMessage) {
      loadingMessage.innerHTML = `<span style="color:red">${err.message}</span>`;
    }
  }

  /* =========================================================
     UI: PAGINATION BINDINGS
  ========================================================= */
  document.getElementById("prevPage")?.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      renderSwine();
    }
  });

  document.getElementById("nextPage")?.addEventListener("click", () => {
    currentPage++;
    renderSwine();
  });

  /* =========================================================
     UI: TAB SWITCHING (DETAILS VIEW)
  ========================================================= */
  function initializeTabSwitching(pig, latest, adg) {
    const tabs = document.querySelectorAll(".details-tab");
    const content = document.getElementById("detailsContent");
    if (!tabs.length || !content) return;

    // Attach Overview actions (monthly + edit)
    function attachOverviewActions() {
      const monthlyBtn = document.getElementById("monthlyUpdateBtn");
      if (monthlyBtn) {
        monthlyBtn.addEventListener("click", () => openMonthlyUpdateModal(pig));
      }

      const updateInfoBtn = document.getElementById("updateInfoBtn");
      if (updateInfoBtn) {
        updateInfoBtn.addEventListener("click", () => {
          const em = document.getElementById("editPigModal");
          if (!em) return;

          const idField = document.getElementById("editPigId");
          const healthField = document.getElementById("editHealth");
          const statusField = document.getElementById("editStatus");
          const notesField = document.getElementById("editNotes");

          if (idField) idField.value = pig.swine_id;
          if (healthField) healthField.value = pig.health_status || "Healthy";
          if (statusField) statusField.value = pig.current_status || "Open";
          if (notesField) notesField.value = "";

          em.classList.add("show");
          document.body.style.overflow = "hidden";
        });
      }
    }

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");

        const selected = tab.dataset.tab;

        if (selected === "overview") {
          content.innerHTML = renderOverviewTab(pig, latest, adg);
          attachOverviewActions();
          return;
        }

        if (selected === "growth") {
          content.innerHTML = renderGrowthTab(pig);
          initializeGrowthChart(pig);

          const backBtn = document.getElementById("backToOverviewGrowth");
          backBtn?.addEventListener("click", () => {
            const overviewTab = document.querySelector('[data-tab="overview"]');
            overviewTab?.click();
          });
          return;
        }

        if (selected === "offspring") {
          content.innerHTML = renderOffspringTab(pig);
          initializeOffspringUI(pig);
          return;
        }

        content.innerHTML = renderComingSoon();
      });
    });

    // Ensure Overview actions work on first render
    attachOverviewActions();
  }
});