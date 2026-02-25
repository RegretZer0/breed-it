// swine.render.js
import { formatStageDisplay, getLatestPerf } from "./swine.helpers.js";

/* =========================================================
   REPRODUCTION CARDS (kept for compatibility)
========================================================= */
export function renderReproductionCards({ cycles = [], offspringByCycle = {} }) {
  const reproCardList = document.getElementById("reproductionCardList");
  const reproEmpty = document.getElementById("reproductionEmptyState");
  if (!reproCardList || !reproEmpty) return;

  reproCardList.innerHTML = "";

  if (!Array.isArray(cycles) || cycles.length === 0) {
    reproEmpty.classList.remove("d-none");
    return;
  }
  reproEmpty.classList.add("d-none");

  cycles.forEach((cycle) => {
    const cycleNo = cycle.cycle_number ?? "—";
    const litter = offspringByCycle?.[cycleNo] || [];

    const totalBorn = litter.length;
    const liveBorn = litter.filter((p) => p.health_status === "Healthy").length;
    const stillBorn = Math.max(totalBorn - liveBorn, 0);

    const status = cycle.status || "Completed";
    const statusClass =
      {
        Completed: "bg-success-subtle text-success",
        Pending: "bg-warning-subtle text-warning",
        Failed: "bg-danger-subtle text-danger",
      }[status] || "bg-secondary-subtle text-secondary";

    reproCardList.insertAdjacentHTML(
      "beforeend",
      `
      <div class="card border-0 shadow-sm reproduction-card mb-3">
        <div class="card-body pb-2 d-flex justify-content-between align-items-center">
          <div class="min-w-0">
            <div class="fw-semibold fs-6 text-truncate">Farrowing Cycle ${cycleNo}</div>
            <div class="small text-muted">
              Service Date: ${
                cycle.ai_service_date
                  ? new Date(cycle.ai_service_date).toLocaleDateString()
                  : "—"
              }
            </div>
            <div class="small text-muted">
              Farrowing Date: ${
                cycle.actual_farrowing_date
                  ? new Date(cycle.actual_farrowing_date).toLocaleDateString()
                  : "—"
              }
            </div>
          </div>

          <div class="d-flex align-items-center gap-2 flex-shrink-0">
            <span class="badge rounded-pill px-3 ${statusClass}">
              ${status}
            </span>
            <button class="btn btn-sm btn-outline-primary toggle-repro" type="button">
              View
            </button>
          </div>
        </div>

        <div class="repro-details d-none card-body pt-2">
          <div class="row g-3 text-center">
            <div class="col-md-4">
              <div class="border rounded p-3">
                <div class="small text-muted">Total Born</div>
                <div class="fs-5 fw-bold">${totalBorn}</div>
              </div>
            </div>

            <div class="col-md-4">
              <div class="border rounded p-3 bg-success-subtle">
                <div class="small text-muted">Alive</div>
                <div class="fs-5 fw-bold text-success">${liveBorn}</div>
              </div>
            </div>

            <div class="col-md-4">
              <div class="border rounded p-3 bg-danger-subtle">
                <div class="small text-muted">Dead</div>
                <div class="fs-5 fw-bold text-danger">${stillBorn}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `
    );
  });
}

