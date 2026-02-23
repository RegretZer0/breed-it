// /js/reports.js
import { authGuard } from "/js/authGuard.js";
import { buildUIHelpers } from "./reports.ui.js";
import { buildReportsModule } from "./reports.module.js";

document.addEventListener("DOMContentLoaded", async () => {
  // ---------------- AUTH ----------------
  const user = await authGuard(["farm_manager", "encoder"]);
  if (!user) return;

  const token = localStorage.getItem("token");
  const BACKEND_URL = "http://localhost:5000";

  // Shared state (kept close to original)
  const state = {
    user,
    token,
    BACKEND_URL,

    selectedStatus: "",
    selectedFarmerId: null,

    allReports: [],
    filteredReports: [],
    currentReportId: null,
    currentReportData: null,

    currentPage: 1,
    ROWS_PER_PAGE: 10,
  };

  // DOM cache (same IDs you used)
  const dom = {
    // stats
    countInHeat: document.getElementById("countInHeat"),
    countAwaitingRecheck: document.getElementById("countAwaitingRecheck"),
    countPregnant: document.getElementById("countPregnant"),
    countFarrowingReady: document.getElementById("countFarrowingReady"),
    countLactating: document.getElementById("countLactating"),

    // modal
    reportDetailsModal: document.getElementById("reportDetailsModal"),
    closeReportModal: document.getElementById("closeReportModal"),
    closeReportModalBtn: document.getElementById("closeReportModalBtn"),

    reportSwine: document.getElementById("reportSwine"),
    reportFarmer: document.getElementById("reportFarmer"),
    reportSigns: document.getElementById("reportSigns"),
    reportProbability: document.getElementById("reportProbability"),
    reportStatus: document.getElementById("reportStatus"),

    confirmPregnancyBtn: document.getElementById("confirmPregnancyBtn"),
    followUpBtn: document.getElementById("followUpBtn"),

    rejectReasonModal: document.getElementById("rejectReasonModal"),
    rejectReasonInput: document.getElementById("rejectReasonInput"),
    confirmRejectBtn: document.getElementById("confirmRejectBtn"),

    prevPageBtn: document.getElementById("prevPageBtn"),
    nextPageBtn: document.getElementById("nextPageBtn"),
    pageIndicator: document.getElementById("pageIndicator"),

    clearFilterBtn: document.getElementById("clearFilter"),

    farrowingModal: document.getElementById("farrowingModal"),
    farrowingForm: document.getElementById("farrowingForm"),

    evidenceGallery: document.getElementById("evidenceGallery"),

    approveBtn: document.getElementById("approveBtn"),
    rejectBtn: document.getElementById("rejectBtn"),
    confirmAIBtn: document.getElementById("confirmAIBtn"),
    confirmFarrowingBtn: document.getElementById("confirmFarrowingBtn"),

    aiConfirmModal: document.getElementById("aiConfirmModal"),
    boarSelect: document.getElementById("boarSelect"),
    submitAIBtn: document.getElementById("submitAI"),

    progressPanel: document.getElementById("trackProgressPanel"),
    closeProgressPanel: document.getElementById("closeProgressPanel"),

    heatFilterForm: document.getElementById("heatFilterForm"),
    farmerOptions: document.getElementById("farmerOptions"),
    farmerSearch: document.getElementById("farmerSearch"),
    farmerDropdownBtn: document.getElementById("farmerDropdownBtn"),
    filterSwine: document.getElementById("filterSwine"),

    toggleFarmerBtn: document.getElementById("toggleFarmerBtn"),

    reportStatusFilter: document.getElementById("reportStatusFilter"),
  };

  const ui = buildUIHelpers(state, dom);
  const mod = buildReportsModule(state, dom, ui);

  // --------- FILTER LOGIC (tabs) ----------
  document.querySelectorAll(".heat-tab").forEach(tab => {
    tab.addEventListener("click", function () {
      document.querySelectorAll(".heat-tab").forEach(t => t.classList.remove("active"));
      this.classList.add("active");

      state.selectedStatus = this.dataset.status || "";
      mod.applyFilters();
    });
  });

  // heatFilterForm submit
  dom.heatFilterForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    mod.applyFilters();
  });

  // toggle farmer card (safe)
  if (dom.toggleFarmerBtn && !dom.toggleFarmerBtn.dataset.bound) {
    dom.toggleFarmerBtn.dataset.bound = "true";
    dom.toggleFarmerBtn.addEventListener("click", () => {
      const farmerCard = document.getElementById("farmerInfoCard");
      const isVisible = farmerCard && farmerCard.style.display !== "none";
      ui.setFarmerCardVisible(!isVisible);
    });
  }

  // pagination
  dom.prevPageBtn?.addEventListener("click", () => {
    if (state.currentPage > 1) {
      state.currentPage--;
      mod.renderCards(state.filteredReports);
      document.getElementById("reportsCardList")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  dom.nextPageBtn?.addEventListener("click", () => {
    const totalPages = Math.ceil(state.filteredReports.length / state.ROWS_PER_PAGE);
    if (state.currentPage < totalPages) {
      state.currentPage++;
      mod.renderCards(state.filteredReports);
      document.getElementById("reportsCardList")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  // clear filter
  dom.clearFilterBtn?.addEventListener("click", () => mod.clearFilters());

  // esc key behavior
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (dom.reportDetailsModal?.style.display === "flex") ui.closeReportDetails();
      ui.closeEvidencePanel();
    }
  });

  // farmer dropdown load
  await mod.loadFarmerForFilter();

  // Ensure evidence overlay exists early
  ui.ensureEvidencePanel();

  // initial load
  mod.loadReports();
});