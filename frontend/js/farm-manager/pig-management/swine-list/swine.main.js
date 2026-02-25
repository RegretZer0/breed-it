// swine.main.js
import { authGuard } from "/js/authGuard.js";

import {
  showGlobalLoader,
  hideGlobalLoader,
  safeCall,
  formatStageDisplay,
  formatAge
} from "./swine.helpers.js";

import {
  renderCards,
  renderGrowth,
  renderReproductionCards,
  renderOffspringOverview,
  renderCycleCards,
  renderCyclePiglets
} from "./swine.render.js";

document.addEventListener("DOMContentLoaded", async () => {
  /* ================= AUTH ================= */
  const user = await authGuard(["farm_manager", "encoder"]);
  if (!user) return;

  const token = localStorage.getItem("token");
  const role = user.role;
  const BACKEND_URL = "http://localhost:5000";

  /* ================= STATE ================= */
  let managerId = null;
  let farmers = [];
  let selectedFarmerId = null;
  let allSwine = [];

  let activeCategory = "all";

  // offspring / cycles UI state
  let offspringByCycle = {}; // { [cycleNo]: piglets[] }
  let cyclesByNumber = {}; // { [cycleNo]: cycleObj }
  let activeSwineForView = null;

  // offspring UI state
  let activeCycleFilter = "all";
  let activeCycleDetail = null; // (kept for compatibility)
  let pigletSexFilter = "all";  // (kept for compatibility)
  let pigletPage = 1;           // (kept for compatibility)
  const PIGLETS_PER_PAGE = 5;

  // per-cycle accordion paging state
  const pigletPagerByCycle = {}; // { [cycleNo]: pageNumber }

  const growthChartInstanceRef = { current: null };

  /* ================= PAGINATION ================= */
  let swinePage = 1;
  const SWINE_ROWS_PER_PAGE = 5;

  /* ================= DOM ================= */
  const swineCardList = document.getElementById("swineCardList");
  const filtersForm = document.getElementById("filtersForm");
  const filterStatus = document.getElementById("filterStatus");
  const filterTag = document.getElementById("filterTag");

  const swineModal = document.getElementById("swineModal");
  const swineModalInstance = swineModal
    ? new bootstrap.Modal(swineModal, { backdrop: true, keyboard: true })
    : null;

  // Legacy modal (still in DOM, but we no longer open it from the list)
  const editModalEl = document.getElementById("editPerformanceModal");
  const editModal = editModalEl ? new bootstrap.Modal(editModalEl) : null;

  const editSwineIdInput = document.getElementById("editSwineId");
  const editWeightInput = document.getElementById("editWeight");
  const editBodyLengthInput = document.getElementById("editBodyLength");
  const editHeartGirthInput = document.getElementById("editHeartGirth");

  const offspringCycleFilterEl = document.getElementById("offspringCycleFilter");
  const offspringLatestBtn = document.getElementById("offspringLatestBtn");
  const pigletsCountLabel = document.getElementById("pigletsCountLabel");

  // NEW: Offcanvas buttons (in Overview tab)
  const openPigInfoBtn = document.getElementById("openPigInfoBtn");
  const openGrowthUpdateBtn = document.getElementById("openGrowthUpdateBtn");

  // NEW: Pig info offcanvas + fields
  const pigInfoCanvasEl = document.getElementById("pigInfoCanvas");
  const pigInfoCanvas = pigInfoCanvasEl ? new bootstrap.Offcanvas(pigInfoCanvasEl) : null;

  const pigInfoForm = document.getElementById("pigInfoForm");
  const pigInfoSwineId = document.getElementById("pigInfoSwineId");
  const pigInfoBreed = document.getElementById("pigInfoBreed");
  const pigInfoSex = document.getElementById("pigInfoSex");
  const pigInfoStage = document.getElementById("pigInfoStage");
  const pigInfoHealthStatus = document.getElementById("pigInfoHealthStatus");
  const pigInfoBirthDate = document.getElementById("pigInfoBirthDate");

  const pigProfileFile = document.getElementById("pigProfileFile");
  const pigProfilePreview = document.getElementById("pigProfilePreview");

  // NEW: Growth offcanvas + fields
  const growthCanvasEl = document.getElementById("growthCanvas");
  const growthCanvas = growthCanvasEl ? new bootstrap.Offcanvas(growthCanvasEl) : null;

  const growthCanvasSwineIdLabel = document.getElementById("growthCanvasSwineIdLabel");
  const growthWeight = document.getElementById("growthWeight");
  const growthLength = document.getElementById("growthLength");
  const growthGirth = document.getElementById("growthGirth");
  const saveGrowthCanvasBtn = document.getElementById("saveGrowthCanvasBtn");

  // NEW: Profile header image
  const profilePigImg = document.getElementById("profilePigImg");
  const profilePigIcon = document.getElementById("profilePigIcon");

  /* ================= RESOLVE MANAGER ================= */
  try {
    if (role === "farm_manager") {
      managerId = user.id;
    } else if (user.managerId) {
      managerId = user.managerId;
    } else {
      const res = await fetch(`${BACKEND_URL}/api/auth/encoders/single/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      managerId = data.encoder?.managerId;
    }
  } catch (err) {
    console.error("Failed to resolve managerId", err);
    return;
  }

  /* ================= MODAL EVENTS ================= */
  swineModal?.addEventListener("shown.bs.modal", () => {
    if (activeSwineForView) {
      renderGrowth({ sw: activeSwineForView, growthChartInstanceRef });
    }
    hideGlobalLoader();
  });

  /* ================= HELPERS ================= */
  function isSowCandidateFor(sw) {
    const sex = String(sw?.sex || "").toLowerCase();
    const ageStage = String(sw?.age_stage || "").toLowerCase();
    const cur = String(sw?.current_status || "").toLowerCase();

    const isFemaleAdult = sex === "female" && ageStage === "adult";

    const statusImpliesSow = ["pregnant", "lactating", "farrowing", "bred", "in-heat", "open"].some(
      (k) => cur.includes(k)
    );

    return Boolean(isFemaleAdult || statusImpliesSow);
  }

  function forceToOverviewTab() {
    document.querySelectorAll("#pigProfileTabs .nav-link").forEach((b) => b.classList.remove("active"));
    document
      .querySelector(`#pigProfileTabs .nav-link[data-target="profileTab"]`)
      ?.classList.add("active");

    document.querySelectorAll(".profile-tab").forEach((tab) => tab.classList.add("d-none"));
    document.getElementById("profileTab")?.classList.remove("d-none");
  }

  function setPigletsCountLabel(n) {
    if (pigletsCountLabel) pigletsCountLabel.textContent = String(n ?? 0);
  }

  function getSortedCycleKeys() {
    const keys = Object.keys(offspringByCycle || {});
    const numeric = keys
      .filter((k) => Number.isFinite(Number(k)))
      .sort((a, b) => Number(a) - Number(b));
    const other = keys.filter((k) => !Number.isFinite(Number(k))).sort();
    return [...numeric, ...other];
  }

  function computeLatestCycleKey() {
    const keys = getSortedCycleKeys();
    if (!keys.length) return "all";
    const numeric = keys.filter((k) => Number.isFinite(Number(k)));
    if (numeric.length) {
      const sorted = [...numeric].sort((a, b) => Number(a) - Number(b));
      return sorted[sorted.length - 1];
    }
    return keys[keys.length - 1];
  }

  function getParentNameById(parentId) {
    const pid = (parentId || "").toString().trim().toLowerCase();
    if (!pid) return "—";
    const match = allSwine.find((x) => (x.swine_id || "").toString().trim().toLowerCase() === pid);
    return match?.swine_id || parentId || "—";
  }

  function renderCyclesListView() {
    activeCycleDetail = null;
    pigletSexFilter = "all";
    pigletPage = 1;

    const cycles = activeSwineForView?.breeding_cycles || [];

    renderCycleCards({
      cycles,
      offspringByCycle,
      cyclesByNumber,
      cycleFilter: activeCycleFilter,
      getParentNameById
    });

    if (activeCycleFilter === "all") {
      const total = Object.values(offspringByCycle || {}).reduce((sum, arr) => sum + (arr?.length || 0), 0);
      setPigletsCountLabel(total);
    } else {
      const total = (offspringByCycle[String(activeCycleFilter)] || []).length;
      setPigletsCountLabel(total);
    }
  }

  function openCycleAccordion(cycleKey) {
    const cycle = String(cycleKey);

    const details = document.querySelector(`[data-cycle-details="${cycle}"]`);
    const btn = document.querySelector(`[data-cycle-toggle="${cycle}"]`);
    if (!details) return;

    const isOpen = !details.classList.contains("d-none");
    const willOpen = !isOpen;

    document.querySelectorAll("[data-cycle-details]").forEach((el) => el.classList.add("d-none"));

    document.querySelectorAll("[data-cycle-toggle]").forEach((b) => {
      b.textContent = "Open";
      b.classList.remove("btn-success");
      b.classList.add("btn-outline-success");
    });

    if (!willOpen) return;

    details.classList.remove("d-none");

    if (btn) {
      btn.textContent = "Hide";
      btn.classList.remove("btn-outline-success");
      btn.classList.add("btn-success");
    }

    pigletPagerByCycle[cycle] = 1;

    document
      .querySelectorAll(`.piglet-filter-btn[data-cycle="${cycle}"]`)
      .forEach((b) => b.classList.remove("active"));
    document
      .querySelector(`.piglet-filter-btn[data-cycle="${cycle}"][data-sex="all"]`)
      ?.classList.add("active");

    const list = offspringByCycle[cycle] || [];
    renderCyclePiglets({
      cycle,
      cycleObj: cyclesByNumber[cycle] || null,
      piglets: list,
      sowId: activeSwineForView?.swine_id || "—",
      motherLabel: activeSwineForView?.swine_id || "—",
      fatherLabel: getParentNameById(
        (cyclesByNumber[cycle] || null)?.boar_id ||
          (cyclesByNumber[cycle] || null)?.sire_id ||
          list?.[0]?.sire_id
      ),
      sexFilter: "all",
      pigletPage: pigletPagerByCycle[cycle],
      PIGLETS_PER_PAGE
    });
  }

  function hydratePigPhoto(sw) {
    // expects sw.profile_photo or sw.image or sw.photo_url etc; keep flexible
    const url =
      sw?.profile_photo ||
      sw?.photo_url ||
      sw?.image_url ||
      sw?.image ||
      "";

    if (profilePigImg && profilePigIcon) {
      if (url) {
        profilePigImg.src = url;
        profilePigImg.classList.remove("d-none");
        profilePigIcon.classList.add("d-none");
      } else {
        profilePigImg.classList.add("d-none");
        profilePigIcon.classList.remove("d-none");
      }
    }

    // also update preview if panel is opened later
    if (pigProfilePreview) pigProfilePreview.src = url || "/images/default-pig.png";
  }

  /* ================= CATEGORY TABS ================= */
  document.getElementById("swineCategoryTabs")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".nav-link");
    if (!btn) return;

    document.querySelectorAll("#swineCategoryTabs .nav-link").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    activeCategory = btn.dataset.type || "all";
    swinePage = 1;

    const { totalPages } = renderCards({
      list: allSwine,
      swineCardList,
      activeCategory,
      swinePage,
      SWINE_ROWS_PER_PAGE
    });

    syncSwinePager(totalPages);
  });

  /* ================= FARMER DROPDOWN ================= */
  function renderFarmerDropdown(list) {
    const wrap = document.getElementById("farmerOptions");
    const searchInput = document.getElementById("farmerSearch");
    if (!wrap) return;

    wrap.innerHTML = "";

    if (!Array.isArray(list) || !list.length) {
      wrap.innerHTML = `<div class="text-muted small">No farmers found</div>`;
      return;
    }

    list.forEach((f) => {
      const div = document.createElement("div");
      div.className = "dropdown-item small";
      div.textContent = `${f.first_name || ""} ${f.last_name || ""}`.trim();

      div.addEventListener("click", () => {
        selectedFarmerId = f._id;

        const btn = document.getElementById("farmerDropdownBtn");
        if (btn) btn.textContent = `${f.first_name || ""} ${f.last_name || ""}`.trim();

        bootstrap.Dropdown.getInstance(btn)?.hide();
      });

      wrap.appendChild(div);
    });

    if (searchInput && !searchInput.dataset.bound) {
      searchInput.dataset.bound = "true";
      searchInput.addEventListener("input", () => {
        const term = (searchInput.value || "").toLowerCase();
        renderFarmerDropdown(
          list.filter((f) => `${f.first_name || ""} ${f.last_name || ""}`.toLowerCase().includes(term))
        );
      });
    }
  }

  async function loadFarmers() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/farmers/${managerId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      farmers = data.farmers || [];
      renderFarmerDropdown(farmers);
    } catch (e) {
      console.error("Load farmers failed", e);
    }
  }

  async function loadSwine() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/swine/all`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();
      const rawSwine = data.swine || [];

      const validFarmerIds = farmers.map((f) => f._id.toString());

      allSwine = rawSwine.filter((sw) => {
        if (sw.farmer_id) {
          const fid = typeof sw.farmer_id === "object" ? sw.farmer_id._id : sw.farmer_id;
          if (validFarmerIds.includes(fid.toString())) return true;
        }

        if (sw.registered_by) {
          const rid = typeof sw.registered_by === "object" ? sw.registered_by._id : sw.registered_by;
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

      const { totalPages } = renderCards({
        list: allSwine,
        swineCardList,
        activeCategory,
        swinePage,
        SWINE_ROWS_PER_PAGE
      });

      syncSwinePager(totalPages);
    } catch (err) {
      console.error("Load swine failed", err);
    }
  }

  function syncSwinePager(totalPages) {
    const indicator = document.getElementById("swinePageIndicator");
    const prevBtn = document.getElementById("swinePrevBtn");
    const nextBtn = document.getElementById("swineNextBtn");

    if (indicator) indicator.textContent = `Page ${swinePage} of ${totalPages}`;
    if (prevBtn) prevBtn.disabled = swinePage <= 1;
    if (nextBtn) nextBtn.disabled = swinePage >= totalPages;
  }

  /* ================= MODAL HYDRATION (PROFILE HEADER) ================= */
  function hydrateModalProfile(sw) {
    const setText = (id, val = "—") => {
      const el = document.getElementById(id);
      if (el) el.textContent = val ?? "—";
    };

    const healthStatus = sw.health_status || "Unknown";

    const isDeceased =
      String(healthStatus).toLowerCase().includes("deceased") ||
      String(healthStatus).toLowerCase() === "dead";

    const ageSourceDate = sw.birth_date || sw.date_registered || sw.createdAt || null;
    const agePretty = isDeceased ? "—" : formatAge(ageSourceDate);

    const stageNorm = String(sw.age_stage || "").toLowerCase().trim();
    const isPigletStage = stageNorm.includes("piglet") || stageNorm.includes("monitor");

    const pigType = sw.is_external_boar
      ? "Master Boar"
      : isPigletStage
      ? "Piglet"
      : sw.sex === "Male"
      ? "Boar"
      : sw.sex === "Female"
      ? "Sow"
      : "Pig";

    const farmerName = sw.farmer_id
      ? `${sw.farmer_id.first_name || ""} ${sw.farmer_id.last_name || ""}`.trim()
      : "Office / Master";

    const perfArr = Array.isArray(sw.performance_records) ? sw.performance_records : [];
    const latestPerf = perfArr.length ? perfArr[perfArr.length - 1] : null;

    const latestWeight = latestPerf?.weight;
    const latestLength = latestPerf?.body_length;
    const latestGirth = latestPerf?.heart_girth;

    const lastUpdated = latestPerf?.record_date
      ? new Date(latestPerf.record_date).toLocaleDateString()
      : sw.updatedAt || sw.createdAt
      ? new Date(sw.updatedAt || sw.createdAt).toLocaleDateString()
      : "—";

    setText("modalSwineId", `Swine History: ${sw.swine_id}`);
    setText("profileSwineId", sw.swine_id);
    setText("profileBreedType", `${sw.breed || "Unknown Breed"} · ${pigType}`);
    setText("profileFarmer", farmerName);

    setText("profileAge", agePretty);
    setText("profileWeight", Number.isFinite(Number(latestWeight)) ? `${Number(latestWeight)} kg` : "—");
    setText("profileStage", sw.age_stage ? formatStageDisplay(sw.age_stage) : "—");
    setText("profileSex", sw.sex || "—");

    setText("profileStatus", healthStatus);
    setText("profileStageDisplay", sw.age_stage ? formatStageDisplay(sw.age_stage) : "—");
    setText("profileAgeDisplay", agePretty);
    setText("profileSexDisplay", sw.sex || "—");

    setText("profileWeightDisplay", Number.isFinite(Number(latestWeight)) ? `${Number(latestWeight)} kg` : "—");
    setText("profileLengthDisplay", Number.isFinite(Number(latestLength)) ? `${Number(latestLength)} cm` : "—");
    setText("profileGirthDisplay", Number.isFinite(Number(latestGirth)) ? `${Number(latestGirth)} cm` : "—");
    setText("profileLastUpdate", lastUpdated);

    const healthBadge = document.getElementById("profileHealthBadge");
    if (healthBadge) {
      const statusClassMap = {
        Healthy: "bg-success-subtle text-success",
        Pregnant: "bg-warning-subtle text-warning",
        "In-Heat": "bg-info-subtle text-info",
        "Under Observation": "bg-danger-subtle text-danger",
        "Deceased (Before Weaning)": "bg-danger-subtle text-danger",
        Deceased: "bg-danger-subtle text-danger"
      };

      healthBadge.textContent = healthStatus;
      healthBadge.className = `badge rounded-pill px-3 py-2 ${
        statusClassMap[healthStatus] || "bg-secondary-subtle text-secondary"
      }`;
    }

    // photo
    hydratePigPhoto(sw);
  }

  /* ================= OFFCANVAS: OPEN + PREFILL ================= */
  function openPigInfoPanel(sw) {
    if (!sw || !pigInfoCanvas) return;

    // fill fields
    if (pigInfoSwineId) pigInfoSwineId.value = sw.swine_id || "";
    if (pigInfoBreed) pigInfoBreed.value = sw.breed || "";
    if (pigInfoSex) pigInfoSex.value = sw.sex || "";
    if (pigInfoStage) pigInfoStage.value = sw.age_stage ? String(sw.age_stage).toLowerCase() : "";
    if (pigInfoHealthStatus) pigInfoHealthStatus.value = sw.health_status || "";
    if (pigInfoBirthDate) {
      const d = sw.birth_date ? new Date(sw.birth_date) : null;
      pigInfoBirthDate.value = d && !Number.isNaN(d.getTime())
        ? d.toISOString().slice(0, 10)
        : "";
    }

    // preview image
    const url =
      sw?.profile_photo ||
      sw?.photo_url ||
      sw?.image_url ||
      sw?.image ||
      "";

    if (pigProfilePreview) pigProfilePreview.src = url || "/images/default-pig.png";
    if (pigProfileFile) pigProfileFile.value = "";

    pigInfoCanvas.show();
  }

  function openGrowthPanel(sw) {
    if (!sw || !growthCanvas) return;

    if (growthCanvasSwineIdLabel) growthCanvasSwineIdLabel.textContent = sw.swine_id || "—";

    // prefill from latest perf
    const perfArr = Array.isArray(sw.performance_records) ? sw.performance_records : [];
    const latestPerf = perfArr.length ? perfArr[perfArr.length - 1] : null;

    if (growthWeight) growthWeight.value = latestPerf?.weight ?? "";
    if (growthLength) growthLength.value = latestPerf?.body_length ?? "";
    if (growthGirth) growthGirth.value = latestPerf?.heart_girth ?? "";

    growthCanvas.show();
  }

  // file preview
  pigProfileFile?.addEventListener("change", () => {
    const file = pigProfileFile.files?.[0];
    if (!file || !pigProfilePreview) return;

    const url = URL.createObjectURL(file);
    pigProfilePreview.src = url;
  });

  /* ================= SAVE: PIG INFO (TEXT FIELDS) ================= */
  pigInfoForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!activeSwineForView) return;

    try {
      const fd = new FormData();

      // text fields
      fd.append("breed", pigInfoBreed?.value?.trim() || activeSwineForView.breed || "");
      fd.append("sex", pigInfoSex?.value || activeSwineForView.sex || "");
      fd.append("age_stage", pigInfoStage?.value || activeSwineForView.age_stage || "");
      fd.append("health_status", pigInfoHealthStatus?.value || activeSwineForView.health_status || "");

      if (pigInfoBirthDate?.value) fd.append("birth_date", pigInfoBirthDate.value);

      // file field (IMPORTANT: must match backend: profile_photo)
      const file = pigProfileFile?.files?.[0];
      if (file) fd.append("profile_photo", file);

      const res = await fetch(`${BACKEND_URL}/api/swine/profile/${activeSwineForView.swine_id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}` // DO NOT set Content-Type for FormData
        },
        body: fd
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Failed to update pig info");

      // refresh list + current view
      await loadSwine();

      const refreshed = allSwine.find((s) => s._id === activeSwineForView._id) || data.swine || activeSwineForView;
      activeSwineForView = refreshed;

      hydrateModalProfile(refreshed); // this calls hydratePigPhoto(sw) too

      pigInfoCanvas?.hide();
      alert("Pig info updated successfully!");
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to update pig info");
    }
  });
  
  /* ================= SAVE: GROWTH (PERFORMANCE RECORD) ================= */
  saveGrowthCanvasBtn?.addEventListener("click", async () => {
    if (!activeSwineForView) return;

    const payload = {
      performance_records: {
        weight: Number(growthWeight?.value),
        body_length: Number(growthLength?.value),
        heart_girth: Number(growthGirth?.value),
        stage: "Monthly Update",
        record_date: new Date()
      }
    };

    try {
      const res = await fetch(`${BACKEND_URL}/api/swine/update/${activeSwineForView.swine_id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error("Failed to update growth");

      await loadSwine();

      const refreshed = allSwine.find((s) => s._id === activeSwineForView._id) || activeSwineForView;
      activeSwineForView = refreshed;

      hydrateModalProfile(refreshed);
      renderGrowth({ sw: refreshed, growthChartInstanceRef });

      growthCanvas?.hide();
      alert("Growth updated successfully!");
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to update growth");
    }
  });

  /* ================= MODAL ACTIONS ================= */
  async function handleView(mongoId) {
    await new Promise((r) => setTimeout(r, 50));

    const sw = allSwine.find((s) => s._id === mongoId);
    if (!sw) {
      hideGlobalLoader();
      return;
    }

    activeSwineForView = sw;
    hydrateModalProfile(sw);

    const isSowCandidate = isSowCandidateFor(sw);

    // show/hide offspring tab
    if (isSowCandidate) {
      document.getElementById("offspringNav")?.classList.remove("d-none");
    } else {
      document.getElementById("offspringNav")?.classList.add("d-none");
      document.getElementById("offspringTab")?.classList.add("d-none");

      const activeBtn = document.querySelector("#pigProfileTabs .nav-link.active");
      if (activeBtn?.dataset?.target === "offspringTab") {
        forceToOverviewTab();
      }
    }

    // derive offspring
    const currentId = sw.swine_id?.trim().toLowerCase();
    const actualOffspring = allSwine.filter((child) => {
      const dam = (child.dam_id || "").trim().toLowerCase();
      const sire = (child.sire_id || "").trim().toLowerCase();
      return dam === currentId || sire === currentId;
    });

    offspringByCycle = {};
    actualOffspring.forEach((child) => {
      const cycle = child.birth_cycle_number ?? child.farrowing_cycle ?? child.cycle_number ?? "Unknown";
      if (!offspringByCycle[cycle]) offspringByCycle[cycle] = [];
      offspringByCycle[cycle].push(child);
    });

    const cycles = sw.breeding_cycles || [];
    cyclesByNumber = {};
    cycles.forEach((c) => {
      const k = c?.cycle_number;
      if (k !== undefined && k !== null) cyclesByNumber[String(k)] = c;
    });

    Object.keys(pigletPagerByCycle).forEach((k) => delete pigletPagerByCycle[k]);

    // stats + chart only if sow
    if (isSowCandidate) {
      renderReproductionCards({ cycles, offspringByCycle });
      renderOffspringOverview({ cycles, offspringByCycle });

      if (offspringCycleFilterEl) {
        const keys = getSortedCycleKeys();
        offspringCycleFilterEl.innerHTML = `
          <option value="all">All Farrowing Cycles</option>
          ${keys.map((k) => `<option value="${k}">Cycle ${k}</option>`).join("")}
        `;
        activeCycleFilter = "all";
        offspringCycleFilterEl.value = activeCycleFilter;
      }

      renderCyclesListView();
    } else {
      setPigletsCountLabel(0);
      if (offspringCycleFilterEl) {
        offspringCycleFilterEl.innerHTML = `<option value="all">All Farrowing Cycles</option>`;
        offspringCycleFilterEl.value = "all";
      }
    }

    document.getElementById("reproNav")?.classList.add("d-none");

    swineModalInstance?.show();
    safeCall(window.hydrateCycleDetail, cycles);
  }

  /* ================= GLOBAL CLICK HANDLER ================= */
  document.addEventListener(
    "click",
    (e) => {
      const viewBtn = e.target.closest(".view-btn");
      const editBtn = e.target.closest(".edit-btn"); // will be ignored (we are removing Edit button)
      const growthBtn = e.target.closest(".toggle-growth");
      const reproBtn = e.target.closest(".toggle-repro");

      const cycleToggleBtn = e.target.closest("[data-cycle-toggle]");
      const pigletFilterBtn = e.target.closest(".piglet-filter-btn");
      const pigletPageBtn = e.target.closest("[data-piglet-page-btn]");

      const backBtn = e.target.closest("[data-cycle-back]");
      const sexTabBtn = e.target.closest("[data-piglet-sex]");
      const pigPrevBtn = e.target.closest("[data-piglet-prev]");
      const pigNextBtn = e.target.closest("[data-piglet-next]");

      // NEW: overview buttons
      const pigInfoBtn = e.target.closest("#openPigInfoBtn");
      const growthUpdateBtn = e.target.closest("#openGrowthUpdateBtn");

      if (viewBtn) {
        e.preventDefault();
        e.stopPropagation();
        showGlobalLoader("Opening pig profile...");
        handleView(viewBtn.dataset.id);
        return;
      }

      // ✅ remove Edit behavior (do nothing)
      if (editBtn) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Open panels from Overview
      if (pigInfoBtn) {
        e.preventDefault();
        e.stopPropagation();
        if (!activeSwineForView) return;
        openPigInfoPanel(activeSwineForView);
        return;
      }

      if (growthUpdateBtn) {
        e.preventDefault();
        e.stopPropagation();
        if (!activeSwineForView) return;
        openGrowthPanel(activeSwineForView);
        return;
      }

      if (growthBtn) {
        const details = growthBtn.closest(".growth-month-card")?.querySelector(".growth-details");
        if (!details) return;
        details.classList.toggle("d-none");
        growthBtn.textContent = details.classList.contains("d-none") ? "View" : "Hide";
        return;
      }

      if (reproBtn) {
        const details = reproBtn.closest(".reproduction-card")?.querySelector(".repro-details");
        if (!details) return;
        details.classList.toggle("d-none");
        reproBtn.textContent = details.classList.contains("d-none") ? "View" : "Hide";
        return;
      }

      if (cycleToggleBtn) {
        e.preventDefault();
        e.stopPropagation();
        const cycle = cycleToggleBtn.getAttribute("data-cycle-toggle");
        if (!cycle) return;
        openCycleAccordion(cycle);
        return;
      }

      if (pigletFilterBtn) {
        e.preventDefault();
        e.stopPropagation();

        const cycle = pigletFilterBtn.getAttribute("data-cycle");
        const sex = (pigletFilterBtn.getAttribute("data-sex") || "all").toLowerCase();
        if (!cycle) return;

        document
          .querySelectorAll(`.piglet-filter-btn[data-cycle="${cycle}"]`)
          .forEach((b) => b.classList.remove("active"));
        pigletFilterBtn.classList.add("active");

        pigletPagerByCycle[String(cycle)] = 1;

        const list = offspringByCycle[String(cycle)] || [];
        renderCyclePiglets({
          cycle: String(cycle),
          cycleObj: cyclesByNumber[String(cycle)] || null,
          piglets: list,
          sowId: activeSwineForView?.swine_id || "—",
          motherLabel: activeSwineForView?.swine_id || "—",
          fatherLabel: getParentNameById(
            (cyclesByNumber[String(cycle)] || null)?.boar_id ||
              (cyclesByNumber[String(cycle)] || null)?.sire_id ||
              list?.[0]?.sire_id
          ),
          sexFilter: sex,
          pigletPage: pigletPagerByCycle[String(cycle)] || 1,
          PIGLETS_PER_PAGE
        });
        return;
      }

      if (pigletPageBtn) {
        e.preventDefault();
        e.stopPropagation();

        const dir = pigletPageBtn.getAttribute("data-piglet-page-btn"); // prev|next
        const cycle = pigletPageBtn.getAttribute("data-cycle");
        if (!cycle) return;

        const cycleKey = String(cycle);

        const activeSexBtn = document.querySelector(`.piglet-filter-btn[data-cycle="${cycleKey}"].active`);
        const sex = (activeSexBtn?.getAttribute("data-sex") || "all").toLowerCase();

        const piglets = offspringByCycle[cycleKey] || [];
        const filtered = piglets.filter((p) => (sex === "all" ? true : (p.sex || "").toLowerCase() === sex));

        const totalPages = Math.max(1, Math.ceil(filtered.length / PIGLETS_PER_PAGE));
        const cur = pigletPagerByCycle[cycleKey] || 1;
        const next = dir === "prev" ? cur - 1 : cur + 1;
        pigletPagerByCycle[cycleKey] = Math.min(totalPages, Math.max(1, next));

        renderCyclePiglets({
          cycle: cycleKey,
          cycleObj: cyclesByNumber[cycleKey] || null,
          piglets,
          sowId: activeSwineForView?.swine_id || "—",
          motherLabel: activeSwineForView?.swine_id || "—",
          fatherLabel: getParentNameById(
            (cyclesByNumber[cycleKey] || null)?.boar_id ||
              (cyclesByNumber[cycleKey] || null)?.sire_id ||
              piglets?.[0]?.sire_id
          ),
          sexFilter: sex,
          pigletPage: pigletPagerByCycle[cycleKey],
          PIGLETS_PER_PAGE
        });
        return;
      }

      if (backBtn) {
        renderCyclesListView();
        return;
      }

      // panel mode handlers (kept for compatibility)
      if (sexTabBtn) {
        const sex = (sexTabBtn.getAttribute("data-piglet-sex") || "all").toLowerCase();
        pigletSexFilter = sex;
        pigletPage = 1;
        if (!activeCycleDetail) return;

        const piglets = offspringByCycle[String(activeCycleDetail)] || [];
        const cycleObj = cyclesByNumber[String(activeCycleDetail)] || null;

        renderCyclePiglets({
          cycle: String(activeCycleDetail),
          cycleObj,
          piglets,
          sowId: activeSwineForView?.swine_id || "—",
          motherLabel: activeSwineForView?.swine_id || "—",
          fatherLabel: getParentNameById(cycleObj?.boar_id || cycleObj?.sire_id || piglets?.[0]?.sire_id),
          sexFilter: pigletSexFilter,
          pigletPage,
          PIGLETS_PER_PAGE
        });
        return;
      }

      if (pigPrevBtn || pigNextBtn) {
        const dir = pigPrevBtn ? -1 : 1;
        if (!activeCycleDetail) return;

        const piglets = offspringByCycle[String(activeCycleDetail)] || [];
        const filtered = piglets.filter((p) =>
          pigletSexFilter === "all" ? true : (p.sex || "").toLowerCase() === pigletSexFilter
        );

        const totalPages = Math.max(1, Math.ceil(filtered.length / PIGLETS_PER_PAGE));
        pigletPage = Math.min(totalPages, Math.max(1, pigletPage + dir));

        const cycleObj = cyclesByNumber[String(activeCycleDetail)] || null;

        renderCyclePiglets({
          cycle: String(activeCycleDetail),
          cycleObj,
          piglets,
          sowId: activeSwineForView?.swine_id || "—",
          motherLabel: activeSwineForView?.swine_id || "—",
          fatherLabel: getParentNameById(cycleObj?.boar_id || cycleObj?.sire_id || piglets?.[0]?.sire_id),
          sexFilter: pigletSexFilter,
          pigletPage,
          PIGLETS_PER_PAGE
        });
      }
    },
    true
  );

  /* ================= SWINE PAGINATION CONTROLS ================= */
  document.getElementById("swinePrevBtn")?.addEventListener("click", () => {
    if (swinePage > 1) {
      swinePage--;
      const { totalPages } = renderCards({
        list: allSwine,
        swineCardList,
        activeCategory,
        swinePage,
        SWINE_ROWS_PER_PAGE
      });
      syncSwinePager(totalPages);
    }
  });

  document.getElementById("swineNextBtn")?.addEventListener("click", () => {
    swinePage++;
    const { totalPages, swinePage: corrected } = renderCards({
      list: allSwine,
      swineCardList,
      activeCategory,
      swinePage,
      SWINE_ROWS_PER_PAGE
    });
    swinePage = corrected;
    syncSwinePager(totalPages);
  });

  /* ================= OFFSPRING DROPDOWN FILTER ================= */
  offspringCycleFilterEl?.addEventListener("change", (e) => {
    activeCycleFilter = e.target.value || "all";
    renderCyclesListView();
    renderOffspringOverview({
      cycles: activeSwineForView?.breeding_cycles || [],
      offspringByCycle
    });
  });

  /* ================= OFFSPRING LATEST BUTTON ================= */
  offspringLatestBtn?.addEventListener("click", () => {
    if (!activeSwineForView) return;
    const latest = computeLatestCycleKey();
    if (!offspringCycleFilterEl) return;

    activeCycleFilter = latest === "all" ? "all" : String(latest);
    offspringCycleFilterEl.value = activeCycleFilter;
    renderCyclesListView();
  });

  /* ================= LEGACY MODAL SAVE (kept) ================= */
  document.getElementById("savePerformanceBtn")?.addEventListener("click", async () => {
    // keep working if you ever open the old modal manually
    const swineId = editSwineIdInput?.value?.trim();
    if (!swineId) return;

    const payload = {
      performance_records: {
        weight: Number(editWeightInput?.value),
        body_length: Number(editBodyLengthInput?.value),
        heart_girth: Number(editHeartGirthInput?.value),
        stage: "Monthly Update",
        record_date: new Date()
      }
    };

    try {
      const res = await fetch(`${BACKEND_URL}/api/swine/update/${swineId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        alert("Performance record updated successfully!");
        await loadSwine();
        editModal?.hide();

        // refresh active modal view if same pig
        if (activeSwineForView?.swine_id === swineId) {
          const refreshed = allSwine.find((s) => s._id === activeSwineForView._id) || activeSwineForView;
          activeSwineForView = refreshed;
          hydrateModalProfile(refreshed);
          renderGrowth({ sw: refreshed, growthChartInstanceRef });
        }
      }
    } catch (err) {
      alert(err.message);
    }
  });

  /* ================= GROWTH YEAR FILTER ================= */
  document.getElementById("growthYearFilter")?.addEventListener("change", () => {
    if (activeSwineForView) {
      renderGrowth({ sw: activeSwineForView, growthChartInstanceRef });
    }
  });

  /* ================= FILTERS ================= */
  filtersForm?.addEventListener("submit", (e) => {
    e.preventDefault();

    let filtered = [...allSwine];
    const status = filterStatus?.value;
    const tag = filterTag?.value?.trim()?.toLowerCase();

    if (selectedFarmerId) {
      filtered = filtered.filter((sw) => {
        if (!sw.farmer_id) return false;

        const fid =
          typeof sw.farmer_id === "object" ? sw.farmer_id._id?.toString() : sw.farmer_id.toString();

        return fid === selectedFarmerId.toString();
      });
    }

    if (status) filtered = filtered.filter((sw) => sw.health_status === status);
    if (tag) filtered = filtered.filter((sw) => sw.swine_id?.toLowerCase().includes(tag));

    swinePage = 1;

    const { totalPages } = renderCards({
      list: filtered,
      swineCardList,
      activeCategory,
      swinePage,
      SWINE_ROWS_PER_PAGE
    });

    syncSwinePager(totalPages);
  });

  document.getElementById("resetFilters")?.addEventListener("click", () => {
    selectedFarmerId = null;
    filtersForm?.reset();

    const farmerBtn = document.getElementById("farmerDropdownBtn");
    if (farmerBtn) farmerBtn.textContent = "Farmer";

    swinePage = 1;

    const { totalPages } = renderCards({
      list: allSwine,
      swineCardList,
      activeCategory,
      swinePage,
      SWINE_ROWS_PER_PAGE
    });

    syncSwinePager(totalPages);
  });

  /* ================= TAB SWITCHING (MODAL ONLY) ================= */
  document.querySelectorAll("#pigProfileTabs .nav-link").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.target;

      if (target === "offspringTab") {
        const nav = document.getElementById("offspringNav");
        if (nav?.classList.contains("d-none")) return;
      }

      document.querySelectorAll("#pigProfileTabs .nav-link").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      document.querySelectorAll(".profile-tab").forEach((tab) => tab.classList.add("d-none"));
      document.getElementById(target)?.classList.remove("d-none");

      if (target === "offspringTab") {
        renderOffspringOverview({
          cycles: activeSwineForView?.breeding_cycles || [],
          offspringByCycle
        });

        if (offspringCycleFilterEl) offspringCycleFilterEl.value = activeCycleFilter || "all";
        renderCyclesListView();
      }

      if (target === "performanceTab" && activeSwineForView) {
        renderGrowth({ sw: activeSwineForView, growthChartInstanceRef });
      }
    });
  });

  /* ================= INIT ================= */
  await loadFarmers();
  await loadSwine();

  // If someone clicks buttons directly (not through global click), support too:
  openPigInfoBtn?.addEventListener("click", () => {
    if (!activeSwineForView) return;
    openPigInfoPanel(activeSwineForView);
  });

  openGrowthUpdateBtn?.addEventListener("click", () => {
    if (!activeSwineForView) return;
    openGrowthPanel(activeSwineForView);
  });

  const autoOpenId = localStorage.getItem("openPigId");
  const autoOpenTab = localStorage.getItem("openPigTab");

  if (autoOpenId) {
    showGlobalLoader("Opening pig profile...");
    handleView(autoOpenId);

    setTimeout(() => {
      if (autoOpenTab) {
        if (autoOpenTab === "offspringTab") {
          const nav = document.getElementById("offspringNav");
          if (nav?.classList.contains("d-none")) {
            localStorage.removeItem("openPigId");
            localStorage.removeItem("openPigTab");
            return;
          }
        }

        document.querySelectorAll("#pigProfileTabs .nav-link").forEach((b) => b.classList.remove("active"));
        document.querySelectorAll(".profile-tab").forEach((tab) => tab.classList.add("d-none"));

        const tabBtn = document.querySelector(`#pigProfileTabs .nav-link[data-target="${autoOpenTab}"]`);
        tabBtn?.classList.add("active");
        document.getElementById(autoOpenTab)?.classList.remove("d-none");

        if (autoOpenTab === "performanceTab" && activeSwineForView) {
          renderGrowth({ sw: activeSwineForView, growthChartInstanceRef });
        }

        if (autoOpenTab === "offspringTab") {
          renderOffspringOverview({
            cycles: activeSwineForView?.breeding_cycles || [],
            offspringByCycle
          });

          if (offspringCycleFilterEl) offspringCycleFilterEl.value = activeCycleFilter || "all";
          renderCyclesListView();
        }
      }

      localStorage.removeItem("openPigId");
      localStorage.removeItem("openPigTab");
    }, 500);
  }
});