/* =========================================================
   GROWTH
========================================================= */
export function renderGrowth({ sw, growthChartInstanceRef }) {
  const timeline = document.getElementById("growthTimeline");
  if (!timeline) return;

  const records = [...(sw?.performance_records || [])]
    .filter((r) => typeof r.weight === "number" && r.record_date)
    .sort((a, b) => new Date(a.record_date) - new Date(b.record_date));

  if (!records.length) {
    timeline.innerHTML = `<div class="text-muted text-center">No growth records yet</div>`;
    const ctx = document.getElementById("growthChart");
    if (ctx && growthChartInstanceRef?.current) {
      growthChartInstanceRef.current.destroy();
      growthChartInstanceRef.current = null;
    }
    return;
  }

  const ctx = document.getElementById("growthChart");
  if (ctx && window.Chart) {
    if (growthChartInstanceRef?.current) {
      growthChartInstanceRef.current.destroy();
      growthChartInstanceRef.current = null;
    }

    growthChartInstanceRef.current = new Chart(ctx, {
      type: "line",
      data: {
        labels: records.map((r) => new Date(r.record_date).toLocaleDateString()),
        datasets: [
          {
            data: records.map((r) => r.weight),
            borderColor: "#198754",
            backgroundColor: "rgba(25,135,84,0.15)",
            tension: 0.35,
            fill: true,
            pointRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { ticks: { callback: (v) => `${v} kg` } } },
      },
    });
  }

  const grouped = {};
  records.forEach((r) => {
    const d = new Date(r.record_date);
    const year = String(d.getFullYear());
    const month = d.toLocaleString("default", { month: "long" });
    const key = `${month} ${year}`;

    if (!grouped[year]) grouped[year] = {};
    if (!grouped[year][key]) grouped[year][key] = [];
    grouped[year][key].push(r);
  });

  const yearSelect = document.getElementById("growthYearFilter");
  const years = Object.keys(grouped).sort((a, b) => Number(b) - Number(a));

  if (yearSelect) {
    const prev = yearSelect.value;
    yearSelect.innerHTML = years.map((y) => `<option value="${y}">${y}</option>`).join("");
    if (prev && years.includes(prev)) yearSelect.value = prev;
  }

  const selectedYear = yearSelect?.value || years[0];
  timeline.innerHTML = "";

  if (!grouped[selectedYear]) {
    timeline.innerHTML = `<div class="text-muted text-center">No growth records for selected year</div>`;
    return;
  }

  timeline.insertAdjacentHTML("beforeend", `<div class="growth-year-header">${selectedYear}</div>`);

  Object.entries(grouped[selectedYear])
    .sort((a, b) => new Date(b[1][0].record_date) - new Date(a[1][0].record_date))
    .forEach(([month, recs]) => {
      const start = recs[0];
      const end = recs[recs.length - 1];
      const gain = Number((end.weight - start.weight).toFixed(1));

      timeline.insertAdjacentHTML(
        "beforeend",
        `
        <div class="growth-month-card">
          <div class="growth-month-header">
            <div>
              <div class="month-title">${month}</div>
              <button class="btn btn-sm btn-outline-primary toggle-growth" type="button">
                View ${recs.length} update${recs.length > 1 ? "s" : ""}
              </button>
            </div>

            <div class="month-metrics">
              <span class="weight-range">${start.weight} → ${end.weight} kg</span>
              <span class="gain-badge ${gain >= 0 ? "gain-positive" : "gain-negative"}">
                ${gain >= 0 ? "+" : ""}${gain} kg
              </span>
            </div>
          </div>

          <div class="growth-details d-none">
            ${recs
              .map(
                (r) => `
              <div class="growth-entry">
                <div class="growth-left">
                  <div class="growth-date">${new Date(r.record_date).toLocaleDateString()}</div>
                  <div class="growth-stage text-muted small">${r.stage || "Monthly Update"}</div>
                </div>

                <div class="growth-metrics">
                  <div class="metric">
                    <span class="metric-label">Weight</span>
                    <span class="metric-value"><strong>${r.weight}</strong> kg</span>
                  </div>
                  <div class="metric">
                    <span class="metric-label">Length</span>
                    <span class="metric-value">${r.body_length || "—"} cm</span>
                  </div>
                  <div class="metric">
                    <span class="metric-label">Girth</span>
                    <span class="metric-value">${r.heart_girth || "—"} cm</span>
                  </div>
                </div>
              </div>
            `
              )
              .join("")}
          </div>
        </div>
      `
      );
    });
}

/* =========================================================
   SWINE CARDS (LIST)
========================================================= */
export function renderCards({
  list = [],
  swineCardList,
  activeCategory = "all",
  swinePage = 1,
  SWINE_ROWS_PER_PAGE = 5
}) {
  if (!swineCardList) return { totalPages: 1, swinePage: 1 };

  swineCardList.innerHTML = "";
  let filteredList = [...list];

  if (activeCategory !== "all") {
    filteredList = filteredList.filter((sw) => {
      const stage = sw.age_stage?.toLowerCase() || "";
      switch (activeCategory) {
        case "piglet":
          return stage.includes("piglet") || stage.includes("monitoring");
        case "sow":
          return sw.sex === "Female" && stage.includes("adult");
        case "boar":
          return sw.sex === "Male" && stage.includes("adult") && !sw.is_external_boar;
        case "master":
          return sw.is_external_boar === true;
        default:
          return true;
      }
    });
  }

  const totalPages = Math.max(1, Math.ceil(filteredList.length / SWINE_ROWS_PER_PAGE));
  let page = swinePage;

  if (page > totalPages) page = totalPages;
  if (page < 1) page = 1;

  const start = (page - 1) * SWINE_ROWS_PER_PAGE;
  const pageItems = filteredList.slice(start, start + SWINE_ROWS_PER_PAGE);

  if (!pageItems.length) {
    swineCardList.innerHTML = `
      <div class="text-center text-muted py-4">No swine records found</div>
    `;
    return { totalPages, swinePage: page };
  }

  pageItems.forEach((sw) => {
    const perf = getLatestPerf(sw);

    const farmerName = sw.farmer_id
      ? `${sw.farmer_id.first_name || ""} ${sw.farmer_id.last_name || ""}`.trim()
      : "Office / Master";

    const pigType = sw.is_external_boar
      ? "Master Boar"
      : sw.sex === "Male"
        ? "Boar"
        : sw.sex === "Female" && sw.age_stage?.toLowerCase().includes("piglet")
          ? "Piglet"
          : sw.sex === "Female"
            ? "Sow"
            : "Pig";

    const ageMonths =
      sw.age_in_months ??
      (sw.birth_date
        ? Math.floor((Date.now() - new Date(sw.birth_date)) / (1000 * 60 * 60 * 24 * 30))
        : "--");

    const statusMap = {
      Healthy: "bg-success-subtle text-success",
      Pregnant: "bg-purple-subtle text-purple",
      "In-Heat": "bg-warning-subtle text-warning",
      "Under Observation": "bg-danger-subtle text-danger",
    };

    const statusClass = statusMap[sw.health_status] || "bg-secondary-subtle text-secondary";

    swineCardList.insertAdjacentHTML(
      "beforeend",
      `
      <div class="swine-card card border-0">
        <div class="card-body">

          <div class="d-flex justify-content-between align-items-start mb-3">
            <div class="min-w-0">
              <div class="fw-bold fs-6">${sw.swine_id}</div>
              <div class="small text-muted text-truncate">${sw.breed || "Unknown Breed"} · ${pigType}</div>
              <div class="small text-muted text-truncate">Farmer: ${farmerName}</div>
            </div>
            <span class="badge rounded-pill px-3 py-1 ${statusClass}">
              ${sw.health_status || "Status"}
            </span>
          </div>

          <div class="swine-details-row">
            <div class="detail-item">
              <i class="fa-solid fa-venus-mars"></i>
              <span class="label">Sex</span>
              <span class="value">${sw.sex || "—"}</span>
            </div>

            <div class="detail-item">
              <i class="fa-solid fa-calendar-days"></i>
              <span class="label">Age</span>
              <span class="value">${ageMonths} mo</span>
            </div>

            <div class="detail-item">
              <i class="fa-solid fa-weight-scale"></i>
              <span class="label">Weight</span>
              <span class="value">${perf.weight} kg</span>
            </div>

            <div class="detail-item">
              <i class="fa-solid fa-layer-group"></i>
              <span class="label">Stage</span>
              <span class="value">${formatStageDisplay(sw.age_stage)}</span>
            </div>
          </div>

          <div class="d-flex justify-content-end gap-2">
            <button class="btn btn-xs btn-outline-primary view-btn" data-id="${sw._id}" type="button">View Details</button>
          </div>
        </div>
      </div>
    `
    );
  });

  return { totalPages, swinePage: page };
}

/* =========================================================
   OFFSPRING OVERVIEW (STAT CARDS + CHART)
========================================================= */
export function renderOffspringOverview({ cycles = [], offspringByCycle = {} }) {
  const setText = (id, val = "0") => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(val);
  };

  const cycleKeys = Object.keys(offspringByCycle || {});
  const totalPiglets = cycleKeys.reduce((sum, c) => sum + (offspringByCycle[c]?.length || 0), 0);

  const totalLive = cycleKeys.reduce(
    (sum, c) => sum + (offspringByCycle[c] || []).filter((p) => p.health_status === "Healthy").length,
    0
  );

  const totalDead = Math.max(totalPiglets - totalLive, 0);
  const cycleCount = Array.isArray(cycles) && cycles.length ? cycles.length : cycleKeys.length;

  setText("offspringStatTotal", totalPiglets);
  setText("offspringStatLive", totalLive);
  setText("offspringStatDead", totalDead);
  setText("offspringStatCycles", cycleCount);

  // keep old ids if present
  setText("statTotalPiglets", totalPiglets);
  setText("statLive", totalLive);
  setText("statDead", totalDead);
  setText("statOffspringCycles", cycleCount);

  const canvas = document.getElementById("offspringChart");
  if (!canvas || !window.Chart) return;

  const numericKeys = cycleKeys.filter((k) => Number.isFinite(Number(k)));
  const otherKeys = cycleKeys.filter((k) => !Number.isFinite(Number(k)));

  const labels = [...numericKeys.sort((a, b) => Number(a) - Number(b)), ...otherKeys.sort()];

  const aliveData = labels.map(
    (k) => (offspringByCycle[k] || []).filter((p) => p.health_status === "Healthy").length
  );

  const deadData = labels.map((k, i) => {
    const total = offspringByCycle[k]?.length || 0;
    return Math.max(total - aliveData[i], 0);
  });

  if (canvas._chartInstance) {
    canvas._chartInstance.destroy();
    canvas._chartInstance = null;
  }

  canvas._chartInstance = new Chart(canvas, {
    type: "bar",
    data: {
      labels: labels.map((c) => (Number.isFinite(Number(c)) ? `C${c}` : String(c))),
      datasets: [
        { label: "Live", data: aliveData },
        { label: "Dead", data: deadData }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: true } },
      scales: {
        x: { stacked: true },
        y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } }
      }
    }
  });
}

