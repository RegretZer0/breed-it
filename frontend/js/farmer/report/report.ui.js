// /js/reports/report.ui.js
import {
  formatCountdown,
  updateCountdowns,
  normalizeApprovalStatus,
  labelApprovalStatus,
  buildTimelineSteps
} from "./report.utils.js";

export function createReportUI({ BACKEND_URL, user, api }) {
  // --------- DOM refs ----------
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

  const moduleTitleMain = document.getElementById("moduleTitleMain");
  const moduleTitleSub = document.getElementById("moduleTitleSub");
  const logsTabBtn = document.getElementById("logsTab");
  const createTabBtn = document.getElementById("createTab");
  const logsSection = document.getElementById("logsSection");
  const createSection = document.getElementById("createSection");

  const paginationEl = document.getElementById("reportsPagination");

    // --- Pig picker refs ---
  const openPigPickerBtn = document.getElementById("openPigPickerBtn");
  const pigPickerPanel = document.getElementById("pigPickerPanel");
  const closePigPickerBtn = document.getElementById("closePigPickerBtn");
  const pigPickerList = document.getElementById("pigPickerList");
  const pigPickerPagination = document.getElementById("pigPickerPagination");
  const pigPickerSearchInput = document.getElementById("pigPickerSearchInput");
  const pigPickerSearchBtn = document.getElementById("pigPickerSearchBtn");

  const selectedPigWrap = document.getElementById("selectedPigWrap");
  const selectedSwineIdInput = document.getElementById("selectedSwineId");

  // remarks
  const remarksInput = document.getElementById("remarks");

  // --------- state ----------
  const PAGE_SIZE = 5;
  let allReports = [];
  let filteredReports = [];
  let currentPage = 1;

  // --- Pig picker state ---
  let allOpenSows = [];
  let filteredOpenSows = [];
  let pigPickerPage = 1;
  const PIGS_PER_PAGE = 5;

  function openPigPicker() {
    if (!pigPickerPanel) return;
    pigPickerPanel.classList.remove("hidden");
    pigPickerPanel.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }

  function closePigPicker() {
    if (!pigPickerPanel) return;
    pigPickerPanel.classList.add("hidden");
    pigPickerPanel.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  function safePigImg(sw) {
    const src =
      sw?.profile_image ||
      sw?.image_url ||
      sw?.photo ||
      "/images/default-pig.png";

    return `<img src="${src}" alt="Pig" onerror="this.onerror=null;this.src='/images/default-pig.png';" />`;
  }

  function calcCycleCount(sw) {
    // best-effort: support various shapes
    const cycles =
      sw?.cycles ||
      sw?.repro_cycles ||
      sw?.breeding_cycles ||
      sw?.cycle_history ||
      sw?.cycleHistory;

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

    pigPickerList.innerHTML = pageItems.map(sw => {
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
    }).join("");

    // bind select buttons
    pigPickerList.querySelectorAll("[data-action='select']").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const sw = filteredOpenSows.find(x => String(x?.swine_id) === String(id));
        if (sw) selectPig(sw);
      });
    });

    renderPigPickerPagination();
  }

  function renderPigPickerPagination() {
    if (!pigPickerPagination) return;

    const totalPages = Math.max(1, Math.ceil(filteredOpenSows.length / PIGS_PER_PAGE));
    if (filteredOpenSows.length <= PIGS_PER_PAGE) {
      pigPickerPagination.innerHTML = "";
      return;
    }

    pigPickerPagination.innerHTML = `
      <button class="page-btn" id="pigPrevBtn" ${pigPickerPage === 1 ? "disabled" : ""}>
        <i class="bi bi-chevron-left"></i>
      </button>

      <div class="picker-page-info">Page ${pigPickerPage} / ${totalPages}</div>

      <button class="page-btn" id="pigNextBtn" ${pigPickerPage === totalPages ? "disabled" : ""}>
        <i class="bi bi-chevron-right"></i>
      </button>
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
      filteredOpenSows = allOpenSows.filter(sw => {
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

    // hide open picker button, show selected card
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

  // --------- Title / tabs ----------
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

  function getActiveTabStatus() {
    const active = document.querySelector(".status-tab.active");
    return active?.dataset?.status || "";
  }

  logsTabBtn?.addEventListener("click", () => setActiveTab("logs"));
  createTabBtn?.addEventListener("click", () => setActiveTab("create"));
  setActiveTab("logs");

  statusTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      statusTabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      if (!isLogsActive()) return;
      currentPage = 1;
      applyFiltersAndRender();
    });
  });

  // --------- filtering ----------
  function passesFilters(report) {
    const swineDisplay = (report.swine_id?.swine_id || "Unknown");
    const approvalRaw = normalizeApprovalStatus(report.status);

    const statusVal = (statusFilter?.value || "").trim();
    const tagVal = (tagSearchInput?.value || "").trim().toLowerCase();
    const tabStatus = getActiveTabStatus();

    const matchDropdown = !statusVal || approvalRaw === statusVal;
    const matchSearch = !tagVal || swineDisplay.toLowerCase().includes(tagVal);
    const matchTab = !tabStatus || approvalRaw === tabStatus;

    return matchDropdown && matchSearch && matchTab;
  }

  function applyFiltersAndRender() {
    filteredReports = allReports.filter(passesFilters);

    const totalPages = Math.max(1, Math.ceil(filteredReports.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;

    renderReportsPage();
    renderPagination();
    updateCountdowns();
  }

  function renderPagination() {
    if (!paginationEl) return;

    const total = filteredReports.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    if (total <= PAGE_SIZE) {
      paginationEl.innerHTML = "";
      return;
    }

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

  function renderReportsPage() {
    if (!reportsTableBody) return;

    if (!filteredReports.length) {
      reportsTableBody.innerHTML = `<div class="empty-state">No reports found</div>`;
      return;
    }

    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filteredReports.slice(start, start + PAGE_SIZE);

    reportsTableBody.innerHTML = pageItems.map(r => {
      const swineDisplay = r.swine_id?.swine_id || "Unknown";

      const approvalRaw = normalizeApprovalStatus(r.status);
      const approvalLabel = labelApprovalStatus(approvalRaw);

      const productionLabel = (r.swine_id?.current_status || "Under Observation").replace(/_/g, " ");
      const countdownTarget = r.next_heat_check || r.expected_farrowing || "";
      const createdDate = r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "-";

      const prodKey = (productionLabel || "").toLowerCase();
      let prodIcon = "bi-activity";
      if (prodKey.includes("open")) prodIcon = "bi-unlock";
      else if (prodKey.includes("heat")) prodIcon = "bi-heart-pulse";
      else if (prodKey.includes("preg")) prodIcon = "bi-clipboard2-check";
      else if (prodKey.includes("farrow")) prodIcon = "bi-calendar2-heart";
      else if (prodKey.includes("lact")) prodIcon = "bi-droplet";

      let approvalIcon = "bi-hourglass-split";
      if (approvalRaw === "approved") approvalIcon = "bi-check2-circle";
      if (approvalRaw === "rejected") approvalIcon = "bi-x-circle";
      if (approvalRaw === "ongoing") approvalIcon = "bi-arrow-repeat";

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

                    <span class="meta-chip" title="Production status">
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
                  <i class="bi bi-eye"></i>
                  View Details
                </button>

                <button class="btn-primary btn-sm" type="button" data-action="track" data-id="${r._id}" data-swine="${swineDisplay}">
                  <i class="bi bi-graph-up-arrow"></i>
                  Track Progress
                </button>
              </div>

            </div>
          </div>
        </div>
      `;
    }).join("");

    // event delegation (avoids inline onclick)
    reportsTableBody.querySelectorAll("[data-action='view']").forEach(btn => {
      btn.addEventListener("click", () => viewEvidence(btn.dataset.id));
    });

    reportsTableBody.querySelectorAll("[data-action='track']").forEach(btn => {
      btn.addEventListener("click", () => openTrackProgress(btn.dataset.id, btn.dataset.swine));
    });
  }

  // --------- evidence modal + lightbox ----------
  function openReportModal() {
    const modal = document.getElementById("reportModal");
    modal?.classList.remove("hidden");
    document.body.classList.add("modal-open");

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
    document.body.classList.remove("modal-open");
    document.removeEventListener("keydown", escCloseOnce);
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
        ${evidenceUrls.map((url) => {
          const src = (url.startsWith("data:") || url.startsWith("http")) ? url : `${BACKEND_URL}${url}`;
          const isVideo = /\.(mp4|mov|webm)$/i.test(url);

          return isVideo
            ? `<div class="evidence-item" data-type="video" data-src="${src}" role="button" tabindex="0">
                <video src="${src}" muted></video>
              </div>`
            : `<div class="evidence-item" data-type="image" data-src="${src}" role="button" tabindex="0">
                <img src="${src}" alt="Evidence" loading="lazy" />
              </div>`;
        }).join("")}
      </div>
    `;
  }

  const evidenceLightbox = document.getElementById("evidenceLightbox");
  const evidenceLightboxBody = document.getElementById("evidenceLightboxBody");
  const evidenceLightboxClose = document.getElementById("evidenceLightboxClose");

  function openEvidenceLightbox({ src, type }) {
    if (!evidenceLightbox || !evidenceLightboxBody) return;

    evidenceLightboxBody.innerHTML = "";

    if (type === "video") {
      const v = document.createElement("video");
      v.src = src;
      v.controls = true;
      v.autoplay = true;
      evidenceLightboxBody.appendChild(v);
    } else {
      const img = document.createElement("img");
      img.src = src;
      img.alt = "Evidence preview";
      evidenceLightboxBody.appendChild(img);
    }

    evidenceLightbox.classList.add("show");
    evidenceLightbox.setAttribute("aria-hidden", "false");
  }

  function closeEvidenceLightbox() {
    if (!evidenceLightbox || !evidenceLightboxBody) return;
    evidenceLightbox.classList.remove("show");
    evidenceLightbox.setAttribute("aria-hidden", "true");
    evidenceLightboxBody.innerHTML = "";
  }

  evidenceLightboxClose?.addEventListener("click", closeEvidenceLightbox);
  evidenceLightbox?.addEventListener("click", (e) => {
    if (e.target?.id === "evidenceLightbox") closeEvidenceLightbox();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && evidenceLightbox?.classList.contains("show")) closeEvidenceLightbox();
  });

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
    // show only when lactating
    return s.includes("lact");
 }

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

      const swineStatusRaw = (report.swine_id?.current_status || "Under Observation");
      const swineStatusLabel = swineStatusRaw.replace(/_/g, " ");

      const nextCheckDate = report.next_heat_check || report.expected_farrowing || "";
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
            ${signs.map(s => `<span class="detail-chip"><i class="bi bi-check2"></i>${s}</span>`).join("")}
          </div>`
        : `<div class="empty-mini">No signs recorded.</div>`;

      const evidenceHtml = buildEvidenceGallery(report.evidence_url || []);

      const showBackInHeat = shouldShowBackInHeat(swineStatusRaw, approvalRaw);
      const showConfirmPreg = shouldShowConfirmPregnant(swineStatusRaw, approvalRaw);
      const showConfirmWean = shouldShowConfirmWeaning(swineStatusRaw, approvalRaw);

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
                  <i class="bi ${approvalRaw === "approved" ? "bi-check2-circle" : approvalRaw === "rejected" ? "bi-x-circle" : approvalRaw === "ongoing" ? "bi-arrow-repeat" : "bi-hourglass-split"}"></i>
                  ${approvalLabel}
                </span>
              </div>

              <div class="meta-row">
                <span class="meta-chip">
                  <i class="bi bi-calendar3"></i>
                  ${createdDate}
                </span>

                <span class="meta-chip">
                  <i class="bi bi-activity"></i>
                  ${swineStatusLabel}
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
              <div class="info-value">${swineStatusLabel}</div>
              <div class="info-sub">Based on latest pig status</div>
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
              <i class="bi bi-images"></i> Evidence
              <span class="evidence-hint"><i class="bi bi-arrows-fullscreen"></i> Tap to view</span>
            </div>
            ${evidenceHtml}
          </div>

          <div class="details-actions">
            ${showBackInHeat ? `
              <button class="btn-soft" type="button" id="btnBackInHeat">
                <i class="bi bi-arrow-counterclockwise"></i>
                Back in Heat
              </button>
            ` : ``}

            ${showConfirmPreg ? `
              <button class="btn-primary" type="button" id="btnConfirmPreg">
                <i class="bi bi-patch-check"></i>
                Confirm Pregnant
              </button>
            ` : ``}

            ${showConfirmWean ? `
            <button class="btn-primary" type="button" id="btnConfirmWean">
                <i class="bi bi-scissors"></i>
                Confirm Weaning
            </button>
            ` : ``}

            <button class="btn-soft" type="button" id="btnCloseDetails">
              <i class="bi bi-x-circle"></i>
              Close
            </button>
          </div>

        </div>
      `;

      modalBody.querySelectorAll(".evidence-item").forEach(item => {
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
        if (!confirm(`Is ${swineTag} in heat again?`)) return;
        const res = await api.stillHeat(report._id);
        if (res?.ok) {
          alert("Cycle reset for re-insemination.");
          await api.sendAdminNotification("Sow Back in Heat", `Farmer ${user.first_name} reported ${swineTag} back in heat.`, "warning");
          await reloadAll();
          await viewEvidence(reportId);
        }
      });

      modalBody.querySelector("#btnConfirmPreg")?.addEventListener("click", async () => {
        if (!confirm(`Confirm pregnancy for ${swineTag}?`)) return;
        const res = await api.confirmPregnancy(report._id);
        if (res?.ok) {
          alert("Pregnancy confirmed!");
          await api.sendAdminNotification("Pregnancy Confirmed", `${swineTag} confirmed pregnant by ${user.first_name}.`, "success");
          await reloadAll();
          await viewEvidence(reportId);
        } else if (res) {
          const errData = await res.json();
          alert("Failed to confirm: " + (errData.message || "Unknown error"));
        }
      });

      modalBody.querySelector("#btnConfirmWean")?.addEventListener("click", async () => {
        if (!confirm(`Confirm weaning for ${swineTag}? This will move the sow back to "Open".`)) return;

        const res = await api.confirmWeaning(report._id);

        if (res?.ok) {
            alert("Weaning confirmed! The sow is now back to Open status.");
            await api.sendAdminNotification("Sow Weaned", `${swineTag} has been weaned by ${user.first_name}.`, "info");
            await reloadAll();
            await viewEvidence(reportId);
        } else if (res) {
            const errData = await res.json();
            alert("Failed to wean: " + (errData.message || "Unknown error"));
        }
        });

    } catch (err) {
      console.error(err);
      const modalBody = document.getElementById("modalBody");
      if (modalBody) modalBody.innerHTML = `<div class="empty-state">Something went wrong loading details.</div>`;
    }
  }

  // --------- track progress ----------
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
    document.body.classList.add("modal-open");

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
      const sw = report.swine_id || {};

      const statusLabel = String(sw.current_status || "Under Observation").replace(/_/g, " ").toUpperCase();
      if (stageEl) stageEl.textContent = statusLabel;

      const due = report.expected_farrowing || sw.expected_farrowing || sw.expected_farrowing_date || report.next_heat_check || "";
      if (remainEl) remainEl.textContent = due ? formatCountdown(due) : "—";

      const steps = buildTimelineSteps(report);

      trackBody.innerHTML = steps.length
        ? steps.map((s, idx) => `
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
          `).join("")
        : `<div class="empty-state">No progress records yet.</div>`;

    } catch (err) {
      console.error(err);
      trackBody.innerHTML = `<div class="empty-state">Something went wrong loading progress.</div>`;
    }
  }

  // --------- file upload UI ----------
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
      alert(`You can upload a maximum of ${MAX_FILES} files.`);
      evidenceInput.value = "";
      return;
    }
    selectedFiles = [...selectedFiles, ...newFiles];
    renderMediaPreview();
  });

  function syncFileInput() {
    const dataTransfer = new DataTransfer();
    selectedFiles.forEach(file => dataTransfer.items.add(file));
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

  // --------- data loaders ----------
  async function refreshSwineData() {
    const data = await api.fetchFarmerSwine();
    const swineList = data?.swine || [];

    const stats = { open: 0, in_heat: 0, under_observation: 0, pregnant: 0, farrowing: 0, lactating: 0 };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const eligibleSows = swineList.filter(sw => {
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

    // ✅ Now safe to assign picker state
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
      return;
    }

    allReports = data.reports || [];
    currentPage = 1;
    applyFiltersAndRender();

    // counters (same as your original)
    const counters = { all: data.reports.length, pending: 0, approved: 0 };

    data.reports.forEach(r => {
      const status = (r.status || "").toLowerCase();
      if (status === "pending") counters.pending++;
      if (status === "approved") counters.approved++;
    });

    const setText = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.textContent = v;
    };

    setText("countAllReports", counters.all);
    setText("countPending", counters.pending);
    setText("countApproved", counters.approved);

    updateCountdowns();
  }

  async function reloadAll() {
    await Promise.all([refreshSwineData(), loadReports()]);
  }

  // --------- form submit ----------
  reportForm?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const selectedSigns = Array.from(document.querySelectorAll('input[name="signs"]:checked')).map(cb => cb.value);
    const chosenSwineId = selectedSwineIdInput?.value || "";
    if (!selectedSigns.length || !chosenSwineId) return alert("Please select a pig and signs of heat.");

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

        // clear selection UI
        if (selectedSwineIdInput) selectedSwineIdInput.value = "";
        if (selectedPigWrap) {
          selectedPigWrap.classList.add("hidden");
          selectedPigWrap.innerHTML = "";
        }
        openPigPickerBtn?.classList.remove("hidden");

        await reloadAll();
      } else {
        alert(data.message || "Error submitting report");
      }
    } catch (err) {
      console.error("Submission Error:", err);
      alert(err.message || "Failed to submit report. Video might be too large.");
    } finally {
      submitBtn && (submitBtn.disabled = false);
    }
  });

  // --------- filter buttons ----------
  searchBtn?.addEventListener("click", () => {
    if (!isLogsActive()) return;
    currentPage = 1;
    applyFiltersAndRender();
  });

  clearFilterBtn?.addEventListener("click", () => {
    if (tagSearchInput) tagSearchInput.value = "";
    if (statusFilter) statusFilter.value = "";

    statusTabs.forEach(t => t.classList.remove("active"));
    if (statusTabs.length > 0) statusTabs[0].classList.add("active");

    if (!isLogsActive()) return;
    currentPage = 1;
    applyFiltersAndRender();
  });

  document.getElementById("trackCloseBtn")?.addEventListener("click", () => {
    const modal = document.getElementById("trackModal");
    modal?.classList.add("hidden");
    document.body.classList.remove("modal-open");
  });

  document.getElementById("trackModal")?.addEventListener("click", (e) => {
    if (e.target?.id === "trackModal") {
      const modal = document.getElementById("trackModal");
      modal?.classList.add("hidden");
      document.body.classList.remove("modal-open");
    }
  });

  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    localStorage.clear();
    window.location.href = "login.html";
  });

  return {
    reloadAll,
    tickCountdowns: () => updateCountdowns(),
    tickReportsReload: () => loadReports()
  };
}