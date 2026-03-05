// /js/reports/report.ui.js
import {
  formatCountdown,
  updateCountdowns,
  normalizeApprovalStatus,
  labelApprovalStatus,
  buildTimelineSteps
} from "./report.utils.js";

export function createReportUI({ BACKEND_URL, user, api }) {
  /* =========================================================
     Module: DOM References
  ========================================================= */
  const swineSelect = document.getElementById("swineSelect");
  const reportForm = document.getElementById("heatReportForm");
  const reportMessage = document.getElementById("reportMessage");
  const reportsTableBody = document.getElementById("reportsTableBody");
  const submitBtn = reportForm?.querySelector(".btn-submit");

  const statusFilter = document.getElementById("statusFilter");
  const searchBtn = document.getElementById("searchBtn");
  const clearFilterBtn = document.getElementById("clearFilterBtn");
  const tagSearchInput = document.getElementById("tagSearchInput");
  const statusTabs = document.querySelectorAll(".status-tab");

  const actionModal = document.getElementById("actionModal");
  const actionForm = document.getElementById("actionForm");
  const actionFormBody = document.getElementById("actionFormBody");
  const actionModalTitle = document.getElementById("actionModalTitle");
  const actionCloseBtn = document.getElementById("actionCloseBtn");

  const moduleTitleMain = document.getElementById("moduleTitleMain");
  const moduleTitleSub = document.getElementById("moduleTitleSub");
  const logsTabBtn = document.getElementById("logsTab");
  const createTabBtn = document.getElementById("createTab");
  const logsSection = document.getElementById("logsSection");
  const createSection = document.getElementById("createSection");

  const paginationEl = document.getElementById("reportsPagination");

  const openArchiveBtn = document.getElementById("openArchiveBtn");
  const archiveModal = document.getElementById("archiveModal");
  const archiveCloseBtn = document.getElementById("archiveCloseBtn");
  const archiveReportsBody = document.getElementById("archiveReportsBody");
  const archivePaginationEl = document.getElementById("archivePagination");
  const archiveSearchInput = document.getElementById("archiveSearchInput");
  const archiveStatusFilter = document.getElementById("archiveStatusFilter");
  const archiveApplyBtn = document.getElementById("archiveApplyBtn");
  const archiveResetBtn = document.getElementById("archiveResetBtn");

  const openPigPickerBtn = document.getElementById("openPigPickerBtn");
  const pigPickerPanel = document.getElementById("pigPickerPanel");
  const closePigPickerBtn = document.getElementById("closePigPickerBtn");
  const pigPickerList = document.getElementById("pigPickerList");
  const pigPickerPagination = document.getElementById("pigPickerPagination");
  const pigPickerSearchInput = document.getElementById("pigPickerSearchInput");
  const pigPickerSearchBtn = document.getElementById("pigPickerSearchBtn");

  const selectedPigWrap = document.getElementById("selectedPigWrap");
  const selectedSwineIdInput = document.getElementById("selectedSwineId");

  const remarksInput = document.getElementById("remarks");

  /* =========================================================
     Module: State
  ========================================================= */
  const PAGE_SIZE = 5;

  let allReports = [];
  let activeReports = [];   // Logs (Pending/Approved/Ongoing/etc + Rejected (still within 24h))
  let archiveReports = [];  // Archive (Completed + Rejected after 24h)

  let filteredReports = [];
  let currentPage = 1;

  let filteredArchive = [];
  let archivePage = 1;

  let allOpenSows = [];
  let filteredOpenSows = [];
  let pigPickerPage = 1;
  const PIGS_PER_PAGE = 5;

  /* =========================================================
     Module: Modal Open State Helpers
  ========================================================= */
  function isElementVisible(el) {
    return !!el && !el.classList.contains("hidden");
  }

  function ensureBodyModalState() {
    const reportModal = document.getElementById("reportModal");
    const trackModal = document.getElementById("trackModal");
    const archiveModalEl = document.getElementById("archiveModal");
    const evidenceLb = document.getElementById("evidenceLightbox");
    const feedbackModal = document.getElementById("feedbackModal");
    const pigPicker = document.getElementById("pigPickerPanel");

    const anyOpen =
      isElementVisible(reportModal) ||
      isElementVisible(trackModal) ||
      isElementVisible(archiveModalEl) ||
      isElementVisible(feedbackModal) ||
      isElementVisible(pigPicker) ||
      (evidenceLb && evidenceLb.classList.contains("show"));

    document.body.classList.toggle("modal-open", anyOpen);
  }

  /* =========================================================
     Module: Action Form Submission (Manager/Tech actions)
  ========================================================= */
  actionForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(actionForm);
    let data = Object.fromEntries(formData.entries());
    const { reportId, actionType } = actionForm.dataset;

    const routeMap = {
      confirm_ai: `${BACKEND_URL}/api/ai/add`,
      confirm_pregnancy: `${BACKEND_URL}/api/ai/confirm-pregnancy/${reportId}`,
      confirm_farrowing: `${BACKEND_URL}/api/farrowing/add`
    };

    if (actionType === "confirm_ai") {
      const report = activeReports.find((r) => r._id === reportId);
      data = {
        ...data,
        heatReportId: reportId,
        swineId: report?.swine_id?.swine_id || "",
        maleSwineId: data.sire_id || "Unknown",
        farmerId: user.id
      };
    }

    try {
      const res = await api.post(routeMap[actionType], data);
      if (res.success) {
        uiAlert("Success!", { variant: "success" });
        location.reload();
      }
    } catch (err) {
      uiAlert(err.message || "Failed to save", { variant: "danger" });
    }
  });

  /* =========================================================
     Module: Themed Alerts and Confirms
  ========================================================= */
  function ensureFeedbackModal() {
    let modal = document.getElementById("feedbackModal");
    if (modal) return modal;

    const wrap = document.createElement("div");
    wrap.id = "feedbackModal";
    wrap.className = "modal-shell hidden";
    wrap.setAttribute("aria-hidden", "true");

    wrap.innerHTML = `
      <div class="fb-backdrop" data-close="1"></div>
      <div class="modal-card fb-card" role="dialog" aria-modal="true" aria-labelledby="fbTitle">
        <div class="modal-head">
          <div class="modal-title" id="fbTitle">
            <i class="bi bi-info-circle"></i>
            <span id="fbTitleText">Message</span>
          </div>
          <button type="button" class="btn-icon close-modal" data-close="1" aria-label="Close">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>

        <div class="modal-body" id="fbBody"></div>

        <div class="modal-foot" id="fbActions">
          <button type="button" class="btn-soft" data-close="1">
            <i class="bi bi-x-circle"></i>
            Close
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(wrap);

    wrap.style.position = "fixed";
    wrap.style.inset = "0";
    wrap.style.zIndex = "3000";

    wrap.style.display = "flex";
    wrap.style.alignItems = "center";
    wrap.style.justifyContent = "center";
    wrap.style.padding = "18px";
    wrap.style.overflow = "auto";

    const backdrop = wrap.querySelector(".fb-backdrop");
    const card = wrap.querySelector(".fb-card");

    if (backdrop) {
      backdrop.style.position = "absolute";
      backdrop.style.inset = "0";
      backdrop.style.zIndex = "0";
      backdrop.style.background = "rgba(0,0,0,0.45)";
      backdrop.style.backdropFilter = "blur(1px)";
    }

    if (card) {
      card.style.position = "relative";
      card.style.zIndex = "1";
      card.style.marginTop = "0";
      card.style.maxWidth = "560px";
      card.style.width = "100%";
    }

    const close = () => closeFeedbackModal();
    wrap.addEventListener("click", (e) => {
      const t = e.target;
      if (t?.dataset?.close === "1" || t?.closest?.("[data-close='1']")) close();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !wrap.classList.contains("hidden")) close();
    });

    return wrap;
  }

  function openFeedbackModal({ title = "Message", html = "", variant = "info", actions = [] } = {}) {
    const modal = ensureFeedbackModal();
    const titleEl = modal.querySelector("#fbTitleText");
    const bodyEl = modal.querySelector("#fbBody");
    const actionsEl = modal.querySelector("#fbActions");
    const iconEl = modal.querySelector(".modal-title i");

    if (titleEl) titleEl.textContent = title;

    const iconMap = {
      info: "bi-info-circle",
      success: "bi-check-circle",
      warning: "bi-exclamation-triangle",
      danger: "bi-x-circle"
    };
    const iconClass = iconMap[variant] || iconMap.info;
    if (iconEl) iconEl.className = `bi ${iconClass}`;

    if (bodyEl) bodyEl.innerHTML = html;

    const safeActions = Array.isArray(actions) ? actions : [];
    if (actionsEl) {
      if (safeActions.length) {
        actionsEl.innerHTML = safeActions
          .map((a, idx) => {
            const btnClass = a.primary ? "btn-primary" : "btn-soft";
            const icon = a.icon ? `<i class="bi ${a.icon}"></i>` : "";
            return `<button type="button" class="${btnClass}" data-action-idx="${idx}">${icon}${a.label || "OK"}</button>`;
          })
          .join("");
      } else {
        actionsEl.innerHTML = `
          <button type="button" class="btn-soft" data-close="1">
            <i class="bi bi-x-circle"></i>
            Close
          </button>
        `;
      }

      actionsEl.querySelectorAll("[data-action-idx]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const idx = Number(btn.dataset.actionIdx);
          const act = safeActions[idx];
          if (act?.onClick) {
            try {
              const ret = act.onClick();
              if (ret && typeof ret.then === "function") await ret;
            } catch (err) {
              console.error(err);
            }
          }
          if (act?.closeOnClick !== false) closeFeedbackModal();
        });
      });

      actionsEl.querySelectorAll("[data-close='1']").forEach((btn) => {
        btn.addEventListener("click", () => closeFeedbackModal());
      });
    }

    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    ensureBodyModalState();
  }

  function closeFeedbackModal() {
    const modal = document.getElementById("feedbackModal");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    ensureBodyModalState();
  }

  function uiAlert(message, opts = {}) {
    openFeedbackModal({
      title: opts.title || "Notice",
      variant: opts.variant || "info",
      html: `<div class="fb-text">${String(message || "")}</div>`,
      actions: [{ label: "Close", icon: "bi-x-circle", primary: false }]
    });
  }

  function uiConfirm(message, opts = {}) {
    return new Promise((resolve) => {
      openFeedbackModal({
        title: opts.title || "Confirm",
        variant: opts.variant || "warning",
        html: `<div class="fb-text">${String(message || "")}</div>`,
        actions: [
          {
            label: opts.cancelText || "Cancel",
            icon: "bi-x-circle",
            primary: false,
            onClick: () => resolve(false)
          },
          {
            label: opts.okText || "Confirm",
            icon: "bi-check2-circle",
            primary: true,
            onClick: () => resolve(true)
          }
        ]
      });
    });
  }

  /* =========================================================
     Module: Report Status Helpers (Report status, not swine status)
  ========================================================= */
  function normStatus(v) {
    return String(v || "").toLowerCase().trim().replace(/\s+/g, "_");
  }

  function reportStageLabelFromStatus(statusRaw) {
    const s = normStatus(statusRaw);

    const map = {
      pending: "Pending Review",
      approved: "AI Scheduled",
      rejected: "Rejected",
      ai_service: "AI Service",
      under_observation: "Under Observation",
      pregnant: "Pregnant",
      farrowing_ready: "Farrowing Ready",
      farrowed: "Farrowed",
      lactating: "Lactating",
      completed: "Completed"
    };

    return map[s] || "Pending Review";
  }

  /* =========================================================
   Module: Report Status Helpers (Time Warp aware)
  ========================================================= */
  function isDue(dateVal) {
    if (!dateVal) return false;

    const d = new Date(dateVal);
    if (Number.isNaN(d.getTime())) return false;

    const offset = parseInt(localStorage.getItem("timeWarpOffset") || "0", 10);
    const virtualNow = new Date(Date.now() + (Number.isFinite(offset) ? offset : 0));

    const today = new Date(virtualNow);
    today.setHours(0, 0, 0, 0);

    const target = new Date(d);
    target.setHours(0, 0, 0, 0);

    return today.getTime() >= target.getTime();
  }

  function canShowBackInHeat(report) {
    const st = normStatus(report?.status);
    if (st === "pending" || st === "rejected" || st === "completed") return false;
    return st === "approved" || st === "under_observation";
  }

  function canShowConfirmPregnant(report) {
    const st = normStatus(report?.status);
    if (st !== "under_observation") return false;
    return isDue(report?.next_heat_check);
  }

  /* =========================================================
   Module: Report Status Helpers
  ========================================================= */
  function canShowConfirmWeaning(report) {
    const st = normStatus(report?.status);
    if (st !== "lactating") return false;

    if (report?.weaning_date) return false;

    const farrowBase = report?.actual_farrowing_date || report?.expected_farrowing;
    if (!farrowBase) return false;

    const farrow = new Date(farrowBase);
    if (Number.isNaN(farrow.getTime())) return false;

    const weanThreshold = new Date(farrow);
    weanThreshold.setDate(weanThreshold.getDate() + 30);

    return isDue(weanThreshold);
  }

  function computeNextCheckDate(report) {
    const st = normStatus(report?.status);

    if (st === "approved" || st === "under_observation") return report?.next_heat_check || "";
    if (st === "pregnant") return report?.expected_farrowing || "";

    if (st === "lactating") {
      const base = report?.actual_farrowing_date || report?.expected_farrowing;
      if (!base) return "";
      const d = new Date(base);
      if (Number.isNaN(d.getTime())) return "";
      d.setDate(d.getDate() + 30);
      return d.toISOString();
    }

    return "";
  }

  /* =========================================================
     Module: Pig Picker
  ========================================================= */
  function openPigPicker() {
    if (!pigPickerPanel) return;
    pigPickerPanel.classList.remove("hidden");
    pigPickerPanel.setAttribute("aria-hidden", "false");
    ensureBodyModalState();
  }

  function closePigPicker() {
    if (!pigPickerPanel) return;
    pigPickerPanel.classList.add("hidden");
    pigPickerPanel.setAttribute("aria-hidden", "true");
    ensureBodyModalState();
  }

  function safePigImg(sw) {
    const src = sw?.profile_image || sw?.image_url || sw?.photo || "/images/default-pig.png";
    return `<img src="${src}" alt="Pig" onerror="this.onerror=null;this.src='/images/default-pig.png';" />`;
  }

  function calcCycleCount(sw) {
    const cycles = sw?.cycles || sw?.repro_cycles || sw?.breeding_cycles || sw?.cycle_history || sw?.cycleHistory;
    if (Array.isArray(cycles)) return cycles.length;
    if (typeof cycles === "number") return cycles;
    return sw?.cycle_count ?? sw?.cycleCount ?? 0;
  }

  function pickWeight(sw) {
    return sw?.current_weight ?? sw?.weight ?? sw?.currentWeight ?? "—";
  }

  function renderPigPickerPage() {
    if (!pigPickerList) return;

    if (!filteredOpenSows.length) {
      pigPickerList.innerHTML = `<div class="empty-state">No open sows found.</div>`;
      if (pigPickerPagination) pigPickerPagination.innerHTML = "";
      return;
    }

    const totalPages = Math.max(1, Math.ceil(filteredOpenSows.length / PIGS_PER_PAGE));
    if (pigPickerPage > totalPages) pigPickerPage = totalPages;

    const start = (pigPickerPage - 1) * PIGS_PER_PAGE;
    const pageItems = filteredOpenSows.slice(start, start + PIGS_PER_PAGE);

    pigPickerList.innerHTML = pageItems
      .map((sw) => {
        const tag = sw?.swine_id || "Unknown";
        const breed = sw?.breed || "—";
        const status = String(sw?.current_status || "Open").replace(/_/g, " ");
        const w = pickWeight(sw);
        const cycles = calcCycleCount(sw);

        return `
        <div class="pig-card" data-id="${tag}">
          <div class="pig-avatar">
            ${safePigImg(sw)}
          </div>

          <div class="pig-info">
            <h5>${tag}</h5>
            <div class="pig-sub">
              <span class="pig-chip"><i class="bi bi-shield-check"></i>${status}</span>
              <span class="pig-chip"><i class="bi bi-diagram-3"></i>${breed}</span>
              <span class="pig-chip"><i class="bi bi-speedometer2"></i>Weight: ${w}</span>
              <span class="pig-chip"><i class="bi bi-arrow-repeat"></i>Cycles: ${cycles}</span>
            </div>
          </div>

          <div class="pig-actions">
            <button type="button" class="btn-primary" data-action="select" data-id="${tag}">
              <i class="bi bi-check2-circle"></i>
              Select
            </button>
          </div>
        </div>
      `;
      })
      .join("");

    pigPickerList.querySelectorAll("[data-action='select']").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const sw = filteredOpenSows.find((x) => String(x?.swine_id) === String(id));
        if (sw) selectPig(sw);
      });
    });

    renderPigPickerPagination();
  }

  function renderPigPickerPagination() {
    if (!pigPickerPagination) return;

    const total = filteredOpenSows.length;
    if (total === 0) {
      pigPickerPagination.innerHTML = "";
      return;
    }

    const totalPages = Math.max(1, Math.ceil(total / PIGS_PER_PAGE));
    if (pigPickerPage < 1) pigPickerPage = 1;
    if (pigPickerPage > totalPages) pigPickerPage = totalPages;

    pigPickerPagination.innerHTML = `
      <div class="pager-mini">
        <button class="page-btn page-btn-sm" id="pigPrevBtn" ${pigPickerPage === 1 ? "disabled" : ""} aria-label="Previous page">
          <i class="bi bi-chevron-left"></i>
        </button>

        <span class="page-info page-info-sm">Page ${pigPickerPage} / ${totalPages}</span>

        <button class="page-btn page-btn-sm" id="pigNextBtn" ${pigPickerPage === totalPages ? "disabled" : ""} aria-label="Next page">
          <i class="bi bi-chevron-right"></i>
        </button>
      </div>
    `;

    pigPickerPagination.querySelector("#pigPrevBtn")?.addEventListener("click", () => {
      if (pigPickerPage > 1) {
        pigPickerPage--;
        renderPigPickerPage();
      }
    });

    pigPickerPagination.querySelector("#pigNextBtn")?.addEventListener("click", () => {
      if (pigPickerPage < totalPages) {
        pigPickerPage++;
        renderPigPickerPage();
      }
    });
  }

  function applyPigSearch() {
    const q = (pigPickerSearchInput?.value || "").trim().toLowerCase();
    if (!q) {
      filteredOpenSows = [...allOpenSows];
    } else {
      filteredOpenSows = allOpenSows.filter((sw) => {
        const id = String(sw?.swine_id || "").toLowerCase();
        const breed = String(sw?.breed || "").toLowerCase();
        return id.includes(q) || breed.includes(q);
      });
    }
    pigPickerPage = 1;
    renderPigPickerPage();
  }

  openPigPickerBtn?.addEventListener("click", () => openPigPicker());
  closePigPickerBtn?.addEventListener("click", () => closePigPicker());
  pigPickerPanel?.addEventListener("click", (e) => {
    if (e.target?.id === "pigPickerPanel") closePigPicker();
  });
  pigPickerSearchBtn?.addEventListener("click", applyPigSearch);
  pigPickerSearchInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") applyPigSearch();
  });

  function selectPig(sw) {
    const id = sw?.swine_id;
    if (!id) return;

    if (selectedSwineIdInput) selectedSwineIdInput.value = id;

    openPigPickerBtn?.classList.add("hidden");
    if (selectedPigWrap) {
      selectedPigWrap.classList.remove("hidden");

      const breed = sw?.breed || "—";
      const status = String(sw?.current_status || "Open").replace(/_/g, " ");
      const w = pickWeight(sw);
      const cycles = calcCycleCount(sw);

      selectedPigWrap.innerHTML = `
        <div class="selected-pig-card">
          <div class="pig-avatar">
            ${safePigImg(sw)}
          </div>

          <div class="pig-info">
            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
              <h5 style="margin:0;">${id}</h5>
              <span class="selected-badge"><i class="bi bi-check2"></i>Selected</span>
            </div>

            <div class="pig-sub">
              <span class="pig-chip"><i class="bi bi-shield-check"></i>${status}</span>
              <span class="pig-chip"><i class="bi bi-diagram-3"></i>${breed}</span>
              <span class="pig-chip"><i class="bi bi-speedometer2"></i>Weight: ${w}</span>
              <span class="pig-chip"><i class="bi bi-arrow-repeat"></i>Cycles: ${cycles}</span>
            </div>
          </div>

          <div class="pig-actions">
            <button type="button" class="btn-soft" id="deselectPigBtn">
              <i class="bi bi-x-circle"></i>
              Deselect
            </button>
          </div>
        </div>
      `;

      selectedPigWrap.querySelector("#deselectPigBtn")?.addEventListener("click", () => {
        if (selectedSwineIdInput) selectedSwineIdInput.value = "";
        selectedPigWrap.classList.add("hidden");
        selectedPigWrap.innerHTML = "";
        openPigPickerBtn?.classList.remove("hidden");
      });
    }

    closePigPicker();
  }

  /* =========================================================
     Module: Title and Tabs
  ========================================================= */
  function setModuleTitle(mode) {
    if (!moduleTitleMain || !moduleTitleSub) return;
    if (mode === "create") {
      moduleTitleMain.textContent = "REPORT - CREATE HEAT REPORT";
      moduleTitleSub.textContent = "Submit signs of heat and evidence for review";
    } else {
      moduleTitleMain.textContent = "REPORT - HEAT MONITORING";
      moduleTitleSub.textContent = "Track breeding cycle & pregnancy progress";
    }
  }

  function setActiveTab(mode) {
    logsTabBtn?.classList.toggle("active", mode === "logs");
    createTabBtn?.classList.toggle("active", mode === "create");
    createTabBtn?.classList.toggle("outline", mode === "logs");
    logsTabBtn?.classList.toggle("outline", mode === "create");

    logsSection?.classList.toggle("hidden", mode !== "logs");
    createSection?.classList.toggle("hidden", mode !== "create");

    setModuleTitle(mode);
  }

  function isLogsActive() {
    return !logsSection?.classList.contains("hidden");
  }

  function getActiveApprovalTab() {
    const active = document.querySelector(".status-tab.active");
    const raw = active?.dataset?.approval ?? active?.dataset?.status ?? "";
    return String(raw || "").trim().toLowerCase();
  }

  logsTabBtn?.addEventListener("click", () => setActiveTab("logs"));
  createTabBtn?.addEventListener("click", () => setActiveTab("create"));
  setActiveTab("logs");

  statusTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      statusTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      if (!isLogsActive()) return;
      currentPage = 1;
      applyFiltersAndRender();
    });
  });

  /* =========================================================
     Module: Logs Filtering
  ========================================================= */
  function normalizeStage(raw) {
    const s = String(raw || "").toLowerCase().trim().replace(/\s+/g, "_");

    if (s === "inheat") return "in_heat";
    if (s === "underobservation") return "under_observation";
    if (s === "farrowing_ready") return "farrowing";
    if (s === "farrowing") return "farrowing";

    const allowed = new Set(["open", "in_heat", "under_observation", "pregnant", "farrowing", "lactating"]);
    return allowed.has(s) ? s : "";
  }

  const APPROVAL_SET = new Set(["pending", "approved", "rejected", "ongoing", "completed"]);

  function normalizeApprovalFilter(v) {
    const s = String(v || "").trim().toLowerCase();
    return APPROVAL_SET.has(s) ? s : "";
  }

  function getBestDecisionDate(report) {
    const reviewedAt =
      report?.reviewedAt ||
      report?.reviewed_at ||
      report?.updatedAt ||
      report?.updated_at ||
      report?.createdAt;

    const d = reviewedAt ? new Date(reviewedAt) : null;
    return d && !isNaN(d.getTime()) ? d : null;
  }

  function isRejectedStillVisible(report) {
    const approval = normalizeApprovalStatus(report?.status);
    if (approval !== "rejected") return false;

    const d = getBestDecisionDate(report);
    if (!d) return true;

    const hours = (Date.now() - d.getTime()) / (1000 * 60 * 60);
    return hours < 24;
  }

  function shouldGoArchive(report) {
    const approval = normalizeApprovalStatus(report?.status);

    if (approval === "completed") return true;

    if (approval === "rejected") {
      return !isRejectedStillVisible(report);
    }

    return false;
  }

  function passesFilters(report) {
    const swineDisplay = report.swine_id?.swine_id || "Unknown";

    const tagVal = (tagSearchInput?.value || "").trim().toLowerCase();
    if (tagVal && !swineDisplay.toLowerCase().includes(tagVal)) return false;

    const approvalRaw = normalizeApprovalStatus(report?.status);

    const tabApproval = getActiveApprovalTab();
    if (tabApproval && tabApproval !== "all" && approvalRaw !== tabApproval) return false;

    const dropdownVal = (statusFilter?.value || "").trim();
    const dropdownApproval = normalizeApprovalFilter(dropdownVal);

    if (dropdownApproval) {
      if (approvalRaw !== dropdownApproval) return false;
    } else if (dropdownVal) {
      const stageRaw = normalizeStage(report.swine_id?.current_status || "");
      if (stageRaw !== dropdownVal) return false;
    }

    return true;
  }

  function applyFiltersAndRender() {
    filteredReports = activeReports.filter(passesFilters);

    const totalPages = Math.max(1, Math.ceil(filteredReports.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;

    renderReportsPage();
    renderPagination();
    updateCountdowns();
  }

  function renderPagination() {
    if (!paginationEl) return;

    const total = filteredReports.length;

    if (total === 0) {
      paginationEl.innerHTML = "";
      return;
    }

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;

    paginationEl.innerHTML = `
      <button class="page-btn" id="prevPageBtn" ${currentPage === 1 ? "disabled" : ""}>
        <i class="bi bi-chevron-left"></i>
      </button>
      <span class="page-info">Page ${currentPage} / ${totalPages}</span>
      <button class="page-btn" id="nextPageBtn" ${currentPage === totalPages ? "disabled" : ""}>
        <i class="bi bi-chevron-right"></i>
      </button>
    `;

    paginationEl.querySelector("#prevPageBtn")?.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage--;
        renderReportsPage();
        renderPagination();
        updateCountdowns();
      }
    });

    paginationEl.querySelector("#nextPageBtn")?.addEventListener("click", () => {
      if (currentPage < totalPages) {
        currentPage++;
        renderReportsPage();
        renderPagination();
        updateCountdowns();
      }
    });
  }

  /* =========================================================
     Module: Reports List Rendering and Event Wiring
  ========================================================= */
  function renderReportsPage() {
    if (!reportsTableBody) return;

    if (!filteredReports.length) {
      reportsTableBody.innerHTML = `<div class="empty-state">No reports found</div>`;
      if (paginationEl) paginationEl.innerHTML = "";
      return;
    }

    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filteredReports.slice(start, start + PAGE_SIZE);

    reportsTableBody.innerHTML = pageItems.map((r) => renderReportCard(r)).join("");

    reportsTableBody.querySelectorAll("[data-action='view']").forEach((btn) => {
      btn.addEventListener("click", () => viewEvidence(btn.dataset.id));
    });

    reportsTableBody.querySelectorAll("[data-action='track']").forEach((btn) => {
      btn.addEventListener("click", () => openTrackProgress(btn.dataset.id, btn.dataset.swine));
    });

    reportsTableBody.querySelectorAll("[data-action='confirm-preg']").forEach((btn) => {
      btn.addEventListener("click", () => {
        const report = activeReports.find((r) => r._id === btn.dataset.id);
        openActionConfirmation(report, "confirm_pregnancy");
      });
    });

    reportsTableBody.querySelectorAll("[data-action='confirm-farrow']").forEach((btn) => {
      btn.addEventListener("click", () => {
        const report = activeReports.find((r) => r._id === btn.dataset.id);
        openActionConfirmation(report, "confirm_farrowing");
      });
    });
  }

  /* =========================================================
     Module: Report Card Renderer
  ========================================================= */
  function renderReportCard(r) {
    const swineDisplay = r.swine_id?.swine_id || "Unknown";

    const approvalRaw = normalizeApprovalStatus(r.status);
    const approvalLabel = labelApprovalStatus(approvalRaw);

    const productionLabel = reportStageLabelFromStatus(r.status);
    const countdownTarget = computeNextCheckDate(r);

    const createdDate = r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "-";

    const prodKey = (productionLabel || "").toLowerCase();
    let prodIcon = "bi-activity";
    if (prodKey.includes("pending")) prodIcon = "bi-hourglass-split";
    else if (prodKey.includes("scheduled") || prodKey.includes("ai")) prodIcon = "bi-calendar2-check";
    else if (prodKey.includes("observation")) prodIcon = "bi-eye";
    else if (prodKey.includes("preg")) prodIcon = "bi-clipboard2-check";
    else if (prodKey.includes("farrow")) prodIcon = "bi-calendar2-heart";
    else if (prodKey.includes("lact")) prodIcon = "bi-droplet";
    else if (prodKey.includes("complete")) prodIcon = "bi-flag";

    let approvalIcon = "bi-hourglass-split";
    if (approvalRaw === "approved") approvalIcon = "bi-check2-circle";
    if (approvalRaw === "rejected") approvalIcon = "bi-x-circle";
    if (approvalRaw === "ongoing") approvalIcon = "bi-arrow-repeat";
    if (approvalRaw === "completed") approvalIcon = "bi-flag-fill";


    return `
      <div class="report-item" data-status="${approvalRaw}" data-swine="${swineDisplay}">
        <div class="report-card">

          <div class="report-status-pill ${approvalRaw}">
            <i class="bi ${approvalIcon}"></i>
            ${approvalLabel}
          </div>

          <div class="report-main">

            <div class="report-top">
              <div class="report-avatar">
                <div class="avatar-placeholder" aria-hidden="true">
                  <i class="bi bi-piggy-bank"></i>
                </div>
              </div>

              <div class="report-title">
                <h3 title="${swineDisplay}">${swineDisplay}</h3>

                <div class="report-meta">
                  <span class="meta-chip" title="Date submitted">
                    <i class="bi bi-calendar3"></i>
                    ${createdDate}
                  </span>

                  <span class="meta-chip" title="Current stage">
                    <i class="bi ${prodIcon}"></i>
                    ${productionLabel}
                  </span>
                </div>
              </div>
            </div>

            <div class="report-progress-panel">
              <div class="progress-row">
                <div class="progress-label">
                  <i class="bi bi-flag"></i>
                  Next check
                </div>

                <div class="countdown" data-date="${countdownTarget}">
                  <i class="bi bi-hourglass"></i>
                  ${formatCountdown(countdownTarget) || "—"}
                </div>
              </div>

              <div class="progress-row">
                <div class="progress-label">
                  <i class="bi bi-info-circle"></i>
                  Current stage
                </div>
                <div class="progress-value">${productionLabel}</div>
              </div>
            </div>

            <div class="report-actions">
              <button class="btn-soft btn-sm" type="button" data-action="view" data-id="${r._id}">
                <i class="bi bi-eye"></i> View Details
              </button>

              <button
                class="btn-primary btn-sm"
                type="button"
                data-action="track"
                data-id="${r._id}"
                data-swine="${swineDisplay}"
                title="Track progress"
              >
                <i class="bi bi-graph-up-arrow"></i> Track Progress
              </button>

              ${canShowConfirmPregnant(r)
                ? `<button class="btn-primary btn-sm" type="button" data-action="confirm-preg" data-id="${r._id}">
                    <i class="bi bi-patch-check"></i> Confirm Preg
                  </button>`
                : ""}

              ${(normStatus(r.status) === "pregnant" && isDue(r.expected_farrowing))
                ? `<button class="btn-primary btn-sm" type="button" data-action="confirm-farrow" data-id="${r._id}">
                    <i class="bi bi-calendar2-heart"></i> Confirm Farrow
                  </button>`
                : ""}
            </div>

          </div>
        </div>
      </div>
    `;
  }

  /* =========================================================
     Module: Archive Modal
  ========================================================= */
  function openArchiveModal() {
    if (!archiveModal) return;
    archiveModal.classList.remove("hidden");
    archiveModal.setAttribute("aria-hidden", "false");
    ensureBodyModalState();

    archivePage = 1;
    applyArchiveFiltersAndRender();
  }

  function closeArchiveModal() {
    if (!archiveModal) return;
    archiveModal.classList.add("hidden");
    archiveModal.setAttribute("aria-hidden", "true");
    ensureBodyModalState();
  }

  /* =========================================================
     Module: Time Warp Action Renderer
  ========================================================= */
  function openActionConfirmation(report, type) {
    if (!actionModal || !actionFormBody) return;

    let html = "";
    const today = new Date().toISOString().split("T")[0];

    if (type === "confirm_ai") {
      actionModalTitle.textContent = "Confirm AI Service";
      html = `
        <div class="form-group mb-3">
          <label class="form-label">Service Date (Time Warp)</label>
          <input type="date" name="event_date" class="form-control" value="${today}" required>
          <small class="text-muted">When did the AI actually happen?</small>
        </div>
        <div class="form-group mb-3">
          <label class="form-label">Boar/Sire ID (Optional)</label>
          <input type="text" name="sire_id" class="form-control" placeholder="Enter Boar ID">
        </div>`;
    } else if (type === "confirm_pregnancy") {
      actionModalTitle.textContent = "Confirm Pregnancy";
      html = `
        <div class="form-group mb-3">
          <label class="form-label">Check Date</label>
          <input type="date" name="event_date" class="form-control" value="${today}" required>
        </div>`;
    } else if (type === "confirm_farrowing") {
      actionModalTitle.textContent = "Confirm Farrowing";
      html = `
        <div class="form-group mb-3">
          <label class="form-label">Farrowing Date</label>
          <input type="date" name="event_date" class="form-control" value="${today}" required>
        </div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 15px;">
           <div class="form-group">
            <label class="form-label">Live Piglets</label>
            <input type="number" name="total_live" class="form-control" min="1" value="1" required>
          </div>
          <div class="form-group">
            <label class="form-label">Mortality</label>
            <input type="number" name="mortality" class="form-control" min="0" value="0">
          </div>
        </div>`;
    }

    actionFormBody.innerHTML = html;
    actionForm.dataset.reportId = report._id;
    actionForm.dataset.actionType = type;

    actionModal.classList.remove("hidden");
    ensureBodyModalState();
  }

  function escArchiveOnce(e) {
    if (e.key === "Escape") closeArchiveModal();
  }

  openArchiveBtn?.addEventListener("click", () => openArchiveModal());
  archiveCloseBtn?.addEventListener("click", () => closeArchiveModal());

  archiveModal?.addEventListener("click", (e) => {
    if (e.target?.id === "archiveModal") closeArchiveModal();
  });

  document.addEventListener("keydown", (e) => {
    if (archiveModal && !archiveModal.classList.contains("hidden")) escArchiveOnce(e);
  });

  function archivePassesFilters(report) {
    const swineDisplay = report.swine_id?.swine_id || "Unknown";
    const approvalRaw = normalizeApprovalStatus(report.status);

    if (!(approvalRaw === "completed" || approvalRaw === "rejected")) return false;

    const q = (archiveSearchInput?.value || "").trim().toLowerCase();
    if (q && !swineDisplay.toLowerCase().includes(q)) return false;

    const st = (archiveStatusFilter?.value || "").trim();
    if (st && approvalRaw !== st) return false;

    return true;
  }

  function applyArchiveFiltersAndRender() {
    filteredArchive = archiveReports.filter(archivePassesFilters);

    const totalPages = Math.max(1, Math.ceil(filteredArchive.length / PAGE_SIZE));
    if (archivePage > totalPages) archivePage = totalPages;

    renderArchivePage();
    renderArchivePagination();
    updateCountdowns(archiveReportsBody || document);
  }

  function renderArchivePage() {
    if (!archiveReportsBody) return;

    if (!filteredArchive.length) {
      archiveReportsBody.innerHTML = `<div class="empty-state">No archived reports found</div>`;
      if (archivePaginationEl) archivePaginationEl.innerHTML = "";
      return;
    }

    const start = (archivePage - 1) * PAGE_SIZE;
    const pageItems = filteredArchive.slice(start, start + PAGE_SIZE);

    archiveReportsBody.innerHTML = pageItems.map((r) => renderReportCard(r)).join("");

    archiveReportsBody.querySelectorAll("[data-action='view']").forEach((btn) => {
      btn.addEventListener("click", () => viewEvidence(btn.dataset.id));
    });

    archiveReportsBody.querySelectorAll("[data-action='track']").forEach((btn) => {
      btn.addEventListener("click", () => openTrackProgress(btn.dataset.id, btn.dataset.swine));
    });
  }

  function renderArchivePagination() {
    if (!archivePaginationEl) return;

    const total = filteredArchive.length;

    if (total === 0) {
      archivePaginationEl.innerHTML = "";
      return;
    }

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    if (archivePage < 1) archivePage = 1;
    if (archivePage > totalPages) archivePage = totalPages;

    archivePaginationEl.innerHTML = `
      <button class="page-btn" id="archivePrevBtn" ${archivePage === 1 ? "disabled" : ""}>
        <i class="bi bi-chevron-left"></i>
      </button>
      <span class="page-info">Page ${archivePage} / ${totalPages}</span>
      <button class="page-btn" id="archiveNextBtn" ${archivePage === totalPages ? "disabled" : ""}>
        <i class="bi bi-chevron-right"></i>
      </button>
    `;

    archivePaginationEl.querySelector("#archivePrevBtn")?.addEventListener("click", () => {
      if (archivePage > 1) {
        archivePage--;
        renderArchivePage();
        renderArchivePagination();
        updateCountdowns(archiveReportsBody || document);
      }
    });

    archivePaginationEl.querySelector("#archiveNextBtn")?.addEventListener("click", () => {
      if (archivePage < totalPages) {
        archivePage++;
        renderArchivePage();
        renderArchivePagination();
        updateCountdowns(archiveReportsBody || document);
      }
    });
  }

  archiveApplyBtn?.addEventListener("click", () => {
    archivePage = 1;
    applyArchiveFiltersAndRender();
  });

  archiveResetBtn?.addEventListener("click", () => {
    if (archiveSearchInput) archiveSearchInput.value = "";
    if (archiveStatusFilter) archiveStatusFilter.value = "";
    archivePage = 1;
    applyArchiveFiltersAndRender();
  });

  archiveSearchInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      archivePage = 1;
      applyArchiveFiltersAndRender();
    }
  });

  function bringAboveArchive(modalEl) {
    if (!modalEl) return;
    if (archiveModal) archiveModal.style.zIndex = "1050";
    modalEl.style.zIndex = "1060";
  }

  /* =========================================================
     Module: Evidence Modal and Lightbox
  ========================================================= */
  function openReportModal() {
    const modal = document.getElementById("reportModal");
    if (!modal) return;

    bringAboveArchive(modal);

    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    ensureBodyModalState();

    modal?.querySelector(".close-modal")?.addEventListener("click", closeReportModal);
    modal?.addEventListener("click", (e) => {
      if (e.target?.id === "reportModal") closeReportModal();
    });

    document.addEventListener("keydown", escCloseOnce);
  }

  function escCloseOnce(e) {
    if (e.key === "Escape") closeReportModal();
  }

  function closeReportModal() {
    const modal = document.getElementById("reportModal");
    modal?.classList.add("hidden");
    modal?.setAttribute("aria-hidden", "true");

    document.removeEventListener("keydown", escCloseOnce);
    ensureBodyModalState();
  }

  function safeImg(src, fallback) {
    return `<img src="${src}" alt="Pig profile" onerror="this.onerror=null;this.src='${fallback}'" />`;
  }

  function buildEvidenceGallery(evidenceUrls = []) {
    if (!Array.isArray(evidenceUrls) || evidenceUrls.length === 0) {
      return `<div class="empty-mini">No evidence uploaded.</div>`;
    }

    return `
      <div class="evidence-grid">
        ${evidenceUrls
          .map((url) => {
            const src = url.startsWith("data:") || url.startsWith("http") ? url : `${BACKEND_URL}${url}`;
            const isVideo = /\.(mp4|mov|webm)$/i.test(url);

            return isVideo
              ? `<div class="evidence-item" data-type="video" data-src="${src}" role="button" tabindex="0">
                <video src="${src}" muted></video>
              </div>`
              : `<div class="evidence-item" data-type="image" data-src="${src}" role="button" tabindex="0">
                <img src="${src}" alt="Evidence" loading="lazy" />
              </div>`;
          })
          .join("")}
      </div>
    `;
  }

  const evidenceLightbox = document.getElementById("evidenceLightbox");
  const evidenceLightboxBody = document.getElementById("evidenceLightboxBody");
  const evidenceLightboxClose = document.getElementById("evidenceLightboxClose");

  /* =========================================================
     Module: Evidence Lightbox Zoom and Pan
  ========================================================= */
  let lbScale = 1;
  let lbMinScale = 1;
  let lbMaxScale = 4;
  let lbTx = 0;
  let lbTy = 0;

  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let panBaseX = 0;
  let panBaseY = 0;

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function applyTransform(targetEl) {
    if (!targetEl) return;
    targetEl.style.transform = `translate(${lbTx}px, ${lbTy}px) scale(${lbScale})`;
  }

  function resetTransform(targetEl) {
    lbScale = 1;
    lbTx = 0;
    lbTy = 0;
    applyTransform(targetEl);
  }

  function zoomTo(targetEl, nextScale, originEvent = null) {
    if (!targetEl) return;

    const prevScale = lbScale;
    lbScale = clamp(nextScale, lbMinScale, lbMaxScale);

    if (originEvent && originEvent.clientX != null && originEvent.clientY != null) {
      const rect = targetEl.getBoundingClientRect();
      const cx = originEvent.clientX - rect.left - rect.width / 2;
      const cy = originEvent.clientY - rect.top - rect.height / 2;

      const k = lbScale / prevScale;
      lbTx = lbTx * k + cx * (k - 1);
      lbTy = lbTy * k + cy * (k - 1);
    }

    applyTransform(targetEl);
  }

  function buildLightboxControls() {
    return `
      <div class="lb-zoom-controls" id="lbZoomControls">
        <button type="button" class="lb-zoom-btn" id="lbZoomOut" aria-label="Zoom out">
          <i class="bi bi-dash-lg"></i>
        </button>
        <button type="button" class="lb-zoom-btn" id="lbZoomIn" aria-label="Zoom in">
          <i class="bi bi-plus-lg"></i>
        </button>
        <button type="button" class="lb-zoom-btn" id="lbZoomReset" aria-label="Reset zoom">
          <i class="bi bi-arrow-counterclockwise"></i>
        </button>
        <button type="button" class="lb-zoom-btn" id="lbZoomFit" aria-label="Fit to screen">
          <i class="bi bi-aspect-ratio"></i>
        </button>
      </div>
    `;
  }

  function fitToScreen(targetEl) {
    resetTransform(targetEl);
  }

  function wireLightboxInteractions(targetEl, type) {
    if (!evidenceLightbox || !evidenceLightboxBody) return;

    const allowZoom = type !== "video";

    const zoomInBtn = document.getElementById("lbZoomIn");
    const zoomOutBtn = document.getElementById("lbZoomOut");
    const zoomResetBtn = document.getElementById("lbZoomReset");
    const zoomFitBtn = document.getElementById("lbZoomFit");

    if (zoomInBtn) zoomInBtn.onclick = () => allowZoom && zoomTo(targetEl, lbScale + 0.25);
    if (zoomOutBtn) zoomOutBtn.onclick = () => allowZoom && zoomTo(targetEl, lbScale - 0.25);
    if (zoomResetBtn) zoomResetBtn.onclick = () => allowZoom && resetTransform(targetEl);
    if (zoomFitBtn) zoomFitBtn.onclick = () => allowZoom && fitToScreen(targetEl);

    evidenceLightboxBody.onwheel = (e) => {
      if (!allowZoom) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.15 : 0.15;
      zoomTo(targetEl, lbScale + delta, e);
    };

    const onDown = (clientX, clientY) => {
      if (!allowZoom) return;
      if (lbScale <= 1.01) return;
      isPanning = true;
      panStartX = clientX;
      panStartY = clientY;
      panBaseX = lbTx;
      panBaseY = lbTy;
      evidenceLightboxBody.classList.add("panning");
    };

    const onMove = (clientX, clientY) => {
      if (!allowZoom) return;
      if (!isPanning) return;
      const dx = clientX - panStartX;
      const dy = clientY - panStartY;
      lbTx = panBaseX + dx;
      lbTy = panBaseY + dy;
      applyTransform(targetEl);
    };

    const onUp = () => {
      isPanning = false;
      evidenceLightboxBody.classList.remove("panning");
    };

    evidenceLightboxBody.onmousedown = (e) => {
      if (e.target && e.target.closest && e.target.closest(".lb-zoom-controls")) return;
      onDown(e.clientX, e.clientY);
    };

    window.addEventListener("mousemove", (e) => onMove(e.clientX, e.clientY));
    window.addEventListener("mouseup", onUp);

    let lastTap = 0;
    evidenceLightboxBody.ontouchstart = (e) => {
      if (!allowZoom) return;
      if (!e.touches || e.touches.length !== 1) return;

      const now = Date.now();
      if (now - lastTap < 260) {
        resetTransform(targetEl);
        lastTap = 0;
        return;
      }
      lastTap = now;

      const t = e.touches[0];
      onDown(t.clientX, t.clientY);
    };

    evidenceLightboxBody.ontouchmove = (e) => {
      if (!allowZoom) return;
      if (!e.touches || e.touches.length !== 1) return;
      const t = e.touches[0];
      onMove(t.clientX, t.clientY);
    };

    evidenceLightboxBody.ontouchend = () => onUp();
  }

  function openEvidenceLightbox({ src, type }) {
    if (!evidenceLightbox || !evidenceLightboxBody) return;

    evidenceLightboxBody.innerHTML = "";

    lbMinScale = 1;
    lbMaxScale = 4;
    lbScale = 1;
    lbTx = 0;
    lbTy = 0;

    evidenceLightboxBody.insertAdjacentHTML("beforeend", buildLightboxControls());

    let targetEl = null;

    if (type === "video") {
      const v = document.createElement("video");
      v.src = src;
      v.controls = true;
      v.autoplay = true;
      v.className = "lb-media";
      evidenceLightboxBody.appendChild(v);
      targetEl = v;
    } else {
      const img = document.createElement("img");
      img.src = src;
      img.alt = "Evidence preview";
      img.className = "lb-media";
      evidenceLightboxBody.appendChild(img);
      targetEl = img;
    }

    applyTransform(targetEl);
    wireLightboxInteractions(targetEl, type);

    evidenceLightbox.classList.add("show");
    evidenceLightbox.setAttribute("aria-hidden", "false");
  }

  function closeEvidenceLightbox() {
    if (!evidenceLightbox || !evidenceLightboxBody) return;

    evidenceLightbox.classList.remove("show");
    evidenceLightbox.setAttribute("aria-hidden", "true");

    evidenceLightboxBody.onwheel = null;
    evidenceLightboxBody.onmousedown = null;
    evidenceLightboxBody.ontouchstart = null;
    evidenceLightboxBody.ontouchmove = null;
    evidenceLightboxBody.ontouchend = null;

    evidenceLightboxBody.innerHTML = "";
  }

  evidenceLightboxClose?.addEventListener("click", closeEvidenceLightbox);
  evidenceLightbox?.addEventListener("click", (e) => {
    if (e.target?.id === "evidenceLightbox") closeEvidenceLightbox();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && evidenceLightbox?.classList.contains("show")) closeEvidenceLightbox();
  });

  /* =========================================================
     Module: Legacy Compatibility (Not used)
  ========================================================= */
  function shouldShowBackInHeat(swineStatus, approvalStatus) {
    const s = (swineStatus || "").toLowerCase();
    if (approvalStatus === "rejected") return false;
    if (s.includes("farrow") || s.includes("lact")) return false;
    return true;
  }
  function shouldShowConfirmPregnant(swineStatus, approvalStatus) {
    const s = (swineStatus || "").toLowerCase();
    if (approvalStatus === "rejected") return false;
    if (s.includes("preg") || s.includes("farrow") || s.includes("lact")) return false;
    return true;
  }
  function shouldShowConfirmWeaning(swineStatus, approvalStatus) {
    const s = (swineStatus || "").toLowerCase();
    if (approvalStatus === "rejected") return false;
    return s.includes("lact");
  }

  /* =========================================================
     Module: Report Details Viewer
  ========================================================= */
  async function viewEvidence(reportId) {
    try {
      const modalBody = document.getElementById("modalBody");
      if (!modalBody) return;

      modalBody.innerHTML = `<div class="empty-state">Loading details...</div>`;
      openReportModal();

      const data = await api.fetchReportDetail(reportId);
      if (!data?.success || !data.report) {
        modalBody.innerHTML = `<div class="empty-state">Could not load report details.</div>`;
        return;
      }

      const report = data.report;

      const swineTag = report.swine_id?.swine_id || "Unknown";
      const createdDate = report.createdAt ? new Date(report.createdAt).toLocaleString() : "-";

      const stageLabel = reportStageLabelFromStatus(report.status);

      const nextCheckDate = computeNextCheckDate(report);
      const nextCheckText = nextCheckDate ? formatCountdown(nextCheckDate) : "—";

      const approvalRaw = normalizeApprovalStatus(report.status);
      const approvalLabel = labelApprovalStatus(approvalRaw);

      const pigImg =
        report.swine_id?.profile_image ||
        report.swine_id?.image_url ||
        report.swine_id?.photo ||
        "/images/default-pig.png";

      const signs = Array.isArray(report.signs) ? report.signs : [];
      const signsHtml = signs.length
        ? `<div class="chips-wrap">
            ${signs.map((s) => `<span class="detail-chip"><i class="bi bi-check2"></i>${s}</span>`).join("")}
          </div>`
        : `<div class="empty-mini">No signs recorded.</div>`;

      const evidenceHtml = buildEvidenceGallery(report.evidence_url || []);

      const remarksText = (report?.remarks ?? report?.remark ?? report?.notes ?? report?.note ?? "")
        .toString()
        .trim();

      const remarksHtml = remarksText
        ? `<div class="remarks-box">${remarksText.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>`
        : `<div class="empty-mini">No remarks provided.</div>`;

      const showBackInHeat = canShowBackInHeat(report);
      const showConfirmPreg = canShowConfirmPregnant(report);
      const showConfirmWean = canShowConfirmWeaning(report);

      modalBody.innerHTML = `
        <div class="details-wrap">

          <div class="details-header">
            <div class="details-avatar">
              ${safeImg(pigImg, "/images/default-pig.png")}
            </div>

            <div class="details-head-text">
              <div class="tag-row">
                <h4 class="pig-tag" title="${swineTag}">
                  <i class="bi bi-tag"></i> ${swineTag}
                </h4>

                <span class="status-pill ${approvalRaw}">
                  <i class="bi ${
                    approvalRaw === "approved"
                      ? "bi-check2-circle"
                      : approvalRaw === "rejected"
                        ? "bi-x-circle"
                        : approvalRaw === "ongoing"
                          ? "bi-arrow-repeat"
                          : approvalRaw === "completed"
                            ? "bi-flag-fill"
                            : "bi-hourglass-split"
                  }"></i>
                  ${approvalLabel}
                </span>
              </div>

              <div class="meta-row">
                <span class="meta-chip">
                  <i class="bi bi-calendar3"></i>
                  ${createdDate}
                </span>

                <span class="meta-chip">
                  <i class="bi bi-flag"></i>
                  ${stageLabel}
                </span>
              </div>
            </div>
          </div>

          <div class="details-panels">
            <div class="info-card">
              <div class="info-label"><i class="bi bi-hourglass-split"></i> Next check</div>
              <div class="info-value">${nextCheckText}</div>
              ${nextCheckDate ? `<div class="info-sub">Target: ${new Date(nextCheckDate).toLocaleDateString()}</div>` : ``}
            </div>

            <div class="info-card">
              <div class="info-label"><i class="bi bi-flag"></i> Current stage</div>
              <div class="info-value">${stageLabel}</div>
              <div class="info-sub">Based on report lifecycle</div>
            </div>
          </div>

          <div class="details-block">
            <div class="block-title">
              <i class="bi bi-clipboard2-pulse"></i> Observed signs
            </div>
            ${signsHtml}
          </div>

          <div class="details-block">
            <div class="block-title">
              <i class="bi bi-chat-left-text"></i> Remarks
            </div>
            ${remarksHtml}
          </div>

          <div class="details-block">
            <div class="block-title">
              <i class="bi bi-images"></i> Evidence
              <span class="evidence-hint"><i class="bi bi-arrows-fullscreen"></i> Tap to view</span>
            </div>
            ${evidenceHtml}
          </div>

          <div class="details-actions">
            ${
              showBackInHeat
                ? `
              <button class="btn-soft" type="button" id="btnBackInHeat">
                <i class="bi bi-arrow-counterclockwise"></i>
                Back in Heat
              </button>
            `
                : ``
            }

            ${
              showConfirmPreg
                ? `
              <button class="btn-primary" type="button" id="btnConfirmPreg">
                <i class="bi bi-patch-check"></i>
                Confirm Pregnant
              </button>
            `
                : ``
            }

            ${
              showConfirmWean
                ? `
              <button class="btn-primary" type="button" id="btnConfirmWean">
                <i class="bi bi-scissors"></i>
                Confirm Weaning
              </button>
            `
                : ``
            }

            <button class="btn-soft" type="button" id="btnCloseDetails">
              <i class="bi bi-x-circle"></i>
              Close
            </button>
          </div>

        </div>
      `;

      modalBody.querySelectorAll(".evidence-item").forEach((item) => {
        const open = () => {
          const src = item.dataset.src;
          const type = item.dataset.type;
          if (src) openEvidenceLightbox({ src, type });
        };
        item.addEventListener("click", open);
        item.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") open();
        });
      });

      modalBody.querySelector("#btnCloseDetails")?.addEventListener("click", closeReportModal);

      modalBody.querySelector("#btnBackInHeat")?.addEventListener("click", async () => {
        const ok = await uiConfirm(`Is ${swineTag} in heat again?`, { title: "Confirm action", variant: "warning" });
        if (!ok) return;

        const res = await api.stillHeat(report._id);

        if (res?.ok) {
          uiAlert("Cycle reset for re-insemination.", { title: "Success", variant: "success" });
          await api.sendAdminNotification(
            "Sow Back in Heat",
            `Farmer ${user.first_name} reported ${swineTag} back in heat.`,
            "warning"
          );
          await reloadAll();
          await viewEvidence(reportId);
        } else if (res) {
          let msg = "Failed to update cycle.";
          try {
            const ct = res.headers.get("content-type") || "";
            if (ct.includes("application/json")) {
              const errData = await res.json();
              msg = errData?.message || msg;
            } else {
              await res.text();
              msg = "Failed to update cycle (server returned non-JSON response).";
            }
          } catch (_) {}
          uiAlert(msg, { title: "Error", variant: "danger" });
        }
      });

      modalBody.querySelector("#btnConfirmPreg")?.addEventListener("click", async () => {
        const ok = await uiConfirm(`Confirm pregnancy for ${swineTag}?`, { title: "Confirm action", variant: "warning" });
        if (!ok) return;

        const res = await api.confirmPregnancy(report._id);

        if (res?.ok) {
          uiAlert("Pregnancy confirmed!", { title: "Success", variant: "success" });
          await api.sendAdminNotification(
            "Pregnancy Confirmed",
            `${swineTag} confirmed pregnant by ${user.first_name}.`,
            "success"
          );
          await reloadAll();
          await viewEvidence(reportId);
        } else if (res) {
          let msg = "Failed to confirm pregnancy.";
          try {
            const ct = res.headers.get("content-type") || "";
            if (ct.includes("application/json")) {
              const errData = await res.json();
              msg = errData?.message || msg;
            } else {
              await res.text();
              msg = "Failed to confirm pregnancy (server returned non-JSON response).";
            }
          } catch (_) {}
          uiAlert(msg, { title: "Error", variant: "danger" });
        }
      });

      modalBody.querySelector("#btnConfirmWean")?.addEventListener("click", async () => {
        const ok = await uiConfirm(
          `Confirm weaning for ${swineTag}? This will move the sow back to "Open".`,
          { title: "Confirm action", variant: "warning" }
        );
        if (!ok) return;

        const res = await api.confirmWeaning(report._id);

        if (res?.ok) {
          uiAlert("Weaning confirmed! The sow is now back to Open status.", { title: "Success", variant: "success" });
          await api.sendAdminNotification("Sow Weaned", `${swineTag} has been weaned by ${user.first_name}.`, "info");
          await reloadAll();
          await viewEvidence(reportId);
        } else if (res) {
          let msg = "Failed to wean.";
          try {
            const ct = res.headers.get("content-type") || "";
            if (ct.includes("application/json")) {
              const errData = await res.json();
              msg = errData?.message || msg;
            } else {
              await res.text();
              msg = "Failed to wean (server returned non-JSON response).";
            }
          } catch (_) {}
          uiAlert(msg, { title: "Error", variant: "danger" });
        }
      });
    } catch (err) {
      console.error(err);
      const modalBody = document.getElementById("modalBody");
      if (modalBody) modalBody.innerHTML = `<div class="empty-state">Something went wrong loading details.</div>`;
      uiAlert(err?.message || "Something went wrong loading details.", { title: "Error", variant: "danger" });
    }
  }

  /* =========================================================
     Module: Track Progress
  ========================================================= */
  async function openTrackProgress(reportId, swineId) {
    const trackModal = document.getElementById("trackModal");
    const trackBody = document.getElementById("trackBody");
    const farmerLine = document.getElementById("trackFarmerLine");
    const swineEl = document.getElementById("trackSwineId");
    const stageEl = document.getElementById("trackCurrentStage");
    const remainEl = document.getElementById("trackTimeRemaining");
    const statePill = document.getElementById("trackStatePill");

    if (!trackModal || !trackBody) return;

    trackModal.classList.remove("hidden");
    trackModal.setAttribute("aria-hidden", "false");
    ensureBodyModalState();

    if (farmerLine) farmerLine.textContent = `Farmer: ${user?.first_name || "—"} ${user?.last_name || ""}`.trim();
    if (swineEl) swineEl.textContent = swineId || "—";

    trackBody.innerHTML = `<div class="empty-state">Loading progress...</div>`;
    if (stageEl) stageEl.textContent = "—";
    if (remainEl) remainEl.textContent = "—";
    if (statePill) statePill.textContent = "Active";

    try {
      const data = await api.fetchReportDetail(reportId);
      if (!data?.success || !data.report) {
        trackBody.innerHTML = `<div class="empty-state">Could not load progress.</div>`;
        return;
      }

      const report = data.report;

      const statusLabel = reportStageLabelFromStatus(report.status).toUpperCase();
      if (stageEl) stageEl.textContent = statusLabel;

      const due = computeNextCheckDate(report);
      if (remainEl) remainEl.textContent = due ? formatCountdown(due) : "—";

      const steps = buildTimelineSteps(report);

      trackBody.innerHTML = steps.length
        ? steps
            .map(
              (s, idx) => `
            <div class="tl-row">
              <div class="tl-icon"><i class="bi ${s.icon}"></i></div>
              ${idx < steps.length - 1 ? `<div class="tl-line"></div>` : ``}
              <div class="tl-card">
                <div class="tl-top">
                  <div class="tl-title">${s.title}</div>
                  <div class="tl-badge">recorded</div>
                </div>
                <div class="tl-desc">${s.desc}</div>
                <div class="tl-date">
                  <i class="bi bi-calendar3"></i>
                  ${s.dateText}
                </div>
              </div>
            </div>
          `
            )
            .join("")
        : `<div class="empty-state">No progress records yet.</div>`;
    } catch (err) {
      console.error(err);
      trackBody.innerHTML = `<div class="empty-state">Something went wrong loading progress.</div>`;
      uiAlert(err?.message || "Something went wrong loading progress.", { title: "Error", variant: "danger" });
    }
  }

  /* =========================================================
     Module: Upload UI
  ========================================================= */
  let selectedFiles = [];
  const uploadBtn = document.getElementById("uploadBtn");
  const evidenceInput = document.getElementById("evidence");
  const mediaPreview = document.getElementById("mediaPreview");
  const fileCountBadge = document.getElementById("fileCountBadge");
  const MAX_FILES = 5;

  uploadBtn?.addEventListener("click", () => evidenceInput?.click());

  evidenceInput?.addEventListener("change", () => {
    const newFiles = Array.from(evidenceInput.files || []);
    if (selectedFiles.length + newFiles.length > MAX_FILES) {
      uiAlert(`You can upload a maximum of ${MAX_FILES} files.`, { title: "Upload limit", variant: "warning" });
      evidenceInput.value = "";
      return;
    }
    selectedFiles = [...selectedFiles, ...newFiles];
    renderMediaPreview();
  });

  function syncFileInput() {
    const dataTransfer = new DataTransfer();
    selectedFiles.forEach((file) => dataTransfer.items.add(file));
    if (evidenceInput) evidenceInput.files = dataTransfer.files;
  }

  function renderMediaPreview() {
    if (!mediaPreview) return;
    mediaPreview.innerHTML = "";

    if (selectedFiles.length === 0) {
      if (fileCountBadge) fileCountBadge.style.display = "none";
      return;
    }

    if (fileCountBadge) {
      fileCountBadge.textContent = selectedFiles.length;
      fileCountBadge.style.display = "inline-flex";
    }

    selectedFiles.forEach((file, index) => {
      const wrapper = document.createElement("div");
      wrapper.className = "preview-item";

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "remove-preview-media";
      removeBtn.innerHTML = "×";
      removeBtn.onclick = () => {
        selectedFiles.splice(index, 1);
        syncFileInput();
        renderMediaPreview();
      };

      const mediaUrl = URL.createObjectURL(file);
      const mediaEl = file.type.startsWith("image") ? document.createElement("img") : document.createElement("video");
      mediaEl.src = mediaUrl;

      if (file.type.startsWith("video")) {
        mediaEl.controls = true;
        mediaEl.style.maxHeight = "100px";
        mediaEl.onloadeddata = () => URL.revokeObjectURL(mediaUrl);
      } else {
        mediaEl.onload = () => URL.revokeObjectURL(mediaUrl);
      }

      wrapper.append(removeBtn, mediaEl);
      mediaPreview.appendChild(wrapper);
    });

    syncFileInput();
  }

  /* =========================================================
     Module: Data Loaders
  ========================================================= */
  async function refreshSwineData() {
    const data = await api.fetchFarmerSwine();
    const swineList = data?.swine || [];

    const stats = { open: 0, in_heat: 0, under_observation: 0, pregnant: 0, farrowing: 0, lactating: 0 };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const eligibleSows = swineList.filter((sw) => {
      let status = (sw.current_status || "Open").toLowerCase();
      const farrowDate = sw.expected_farrowing_date || sw.expected_farrowing;

      if (status === "pregnant" && farrowDate) {
        const target = new Date(farrowDate);
        target.setHours(0, 0, 0, 0);
        const diffDays = Math.round((target - today) / (1000 * 60 * 60 * 24));
        if (diffDays <= 7) status = "farrowing";
      }

      if (status === "open") stats.open++;
      else if (status === "in_heat") stats.in_heat++;
      else if (status === "under_observation") stats.under_observation++;
      else if (status === "pregnant") stats.pregnant++;
      else if (status === "farrowing" || status === "farrowing ready") stats.farrowing++;
      else if (status === "lactating") stats.lactating++;

      const isFemale = (sw.sex || sw.swine_sex || "").toLowerCase() === "female";
      return isFemale && status === "open";
    });

    allOpenSows = eligibleSows;
    filteredOpenSows = [...allOpenSows];
    pigPickerPage = 1;
    if (pigPickerList) renderPigPickerPage();

    const setText = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.textContent = v;
    };

    setText("countOpen", stats.open);
    setText("countInHeat", stats.in_heat);
    setText("countObservation", stats.under_observation);
    setText("countPregnant", stats.pregnant);
    setText("countFarrowing", stats.farrowing);
    setText("countLactating", stats.lactating);
  }

  async function loadReports() {
    const data = await api.fetchFarmerReports();

    if (!data?.success || !data.reports?.length) {
      if (reportsTableBody) reportsTableBody.innerHTML = `<div class="empty-state">No reports found</div>`;
      if (paginationEl) paginationEl.innerHTML = "";
      if (archiveReportsBody) archiveReportsBody.innerHTML = `<div class="empty-state">No archived reports found</div>`;
      if (archivePaginationEl) archivePaginationEl.innerHTML = "";
      return;
    }

    allReports = data.reports || [];

    activeReports = allReports.filter((r) => !shouldGoArchive(r));
    archiveReports = allReports.filter((r) => shouldGoArchive(r));

    currentPage = 1;
    applyFiltersAndRender();

    if (archiveModal && !archiveModal.classList.contains("hidden")) {
      archivePage = 1;
      applyArchiveFiltersAndRender();
    }

    updateCountdowns();
  }

  async function reloadAll() {
    await Promise.all([refreshSwineData(), loadReports()]);
  }

  /* =========================================================
     Module: Report Form Submit
  ========================================================= */
  reportForm?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const selectedSigns = Array.from(document.querySelectorAll('input[name="signs"]:checked')).map((cb) => cb.value);
    const chosenSwineId = selectedSwineIdInput?.value || "";
    if (!selectedSigns.length || !chosenSwineId) {
      uiAlert("Please select a pig and signs of heat.", { title: "Missing details", variant: "warning" });
      return;
    }

    submitBtn && (submitBtn.disabled = true);
    if (reportMessage) {
      reportMessage.textContent = "Uploading report and media...";
      reportMessage.style.color = "blue";
    }

    try {
      const res = await api.submitHeatReport({
        swineId: chosenSwineId,
        farmerId: user.id || user._id,
        signs: selectedSigns,
        files: selectedFiles,
        remarks: (remarksInput?.value || "").trim()
      });

      if (!res) throw new Error("No response from server");

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const textError = await res.text();
        console.error("Server returned non-JSON:", textError);
        throw new Error("Server error (Check file size or backend logs)");
      }

      const data = await res.json();

      if (res.ok) {
        if (reportMessage) reportMessage.textContent = "Heat report submitted!";
        await api.sendAdminNotification(
          "New Heat Report",
          `Farmer ${user.first_name} submitted a new report for ${chosenSwineId}.`,
          "info"
        );

        reportForm.reset();
        selectedFiles = [];
        renderMediaPreview();

        if (selectedSwineIdInput) selectedSwineIdInput.value = "";
        if (selectedPigWrap) {
          selectedPigWrap.classList.add("hidden");
          selectedPigWrap.innerHTML = "";
        }
        openPigPickerBtn?.classList.remove("hidden");

        await reloadAll();
      } else {
        uiAlert(data.message || "Error submitting report", { title: "Error", variant: "danger" });
      }
    } catch (err) {
      console.error("Submission Error:", err);
      uiAlert(err.message || "Failed to submit report. Video might be too large.", { title: "Error", variant: "danger" });
    } finally {
      submitBtn && (submitBtn.disabled = false);
    }
  });

  /* =========================================================
     Module: Logs Filter Buttons
  ========================================================= */
  searchBtn?.addEventListener("click", () => {
    if (!isLogsActive()) return;
    currentPage = 1;
    applyFiltersAndRender();
  });

  clearFilterBtn?.addEventListener("click", () => {
    if (tagSearchInput) tagSearchInput.value = "";
    if (statusFilter) statusFilter.value = "";

    statusTabs.forEach((t) => t.classList.remove("active"));
    const first = statusTabs?.[0];
    if (first) first.classList.add("active");

    if (!isLogsActive()) return;
    currentPage = 1;
    applyFiltersAndRender();
  });

  document.getElementById("trackCloseBtn")?.addEventListener("click", () => {
    const modal = document.getElementById("trackModal");
    modal?.classList.add("hidden");
    ensureBodyModalState();
  });

  document.getElementById("trackModal")?.addEventListener("click", (e) => {
    if (e.target?.id === "trackModal") {
      const modal = document.getElementById("trackModal");
      modal?.classList.add("hidden");
      ensureBodyModalState();
    }
  });

  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    localStorage.clear();
    window.location.href = "login.html";
  });

  /* =========================================================
     Module: Public API
  ========================================================= */
  return {
    reloadAll,
    tickCountdowns: () => updateCountdowns(),
    tickReportsReload: () => loadReports()
  };
}