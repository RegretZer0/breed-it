// overview.js
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

  /* ================= GLOBAL LOADER HELPERS ================= */
  function showGlobalLoader(text = "Opening farmer panel...") {
    const loader = document.getElementById("globalLoader");
    if (!loader) return;

    const label = loader.querySelector(".loader-text");
    if (label) label.textContent = text;

    loader.classList.remove("d-none");
  }

  function hideGlobalLoader() {
    document.getElementById("globalLoader")?.classList.add("d-none");
  }

  /* ================= STATE ================= */
  const state = {
    managerId: null,

    allFarmers: [],
    filteredFarmers: [],
    farmerPage: 1,
    selectedFarmerId: "",

    // pigs under opened farmer (panel)
    currentFarmerPigs: [],
    filteredPigList: [],

    pigPage: 1,
    PIG_ROWS_PER_PAGE: 5,

    rawPerformanceData: { morphology: [], deformities: [] },
    rawAiData: [],
    rawSelectionData: [],
    allSwineData: [],

    aiPage: 1,
    AI_ROWS_PER_PAGE: 3,

    // breeding performance state
    breedingChartInstance: null,
    activeSowForBreeding: null,

    breedingSowPage: 1,
    BREEDING_SOWS_PER_PAGE: 4,

    breedingSowsCache: [],
    activeCycleForBreeding: null,

    // farmers pagination
    FARMER_ROWS_PER_PAGE: 5,

    // cycles pagination (cards list)
    breedingCyclePage: 1,
    CYCLES_PER_PAGE: 5,

    // ✅ UI view state helpers used by breeding module (safe defaults)
    __reproView: "SOWS"
  };

  /* ================= RESOLVE MANAGER ================= */
  try {
    // ✅ keep backward-compat: accept id/_id for farm_manager, managerId for encoder
    const uid = user?.id || user?._id || null;
    state.managerId = role === "farm_manager" ? uid : user.managerId || uid;
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

  // ✅ FIXED: count TRUE deaths robustly (matches old module behavior better)
  // Handles: "Dead", "Deceased", "Died", "Deceased (Before Weaning)", etc.
  function isDeadStatus(status) {
    const s = (status || "").toString().trim().toLowerCase();
    if (!s) return false;

    // strict-ish keywords
    if (s === "dead" || s === "deceased" || s === "died") return true;

    // common variants
    if (s.includes("deceased")) return true;
    if (s.includes("dead")) return true;

    return false;
  }

  function isAliveStatus(status) {
    return !isDeadStatus(status);
  }

  /* ================= IMAGE HELPERS ================= */
  function resolveImageUrl(path) {
    if (!path) return "/images/default-avatar.png";

    if (typeof path !== "string") return "/images/default-avatar.png";

    // ✅ Supabase / external URL
    if (path.startsWith("http")) return path;

    // ❌ DO NOT fallback to local uploads anymore
    return "/images/default-avatar.png";
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

  /* ================= DOM ================= */
  const dom = {
    farmerCardList: document.getElementById("farmerCardList"),
    filtersForm: document.getElementById("filtersForm"),
    filterStatus: document.getElementById("filterStatus"),
    searchFarmer: document.getElementById("searchFarmer"),

    // ✅ Floating panel (hidden by default)
    farmerPanel: document.getElementById("farmerPanel"),

    // ✅ Optional overlay close button (if you add one in ejs)
    farmerPanelCloseBtn: document.getElementById("closeFarmerPanelBtn")
  };

  /* ================= CTX ================= */
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

  /* ================= MODULE INIT ================= */
  const breeding = initBreedingModule(ctx);
  const pigs = initPigsModule(ctx, breeding);
  const farmers = initFarmersModule(ctx, pigs);

  /* ================= OPTIONAL: GLOBAL CLOSE HANDLERS FOR FLOATING PANEL ================= */
  function closeFarmerPanel() {
    // ✅ close overlay too, if present
    document.getElementById("farmerPanelOverlay")?.classList.add("d-none");
    dom.farmerPanel?.classList.add("d-none");
    document.body.classList.remove("panel-open");

    // ✅ FIXED: only call functions that actually exist in breeding module
    breeding?.closeSowDetailView?.();
  }

  dom.farmerPanelCloseBtn?.addEventListener("click", closeFarmerPanel);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && dom.farmerPanel && !dom.farmerPanel.classList.contains("d-none")) {
      closeFarmerPanel();
    }
  });

  // ✅ close when clicking outside (overlay style)
  dom.farmerPanel?.addEventListener("click", (e) => {
    if (e.target === dom.farmerPanel && dom.farmerPanel.classList.contains("panel-overlay")) {
      closeFarmerPanel();
    }
  });

  /* ================= INIT LOAD ================= */
  await Promise.all([farmers.loadFarmers(), pigs.loadResearchData()]);
});