/* ==========================
   RENDER CYCLE CARDS (ACCORDION VERSION)
   - Matches swine.main.js:
     Open button: data-cycle-toggle="<cycleNo>"
     Details panel: data-cycle-details="<cycleNo>"
     Piglets wrap: #cyclePigletsWrap-<cycleNo>
     Pager buttons: data-piglet-page-btn="prev|next" data-cycle="<cycleNo>"
============================= */
export function renderCycleCards({
  cycles = [],
  offspringByCycle = {},
  cyclesByNumber = {},
  cycleFilter = "all",
  getParentNameById
}) {
  const wrap = document.getElementById("offspringCycleList");
  const empty = document.getElementById("offspringEmptyState");
  if (!wrap || !empty) return { totalPages: 1, cyclePage: 1 };

  wrap.innerHTML = "";

  const keys = Object.keys(offspringByCycle || {});
  if (!keys.length) {
    empty.classList.remove("d-none");
    return { totalPages: 1, cyclePage: 1 };
  }
  empty.classList.add("d-none");

  const numericKeys = keys
    .filter((k) => Number.isFinite(Number(k)))
    .sort((a, b) => Number(b) - Number(a));
  const otherKeys = keys
    .filter((k) => !Number.isFinite(Number(k)))
    .sort();

  let ordered = [...numericKeys, ...otherKeys];

  if (cycleFilter !== "all") {
    ordered = ordered.filter((k) => String(k) === String(cycleFilter));
  }

  if (!ordered.length) {
    empty.classList.remove("d-none");
    return { totalPages: 1, cyclePage: 1 };
  }
  empty.classList.add("d-none");

  const cycleDateText = (cObj) => {
    const date =
      cObj?.actual_farrowing_date ||
      cObj?.expected_farrowing_date ||
      cObj?.ai_service_date ||
      null;
    return date ? new Date(date).toLocaleDateString() : "—";
  };

  ordered.forEach((cycleNo) => {
    const litter = offspringByCycle?.[cycleNo] || [];
    const live = litter.filter((p) => p.health_status === "Healthy").length;
    const dead = Math.max(litter.length - live, 0);

    const cObj =
      cyclesByNumber?.[String(cycleNo)] ||
      (Array.isArray(cycles)
        ? cycles.find((x) => String(x?.cycle_number) === String(cycleNo))
        : null);

    const motherId = cObj?.dam_id || litter?.[0]?.dam_id || "";
    const fatherId = cObj?.sire_id || cObj?.boar_id || litter?.[0]?.sire_id || "";

    const mother =
      typeof getParentNameById === "function" ? getParentNameById(motherId) : motherId || "—";
    const father =
      typeof getParentNameById === "function" ? getParentNameById(fatherId) : fatherId || "—";

    wrap.insertAdjacentHTML(
      "beforeend",
      `
      <div class="card cycle-card border-0 shadow-sm overflow-hidden">

        <!-- HEADER -->
        <div class="card-body cycle-card-head d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3">
          <div class="min-w-0">
            <div class="fw-bold fs-6 mb-1">Cycle ${cycleNo}</div>
            <div class="text-muted small">
              <i class="bi bi-calendar3 me-1"></i>${cycleDateText(cObj)}
            </div>
          </div>

          <div class="d-flex align-items-center flex-wrap gap-2 justify-content-md-end">
            <span class="badge rounded-pill bg-light text-dark px-3 py-2 cycle-pill">
              <i class="bi bi-collection me-1"></i> ${litter.length}
            </span>
            <span class="badge rounded-pill bg-success-subtle text-success px-3 py-2 cycle-pill">
              <i class="bi bi-heart-pulse me-1"></i> ${live}
            </span>
            <span class="badge rounded-pill bg-danger-subtle text-danger px-3 py-2 cycle-pill">
              <i class="bi bi-x-circle me-1"></i> ${dead}
            </span>

            <button
              type="button"
              class="btn btn-sm btn-outline-success cycle-toggle-btn"
              data-cycle-toggle="${cycleNo}">
              Open
            </button>
          </div>
        </div>

        <!-- DETAILS -->
        <div class="border-top d-none" data-cycle-details="${cycleNo}">
          <div class="card-body pt-4">

            <div class="row g-3 mb-3">
              <div class="col-12 col-lg-6">
                <div class="parent-card h-100">
                  <div class="parent-label">Mother</div>
                  <div class="parent-value">${mother || "—"}</div>
                </div>
              </div>

              <div class="col-12 col-lg-6">
                <div class="parent-card h-100">
                  <div class="parent-label">Father</div>
                  <div class="parent-value">${father || "—"}</div>
                </div>
              </div>
            </div>

            <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
              <div class="btn-group btn-group-sm cycle-filter-group" role="group" aria-label="Piglet filter">
                <button type="button"
                  class="btn btn-outline-secondary piglet-filter-btn active"
                  data-cycle="${cycleNo}" data-sex="all">All</button>

                <button type="button"
                  class="btn btn-outline-secondary piglet-filter-btn"
                  data-cycle="${cycleNo}" data-sex="male">Male</button>

                <button type="button"
                  class="btn btn-outline-secondary piglet-filter-btn"
                  data-cycle="${cycleNo}" data-sex="female">Female</button>
              </div>

              <div class="text-muted small">
                <i class="bi bi-list-ul me-1"></i>
                <span id="pigletsCountLabel-${cycleNo}">${litter.length}</span> piglet(s)
              </div>
            </div>

            <div id="cyclePigletsWrap-${cycleNo}"
              data-cycle-piglets-wrap="${cycleNo}"
              class="d-flex flex-column gap-3"></div>

            <div class="d-flex justify-content-between align-items-center mt-3"
              id="cyclePigletsPager-${cycleNo}"
              data-cycle-piglets-pager="${cycleNo}">
              <button type="button" class="btn btn-outline-secondary btn-sm"
                data-piglet-page-btn="prev" data-cycle="${cycleNo}">
                <i class="bi bi-chevron-left"></i>
              </button>

              <span class="small text-muted" data-piglet-page-indicator="${cycleNo}">
                Page 1 of 1
              </span>

              <button type="button" class="btn btn-outline-secondary btn-sm"
                data-piglet-page-btn="next" data-cycle="${cycleNo}">
                <i class="bi bi-chevron-right"></i>
              </button>
            </div>

          </div>
        </div>

      </div>
      `
    );
  });

  return { totalPages: 1, cyclePage: 1 };
}

