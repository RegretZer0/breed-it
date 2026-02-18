import { authGuard } from "/js/authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  // ---------------- AUTHENTICATION ----------------
  const user = await authGuard("farmer");
  if (!user) return;

  const token = localStorage.getItem("token");
  const userId = user.id || user._id; 
  const BACKEND_URL = "http://localhost:5000";

  const swineSelect = document.getElementById("swineSelect");
  const reportForm = document.getElementById("heatReportForm");
  const reportMessage = document.getElementById("reportMessage");
  const reportsTableBody = document.getElementById("reportsTableBody");
  const submitBtn = reportForm?.querySelector(".btn-submit");

  /* ---------------- FILTER ELEMENT REFERENCES ----------------*/
  const statusFilter = document.getElementById("statusFilter");
  const searchBtn = document.getElementById("searchBtn");
  const clearFilterBtn = document.getElementById("clearFilterBtn");

  const tagSearchInput = document.getElementById("tagSearchInput");

  const statusTabs = document.querySelectorAll(".status-tab");

  /* ---------------- TITLE SWITCHER ----------------*/
  const moduleTitleMain = document.getElementById("moduleTitleMain");
  const moduleTitleSub  = document.getElementById("moduleTitleSub");

  const logsTabBtn   = document.getElementById("logsTab");
  const createTabBtn = document.getElementById("createTab");

  const logsSection   = document.getElementById("logsSection");
  const createSection = document.getElementById("createSection");

  function setModuleTitle(mode) {
    if (!moduleTitleMain || !moduleTitleSub) return;

    if (mode === "create") {
      moduleTitleMain.textContent = "REPORT - CREATE HEAT REPORT";
      moduleTitleSub.textContent  = "Submit signs of heat and evidence for review";
    } else {
      moduleTitleMain.textContent = "REPORT - HEAT MONITORING";
      moduleTitleSub.textContent  = "Track breeding cycle & pregnancy progress";
    }
  }

  function setActiveTab(mode) {
    // tabs
    logsTabBtn?.classList.toggle("active", mode === "logs");
    createTabBtn?.classList.toggle("active", mode === "create");
    createTabBtn?.classList.toggle("outline", mode === "logs");
    logsTabBtn?.classList.toggle("outline", mode === "create");

    // sections
    logsSection?.classList.toggle("hidden", mode !== "logs");
    createSection?.classList.toggle("hidden", mode !== "create");

    // title
    setModuleTitle(mode);
  }

  // ---------------- TAB CLICK BINDINGS ----------------
  logsTabBtn?.addEventListener("click", () => {
    setActiveTab("logs");
  });

  createTabBtn?.addEventListener("click", () => {
    setActiveTab("create");
  });

  // Default view on load
  setActiveTab("logs");

  // ---------------- PAGINATION STATE ----------------
  const PAGE_SIZE = 5;
  let allReports = [];
  let filteredReports = [];
  let currentPage = 1;

  const paginationEl = document.getElementById("reportsPagination");

  // ---------------- STATUS TABS (BIND ONCE) ----------------
  statusTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      statusTabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");

      if (!isLogsActive()) return;

      currentPage = 1;
      applyFiltersAndRender();
    });
  });

  let selectedFiles = [];

  // ---------------- UPLOAD MEDIA ----------------
  const uploadBtn = document.getElementById("uploadBtn");
  const evidenceInput = document.getElementById("evidence");
  const mediaPreview = document.getElementById("mediaPreview");
  const fileCountBadge = document.getElementById("fileCountBadge");

  const MAX_FILES = 5;

  uploadBtn?.addEventListener("click", () => evidenceInput.click());

  evidenceInput?.addEventListener("change", () => {
    const newFiles = Array.from(evidenceInput.files);
    if (selectedFiles.length + newFiles.length > MAX_FILES) {
      alert(`You can upload a maximum of ${MAX_FILES} files.`);
      evidenceInput.value = "";
      return;
    }
    selectedFiles = [...selectedFiles, ...newFiles];
    renderMediaPreview();
  });

  function renderMediaPreview() {
    if (!mediaPreview) return;
    mediaPreview.innerHTML = "";

    if (selectedFiles.length === 0) {
      fileCountBadge.style.display = "none";
      return;
    }

    fileCountBadge.textContent = selectedFiles.length;
    fileCountBadge.style.display = "inline-flex";

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
      }
      if (file.type.startsWith("image")) {
        mediaEl.onload = () => URL.revokeObjectURL(mediaUrl);
      } else {
        mediaEl.onloadeddata = () => URL.revokeObjectURL(mediaUrl);
      }
      
      wrapper.append(removeBtn, mediaEl);
      mediaPreview.appendChild(wrapper);
    });
    syncFileInput();
  }

  function syncFileInput() {
    const dataTransfer = new DataTransfer();
    selectedFiles.forEach(file => dataTransfer.items.add(file));
    if (evidenceInput) evidenceInput.files = dataTransfer.files;
  }

  // ---------------- FETCH HELPER ----------------
  async function fetchWithAuth(url, options = {}) {
    options.headers = { 
        ...options.headers, 
        Authorization: `Bearer ${localStorage.getItem("token")}` 
    };
    options.credentials = "include";

    try {
      const res = await fetch(url, options);
      if (res.status === 401) {
        alert("Authorization Error: Session expired or system clock changed. Please log in again.");
        localStorage.clear();
        window.location.href = "login.html";
        return null;
      }
      return res;
    } catch (err) {
      console.error("Fetch error:", err);
      throw err;
    }
  }

  const sendAdminNotification = async (title, message, type = "info") => {
    try {
      await fetch(`${BACKEND_URL}/api/notifications/admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify({ title, message, type })
      });
    } catch (err) { console.error("Failed to notify admin:", err); }
  };

  // ---------------- UPDATE STATS & DROPDOWN ----------------
  async function refreshSwineData() {
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/swine/farmer`);
      if (!res) return;
      const data = await res.json();
      const swineList = data.swine || [];
      
      const stats = {
        open: 0,
        in_heat: 0,
        under_observation: 0,
        pregnant: 0,
        farrowing: 0,
        lactating: 0
      };

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const eligibleSows = swineList.filter(sw => {
        let status = (sw.current_status || "Open").toLowerCase();
        const farrowDate = sw.expected_farrowing_date || sw.expected_farrowing;
        
        if (status === "pregnant" && farrowDate) {
            const target = new Date(farrowDate);
            target.setHours(0,0,0,0);
            const diffTime = target.getTime() - today.getTime();
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays <= 7) status = "farrowing";
        }
        
        if (status === "open") stats.open++;
        else if (status === "in_heat") stats.in_heat++;
        else if (status === "under_observation") stats.under_observation++;
        else if (status === "pregnant") stats.pregnant++;
        else if (status === "farrowing" || status === "farrowing ready") stats.farrowing++;
        else if (status === "lactating") stats.lactating++;

        const isFemale = (sw.sex || sw.swine_sex || "").toLowerCase() === "female";
        return isFemale && (status === "open");
      });

      if (document.getElementById("countOpen"))
        document.getElementById("countOpen").textContent = stats.open;

      if (document.getElementById("countInHeat"))
        document.getElementById("countInHeat").textContent = stats.in_heat;

      if (document.getElementById("countObservation"))
        document.getElementById("countObservation").textContent = stats.under_observation;

      if (document.getElementById("countPregnant"))
        document.getElementById("countPregnant").textContent = stats.pregnant;

      if (document.getElementById("countFarrowing"))
        document.getElementById("countFarrowing").textContent = stats.farrowing;

      if (document.getElementById("countLactating"))
        document.getElementById("countLactating").textContent = stats.lactating;

      swineSelect.innerHTML = eligibleSows.length 
        ? '<option value="">-- Select Swine --</option>' + eligibleSows.map(sw => `<option value="${sw.swine_id}">${sw.swine_id} - ${sw.breed} (${sw.current_status})</option>`).join("")
        : '<option value="">No eligible sows available</option>';
    } catch (err) { console.error(err); }
  }

  // ------------- UPDATE APPROVAL STATUS ----------------
  function normalizeApprovalStatus(raw) {
    const s = (raw || "pending").toLowerCase().trim().replace(/\s+/g, "_");
    if (s === "waiting_heat_check") return "ongoing";
    if (s === "in_progress") return "ongoing";
    if (s === "ongoing") return "ongoing";
    if (s === "approved") return "approved";
    if (s === "rejected") return "rejected";
    return "pending";
  }

  function labelApprovalStatus(normalized) {
    if (normalized === "approved") return "Approved";
    if (normalized === "rejected") return "Rejected";
    if (normalized === "ongoing") return "Ongoing";
    return "Pending";
  }

  function isLogsActive() {
    return !logsSection?.classList.contains("hidden");
  }

  function getActiveTabStatus() {
    const active = document.querySelector(".status-tab.active");
    return active?.dataset?.status || ""; // "" means All
  }

  function passesFilters(report) {
    const swineDisplay = (report.swine_id?.swine_id || "Unknown");
    const approvalRaw = normalizeApprovalStatus(report.status);

    // dropdown filter
    const statusVal = (statusFilter?.value || "").trim(); // could be "" or "pending" etc
    // search filter
    const tagVal = (tagSearchInput?.value || "").trim().toLowerCase();

    // tab filter
    const tabStatus = getActiveTabStatus(); // "" | pending | approved | rejected | ongoing

    const matchDropdown = !statusVal || approvalRaw === statusVal;
    const matchSearch = !tagVal || swineDisplay.toLowerCase().includes(tagVal);
    const matchTab = !tabStatus || approvalRaw === tabStatus;

    return matchDropdown && matchSearch && matchTab;
  }

  function applyFiltersAndRender() {
    filteredReports = allReports.filter(passesFilters);

    // clamp current page if data shrinks
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

    // hide if only 1 page or nothing
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

    // Pagination Helper
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
        <div class="report-item"
          data-status="${approvalRaw}"
          data-swine="${swineDisplay}"
          data-date="${(r.createdAt || "").split("T")[0] || ""}"
        >
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
                <button class="btn-soft btn-sm" type="button" onclick="viewEvidence('${r._id}')">
                  <i class="bi bi-eye"></i>
                  View Details
                </button>

                <button class="btn-primary btn-sm" type="button" onclick="openTrackProgress('${r._id}', '${swineDisplay}')">
                  <i class="bi bi-graph-up-arrow"></i>
                  Track Progress
                </button>
              </div>

            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  //Track Progress
  window.openTrackProgress = async (reportId, swineId) => {
    const trackModal = document.getElementById("trackModal");
    const trackBody  = document.getElementById("trackBody");

    const farmerLine = document.getElementById("trackFarmerLine");
    const swineEl     = document.getElementById("trackSwineId");
    const stageEl     = document.getElementById("trackCurrentStage");
    const remainEl    = document.getElementById("trackTimeRemaining");
    const statePill   = document.getElementById("trackStatePill");

    if (!trackModal || !trackBody) return;

    // open
    trackModal.classList.remove("hidden");
    document.body.classList.add("modal-open");

    // header values
    if (farmerLine) farmerLine.textContent = `Farmer: ${user?.first_name || "—"} ${user?.last_name || ""}`.trim();
    if (swineEl) swineEl.textContent = swineId || "—";

    trackBody.innerHTML = `<div class="empty-state">Loading progress...</div>`;
    if (stageEl) stageEl.textContent = "—";
    if (remainEl) remainEl.textContent = "—";
    if (statePill) statePill.textContent = "Active";

    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/heat/${reportId}/detail`);
      if (!res) return;

      const data = await res.json();
      if (!data.success || !data.report) {
        trackBody.innerHTML = `<div class="empty-state">Could not load progress.</div>`;
        return;
      }

      const report = data.report;
      const sw = report.swine_id || {};

      // stage + remaining
      const statusLabel = String(sw.current_status || "Under Observation").replace(/_/g, " ").toUpperCase();
      if (stageEl) stageEl.textContent = statusLabel;

      const due = report.expected_farrowing || sw.expected_farrowing || sw.expected_farrowing_date || report.next_heat_check || "";
      if (remainEl) remainEl.textContent = due ? formatCountdown(due) : "—";

      // Build steps (latest FIRST)
      const steps = buildTimelineSteps(report);

      // render
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
  };

  // ---------------- LOAD REPORTS ----------------
  async function loadReports() {
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/heat/farmer`);
      if (!res) return;
      const data = await res.json();  

      /* ---------------- EMPTY STATE RENDER ----------------*/
      if (!data.success || !data.reports?.length) {
        reportsTableBody.innerHTML = `<div class="empty-state">No reports found</div>`;
        if (paginationEl) paginationEl.innerHTML = "";
        return;
      }


      const now = new Date();
      now.setHours(0,0,0,0);

      allReports = data.reports || [];
      currentPage = 1;
      applyFiltersAndRender();


      /* ================= UPDATE REPORT COUNTERS ================= */
      const counters = {
        all: data.reports.length,
        pending: 0,
        approved: 0
      };

      data.reports.forEach(r => {
        const status = (r.status || "").toLowerCase();
        if (status === "pending") counters.pending++;
        if (status === "approved") counters.approved++;
      });

      if (document.getElementById("countAllReports"))
        document.getElementById("countAllReports").textContent = counters.all;

      if (document.getElementById("countPending"))
        document.getElementById("countPending").textContent = counters.pending;

      if (document.getElementById("countApproved"))
        document.getElementById("countApproved").textContent = counters.approved;

      updateCountdowns();
    } catch (err) { console.error("Load Reports Error:", err); }
  }

  // ---------------- VIEW EVIDENCE MODAL ----------------
  function openReportModal() {
    const modal = document.getElementById("reportModal");
    modal?.classList.remove("hidden");
    document.body.classList.add("modal-open");

    // close bindings (once)
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
    return `
      <img src="${src}" alt="Pig profile"
        onerror="this.onerror=null;this.src='${fallback}'"
      />
    `;
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

  // ---------------- TRACK MODAL HELPERS ----------------
  function openTrackModal() {
    const modal = document.getElementById("trackModal");
    modal?.classList.remove("hidden");
    modal?.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }

  function closeTrackModal() {
    const modal = document.getElementById("trackModal");
    modal?.classList.add("hidden");
    modal?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  document.getElementById("trackCloseBtn")?.addEventListener("click", closeTrackModal);
  document.getElementById("trackModal")?.addEventListener("click", (e) => {
    if (e.target?.id === "trackModal") closeTrackModal();
  });

  // ================= EVIDENCE LIGHTBOX (ONE TIME SETUP) =================
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

  // bind ONCE
  evidenceLightboxClose?.addEventListener("click", closeEvidenceLightbox);
  evidenceLightbox?.addEventListener("click", (e) => {
    if (e.target?.id === "evidenceLightbox") closeEvidenceLightbox();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && evidenceLightbox?.classList.contains("show")) {
      closeEvidenceLightbox();
    }
  });


  function shouldShowBackInHeat(swineStatus, approvalStatus) {
    // MVP logic: allow back-in-heat if not farrowing/lactating and report is not rejected
    const s = (swineStatus || "").toLowerCase();
    if (approvalStatus === "rejected") return false;
    if (s.includes("farrow") || s.includes("lact")) return false;
    // typically after AI / observation
    return true;
  }

  function shouldShowConfirmPregnant(swineStatus, approvalStatus) {
    // MVP: allow confirm pregnancy only if not already pregnant/farrowing/lactating and not rejected
    const s = (swineStatus || "").toLowerCase();
    if (approvalStatus === "rejected") return false;
    if (s.includes("preg") || s.includes("farrow") || s.includes("lact")) return false;
    return true;
  }

  // ---------------- TRACK REPORT PROGRESS ----------------
  window.trackReport = async (reportId) => {
    const trackBody = document.getElementById("trackBody");
    const trackFarmLine = document.getElementById("trackFarmLine");
    if (!trackBody) return;

    trackBody.innerHTML = `<div class="empty-state">Loading progress...</div>`;
    openTrackModal();

    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/heat/${reportId}/detail`);
      if (!res) return;

      const data = await res.json();
      if (!data.success || !data.report) {
        trackBody.innerHTML = `<div class="empty-state">Could not load progress.</div>`;
        return;
      }

      const report = data.report;
      const sw = report.swine_id || {};

      const farmName =
        sw.farm_name || sw.farm?.name || sw.farm || "—";
      if (trackFarmLine) trackFarmLine.textContent = `Farm: ${farmName}`;

      const swineTag = sw.swine_id || "Unknown";
      const approval = normalizeApprovalStatus(report.status);

      const swineStatus = (sw.current_status || "").toLowerCase();
      const createdAt = report.createdAt ? new Date(report.createdAt) : null;

      const nextHeatCheck = report.next_heat_check ? new Date(report.next_heat_check) : null;
      const expectedFarrow = (report.expected_farrowing || sw.expected_farrowing || sw.expected_farrowing_date)
        ? new Date(report.expected_farrowing || sw.expected_farrowing || sw.expected_farrowing_date)
        : null;

      // helpers
      const today = new Date(); today.setHours(0,0,0,0);
      const daysLeft = (d) => {
        if (!d) return null;
        const t = new Date(d); t.setHours(0,0,0,0);
        return Math.round((t.getTime() - today.getTime()) / (1000*60*60*24));
      };

      const hasReport = !!report._id;
      const hasObservation = !!nextHeatCheck;
      const isPregnant = swineStatus.includes("preg") || !!expectedFarrow;
      const isFarrowing = swineStatus.includes("farrow") || (expectedFarrow && daysLeft(expectedFarrow) !== null && daysLeft(expectedFarrow) <= 7);
      const isLactating = swineStatus.includes("lact");

      let activeIndex = 0;
      if (hasReport) activeIndex = 1;
      if (hasObservation) activeIndex = 2;
      if (isPregnant) activeIndex = 3;
      if (isFarrowing) activeIndex = 4;
      if (isLactating) activeIndex = 5;

      // progress percent (6 steps)
      const totalSteps = 6;
      const percent = Math.round((activeIndex / (totalSteps - 1)) * 100);

      const approvalIcon =
        approval === "approved" ? "bi-check2-circle" :
        approval === "rejected" ? "bi-x-circle" :
        approval === "ongoing" ? "bi-arrow-repeat" :
        "bi-hourglass-split";

      const approvalLabel = labelApprovalStatus(approval);

      const currentStageLabel =
        isLactating ? "Lactation" :
        isFarrowing ? "Farrowing Window" :
        isPregnant ? "Gestation" :
        hasObservation ? "21-Day Observation" :
        hasReport ? "Insemination / Review" :
        "Estrus Detection";

      const remainingText =
        isLactating ? "Active lactation stage" :
        isFarrowing && expectedFarrow ? `${Math.max(0, daysLeft(expectedFarrow))} days remaining` :
        isPregnant && expectedFarrow ? `${Math.max(0, daysLeft(expectedFarrow))} days remaining` :
        hasObservation && nextHeatCheck ? `${Math.max(0, daysLeft(nextHeatCheck))} days remaining` :
        "—";

      const steps = [
        {
          title: "Estrus Detection",
          desc: "Heat signs submitted and logged",
          icon: "bi-heart-pulse",
          badge: activeIndex > 0 ? "completed" : "active",
          meta: createdAt ? `Started: ${createdAt.toLocaleDateString()}` : "Started: —"
        },
        {
          title: "Insemination / Review",
          desc: "Report under validation / action by admin",
          icon: "bi-clipboard2-check",
          badge: activeIndex > 1 ? "completed" : (activeIndex === 1 ? "active" : "pending"),
          meta: `Status: ${approvalLabel}`
        },
        {
          title: "21-Day Observation",
          desc: "Monitoring for pregnancy confirmation",
          icon: "bi-eye",
          badge: activeIndex > 2 ? "completed" : (activeIndex === 2 ? "active" : "pending"),
          meta: nextHeatCheck ? `Target: ${nextHeatCheck.toLocaleDateString()}` : "Target: —"
        },
        {
          title: "Pregnancy Confirmed",
          desc: "Gestation tracking begins",
          icon: "bi-patch-check",
          badge: activeIndex > 3 ? "completed" : (activeIndex === 3 ? "active" : "pending"),
          meta: expectedFarrow ? `Farrow target: ${expectedFarrow.toLocaleDateString()}` : "Farrow target: —"
        },
        {
          title: "Farrowing Window",
          desc: "Preparing for delivery period",
          icon: "bi-calendar2-heart",
          badge: activeIndex > 4 ? "completed" : (activeIndex === 4 ? "active" : "pending"),
          meta: expectedFarrow ? `Due in: ${Math.max(0, daysLeft(expectedFarrow))} days` : "Due in: —"
        },
        {
          title: "Lactation",
          desc: "Post-farrow care and nursing stage",
          icon: "bi-droplet",
          badge: activeIndex === 5 ? "active" : "pending",
          meta: sw.current_status ? `Current: ${String(sw.current_status).replace(/_/g," ")}` : "Current: —"
        }
      ];

      trackBody.innerHTML = `
        <div class="track-hero">
          <div class="track-hero-top">
            <div class="track-hero-title">
              <i class="bi bi-activity"></i>
              <span>${swineTag} - Reproductive Cycle</span>
            </div>

            <span class="status-pill ${approval}">
              <i class="bi ${approvalIcon}"></i>
              ${approvalLabel}
            </span>
          </div>

          <div class="track-progress">
            <div class="track-progress-line">
              <small>Overall Progress</small>
              <div>${percent}%</div>
            </div>
            <div class="track-bar"><div style="width:${percent}%"></div></div>

            <div class="track-progress-line">
              <small>Current: ${currentStageLabel}</small>
              <div style="color:#b45309; font-weight:900;">${remainingText}</div>
            </div>
          </div>
        </div>

        <div class="track-timeline">
          ${steps.map((s, i) => `
            <div class="track-step">
              <div class="track-dot" aria-hidden="true">
                <i class="bi ${s.icon}"></i>
              </div>
              <div class="track-card">
                <div class="track-card-top">
                  <div>
                    <h4>${s.title}</h4>
                    <p>${s.desc}</p>
                  </div>
                  <span class="track-badge ${s.badge}">
                    ${s.badge === "completed" ? "completed" : (s.badge === "active" ? "Active" : "Pending")}
                  </span>
                </div>

                <div class="track-meta">
                  <span class="track-chip"><i class="bi bi-info-circle"></i>${s.meta}</span>
                </div>
              </div>
            </div>
          `).join("")}
        </div>
      `;

    } catch (err) {
      console.error(err);
      trackBody.innerHTML = `<div class="empty-state">Something went wrong loading progress.</div>`;
    }
  };

  // ---------------- HELPERS ----------------
  function toDateOrNull(v) {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  // More friendly countdown:
  // - Overdue (X days ago)
  // - TODAY / Tomorrow
  // - X days remaining
  function formatCountdown(targetDate) {
    const target = toDateOrNull(targetDate);
    if (!target) return "";

    const today = startOfDay(new Date());
    const t = startOfDay(target);

    const diffDays = Math.round((t.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      const daysAgo = Math.abs(diffDays);
      return daysAgo === 1 ? "Overdue (1 day ago)" : `Overdue (${daysAgo} days ago)`;
    }
    if (diffDays === 0) return "TODAY";
    if (diffDays === 1) return "Tomorrow";
    return `${diffDays} days remaining`;
  }

  function updateCountdowns() {
    document.querySelectorAll(".countdown").forEach(el => {
      const d = el.dataset.date;
      const text = d ? formatCountdown(d) : "—";
      el.innerHTML = `<i class="bi bi-hourglass"></i> ${text || "—"}`;
    });
  }

  // Grab the first non-empty field from an object
  function pickFirst(obj, keys) {
    for (const k of keys) {
      const v = obj?.[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
    return "";
  }

  function formatMaybeDate(d) {
    const dt = toDateOrNull(d);
    return dt ? dt.toLocaleDateString() : "";
  }

  // Build timeline (newest first) with decision + reason/message
  function buildTimelineSteps(report) {
    const sw = report?.swine_id || {};
    const approval = normalizeApprovalStatus(report?.status);

    const createdAt = toDateOrNull(report?.createdAt);
    const nextHeat = toDateOrNull(report?.next_heat_check);

    const expectedFarrow = toDateOrNull(
      report?.expected_farrowing ||
      sw?.expected_farrowing ||
      sw?.expected_farrowing_date
    );

    const reviewedAt = pickFirst(report, ["reviewedAt", "reviewed_at", "updatedAt", "updated_at"]);
    const reviewedDate = toDateOrNull(reviewedAt);

    const reason = pickFirst(report, [
      "rejection_reason",
      "rejectionReason",
      "admin_comment",
      "adminComment",
      "remarks",
      "note",
      "message"
    ]);

    const approvedMsg = pickFirst(report, [
      "approval_note",
      "approved_note",
      "approvalNote",
      "approvedNote"
    ]);

    const status = String(sw?.current_status || "").toLowerCase();
    const isPregnant = status.includes("preg") || !!expectedFarrow;

    const events = [];

    // (1) Report submitted
    events.push({
      title: "Report Submitted",
      desc: "Farmer submitted the heat detection report.",
      icon: "bi-journal-check",
      date: createdAt,
      dateText: createdAt ? createdAt.toLocaleDateString() : "Date N/A",
      badge: "recorded"
    });

    // (2) Decision / Review (Approved / Rejected / Pending / Ongoing)
    let decisionTitle = "Report Review";
    let decisionDesc = "Your report is pending review.";
    let decisionIcon = "bi-hourglass-split";
    let decisionBadge = "pending";

    if (approval === "approved") {
      decisionTitle = "Report Approved";
      decisionDesc = approvedMsg
        ? `Your report has been approved. ${approvedMsg}`
        : "Your report has been approved.";
      decisionIcon = "bi-check2-circle";
      decisionBadge = "recorded";
    } else if (approval === "rejected") {
      decisionTitle = "Report Rejected";
      decisionDesc = reason
        ? `Reason: ${reason}`
        : "Your report has been rejected. Please review and resubmit.";
      decisionIcon = "bi-x-circle";
      decisionBadge = "recorded";
    } else if (approval === "ongoing") {
      decisionTitle = "Report Under Review";
      decisionDesc = "Your report is currently being reviewed.";
      decisionIcon = "bi-arrow-repeat";
      decisionBadge = "ongoing";
    }

    events.push({
      title: decisionTitle,
      desc: decisionDesc,
      icon: decisionIcon,
      date: reviewedDate || createdAt, // best available
      dateText: reviewedDate
        ? `Reviewed: ${reviewedDate.toLocaleDateString()}`
        : (createdAt ? `Submitted: ${createdAt.toLocaleDateString()}` : "Date N/A"),
      badge: decisionBadge
    });

    // (3) Under 30 days monitoring (use next_heat_check if present)
    events.push({
      title: "Under 30 Days Monitoring",
      desc: "Monitoring for return-to-heat signs post-AI.",
      icon: "bi-eye",
      date: nextHeat || null,
      dateText: nextHeat ? `Due: ${nextHeat.toLocaleDateString()}` : "Ongoing",
      badge: nextHeat ? "recorded" : "pending"
    });

    // (4) Pregnancy / 115 days monitoring (if pregnant)
    if (isPregnant) {
      events.push({
        title: "Pregnant & Under 115 Days Monitoring",
        desc: "Pregnancy confirmed. Monitoring gestation period.",
        icon: "bi-heart-pulse",
        date: expectedFarrow || null,
        dateText: expectedFarrow ? `Due: ${expectedFarrow.toLocaleDateString()}` : "Due: N/A",
        badge: "recorded"
      });
    }

    // Newest first; null dates go bottom
    events.sort((a, b) => {
      const at = a.date ? a.date.getTime() : -Infinity;
      const bt = b.date ? b.date.getTime() : -Infinity;
      return bt - at;
    });

    return events;
  }

  // ---------------- VIEW DETAILS (MODAL CONTENT) ----------------
  window.viewEvidence = async (reportId) => {
    try {
      const modalBody = document.getElementById("modalBody");
      if (!modalBody) return;

      modalBody.innerHTML = `<div class="empty-state">Loading details...</div>`;
      openReportModal();

      const res = await fetchWithAuth(`${BACKEND_URL}/api/heat/${reportId}/detail`);
      if (!res) return;

      const data = await res.json();
      if (!data.success || !data.report) {
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

      // ✅ render modal content
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

            <button class="btn-soft" type="button" id="btnCloseDetails">
              <i class="bi bi-x-circle"></i>
              Close
            </button>
          </div>

        </div>
      `;

      // ✅ THIS is the block you were looking for — it must be AFTER modalBody.innerHTML
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

      // bind actions
      modalBody.querySelector("#btnCloseDetails")?.addEventListener("click", closeReportModal);

      modalBody.querySelector("#btnBackInHeat")?.addEventListener("click", async () => {
        await window.submitFollowUp(report._id, swineTag);
        await loadReports();
        await refreshSwineData();
        window.viewEvidence(reportId);
      });

      modalBody.querySelector("#btnConfirmPreg")?.addEventListener("click", async () => {
        await window.confirmPregnancy(report._id, swineTag);
        await loadReports();
        await refreshSwineData();
        window.viewEvidence(reportId);
      });

    } catch (err) {
      console.error(err);
      const modalBody = document.getElementById("modalBody");
      if (modalBody) modalBody.innerHTML = `<div class="empty-state">Something went wrong loading details.</div>`;
    }
  };


  // ---------------- ACTIONS ----------------
  window.submitFollowUp = async (id, swineId) => {
    if (!confirm(`Is ${swineId} in heat again?`)) return;
    const res = await fetchWithAuth(`${BACKEND_URL}/api/heat/${id}/still-heat`, { method: "POST" });
    if (res?.ok) {
      alert("Cycle reset for re-insemination.");
      await sendAdminNotification("Sow Back in Heat", `Farmer ${user.first_name} reported ${swineId} back in heat.`, "warning");
      await loadReports();
    }
  };

  window.confirmPregnancy = async (id, swineId) => {
    if (!confirm(`Confirm pregnancy for ${swineId}? Farrowing date will be set to 115 days from today.`)) return;
    const res = await fetchWithAuth(`${BACKEND_URL}/api/heat/${id}/confirm-pregnancy`, { 
      method: "POST", 
      headers: { "Content-Type": "application/json" }
    });
    
    if (res && res.ok) {
      alert("Pregnancy confirmed! Gestation started (115 days).");
      await sendAdminNotification("Pregnancy Confirmed", `${swineId} confirmed pregnant by ${user.first_name}.`, "success");
      await Promise.all([loadReports(), refreshSwineData()]);
    } else if (res) {
      const errData = await res.json();
      alert("Failed to confirm: " + (errData.message || "Unknown error"));
    }
  };

  // NEW FEATURE: CONFIRM WEANING
  window.confirmWeaning = async (id, swineId) => {
    if (!confirm(`Confirm weaning for ${swineId}? This will move the sow back to "Open" status.`)) return;
    const res = await fetchWithAuth(`${BACKEND_URL}/api/heat/${id}/confirm-weaning`, { 
      method: "POST", 
      headers: { "Content-Type": "application/json" }
    });
    
    if (res && res.ok) {
      alert("Weaning confirmed! The sow is now back to Open status.");
      await sendAdminNotification("Sow Weaned", `${swineId} has been weaned by ${user.first_name}.`, "info");
      await Promise.all([loadReports(), refreshSwineData()]);
    } else if (res) {
      const errData = await res.json();
      alert("Failed to wean: " + (errData.message || "Unknown error"));
    }
  };

  // ---------------- FORM SUBMIT ----------------
  reportForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const selectedSigns = Array.from(document.querySelectorAll('input[name="signs"]:checked')).map(cb => cb.value);
    if (!selectedSigns.length || !swineSelect.value) return alert("Please select swine and signs of heat.");

    const formData = new FormData();
    formData.append("swineId", swineSelect.value);
    formData.append("farmerId", userId); 
    formData.append("signs", JSON.stringify(selectedSigns));
    
    selectedFiles.forEach(f => formData.append("evidence", f));

    submitBtn.disabled = true;
    reportMessage.textContent = "Uploading report and media...";
    reportMessage.style.color = "blue";

    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/heat/add`, { 
        method: "POST", 
        body: formData 
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
          reportMessage.textContent = "Heat report submitted!";
        await sendAdminNotification("New Heat Report", `Farmer ${user.first_name} submitted a new report for ${swineSelect.value}.`, "info");
        reportForm.reset();
        selectedFiles = [];
        renderMediaPreview();
        await Promise.all([loadReports(), refreshSwineData()]);
      } else {
        alert(data.message || "Error submitting report");
      }
    } catch (err) { 
      console.error("Submission Error:", err);
      alert(err.message || "Failed to submit report. Video might be too large.");
    } finally {
      submitBtn.disabled = false;
    }
  });

  /* ---------------- ADVANCED FILTER APPLY ----------------*/
  searchBtn?.addEventListener("click", () => {
    if (!isLogsActive()) return;
    currentPage = 1;
    applyFiltersAndRender();
  });

  /* -------------- FILTER RESET ----------------*/
  clearFilterBtn?.addEventListener("click", () => {
    tagSearchInput.value = "";
    statusFilter.value = "";

    statusTabs.forEach(t => t.classList.remove("active"));
    if (statusTabs.length > 0) statusTabs[0].classList.add("active");

    if (!isLogsActive()) return;

    currentPage = 1;
    applyFiltersAndRender();
  });

  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    localStorage.clear();
    window.location.href = "login.html";
  });

  await Promise.all([refreshSwineData(), loadReports()]);
  setInterval(updateCountdowns, 30000);
  setInterval(loadReports, 60000);
});