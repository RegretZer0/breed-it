// /js/mypigs.js
import { authGuard } from "/js/authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  /* =========================================================
     MODULE: AUTH + BASE DOM REFERENCES
  ========================================================= */
  const user = await authGuard("farmer");
  if (!user) return;

  const token = localStorage.getItem("token");
  const pigList = document.getElementById("pigList");
  const loadingMessage = document.getElementById("loadingMessage");
  const pigModal = document.getElementById("pigModal");
  const modalBody = document.getElementById("modalBody");
  const closeModal = document.getElementById("closeModal");
  const searchInput = document.getElementById("searchInput");

  pigModal?.classList.remove("show");
  document.body.style.overflow = "";

  const BACKEND_URL = "http://localhost:5000";

  let currentSwineData = [];
  let currentPage = 1;
  let itemsPerPage = 5;
  let currentTypeFilter = "all";
  let currentSearchTerm = "";
  let weightChartInstance = null;
  let offspringChartInstance = null;

  /* =========================================================
     MODULE: SUMMARY STATS
  ========================================================= */
  function updateSummaryStats() {
    const totalEl = document.getElementById("totalCount");
    const healthyEl = document.getElementById("healthyCount");
    const sickEl = document.getElementById("sickCount");
    const sowEl = document.getElementById("sowCount");
    const pigletEl = document.getElementById("pigletCount");
    const boarEl = document.getElementById("boarCount");
    const deadEl = document.getElementById("deadCount");

    const all = currentSwineData || [];

    const healthyCount = all.filter((p) => String(p.health_status || "").trim() === "Healthy").length;
    const sickCount = all.filter((p) => String(p.health_status || "").trim() === "Sick").length;

    const deadCount = all.filter((p) => {
      const health = String(p.health_status || "").toLowerCase();
      const status = String(p.current_status || "").toLowerCase();
      return (
        health.includes("deceased") ||
        health === "dead" ||
        status.includes("deceased") ||
        status === "dead"
      );
    }).length;

    const pigletCount = all.filter((p) => {
      const stage = String(p.age_stage || "").toLowerCase();
      const status = String(p.current_status || "").toLowerCase();
      return (
        stage.includes("piglet") ||
        stage.includes("monitoring") ||
        status.includes("piglet")
      );
    }).length;

    const sowCount = all.filter((p) => {
      const stage = String(p.age_stage || "").toLowerCase();
      const sex = String(p.sex || "").toLowerCase();
      return sex === "female" && stage.includes("adult");
    }).length;

    const boarCount = all.filter((p) => {
      const stage = String(p.age_stage || "").toLowerCase();
      const sex = String(p.sex || "").toLowerCase();
      return sex === "male" && stage.includes("adult");
    }).length;

    if (totalEl) totalEl.textContent = String(all.length);
    if (healthyEl) healthyEl.textContent = String(healthyCount);
    if (sickEl) sickEl.textContent = String(sickCount);
    if (sowEl) sowEl.textContent = String(sowCount);
    if (pigletEl) pigletEl.textContent = String(pigletCount);
    if (boarEl) boarEl.textContent = String(boarCount);
    if (deadEl) deadEl.textContent = String(deadCount);
  }

  /* =========================================================
     MODULE: FATHER ID RESOLVER
  ========================================================= */
  const swineIdCache = new Map();

  function looksLikeObjectId(v) {
    return typeof v === "string" && /^[a-f0-9]{24}$/i.test(v.trim());
  }

  async function resolveSwineId(idOrCode) {
    const raw = (idOrCode || "").toString().trim();
    if (!raw) return "—";
    if (!looksLikeObjectId(raw)) return raw;
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
     MODULE: MODAL CONTROLS
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

  const editModal = document.getElementById("editPigModal");
  const closeEditModal = document.getElementById("closeEditModal");
  const editForm = document.getElementById("editPigForm");
  const backToOverviewEdit = document.getElementById("backToOverviewEdit");

  closeEditModal?.addEventListener("click", () => {
    editModal?.classList.remove("show");
    document.body.style.overflow = "";
  });

  backToOverviewEdit?.addEventListener("click", () => {
    editModal?.classList.remove("show");
    pigModal?.classList.add("show");
    document.body.style.overflow = "hidden";
  });

  editModal?.addEventListener("click", (e) => {
    if (e.target === editModal) {
      editModal.classList.remove("show");
      document.body.style.overflow = "";
    }
  });

  /* =========================================================
     MODULE: EDIT FORM SUBMIT
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
      location.reload();
    } catch (err) {
      console.error(err);
      alert("Update failed.");
    }
  });

  /* =========================================================
     MODULE: SHARED HELPERS
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

  function getStageIcon(pig) {
    const stage = String(pig.age_stage || "").toLowerCase();
    const sex = String(pig.sex || "").toLowerCase();

    if (stage.includes("piglet") || stage.includes("monitoring")) return "bi-heart-pulse";
    if (sex === "female") return "bi-gender-female";
    if (sex === "male") return "bi-gender-male";
    return "bi-piggy-bank";
  }

  function getLatestPerformance(records = []) {
    if (!Array.isArray(records) || !records.length) return {};

    const sorted = [...records].sort(
      (a, b) => new Date(b.record_date || 0) - new Date(a.record_date || 0)
    );

    const latestGrowthRecord = sorted.find((r) => {
      const weightNum = Number(r.weight);
      const bodyLengthNum = Number(r.body_length);
      const heartGirthNum = Number(r.heart_girth);

      const hasWeight =
        r.weight !== undefined &&
        r.weight !== null &&
        r.weight !== "" &&
        !Number.isNaN(weightNum) &&
        weightNum > 0;

      const hasBodyLength =
        r.body_length !== undefined &&
        r.body_length !== null &&
        r.body_length !== "" &&
        !Number.isNaN(bodyLengthNum) &&
        bodyLengthNum > 0;

      const hasHeartGirth =
        r.heart_girth !== undefined &&
        r.heart_girth !== null &&
        r.heart_girth !== "" &&
        !Number.isNaN(heartGirthNum) &&
        heartGirthNum > 0;

      return hasWeight || hasBodyLength || hasHeartGirth;
    });

    return latestGrowthRecord || {};
  }

  function calculateADG(records = []) {
    const weightedRecords = [...(records || [])]
      .filter((r) => {
        const weightNum = Number(r.weight);
        return (
          r &&
          r.record_date &&
          r.weight !== undefined &&
          r.weight !== null &&
          r.weight !== "" &&
          !Number.isNaN(weightNum) &&
          weightNum > 0
        );
      })
      .sort((a, b) => new Date(a.record_date) - new Date(b.record_date));

    if (weightedRecords.length < 2) return "N/A";

    const last = weightedRecords[weightedRecords.length - 1];
    const prev = weightedRecords[weightedRecords.length - 2];

    const days =
      (new Date(last.record_date) - new Date(prev.record_date)) / (1000 * 60 * 60 * 24);

    if (!Number.isFinite(days) || days <= 0) return "N/A";

    const lastWeight = Number(last.weight);
    const prevWeight = Number(prev.weight);

    if (!Number.isFinite(lastWeight) || !Number.isFinite(prevWeight)) return "N/A";

    return ((lastWeight - prevWeight) / days).toFixed(3) + " kg/day";
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
     MODULE: OFFSPRING HELPERS
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

  function buildOffspringCycleChart(cycles) {
    const canvas = document.getElementById("offspringCycleChart");
    const filter = document.getElementById("cycleFilter");

    if (!canvas || !filter) return;

    // Destroy existing chart
    if (offspringChartInstance) {
      offspringChartInstance.destroy();
      offspringChartInstance = null;
    }

    // Normalize + extract cycle numbers
    const cycleNumbers = cycles
      .map(c => Number(c.cycle_number))
      .filter(n => !Number.isNaN(n) && n > 0)
      .sort((a, b) => a - b);

    const uniqueCycles = [...new Set(cycleNumbers)];

    // Populate filter (dynamic)
    filter.innerHTML = `
      <option value="all" selected>All</option>
      ${uniqueCycles.map(c => `<option value="${c}">Cycle ${c}</option>`).join("")}
    `;

    // Render function
    function render(selected = "all") {
      const filtered = selected === "all"
        ? cycles
        : cycles.filter(c => String(c.cycle_number) === String(selected));

      const sorted = [...filtered].sort(
        (a, b) => (Number(a.cycle_number) || 0) - (Number(b.cycle_number) || 0)
      );

      const labels = sorted.map(c => `C${c.cycle_number}`);
      const live = sorted.map(c => toNum(c.live));
      const dead = sorted.map(c => toNum(c.dead));

      if (offspringChartInstance) {
        offspringChartInstance.destroy();
      }

      offspringChartInstance = new Chart(canvas, {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              label: "Live",
              data: live,
              backgroundColor: "rgba(31,167,116,0.75)",
              borderRadius: 12,
              barThickness: 48,
              maxBarThickness: 56,
            },
            {
              label: "Dead",
              data: dead,
              backgroundColor: "rgba(220,38,38,0.6)",
              borderRadius: 12,
              barThickness: 48,
              maxBarThickness: 56,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,

          layout: {
            padding: {
              top: 16,
              bottom: 8,
              left: 8,
              right: 8,
            },
          },

          plugins: {
            legend: {
              position: "bottom",
              labels: {
                usePointStyle: true,
                boxWidth: 10,
              },
            },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.dataset.label}: ${ctx.raw}`,
              },
            },
          },

          scales: {
            x: {
              grid: {
                display: false,
              },
              ticks: {
                font: {
                  size: 12,
                },
              },
            },
            y: {
              beginAtZero: true,
              ticks: {
                precision: 0,
                stepSize: 1,
              },
            },
          },
        },
      });
    }

    // Initial render
    render("all");

    // Prevent duplicate listeners
    filter.onchange = (e) => {
      render(e.target.value);
    };
  }

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

  function normalizePigletSex(value) {
    const v = String(value || "").trim().toLowerCase();
    if (v === "male") return "male";
    if (v === "female") return "female";
    return "unknown";
  }

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

        openPigDetails(targetPig);
      });
    });
  }

  function bindPigletFilterTabs(onChange) {
    document.querySelectorAll("[data-piglet-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const filter = btn.getAttribute("data-piglet-filter") || "all";
        onChange(filter);
      });
    });
  }

  function bindPigletPagination(onChange) {
    const prevBtn = document.getElementById("pigletPrevPageBtn");
    const nextBtn = document.getElementById("pigletNextPageBtn");

    prevBtn?.addEventListener("click", () => onChange("prev"));
    nextBtn?.addEventListener("click", () => onChange("next"));
  }

  /* =========================================================
     MODULE: LEGACY MONTHLY UPDATE
     PURPOSE:
       Kept in memory for later transfer. Not used in current UI.
  ========================================================= */
  function openMonthlyUpdateModal(pig) {
    if (!modalBody) return;

    modalBody.innerHTML = `
      <div class="empty-state">
        <i class="bi bi-box-seam"></i>
        <p>Monthly update has been moved from this interface and reserved for future transfer.</p>
      </div>
    `;

    pigModal.classList.add("show");
    document.body.style.overflow = "hidden";
  }

  /* =========================================================
     MODULE: DETAILS TABS
  ========================================================= */
  function generateTabs(pig) {
    const stage = (pig.age_stage || "").toLowerCase();
    const isPiglet = stage.includes("piglet") || stage.includes("monitoring");
    const isFemale = (pig.sex || "").toLowerCase() === "female";

    let tabs = `
      <button class="details-tab active" data-tab="overview" type="button">
        <i class="bi bi-grid"></i>
        <span>Overview</span>
      </button>
      <button class="details-tab" data-tab="growth" type="button">
        <i class="bi bi-graph-up-arrow"></i>
        <span>Growth</span>
      </button>
    `;

    if (!isPiglet && isFemale) {
      tabs += `
        <button class="details-tab" data-tab="offspring" type="button">
          <i class="bi bi-diagram-3"></i>
          <span>Offspring</span>
        </button>
      `;
    }

    return `<div class="details-tabs">${tabs}</div>`;
  }

  /* =========================================================
     MODULE: OPEN PIG DETAILS MODAL
  ========================================================= */
  function openPigDetails(pig) {
    if (!modalBody) return;

    const latest = getLatestPerformance(pig.performance_records || []);
    const adg = calculateADG(pig.performance_records || []);

    const latestWeightText =
      latest.weight !== undefined &&
      latest.weight !== null &&
      latest.weight !== "" &&
      !Number.isNaN(Number(latest.weight))
        ? `${Number(latest.weight)} kg`
        : "-";

    modalBody.innerHTML = `
      <div class="pig-details">

        <div class="details-hero">
          <div class="details-hero-left">
            <div class="details-avatar">
              <i class="bi ${getStageIcon(pig)}"></i>
            </div>

            <div class="min-w-0">
              <h2 class="mb-1">${pig.swine_id}</h2>
              <div class="details-hero-meta">
                <span>${pig.breed || "-"}</span>
                <span class="dot-sep"></span>
                <span>${pig.sex || "-"}</span>
              </div>
            </div>
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
            <strong>${latestWeightText}</strong>
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
     MODULE: OVERVIEW TAB
  ========================================================= */
  function renderOverviewTab(pig, latest = {}, adg = "N/A") {
    const weightText =
      latest.weight !== undefined &&
      latest.weight !== null &&
      latest.weight !== "" &&
      !Number.isNaN(Number(latest.weight))
        ? `${Number(latest.weight)} kg`
        : "-";

    const bodyLengthText =
      latest.body_length !== undefined &&
      latest.body_length !== null &&
      latest.body_length !== "" &&
      !Number.isNaN(Number(latest.body_length))
        ? `${Number(latest.body_length)} cm`
        : "-";

    const heartGirthText =
      latest.heart_girth !== undefined &&
      latest.heart_girth !== null &&
      latest.heart_girth !== "" &&
      !Number.isNaN(Number(latest.heart_girth))
        ? `${Number(latest.heart_girth)} cm`
        : "-";

    return `
      <div class="overview-section">
        <div class="content-block">
          <div class="content-block-head">
            <h4 class="mb-0">Pig Information</h4>
          </div>

          <div class="condition-list">
            <div><span>Status</span><span>${pig.current_status || "-"}</span></div>
            <div><span>Health</span><span>${pig.health_status || "-"}</span></div>
            <div><span>Age Group</span><span>${formatStageDisplay(pig.age_stage)}</span></div>
            <div><span>Sex</span><span>${pig.sex || "-"}</span></div>
          </div>
        </div>

        <div class="content-block">
          <div class="content-block-head">
            <h4 class="mb-0">Latest Growth Record</h4>
          </div>

          <div class="condition-list">
            <div><span>Weight</span><span>${weightText}</span></div>
            <div><span>Daily Gain (ADG)</span><span>${adg}</span></div>
            <div><span>Body Length</span><span>${bodyLengthText}</span></div>
            <div><span>Heart Girth</span><span>${heartGirthText}</span></div>
          </div>
        </div>

        <div class="overview-actions mt-3"></div>
      </div>
    `;
  }

  function renderComingSoon() {
    return `
      <div class="empty-state">
        <i class="bi bi-hourglass-split"></i>
        <p>Feature coming soon.</p>
      </div>
    `;
  }

  /* =========================================================
     MODULE: GROWTH TAB
     NOTE:
       Read-only growth view retained.
       Monthly update action removed from interface.
  ========================================================= */
  function renderGrowthTab(pig) {
    const records = [...(pig.performance_records || [])]
      .filter((r) => {
        const weightNum = Number(r.weight);
        return (
          r &&
          r.record_date &&
          r.weight !== undefined &&
          r.weight !== null &&
          r.weight !== "" &&
          !Number.isNaN(weightNum) &&
          weightNum > 0
        );
      })
      .sort((a, b) => new Date(a.record_date) - new Date(b.record_date));

    if (!records.length) {
      return `
        <div class="growth-section">

          <div class="empty-state">
            <i class="bi bi-graph-up"></i>
            <p>No growth records yet.</p>
          </div>
        </div>
      `;
    }

    return `
      <div class="growth-section">

        <div class="chart-card growth-chart-card">

          <!-- HEADER -->
          <div class="chart-card-head">
            <div>
              <h4 class="mb-1">Weight Trend</h4>
              <small>Recorded growth history</small>
            </div>

            <div class="chart-card-badge">
              <i class="bi bi-graph-up-arrow"></i>
              <span>${records.length} Record${records.length > 1 ? "s" : ""}</span>
            </div>
          </div>

          <!-- FILTER (MOVED HERE - FULL WIDTH LIKE MONTHLY) -->
          <div class="growth-filter-card chart-filter-spacing">
            <div class="growth-filter-left">
              <div class="growth-filter-label">
                <i class="bi bi-calendar3"></i>
                <span>Select Year</span>
              </div>

              <div class="growth-select-box">
                <select id="chartYearFilter"></select>
                <i class="bi bi-chevron-down select-arrow"></i>
              </div>
            </div>
          </div>

          <!-- CHART -->
          <div class="chart-canvas-wrap">
            <div class="chart-inner">
              <canvas id="weightChart"></canvas>
            </div>
          </div>
        </div>

        <div class="summary-card-light growth-summary-shell">
          <div class="growth-summary-head">
            <div>
              <h4 class="mb-1">Monthly Growth Summary</h4>
              <small>Review recorded measurements by month</small>
            </div>

            <span class="readonly-pill">
              <i class="bi bi-lock"></i>
              <span>Read Only</span>
            </span>
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

  function bindMonthToggle() {
    const cards = document.querySelectorAll("[data-month]");

    cards.forEach((card) => {
      const btn = card.querySelector(".month-toggle-btn");
      const body = card.querySelector(".month-body");
      const text = card.querySelector(".toggle-text");
      const icon = card.querySelector(".toggle-icon");

      btn?.addEventListener("click", () => {
        const isOpen = !body.classList.contains("collapsed");

        // Close all first
        document.querySelectorAll(".month-body").forEach((b) => {
          b.classList.add("collapsed");
        });

        document.querySelectorAll(".toggle-text").forEach((t) => {
          t.textContent = "View details";
        });

        document.querySelectorAll(".toggle-icon").forEach((i) => {
          i.classList.remove("rotate");
        });

        // Open current if closed
        if (!isOpen) {
          body.classList.remove("collapsed");
          text.textContent = "Hide details";
          icon.classList.add("rotate");
        }
      });
    });
  }

  function initializeGrowthChart(pig) {
    const allRecords = [...(pig.performance_records || [])]
      .filter((r) => {
        const weightNum = Number(r.weight);
        return (
          r &&
          r.record_date &&
          r.weight !== undefined &&
          r.weight !== null &&
          r.weight !== "" &&
          !Number.isNaN(weightNum) &&
          weightNum > 0
        );
      });

    const ctx = document.getElementById("weightChart");
    const yearFilter = document.getElementById("chartYearFilter");

    if (!ctx || !yearFilter) return;

    // Get available years dynamically
    const years = [...new Set(allRecords.map(r => new Date(r.record_date).getFullYear()))]
      .sort((a, b) => b - a);

    yearFilter.innerHTML = years
      .map(y => `<option value="${y}">${y}</option>`)
      .join("");

    function renderChart(year) {
      const records = allRecords
        .filter(r => new Date(r.record_date).getFullYear() == year)
        .sort((a, b) => new Date(a.record_date) - new Date(b.record_date));

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
          plugins: {
            legend: { display: false },
          },
          scales: {
            x: {
              ticks: {
                autoSkip: true,
                maxRotation: 0,
              },
            },
            y: {
              ticks: {
                callback: (value) => value + " kg",
              },
            },
          },
        },
      });
    }

    // Initial render
    if (years.length) renderChart(years[0]);

    // On change
    yearFilter.addEventListener("change", (e) => {
      renderChart(e.target.value);
    });

    // Keep monthly summary synced
    generateMonthlySummary(allRecords);
  }

  /* ===============================
     MODULE: MONTHLY SUMMARY
  =================================== */
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

      if (!sortedMonths.length) {
        container.innerHTML = `
          <div class="empty-state">
            <i class="bi bi-calendar-x"></i>
            <p>No records found for the selected year.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = sortedMonths
        .map((monthIndex) => {
          const monthData = monthly[monthIndex];
          const data = monthData.records.sort(
            (a, b) => new Date(a.record_date) - new Date(b.record_date)
          );

          const start = Number(data[0].weight || 0);
          const end = Number(data[data.length - 1].weight || 0);
          const diff = (end - start).toFixed(1);

          return `
            <div class="month-card" data-month>

              <!-- HEADER -->
              <div class="month-header">
                <div>
                  <h5 class="mb-0">${monthData.name}</h5>
                  <small>${data.length} updates</small>
                </div>

                <div class="month-right d-flex align-items-center gap-2">
                  <strong>${start} → ${end} kg</strong>
                  <span class="badge">${diff} kg</span>

                  <button class="month-toggle-btn" type="button">
                    <span class="toggle-text">View details</span>
                    <i class="bi bi-chevron-down toggle-icon"></i>
                  </button>
                </div>
              </div>

              <!-- COLLAPSIBLE BODY -->
              <div class="month-body collapsed">
                ${data
                  .map(
                    (r) => `
                      <div class="month-record">
                        <div class="record-date">
                          ${new Date(r.record_date).toLocaleDateString()}
                        </div>

                        <div class="record-grid">
                          <div>
                            <small>Weight</small>
                            <strong>${r.weight || "-"} kg</strong>
                          </div>

                          <div>
                            <small>Length</small>
                            <strong>${r.body_length || "-"} cm</strong>
                          </div>

                          <div>
                            <small>Girth</small>
                            <strong>${r.heart_girth || "-"} cm</strong>
                          </div>
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

      bindMonthToggle();
    }

    if (years.length) render(years[0]);

    yearFilter.addEventListener("change", (e) => render(e.target.value));
  }

  /* =========================================================
     MODULE: OFFSPRING TAB
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

    const cycleOptions = `
      <option value="all" selected>All Cycles</option>
      ${cycles
        .sort((a, b) => (b.cycle_number || 0) - (a.cycle_number || 0))
        .map(c => `
          <option value="${c.cycle_number}">
            Cycle ${c.cycle_number}
          </option>
        `)
        .join("")}
    `;

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

        <!-- CHART CARD -->
        <div class="chart-card offspring-chart-card">

          <div class="chart-card-head">
            <div>
              <h4 class="mb-1">Piglets per Cycle</h4>
              <small>Alive vs Dead comparison</small>
            </div>
          </div>

          <!-- FILTER -->
          <div class="growth-filter-card chart-filter-spacing">
            <div class="growth-filter-left">
              <div class="growth-filter-label">
                <i class="bi bi-arrow-repeat"></i>
                <span>Filter Cycle</span>
              </div>

              <div class="growth-select-box">
                <select id="cycleFilter"></select>
                <i class="bi bi-chevron-down select-arrow"></i>
              </div>
            </div>
          </div>

          <!-- CHART -->
          <div class="offspring-chart-wrap">
            <div class="offspring-chart-inner">
              <canvas id="offspringCycleChart"></canvas>
            </div>
          </div>
        </div>

        <!-- WRAPPED CYCLE SECTION -->
        <div class="summary-card-light cycle-section-card">

          <!-- TITLE -->
          <div class="cycle-section-head">
            <div>
              <h4 class="mb-1">Cycle Records</h4>
              <small>View and filter breeding cycles</small>
            </div>
          </div>

          <!-- FILTER -->
          <div class="cycle-filter-card">
            <div class="cycle-filter-label">
              <i class="bi bi-funnel"></i>
              <span>Filter Cycle</span>
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

          <!-- CYCLE CARDS -->
          <div id="cycleCardsArea" class="cycle-cards-area"></div>

        </div>

        <!-- HINT -->
        <div class="offspring-hint">
          <i class="bi bi-info-circle"></i>
          <span>Tip: Click a cycle card to view mother, father, and piglet list.</span>
        </div>

      </div>
    `;
  }

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

  function initializeOffspringUI(pig) {
    const cycles = normalizeCycles(pig);
    if (!cycles.length) return;

    const cycleSelect = document.getElementById("cycleSelect");
    const cycleCardsArea = document.getElementById("cycleCardsArea");
    const jumpLatestBtn = document.getElementById("jumpLatestCycleBtn");

    const latestCycleNum = Math.max(...cycles.map((c) => c.cycle_number || 0));

    if (cycleSelect) cycleSelect.value = String(latestCycleNum);

    buildOffspringCycleChart(cycles);

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

    function renderAllCycles() {
      if (!cycleCardsArea) return;

      cycleCardsArea.innerHTML = cycles.map((c) => {
        const dateLabel = c.actual_farrowing_date
          ? new Date(c.actual_farrowing_date).toLocaleDateString()
          : "Date not recorded";

        return `
          <div class="cycle-card modern-cycle-card">
            <div class="cycle-card-top">
              <div class="min-w-0">
                <strong>Cycle ${c.cycle_number}</strong>
                <small class="d-block text-truncate">${dateLabel}</small>
              </div>

              <div class="cycle-badges">
                <span class="mini-badge total"><i class="bi bi-collection"></i> ${c.total}</span>
                <span class="mini-badge live"><i class="bi bi-heart-pulse"></i> ${c.live}</span>
                <span class="mini-badge dead"><i class="bi bi-x-circle"></i> ${c.dead}</span>
              </div>
            </div>

            <div class="cycle-card-bottom">
              <div class="cycle-mini">
                <small>Mother</small>
                <div class="mono">${c.mother_id || "-"}</div>
              </div>
              <div class="cycle-mini">
                <small>Father</small>
                <div class="mono">—</div>
              </div>
            </div>
          </div>
        `;
      }).join("");
    }

    if (cycleSelect) cycleSelect.value = "all";
    renderAllCycles();

    cycleSelect?.addEventListener("change", (e) => {
      const value = e.target.value;

      if (value === "all") {
        renderAllCycles();
        return;
      }

      renderSelectedCycle(toNum(value));
    });

    jumpLatestBtn?.addEventListener("click", () => {
      if (!cycleSelect) return;
      cycleSelect.value = String(latestCycleNum);
      renderSelectedCycle(latestCycleNum);
    });
  }

  

  /* =========================================================
     MODULE: RENDER SWINE LIST
  ========================================================= */
  function renderSwine() {
    if (!pigList) return;

    pigList.innerHTML = "";

    let filtered = [...currentSwineData];

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

    if (currentSearchTerm) {
      const q = currentSearchTerm.toLowerCase();
      filtered = filtered.filter((p) => {
        return [
          p.swine_id,
          p.breed,
          p.sex,
          p.age_stage,
          p.current_status,
          p.health_status,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q));
      });
    }

    filtered.sort((a, b) => {
      if (a.health_status === "Sick" && b.health_status !== "Sick") return -1;
      if (b.health_status === "Sick" && a.health_status !== "Sick") return 1;
      return String(a.swine_id || "").localeCompare(String(b.swine_id || ""), undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });

    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    if (currentPage > totalPages) currentPage = totalPages || 1;

    const start = (currentPage - 1) * itemsPerPage;
    const paginatedItems = filtered.slice(start, start + itemsPerPage);

    if (!paginatedItems.length) {
      pigList.innerHTML = `
        <div class="empty-state">
          <i class="bi bi-search"></i>
          <p>No pigs found for the current filter.</p>
        </div>
      `;
    } else {
      paginatedItems.forEach((pig) => {
        const latest = getLatestPerformance(pig.performance_records);
        const latestWeight =
          latest.weight !== undefined &&
          latest.weight !== null &&
          latest.weight !== "" &&
          !Number.isNaN(Number(latest.weight))
            ? `${Number(latest.weight)} kg`
            : "-";

        const card = document.createElement("div");
        card.className = "pig-card";

        card.innerHTML = `
          <div class="pig-card-shell">
            <div class="pig-card-top">
              <div class="pig-card-identity">
                <div class="pig-card-icon">
                  <i class="bi ${getStageIcon(pig)}"></i>
                </div>

                <div class="min-w-0">
                  <div class="pig-id">${pig.swine_id}</div>
                  <div class="pig-card-meta">
                    <span>${pig.breed || "-"}</span>
                    <span class="dot-sep"></span>
                    <span>${pig.sex || "-"}</span>
                  </div>
                </div>
              </div>

              <span class="status-badge ${getStatusClass(pig.health_status)}">
                ${pig.health_status || "-"}
              </span>
            </div>

            <div class="pig-card-body">
              <div class="pig-mini-stat">
                <small>Age Group</small>
                <strong>${formatStageDisplay(pig.age_stage)}</strong>
              </div>

              <div class="pig-mini-stat">
                <small>Current Status</small>
                <strong>${pig.current_status || "-"}</strong>
              </div>

              <div class="pig-mini-stat">
                <small>Latest Weight</small>
                <strong>${latestWeight}</strong>
              </div>
            </div>

            <div class="pig-card-footer">
              <span class="pig-card-link">
                <span class="pig-card-link-text">View Details</span>
                <span class="pig-card-link-arrow">
                  <i class="bi bi-arrow-right"></i>
                </span>
              </span>
            </div>
          </div>
        `;

        card.addEventListener("click", () => {
          openPigDetails(pig);
        });

        pigList.appendChild(card);
      });
    }

    const pageInfo = document.getElementById("pageInfo");
    const prevBtn = document.getElementById("prevPage");
    const nextBtn = document.getElementById("nextPage");

    if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${totalPages || 1}`;
    if (prevBtn) prevBtn.disabled = currentPage === 1;
    if (nextBtn) nextBtn.disabled = currentPage === totalPages || totalPages === 0;
  }

  /* =========================================================
     MODULE: TYPE FILTER BINDINGS
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
     MODULE: SEARCH BINDING
  ========================================================= */
  searchInput?.addEventListener("input", (e) => {
    currentSearchTerm = String(e.target.value || "").trim();
    currentPage = 1;
    renderSwine();
  });

  /* =========================================================
     MODULE: LOAD SWINE DATA
  ========================================================= */
  try {
    if (loadingMessage) {
      loadingMessage.classList.remove("hidden");
      loadingMessage.textContent = "Loading your pig records...";
    }

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

    if (loadingMessage) {
      loadingMessage.textContent = "";
      loadingMessage.classList.add("hidden");
    }

    updateSummaryStats();
    renderSwine();
  } catch (err) {
    console.error(err);
    if (loadingMessage) {
      loadingMessage.classList.remove("hidden");
      loadingMessage.innerHTML = `<span style="color:red">${err.message}</span>`;
    }
  }

  /* =========================================================
     MODULE: PAGINATION BINDINGS
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
     MODULE: TAB SWITCHING
     PURPOSE:
       Handle detail tab navigation and render each selected
       content panel. Update Pig Info action has been removed
       from this interface and reserved for later transfer.
  ========================================================= */
  function initializeTabSwitching(pig, latest, adg) {
    const tabs = document.querySelectorAll(".details-tab");
    const content = document.getElementById("detailsContent");
    if (!tabs.length || !content) return;

    /* =========================================================
       MODULE: OVERVIEW ACTIONS
       PURPOSE:
         Reserved for future overview actions. The previous
         Update Pig Info flow is intentionally disabled here.
    ========================================================= */
    function attachOverviewActions() {
      // Update Pig Info has been removed from this interface.
      // Keep this function for compatibility and future transfer.
    }

    /* =========================================================
       MODULE: TAB CLICK BINDINGS
       PURPOSE:
         Switch active tab state and render the matching content.
    ========================================================= */
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
          backBtn?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();

            const overviewTab = document.querySelector('.details-tab[data-tab="overview"]');
            if (overviewTab) {
              overviewTab.click();
            }
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

    /* =========================================================
       MODULE: INITIAL OVERVIEW HOOK
       PURPOSE:
         Run compatibility hooks for the default Overview tab.
    ========================================================= */
    attachOverviewActions();
  }
});