/* =========================================================
   RENDER CYCLE PIGLETS (accordion content)
   - Main controls clicks + paging. This function only renders.
   - Supports both parameter names:
     * pigletPage / PIGLETS_PER_PAGE (from main)
     * page / PER_PAGE (fallback)
========================================================= */
export function renderCyclePiglets({
  cycle,
  piglets = [],
  sexFilter = "all",

  // support both call styles
  pigletPage,
  PIGLETS_PER_PAGE,
  page,
  PER_PAGE,

  // extra args (safe to ignore if passed)
  cycleObj,
  sowId,
  motherLabel,
  fatherLabel
} = {}) {
  const wrap = document.getElementById(`cyclePigletsWrap-${cycle}`);
  const pager = document.getElementById(`cyclePigletsPager-${cycle}`);
  const indicator = document.querySelector(`[data-piglet-page-indicator="${cycle}"]`);
  const countLabel = document.getElementById(`pigletsCountLabel-${cycle}`);
  if (!wrap) return;

  const curPageRaw = pigletPage ?? page ?? 1;
  const perPage = PIGLETS_PER_PAGE ?? PER_PAGE ?? 5;

  const normSex = (s) => String(s || "").toLowerCase();
  const filtered =
    sexFilter === "male"
      ? piglets.filter((p) => normSex(p.sex) === "male")
      : sexFilter === "female"
        ? piglets.filter((p) => normSex(p.sex) === "female")
        : [...piglets];

  if (countLabel) countLabel.textContent = String(filtered.length);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  let currentPage = Number(curPageRaw) || 1;
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const start = (currentPage - 1) * perPage;
  const pageItems = filtered.slice(start, start + perPage);

  wrap.innerHTML = "";
  wrap.dataset.page = String(currentPage);

  if (!pageItems.length) {
    wrap.innerHTML = `<div class="text-muted text-center py-2">No piglets found</div>`;
  } else {
    pageItems.forEach((p) => {
      const perf = getLatestPerf(p);
      const latestPerf = p?.performance_records?.slice(-1)[0] || {};
      const girth = latestPerf.heart_girth ?? "--";

      const statusText = p.health_status || p.current_status || "Active";
      const statusClass =
        statusText === "Healthy"
          ? "bg-success-subtle text-success"
          : statusText === "Dead"
            ? "bg-danger-subtle text-danger"
            : "bg-secondary-subtle text-secondary";

      wrap.insertAdjacentHTML(
        "beforeend",
        `
        <div class="card border-0 shadow-sm">
          <div class="card-body py-2 px-3 d-flex justify-content-between align-items-start gap-3">
            <div class="min-w-0">
              <div class="fw-semibold text-truncate">${p.swine_id || p.tag_id || "Piglet"}</div>
              <div class="small text-muted text-truncate">
                ${p.breed || "—"} · ${formatStageDisplay(p.age_stage)}
              </div>
              <div class="small text-muted text-truncate">
                Sex: ${p.sex || "—"}
              </div>
            </div>

            <div class="text-end flex-shrink-0">
              <span class="badge rounded-pill px-3 py-2 ${statusClass}">${statusText}</span>
            </div>
          </div>

          <div class="px-3 pb-3">
            <div class="row g-2 small">
              <div class="col-6 col-md-3">
                <div class="text-muted">Weight</div>
                <div class="fw-semibold">${perf.weight ?? "--"} kg</div>
              </div>
              <div class="col-6 col-md-3">
                <div class="text-muted">Length</div>
                <div class="fw-semibold">${perf.length ?? "--"} cm</div>
              </div>
              <div class="col-6 col-md-3">
                <div class="text-muted">Girth</div>
                <div class="fw-semibold">${girth ?? "--"} cm</div>
              </div>
              <div class="col-6 col-md-3">
                <div class="text-muted">Status</div>
                <div class="fw-semibold">${p.current_status || p.health_status || "—"}</div>
              </div>
            </div>
          </div>
        </div>
        `
      );
    });
  }

  if (indicator) indicator.textContent = `Page ${currentPage} of ${totalPages}`;
  if (pager) {
    const prevBtn = pager.querySelector(`[data-piglet-page-btn="prev"][data-cycle="${cycle}"]`);
    const nextBtn = pager.querySelector(`[data-piglet-page-btn="next"][data-cycle="${cycle}"]`);
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
  }
}