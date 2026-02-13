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

    const FARMER_ROWS_PER_PAGE = 5;

  /* ================= RESOLVE MANAGER ================= */
  try {
    managerId = role === "farm_manager" ? user.id : user.managerId;
  } catch (err) {
    console.error("Manager resolution failed", err);
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

    // Always fall back to allFarmers if filtered is empty
    const list = filteredFarmers && filteredFarmers.length
        ? filteredFarmers
        : allFarmers;

    const totalPages = Math.max(
        1,
        Math.ceil(list.length / FARMER_ROWS_PER_PAGE)
    );

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
        html += `
        <div class="farmer-card-modern">
            <div class="farmer-card-top">
            <div class="farmer-card-left">
                <div class="farmer-card-avatar">
                <img src="/images/default-avatar.png" alt="Avatar">
                </div>
                <div>
                <div class="farmer-name">
                    ${f.first_name || ""} ${f.last_name || ""}
                </div>
                <div class="farmer-meta">
                    ${f.farm_name || "No Farm Name"}
                </div>
                <div class="farmer-meta">
                    ${f.location || "No Location"}
                </div>
                </div>
            </div>

            <div>
                <span class="farmer-status ${
                f.status === "Active" ? "status-active" : "status-inactive"
                }">
                ${f.status || "Inactive"}
                </span>
            </div>
            </div>

            <div class="farmer-card-bottom">
            <button
                class="btn btn-outline-primary btn-sm view-farmer-btn"
                data-id="${f._id}">
                View Profile
            </button>
            </div>
        </div>
        `;
    });

    farmerCardList.innerHTML = html;
    updatePagination(totalPages);
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

    setText("profileFarmerName",
      `${farmer.first_name || ""} ${farmer.last_name || ""}`);

    setText("profileFarmerContact", farmer.phone || farmer.email);
    setText("profilePhone", farmer.phone);
    setText("profileEmail", farmer.email);
    setText("profileAddress", farmer.address);

    setText("profileFarmerId", farmer._id);
    setText("profileFarmerIdOverview", farmer._id);

    setText("profilePenCount", farmer.pen_count || "—");
    setText("profilePenCountOverview", farmer.pen_count || "—");

    setText("profilePenCapacity", farmer.pen_capacity || "—");
    setText("profilePenCapacityOverview", farmer.pen_capacity || "—");


    const badge = document.getElementById("profileFarmerStatus");
    if (badge) {
      badge.textContent = farmer.status || "Inactive";
      badge.className =
        `badge rounded-pill px-3 py-1 ${
          farmer.status === "Active"
            ? "bg-success-subtle text-success"
            : "bg-secondary-subtle text-secondary"
        }`;
    }

    if (farmerModal) farmerModal.show();
    loadLinkedPigs(id);
  }

  /* ================= LOAD LINKED PIGS ================= */
  async function loadLinkedPigs(farmerId) {
    const wrap = document.getElementById("linkedPigList");
    if (!wrap) return;

    wrap.innerHTML = `
      <div class="text-muted text-center py-3">
        Loading pigs...
      </div>`;

    try {
      const res = await fetch(
        `${BACKEND_URL}/api/farmer/${farmerId}/pigs`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!res.ok) throw new Error("Failed request");

      const data = await res.json();
      currentFarmerPigs = data.pigs || [];

      if (!currentFarmerPigs.length) {
        wrap.innerHTML = `
          <div class="text-muted text-center py-3">
            No pigs registered under this farmer.
          </div>`;
        setText("profileTotalPigs", 0);
        return;
      }

      renderFarmerPigs(currentFarmerPigs);
      setText("profileTotalPigs", currentFarmerPigs.length);

    } catch (err) {
      console.error("Load pigs error:", err);
      wrap.innerHTML = `
        <div class="text-danger text-center py-3">
          Failed to load pigs
        </div>`;
    }
  }

  /* ================= RENDER FAMER PIG LIST ================= */
    function renderFarmerPigs() {

    const wrap = document.getElementById("linkedPigList");
    if (!wrap) return;

    const list = filteredPigList.length
        ? filteredPigList
        : currentFarmerPigs;

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

            <button
                class="btn btn-sm btn-outline-primary view-pig-btn"
                data-id="${p._id}">
                View
            </button>
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

        const stage = p.age_stage?.toLowerCase() || "";

        switch (activePigCategory) {
            case "piglet":
            return stage === "piglet";
            case "sow":
            return p.sex === "Female" && stage === "adult";
            case "boar":
            return p.sex === "Male" && stage === "adult";
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


  /* ================= HELPERS ================= */
  function setText(id, value = "—") {
    const el = document.getElementById(id);
    if (el) el.textContent = value || "—";
  }

  /* ================= INIT ================= */
  await loadFarmers();
});
