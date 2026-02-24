import { authGuard } from "/js/authGuard.js";

import { initFarmersModule } from "./overview.farmers.js";
import { initPigsModule } from "./overview.pigs.js";
import { initBreedingModule } from "./overview.breeding.js";

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
  const state = {
    managerId: null,

    allFarmers: [],
    filteredFarmers: [],
    farmerPage: 1,
    selectedFarmerId: "",

    activePigCategory: "all",
    currentFarmerPigs: [],
    filteredPigList: [],

    pigPage: 1,
    PIG_ROWS_PER_PAGE: 5,

    rawPerformanceData: { morphology: [], deformities: [] },
    rawAiData: [],
    rawSelectionData: [],
    allSwineData: [],

    litterPage: 1,
    LITTER_ROWS_PER_PAGE: 5,
    currentLitterPiglets: [],

    aiPage: 1,
    AI_ROWS_PER_PAGE: 3,
    currentAiRecords: [],

    // ===== BREEDING PERFORMANCE STATE =====
    breedingChartInstance: null,
    activeSowForBreeding: null,

    breedingSowPage: 1,
    BREEDING_SOWS_PER_PAGE: 4,

    breedingSowsCache: [],
    activeCycleForBreeding: null,

    FARMER_ROWS_PER_PAGE: 5,

    // ===== BREEDING DETAIL STATE =====
    breedingCyclePage: 1,
    CYCLES_PER_PAGE: 2,

    breedingPigletPage: 1,
    PIGLETS_PER_PAGE: 5
  };

  /* ================= RESOLVE MANAGER ================= */
  try {
    state.managerId = role === "farm_manager" ? user.id : user.managerId;
  } catch (err) {
    console.error("Manager resolution failed", err);
    hideGlobalLoader();
    return;
  }

  /* ================= HELPERS ================= */
  function setText(id, value = "—") {
    const el = document.getElementById(id);
    if (el) el.textContent = value || "—";
  }

  // Only count TRUE deaths (prevents "Sick" being counted as dead)
  function isDeadStatus(status) {
    const s = (status || "").toString().trim().toLowerCase();
    // adjust if your schema uses different labels
    return s === "dead" || s === "deceased" || s === "died" || s.includes("dead");
  }

  function isAliveStatus(status) {
    // Keep your original "Healthy" semantics for alive in UI,
    // but death counting uses isDeadStatus.
    return !isDeadStatus(status);
  }

  /* ================= IMAGE HELPERS ================= */
  function resolveImageUrl(path) {
    if (!path) return "/images/default-avatar.png";
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    if (path.startsWith("/")) return path;
    return `/uploads/profiles/${path}`;
  }

  function setImage(id, src) {
    const el = document.getElementById(id);
    if (!el) return;

    const finalSrc = resolveImageUrl(src);
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

  /* ================= DOM ================= */
  const dom = {
    farmerCardList: document.getElementById("farmerCardList"),
    filtersForm: document.getElementById("filtersForm"),
    filterStatus: document.getElementById("filterStatus"),
    searchFarmer: document.getElementById("searchFarmer"),

    farmerModalEl: document.getElementById("farmerModal"),
    farmerModal: null
  };

  dom.farmerModal = dom.farmerModalEl
    ? new bootstrap.Modal(dom.farmerModalEl)
    : null;

  /* ================= MODULE INIT ================= */
  const ctx = {
    user,
    token,
    role,
    BACKEND_URL,
    state,
    dom,

    // helpers
    setText,
    setImage,
    resolveImageUrl,
    showGlobalLoader,
    hideGlobalLoader,
    isDeadStatus,
    isAliveStatus
  };

  // breeding module first (others will call its functions)
  const breeding = initBreedingModule(ctx);
  const pigs = initPigsModule(ctx, breeding);
  const farmers = initFarmersModule(ctx, pigs);

  /* ================= INIT LOAD ================= */
  await Promise.all([
    farmers.loadFarmers(),
    pigs.loadResearchData()
  ]);
});