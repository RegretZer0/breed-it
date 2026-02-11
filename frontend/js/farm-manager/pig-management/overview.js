  import { authGuard } from "/js/authGuard.js";

  document.addEventListener("DOMContentLoaded", async () => {
    // ================= AUTH =================
    const user = await authGuard(["farm_manager", "encoder"]);
    if (!user) return;

    const token = localStorage.getItem("token");
    const role = user.role;
    const BACKEND_URL = "http://localhost:5000";

    // ================= STATE =================
    let managerId = null;
    let farmers = [];
    let selectedFarmerId = null;
    let allSwine = [];
    let currentEditingMongoId = null;
    let activeCategory = "all";
    let activeOffspringCycle = "all";
    let offspringByCycle = {};
    let activeSwineForView = null;
    let growthChartInstance = null;  

    // ================= PAGINATION =================
    let swinePage = 1;
    const SWINE_ROWS_PER_PAGE = 5;

    // ================= RESOLVE MANAGER =================
    try {
      if (role === "farm_manager") {
        managerId = user.id;
      } else {
        if (user.managerId) {
          managerId = user.managerId;
        } else {
          const res = await fetch(
            `${BACKEND_URL}/api/auth/encoders/single/${user.id}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          const data = await res.json();
          managerId = data.encoder?.managerId;
        }
      }
    } catch (err) {
      console.error("Failed to resolve managerId", err);
      return;
    }

    // ================= DOM =================
    const swineCardList = document.getElementById("swineCardList");
    const filterFarmer = document.getElementById("filterFarmer");
    const filtersForm = document.getElementById("filtersForm");
    const filterStatus = document.getElementById("filterStatus");
    const filterSex = document.getElementById("filterSex");
    const filterType = document.getElementById("filterType");
    const filterTag = document.getElementById("filterTag");
    const swineModal = document.getElementById("swineModal");
    const swineModalInstance = new bootstrap.Modal(swineModal, {
      backdrop: true,
      keyboard: true
    });


    swineModal.addEventListener("shown.bs.modal", () => {
      if (activeSwineForView) {
        renderGrowth(activeSwineForView);
      }
    });

    const editModalEl = document.getElementById("editPerformanceModal");
    const editModal = new bootstrap.Modal(editModalEl);
    const editSwineIdInput = document.getElementById("editSwineId");
    const editWeightInput = document.getElementById("editWeight");
    const editBodyLengthInput = document.getElementById("editBodyLength");
    const editHeartGirthInput = document.getElementById("editHeartGirth");

    document.getElementById("swineCategoryTabs")
    ?.addEventListener("click", (e) => {
      const btn = e.target.closest(".nav-link");
      if (!btn) return;

      // Toggle active tab
      document
        .querySelectorAll("#swineCategoryTabs .nav-link")
        .forEach(b => b.classList.remove("active"));

      btn.classList.add("active");

      // Update category
      activeCategory = btn.dataset.type;
      swinePage = 1;

      renderCards(allSwine);
    });


    // ================= HELPERS =================
    const formatStageDisplay = (stage) => {
      const map = {
        "Monitoring (Day 1-30)": "Piglet",
        "Weaned (Monitoring 3 Months)": "Weaner",
        "Final Selection": "Selection",
        "Monthly Update": "Routine Update",
        "Routine": "Routine",
        "Market-Ready": "Market Ready",
        "Open": "Adult",
        "Pregnant": "Pregnant",
        "Lactating": "Lactating",
        "In-Heat": "In Heat",
        "Under Observation": "Under Observation",
        "Bred": "Bred",
        "Farrowing": "Farrowing",
      };
      return map[stage] || stage || "—";
    };

    const getLatestPerf = (sw) => {
      const p = sw.performance_records?.slice(-1)[0];
      return {
        weight: p?.weight || "--",
        length: p?.body_length || "--",
      };
    };

      function renderReproductionCards(cycles = []) {
      const reproCardList = document.getElementById("reproductionCardList");
      const reproEmpty = document.getElementById("reproductionEmptyState");

      if (!reproCardList || !reproEmpty) return;

      reproCardList.innerHTML = "";

      if (!Array.isArray(cycles) || cycles.length === 0) {
        reproEmpty.classList.remove("d-none");
        return;
      }

      reproEmpty.classList.add("d-none");

      cycles.forEach(cycle => {
        const cycleNo = cycle.cycle_number ?? "—";
        const litter = offspringByCycle[cycleNo] || [];

        const totalBorn = litter.length;
        const liveBorn = litter.filter(p => p.health_status === "Healthy").length;
        const stillBorn = Math.max(totalBorn - liveBorn, 0);

        const status = cycle.status || "Completed";
        const statusClass =
          {
            Completed: "bg-success-subtle text-success",
            Pending: "bg-warning-subtle text-warning",
            Failed: "bg-danger-subtle text-danger"
          }[status] || "bg-secondary-subtle text-secondary";

        reproCardList.insertAdjacentHTML("beforeend", `
          <div class="card border-0 shadow-sm reproduction-card mb-3">
            <div class="card-body pb-2 d-flex justify-content-between align-items-center">
              <div>
                <div class="fw-semibold fs-6">Farrowing Cycle ${cycleNo}</div>
                <div class="small text-muted">
                  Service Date: ${cycle.ai_service_date ? new Date(cycle.ai_service_date).toLocaleDateString() : "—"}
                </div>
                <div class="small text-muted">
                  Farrowing Date: ${cycle.actual_farrowing_date ? new Date(cycle.actual_farrowing_date).toLocaleDateString() : "—"}
                </div>
              </div>

              <div class="d-flex align-items-center gap-2">
                <span class="badge rounded-pill px-3 ${statusClass}">
                  ${status}
                </span>
                <button class="btn btn-sm btn-outline-primary toggle-repro">View</button>
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
        `);
      });
    }


    /* ================= GROWTH ================= */
    function renderGrowth(sw) {

      const records = [...(sw.performance_records || [])]
        .filter(r => typeof r.weight === "number")
        .sort(( a, b) => new Date(a.record_date) - new Date(b.record_date));

      const timeline = document.getElementById("growthTimeline");
      if (!timeline) return;

      /* ================= EMPTY STATE ================= */
      if (!records.length) {
        timeline.innerHTML =
          `<div class="text-muted text-center">No growth records yet</div>`;
        return;
      }

      /* ================= CHART (OPTIONAL) ================= */
      const ctx = document.getElementById("growthChart");

      if (ctx) {
        if (growthChartInstance) {
          growthChartInstance.destroy();
        }

        growthChartInstance = new Chart(ctx, {
          type: "line",
          data: {
            labels: records.map(r =>
              new Date(r.record_date).toLocaleDateString()
            ),
            datasets: [{
              data: records.map(r => r.weight),
              borderColor: "#198754",
              backgroundColor: "rgba(25,135,84,0.15)",
              tension: 0.35,
              fill: true,
              pointRadius: 4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              y: {
                ticks: { callback: v => `${v} kg` }
              }
            }
          }
        });
      }

      /* ================= GROUP BY YEAR → MONTH ================= */
      const grouped = {};

      records.forEach(r => {
        const d = new Date(r.record_date);
        const year = d.getFullYear();
        const month = d.toLocaleString("default", { month: "long" });
        const key = `${month} ${year}`;

        if (!grouped[year]) grouped[year] = {};
        if (!grouped[year][key]) grouped[year][key] = [];

        grouped[year][key].push(r);
      });


      /* ================= YEAR FILTER ================= */
      const yearSelect = document.getElementById("growthYearFilter");
      if (!yearSelect) return;

      const years = Object.keys(grouped).sort((a, b) => b - a);

      // populate only once or when swine changes
      yearSelect.innerHTML = years.map(y =>
        `<option value="${y}">${y}</option>`
      ).join("");

      /* ================= RENDER (LATEST YEAR & MONTH FIRST) ================= */
      timeline.innerHTML = "";

      // sort years DESC (latest first)
      const selectedYear = yearSelect.value || years[0];

      Object.entries(grouped)
        .filter(([year]) => year === selectedYear)
        .forEach(([year, months]) => {


          timeline.insertAdjacentHTML("beforeend", `
            <div class="growth-year-header">${year}</div>
          `);

          // sort months by first record date DESC
          Object.entries(grouped[year])
            .sort((a, b) => {
              return new Date(b[1][0].record_date) - new Date(a[1][0].record_date);
            })
            .forEach(([month, recs]) => {

              const start = recs[0];
              const end = recs[recs.length - 1];
              const gain = Number((end.weight - start.weight).toFixed(1));

              timeline.insertAdjacentHTML("beforeend", `
                <div class="growth-month-card">

                  <!-- HEADER -->
                  <div class="growth-month-header">
                    <div>
                      <div class="month-title">${month}</div>
                      <button class="btn btn-sm btn-outline-primary toggle-growth">
                        ${recs.length > 1 ? "View" : "View"} ${recs.length} update${recs.length > 1 ? "s" : ""}
                      </button>
                    </div>

                    <div class="month-metrics">
                      <span class="weight-range">
                        ${start.weight} → ${end.weight} kg
                      </span>
                      <span class="gain-badge ${gain >= 0 ? "gain-positive" : "gain-negative"}">
                        ${gain >= 0 ? "+" : ""}${gain} kg
                      </span>
                    </div>
                  </div>

                  <!-- DETAILS -->
                  <div class="growth-details d-none">
                    ${recs.map(r => `
                      <div class="growth-entry">
                        <div class="growth-left">
                          <div class="growth-date">
                            ${new Date(r.record_date).toLocaleDateString()}
                          </div>
                          <div class="growth-stage text-muted small">
                            ${r.stage || "Monthly Update"}
                          </div>
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
                    `).join("")}
                  </div>

                </div>
              `);
            });
        });
    }

    /* ================= OFFSPRING ================= */
    function renderOffspring() {
    const wrap = document.getElementById("offspringCycleList");
    const empty = document.getElementById("offspringEmptyState");

    if (!wrap || !empty) return;

    wrap.innerHTML = "";

    const cyclesToRender =
      activeOffspringCycle === "all"
        ? Object.entries(offspringByCycle)
        : Object.entries(offspringByCycle)
            .filter(([c]) => String(c) === String(activeOffspringCycle));

    if (!cyclesToRender.length) {
      empty.classList.remove("d-none");
      return;
    }

    empty.classList.add("d-none");

    cyclesToRender
      .sort((a, b) => Number(b[0]) - Number(a[0]))
      .forEach(([cycle, piglets]) => {
        wrap.insertAdjacentHTML("beforeend", `
          <div class="offspring-cycle-card mb-4">

            <div class="offspring-cycle-header d-flex justify-content-between align-items-center mb-2">
              <div>
                <div class="fw-semibold">Farrowing Cycle ${cycle}</div>
                <div class="small text-muted">
                  ${piglets.length} piglet${piglets.length > 1 ? "s" : ""}
                </div>
              </div>

              <button class="btn btn-sm btn-outline-primary toggle-cycle">
                View
              </button>
            </div>

            <div class="offspring-cycle-body d-none d-flex flex-column gap-2">
              ${piglets.map(p => `
                <div class="card border-0 shadow-sm">
                  <div class="card-body py-2 px-3 d-flex justify-content-between">

                    <div>
                      <div class="fw-semibold">${p.swine_id}</div>
                      <div class="small text-muted">
                        ${p.breed || "Native"} · ${formatStageDisplay(p.age_stage)}
                      </div>
                      <div class="small text-muted">
                        ${p.sex || "—"} · ${p.current_status || "Active"}
                      </div>
                    </div>

                    <div class="d-flex align-items-center gap-2">
                      <span class="badge ${
                        p.health_status === "Healthy"
                          ? "bg-success-subtle text-success"
                          : "bg-secondary-subtle text-secondary"
                      }">
                        ${p.health_status || "Active"}
                      </span>

                      <button
                        class="btn btn-xs btn-outline-primary view-btn"
                        data-id="${p._id}">
                        View
                      </button>
                    </div>

                  </div>
                </div>
              `).join("")}
            </div>

          </div>
        `);
      });
  }

  function renderFarmerDropdown(list) {
    const wrap = document.getElementById("farmerOptions");
    const searchInput = document.getElementById("farmerSearch");

    if (!wrap) return;
    wrap.innerHTML = "";

    if (!list.length) {
      wrap.innerHTML = `<div class="text-muted small">No farmers found</div>`;
      return;
    }

    list.forEach(f => {
      const div = document.createElement("div");
      div.className = "dropdown-item small";
      div.textContent = `${f.first_name} ${f.last_name}`.trim();

      div.addEventListener("click", () => {
        selectedFarmerId = f._id;
        document.getElementById("farmerDropdownBtn").textContent =
          `${f.first_name} ${f.last_name}`.trim();

        bootstrap.Dropdown
          .getInstance(document.getElementById("farmerDropdownBtn"))
          ?.hide();
      });

      wrap.appendChild(div);
    });

    if (searchInput && !searchInput.dataset.bound) {
      searchInput.dataset.bound = "true";
      searchInput.addEventListener("input", () => {
        const term = searchInput.value.toLowerCase();
        renderFarmerDropdown(
          list.filter(f =>
            `${f.first_name} ${f.last_name}`.toLowerCase().includes(term)
          )
        );
      });
    }
  }

    // ================= FARMERS =================
    async function loadFarmers() {
      try {
        const res = await fetch(
          `${BACKEND_URL}/api/auth/farmers/${managerId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const data = await res.json();
        farmers = data.farmers || [];

        // Render dropdown options
        renderFarmerDropdown(farmers);

        // (Optional legacy select support – safe to keep)
        if (filterFarmer) {
          filterFarmer.innerHTML =
            `<option value="">All Farmers / Owners</option>`;
          farmers.forEach(f => {
            filterFarmer.add(
              new Option(`${f.first_name} ${f.last_name}`, f._id)
            );
          });
        }

      } catch (e) {
        console.error("Load farmers failed", e);
      }
    }

      // ================= MODAL ACTIONS =================
      function handleView(mongoId) {
        const sw = allSwine.find(s => s._id === mongoId);
        if (!sw) return;

        activeSwineForView = sw;

        // ================= BREEDING CYCLES =================
        const cycles = sw.breeding_cycles || [];
        renderReproductionCards(cycles);

        // ================= DERIVE OFFSPRING =================
        const currentId = sw.swine_id?.trim().toLowerCase();

        const actualOffspring = allSwine.filter(child => {
          const dam = (child.dam_id || "").trim().toLowerCase();
          const sire = (child.sire_id || "").trim().toLowerCase();
          return dam === currentId || sire === currentId;
        });

          // ---------- DERIVED VALUES ----------
            // Pig type
            const pigType = sw.is_external_boar
              ? "Master Boar"
              : sw.sex === "Male"
                ? "Boar"
                : sw.sex === "Female"
                  ? "Sow"
                  : "Pig";

            // Farmer
            const farmerName = sw.farmer_id
              ? `${sw.farmer_id.first_name || ""} ${sw.farmer_id.last_name || ""}`.trim()
              : "Office / Master";

            // Age (robust fallback)
            const ageMonths =
              Number.isFinite(sw.age_in_months)
                ? sw.age_in_months
                : sw.birth_date
                  ? Math.floor(
                      (Date.now() - new Date(sw.birth_date)) /
                      (1000 * 60 * 60 * 24 * 30)
                    )
                  : null;

            // Latest performance
            const latestPerf = sw.performance_records?.slice(-1)[0] || {};

    // ================= RESET TABS =================
    document
      .querySelectorAll(".profile-tab")
      .forEach(tab => tab.classList.add("d-none"));

    document
      .querySelectorAll("#pigProfileTabs .nav-link")
      .forEach(b => b.classList.remove("active"));
      
    // Activate Overview by default
    document
      .querySelector('#pigProfileTabs .nav-link[data-target="profileTab"]')
      ?.classList.add("active");

    document.getElementById("profileTab")?.classList.remove("d-none");

    // ================= PROFILE TAB MIRROR DATA =================
    const mirror = (id, value = "—") => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };

    mirror("profileTagDisplay", sw.swine_id);
    mirror("profileBreedTypeDisplay", `${sw.breed || "Unknown Breed"} · ${pigType}`);
    mirror("profileFarmerDisplay", farmerName);

    mirror("profileAgeDisplay", ageMonths !== null ? `${ageMonths} mo` : "—");
    mirror("profileWeightDisplay", latestPerf.weight ? `${latestPerf.weight} kg` : "—");
    mirror("profileStageDisplay", formatStageDisplay(sw.age_stage));
    mirror("profileSexDisplay", sw.sex || "—");

  // ================= GROUP OFFSPRING BY CYCLE =================
  // const offspringByCycle = {};
  offspringByCycle = {};

  actualOffspring.forEach(child => {
    const cycle =
      child.farrowing_cycle ||
      child.cycle_number ||
      "Unknown";

    if (!offspringByCycle[cycle]) {
      offspringByCycle[cycle] = [];
    }
    offspringByCycle[cycle].push(child);
  });

  // ================= POPULATE FARROWING CYCLE FILTER =================
  const cycleSelect = document.getElementById("offspringCycleFilter");

  if (cycleSelect) {
    const cycles = Object.keys(offspringByCycle).sort((a, b) => b - a);

    cycleSelect.innerHTML = `
      <option value="all">All Farrowing Cycles</option>
      ${cycles.map(c => `
        <option value="${c}">
          Farrowing Cycle ${c}
        </option>
      `).join("")}
    `;

    // default → latest cycle
    activeOffspringCycle = cycles[0] || "all";
    cycleSelect.value = activeOffspringCycle;
    
    renderOffspring();
  }

  // ================= PROFILE HEADER DATA =================

      // ---------- SAFE DOM GETTERS ----------
      const setText = (id, value = "—") => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
      };

      // ---------- HEADER TEXT ----------
      setText("profileSwineId", sw.swine_id);
      setText(
        "profileBreedType",
        `${sw.breed || "Unknown Breed"} · ${pigType}`
      );
      setText("profileFarmer", `Farmer: ${farmerName}`);

      // ---------- QUICK STATS ----------
      setText(
        "profileAge",
        ageMonths !== null ? `${ageMonths} mo` : "—"
      );

      setText(
        "profileWeight",
        latestPerf.weight ? `${latestPerf.weight} kg` : "—"
      );

      setText(
        "profileStage",
        sw.age_stage ? formatStageDisplay(sw.age_stage) : "—"
      );

      setText("profileSex", sw.sex || "—");

      // ---------- HEALTH BADGE ----------
      const healthBadge = document.getElementById("profileHealthBadge");

      if (healthBadge) {
        const status = sw.health_status || "Unknown";

        const statusClassMap = {
          "Healthy": "bg-success-subtle text-success",
          "Pregnant": "bg-warning-subtle text-warning",
          "In-Heat": "bg-info-subtle text-info",
          "Under Observation": "bg-danger-subtle text-danger",
        };

        healthBadge.textContent = status;
        healthBadge.className =
          `badge rounded-pill px-3 py-1 ${
            statusClassMap[status] || "bg-secondary-subtle text-secondary"
          }`;
      }

    // ================= HEADER =================
    document.getElementById("modalSwineId").textContent =
      `Swine History: ${sw.swine_id}`;

    // ================= REPRO / OFFSPRING LOGIC =================
    const stage = (sw.age_stage || "").toLowerCase();
    const isAdult = stage.includes("adult");
    const isParent =
      isAdult ||
      ["final selection", "pregnant", "lactating"].includes(stage) ||
      sw.is_external_boar;

    // ================= VISIBILITY CONTROL =================
    const repro = document.getElementById("reproSummarySection");
    const offspringSec = document.getElementById("offspringTab");

    // reset
    if (repro) repro.classList.add("d-none");
    if (offspringSec) offspringSec.classList.add("d-none");

    // show offspring for parents
    if (isParent && offspringSec) {
      offspringSec.classList.remove("d-none");
    }

    // show reproduction ONLY for female parents
    if (isParent && sw.sex === "Female" && repro) {
      repro.classList.remove("d-none");
    }
    
    swineModalInstance.show();

      // ================= TAB NAV VISIBILITY =================
      document.getElementById("reproNav")?.classList.toggle(
        "d-none",
        !isParent || sw.sex !== "Female"
      );

      document.getElementById("offspringNav")?.classList.toggle(
        "d-none",
        !isParent
      );

      // ================= REPRO STATS (SOURCE = offspringByCycle) =================
      const cycleKeys = Object.keys(offspringByCycle);

      const finalTotalBorn = cycleKeys.reduce(
        (sum, c) => sum + offspringByCycle[c].length,
        0
      );

      const finalTotalLive = cycleKeys.reduce(
        (sum, c) =>
          sum +
          offspringByCycle[c].filter(
            p => p.health_status === "Healthy"
          ).length,
        0
      );

      document.getElementById("statCycles").textContent = cycles.length;
      document.getElementById("statTotalBorn").textContent = finalTotalBorn;
      document.getElementById("statAvgLitter").textContent =
        cycles.length > 0
          ? (finalTotalBorn / cycles.length).toFixed(1)
          : 0;
      document.getElementById("statTotalLive").textContent = finalTotalLive;
    }

    // ================= SHOW MODAL (LAST STEP) =================
    function handleEdit(mongoId) {
      const sw = allSwine.find(s => s._id === mongoId);
    if (!sw) return;
      currentEditingMongoId = sw._id; 
      const latest = sw.performance_records?.slice(-1)[0] || {};
      editSwineIdInput.value = sw.swine_id; 
      editWeightInput.value = latest.weight || "";
      editBodyLengthInput.value = latest.body_length || "";
      editHeartGirthInput.value = latest.heart_girth || "";
      editModal.show();
    }


  // ================= TABLE RENDERERS =================
  function renderCards(list) {
    if (!swineCardList) return;

    swineCardList.innerHTML = "";

    /* ================= CATEGORY FILTER ================= */
    let filteredList = [...list];

    if (activeCategory !== "all") {
      filteredList = filteredList.filter(sw => {
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

    /* ================= PAGINATION ================= */
    const totalPages = Math.max(
      1,
      Math.ceil(filteredList.length / SWINE_ROWS_PER_PAGE)
    );

    if (swinePage > totalPages) swinePage = totalPages;
    if (swinePage < 1) swinePage = 1;

    const start = (swinePage - 1) * SWINE_ROWS_PER_PAGE;
    const pageItems = filteredList.slice(start, start + SWINE_ROWS_PER_PAGE);

    if (!pageItems.length) {
      swineCardList.innerHTML = `
        <div class="text-center text-muted py-4">
          No swine records found
        </div>
      `;
    } else {
      pageItems.forEach(sw => {
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
            ? Math.floor(
                (Date.now() - new Date(sw.birth_date)) /
                (1000 * 60 * 60 * 24 * 30)
              )
            : "--");

        const statusMap = {
          Healthy: "bg-success-subtle text-success",
          Pregnant: "bg-purple-subtle text-purple",
          "In-Heat": "bg-warning-subtle text-warning",
          "Under Observation": "bg-danger-subtle text-danger"
        };

        const statusClass =
          statusMap[sw.health_status] ||
          "bg-secondary-subtle text-secondary";

        swineCardList.insertAdjacentHTML("beforeend", `
          <div class="swine-card card border-0">
            <div class="card-body">

              <div class="d-flex justify-content-between align-items-start mb-3">
                <div>
                  <div class="fw-bold fs-6">${sw.swine_id}</div>
                  <div class="small text-muted">
                    ${sw.breed || "Unknown Breed"} · ${pigType}
                  </div>
                  <div class="small text-muted">
                    Farmer: ${farmerName}
                  </div>
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
                <button
                  class="btn btn-xs btn-outline-primary view-btn"
                  data-id="${sw._id}">
                  View
                </button>

                <button
                  class="btn btn-xs btn-outline-secondary edit-btn"
                  data-id="${sw._id}">
                  Edit
                </button>
              </div>

            </div>
          </div>
        `);
      });
    }

    /* ================= PAGINATION UI ================= */
    const indicator = document.getElementById("swinePageIndicator");
    const prevBtn = document.getElementById("swinePrevBtn");
    const nextBtn = document.getElementById("swineNextBtn");

    if (indicator) {
      indicator.textContent = `Page ${swinePage} of ${totalPages}`;
    }

    if (prevBtn) prevBtn.disabled = swinePage <= 1;
    if (nextBtn) nextBtn.disabled = swinePage >= totalPages;
  }

  /* ================= GLOBAL CLICK HANDLER ================= */
  document.addEventListener("click", (e) => {
    const viewBtn = e.target.closest(".view-btn");
    const editBtn = e.target.closest(".edit-btn");
    const growthBtn = e.target.closest(".toggle-growth");
    const cycleBtn = e.target.closest(".toggle-cycle");
    const reproBtn = e.target.closest(".toggle-repro");

    if (viewBtn) {
      e.preventDefault();
      e.stopPropagation();
      handleView(viewBtn.dataset.id);
      return;
    }

    if (editBtn) {
      e.preventDefault();
      e.stopPropagation();
      handleEdit(editBtn.dataset.id);
      return;
    }

    if (growthBtn) {
      const details = growthBtn
        .closest(".growth-month-card")
        ?.querySelector(".growth-details");

      if (!details) return;

      details.classList.toggle("d-none");
      growthBtn.textContent = details.classList.contains("d-none")
        ? "View"
        : "Hide";
      return;
    }

    if (cycleBtn) {
      const body = cycleBtn
        .closest(".offspring-cycle-card")
        ?.querySelector(".offspring-cycle-body");

      if (!body) return;

      body.classList.toggle("d-none");
      cycleBtn.textContent = body.classList.contains("d-none")
        ? "View"
        : "Hide";
      return;
    }

    if (reproBtn) {
      const details = reproBtn
        .closest(".reproduction-card")
        ?.querySelector(".repro-details");

      if (!details) return;

      details.classList.toggle("d-none");
      reproBtn.textContent = details.classList.contains("d-none")
        ? "View"
        : "Hide";
    }
  });

  /* ================= SWINE PAGINATION CONTROLS ================= */
  document.getElementById("swinePrevBtn")?.addEventListener("click", () => {
    if (swinePage > 1) {
      swinePage--;
      renderCards(allSwine);
    }
  });

  document.getElementById("swineNextBtn")?.addEventListener("click", () => {
    swinePage++;
    renderCards(allSwine);
  });

  /* ================= API ACTIONS ================= */
  async function loadSwine() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/swine/all`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      const rawSwine = data.swine || [];

      const validFarmerIds = farmers.map(f => f._id.toString());

      allSwine = rawSwine.filter(sw => {
        if (sw.farmer_id) {
          const fid =
            typeof sw.farmer_id === "object"
              ? sw.farmer_id._id
              : sw.farmer_id;
          if (validFarmerIds.includes(fid.toString())) return true;
        }

        if (sw.registered_by) {
          const rid =
            typeof sw.registered_by === "object"
              ? sw.registered_by._id
              : sw.registered_by;
          if (rid.toString() === managerId.toString()) return true;
        }

        return false;
      });

      allSwine.sort((a, b) => {
        const da = new Date(a.createdAt || a.updatedAt || 0);
        const db = new Date(b.createdAt || b.updatedAt || 0);
        return db - da;
      });

      swinePage = 1;
      renderCards(allSwine);

    } catch (err) {
      console.error("Load swine failed", err);
    }
  }

  /* ================= SAVE PERFORMANCE ================= */
  document.getElementById("savePerformanceBtn")
    ?.addEventListener("click", async () => {

      if (!currentEditingMongoId) return;

      const swine = allSwine.find(s => s._id === currentEditingMongoId);
      if (!swine) return;

      const payload = {
        performance_records: {
          weight: Number(editWeightInput.value),
          body_length: Number(editBodyLengthInput.value),
          heart_girth: Number(editHeartGirthInput.value),
          stage: "Monthly Update",
          record_date: new Date()
        }
      };

      try {
        const res = await fetch(
          `${BACKEND_URL}/api/swine/update/${swine.swine_id}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(payload)
          }
        );

        if (res.ok) {
          alert("Performance record updated successfully!");
          await loadSwine();
          editModal.hide();
        }
      } catch (err) {
        alert(err.message);
      }
    });

    /* ================= FILTER PREVIEW PAGINATION ================= */
    document.getElementById("filterPreviewPrev")?.addEventListener("click", () => {
      if (filterPreviewPage > 1) {
        filterPreviewPage--;
        renderFilterPreview();
      }
    });

    document.getElementById("filterPreviewNext")?.addEventListener("click", () => {
      const totalPages = Math.ceil(
        filterPreviewResults.length / FILTER_PREVIEW_ROWS
      );
      if (filterPreviewPage < totalPages) {
        filterPreviewPage++;
        renderFilterPreview();
      }
    });

    /* ================= GROWTH YEAR FILTER ================= */
    document.getElementById("growthYearFilter")
      ?.addEventListener("change", () => {
        if (activeSwineForView) {
          renderGrowth(activeSwineForView);
        }
    });
    // ================= FILTERS =================
    filtersForm.addEventListener("submit", (e) => {
      e.preventDefault();
      let filtered = [...allSwine];
      const status = filterStatus.value;
      const sex = filterSex.value;
      const type = filterType.value;
      const tag = filterTag.value.trim().toLowerCase();

      if (selectedFarmerId) {
        filtered = filtered.filter(sw => {
          if (!sw.farmer_id) return false;

          const fid = typeof sw.farmer_id === "object"
            ? sw.farmer_id._id?.toString()
            : sw.farmer_id.toString();

          return fid === selectedFarmerId.toString();
        });
      }

      if (status) filtered = filtered.filter(sw => (sw.current_status || sw.status) === status);
      if (sex) filtered = filtered.filter(sw => sw.sex === sex);
      if (type) {
        filtered = filtered.filter(sw => {
          const stage = sw.age_stage ? sw.age_stage.toLowerCase() : "";
          if (type === "piglet") return stage.includes("piglet") || stage.includes("monitoring");
          if (type === "sow") return sw.sex === "Female" && (stage === "adult" || stage === "final selection");
          if (type === "boar") return sw.sex === "Male" && stage === "adult" && !sw.is_external_boar;
          if (type === "master") return sw.is_external_boar === true;
          return true;
        });
      }
      if (tag) filtered = filtered.filter(sw => sw.swine_id?.toLowerCase().includes(tag));
      filterPreviewResults = filtered;
      filterPreviewPage = 1;
      renderFilterPreview();

    });

      document.getElementById("resetFilters").addEventListener("click", () => {
        selectedFarmerId = null;
        filterPreviewResults = [];
        filterPreviewPage = 1;

        filtersForm.reset();
        document.getElementById("farmerDropdownBtn").textContent = "Select Farmer";
        document.getElementById("filterResultWrap")?.classList.add("d-none");

        swinePage = 1;
        renderCards(allSwine);

      });

  // ================= TAB SWITCHING (MODAL ONLY) =================
  document
    .querySelectorAll("#pigProfileTabs .nav-link")
    .forEach(btn => {
      btn.addEventListener("click", () => {

        // Activate tab
        document
          .querySelectorAll("#pigProfileTabs .nav-link")
          .forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        // Hide all tabs
        document
          .querySelectorAll(".profile-tab")
          .forEach(tab => tab.classList.add("d-none"));

        const target = btn.dataset.target;
        const targetEl = document.getElementById(target);
        targetEl?.classList.remove("d-none");

        // ✅ CLEAR offspring UI when NOT on offspring tab
        if (target !== "offspringTab") {
          document.getElementById("offspringCycleList").innerHTML = "";
          document.getElementById("offspringEmptyState")?.classList.add("d-none");
        }

        // ✅ Render offspring ONLY when tab is opened
        if (target === "offspringTab") {
          renderOffspring();
        }

        // Optional but correct
        if (target === "performanceTab" && activeSwineForView) {
          renderGrowth(activeSwineForView);
        }
      });
    });

    // ================= INIT =================
    await loadFarmers();
    await loadSwine();
  });