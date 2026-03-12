// heat-report/ui-actions.js
export function initHeatReportUI({ user, token, BACKEND_URL }) {
  /* =========================
     DOM (MAIN)
  ========================= */
  const countInHeat = document.getElementById("countInHeat");
  const countAwaitingRecheck = document.getElementById("countAwaitingRecheck");
  const countPregnant = document.getElementById("countPregnant");
  const countFarrowingReady = document.getElementById("countFarrowingReady");
  const countLactating = document.getElementById("countLactating");

  const reportDetailsModal = document.getElementById("reportDetailsModal");
  const closeReportModal = document.getElementById("closeReportModal");
  const closeReportModalBtn = document.getElementById("closeReportModalBtn");

  const reportSwine = document.getElementById("reportSwine");
  const reportSwinePhoto = document.getElementById("reportSwinePhoto");
  const reportFarmer = document.getElementById("reportFarmer");
  const reportSigns = document.getElementById("reportSigns");
  const reportProbability = document.getElementById("reportProbability");
  const reportStatus = document.getElementById("reportStatus");
  const reportActionHistory = document.getElementById("reportActionHistory");

  const confirmPregnancyBtn = document.getElementById("confirmPregnancyBtn");
  const followUpBtn = document.getElementById("followUpBtn");

  const rejectReasonModal = document.getElementById("rejectReasonModal");
  const rejectReasonInput = document.getElementById("rejectReasonInput");
  const confirmRejectBtn = document.getElementById("confirmRejectBtn");

  const prevPageBtn = document.getElementById("prevPageBtn");
  const nextPageBtn = document.getElementById("nextPageBtn");
  const pageIndicator = document.getElementById("pageIndicator");

  const farrowingModal = document.getElementById("farrowingModal");
  const farrowingForm = document.getElementById("farrowingForm");

  /* Farrowing modal controls */
  const closeFarrowingModal = document.getElementById("closeFarrowingModal");
  const cancelFarrowingBtn = document.getElementById("cancelFarrowingBtn");

  /* Farrowing inputs */
  const maleCountInput = document.getElementById("maleCount");
  const femaleCountInput = document.getElementById("femaleCount");
  const totalLiveLabel = document.getElementById("totalLiveLabel");

  const toggleFarmerCardBtn = document.getElementById("toggleFarmerCardBtn");
  const farmerMiniCardWrap = document.getElementById("farmerMiniCardWrap");
  const farmerMiniCard = document.getElementById("farmerMiniCard");

  const evidenceGallery = document.getElementById("evidenceGallery");

  const approveBtn = document.getElementById("approveBtn");
  const rejectBtn = document.getElementById("rejectBtn");
  const confirmAIBtn = document.getElementById("confirmAIBtn");
  const confirmFarrowingBtn = document.getElementById("confirmFarrowingBtn");

  const aiConfirmModal = document.getElementById("aiConfirmModal");
  const boarSelect = document.getElementById("boarSelect");
  const submitAIBtn = document.getElementById("submitAI");

  /* Optional date inputs / weaning */
  const aiDateInput = document.getElementById("ai_date_input");
  const confirmWeaningBtn = document.getElementById("confirmWeaningBtn");
  const weaningDateInput = document.getElementById("weaning_date_input");
  const weaningWeightInput = document.getElementById("weaning_weight_input");
  const weaningRemarksInput = document.getElementById("weaning_remarks_input");

  /* Evidence viewer modal */
  const evidenceViewerModal = document.getElementById("evidenceViewerModal");
  const closeEvidenceViewer = document.getElementById("closeEvidenceViewer");

  const evImageWrap = document.getElementById("evImageWrap");
  const evVideoWrap = document.getElementById("evVideoWrap");

  const evStage = document.getElementById("evStage");
  const evImage = document.getElementById("evImage");
  const evVideo = document.getElementById("evVideo");

  const evZoomIn = document.getElementById("evZoomIn");
  const evZoomOut = document.getElementById("evZoomOut");
  const evZoomReset = document.getElementById("evZoomReset");
  const evZoomLabel = document.getElementById("evZoomLabel");

  const progressPanel = document.getElementById("trackProgressPanel");

  /* =========================
     DOM (ARCHIVE MODAL)
  ========================= */
  const archiveBtn = document.getElementById("archiveBtn");
  const archiveModal = document.getElementById("archiveModal");
  const closeArchiveModal = document.getElementById("closeArchiveModal");
  const closeArchiveModalBtn = document.getElementById("closeArchiveModalBtn");
  const archiveCardList = document.getElementById("archiveCardList");
  const showArchivedBtn = document.getElementById("showArchivedBtn");
  const backToActiveBtn = document.getElementById("backToActiveBtn");

  /* Archive filters */
  const archiveFilterForm = document.getElementById("archiveFilterForm");
  const archiveStatusFilter = document.getElementById("archiveStatusFilter");
  const archiveFarmerSearch = document.getElementById("archiveFarmerSearch");
  const archiveTagSearch = document.getElementById("archiveTagSearch");
  const archiveDateFrom = document.getElementById("archiveDateFrom");
  const archiveDateTo = document.getElementById("archiveDateTo");
  const archiveResetBtn = document.getElementById("archiveResetBtn");
  const archivePrevBtn = document.getElementById("archivePrevBtn");
  const archiveNextBtn = document.getElementById("archiveNextBtn");
  const archivePageIndicator = document.getElementById("archivePageIndicator");

  /* =========================
     FEEDBACK + CONFIRM MODALS
  ========================= */
  const appFeedbackModal = document.getElementById("appFeedbackModal");
  const appFeedbackTitle = document.getElementById("appFeedbackTitle");
  const appFeedbackSub = document.getElementById("appFeedbackSub");
  const appFeedbackBody = document.getElementById("appFeedbackBody");
  const appFeedbackOkBtn = document.getElementById("appFeedbackOkBtn");
  const appFeedbackCloseX = document.getElementById("appFeedbackCloseX");
  const appFeedbackIconWrap = document.getElementById("appFeedbackIconWrap");
  const appFeedbackIcon = document.getElementById("appFeedbackIcon");

  const appConfirmModal = document.getElementById("appConfirmModal");
  const appConfirmTitle = document.getElementById("appConfirmTitle");
  const appConfirmSub = document.getElementById("appConfirmSub");
  const appConfirmBody = document.getElementById("appConfirmBody");
  const appConfirmOkBtn = document.getElementById("appConfirmOkBtn");
  const appConfirmCancelBtn = document.getElementById("appConfirmCancelBtn");
  const appConfirmCloseX = document.getElementById("appConfirmCloseX");

  /* =========================
     STATE
  ========================= */
  let allReports = [];
  let filteredReports = [];
  let currentReportId = null;

  let urlAutoOpened = false;

  const filterState = {
    selectedStatus: "",
    selectedFarmerId: null,
    selectedReportStatus: ""
  };

  let currentPage = 1;
  const ROWS_PER_PAGE = 5;

  let archivePage = 1;
  const ARCHIVE_ROWS_PER_PAGE = 5;

  const SHOW_REJECTED_IN_LIST = true;
  const EXCLUDE_ARCHIVED_FROM_ACTIVE_LIST = true;
  const ARCHIVE_STATUSES = ["completed", "rejected"];

  let archivedAll = [];
  let archivedFiltered = [];

  /* =========================
     URL HELPERS MODULE
  ========================= */
  function getUrlReportId() {
    const sp = new URLSearchParams(window.location.search);
    return sp.get("reportId");
  }

  async function autoOpenReportFromUrl() {
    if (urlAutoOpened) return;

    const rid = getUrlReportId();
    if (!rid) return;

    urlAutoOpened = true;
    await viewReport(rid);
  }

  /* =========================
     LIFE CYCLE NORMALIZATION MODULE
  ========================= */
  function safeLower(s) {
    return `${s || ""}`.toLowerCase();
  }

  function normalizeLifecycleStatus(r) {
    const raw =
      r?.status ??
      r?.cycle_status ??
      r?.heat_cycle_status ??
      r?.cycleStage ??
      r?.cycleStatus ??
      "";

    const s = safeLower(raw).replace(/\s+/g, "_");

    const map = {
      awaiting_farrowing: "farrowing_ready",
      awaiting_farrow: "farrowing_ready",
      farrowing: "farrowing_ready",
      farrowing_due: "farrowing_ready",
      farrowed: "lactating"
    };

    return map[s] || s;
  }

  function getExpectedFarrowingDate(r) {
    return (
      r?.expected_farrowing ||
      r?.expected_farrowing_date ||
      r?.expectedFarrowing ||
      r?.farrowing_due ||
      r?.farrowing_due_date ||
      null
    );
  }

  /* =========================
     STATUS RESOLUTION MODULE
  ========================= */
  function getCycleStatus(r) {
    return (
      r?.cycle_status ||
      r?.heat_cycle_status ||
      r?.cycleStage ||
      r?.cycleStatus ||
      r?.status ||
      ""
    );
  }

  function getReportStatus(r) {
    const candidate = r?.report_status || r?.workflow_status || r?.review_status || r?.reportStatus;
    if (candidate != null && `${candidate}`.trim() !== "") return candidate;
    return r?.status || "";
  }

  function isArchivedReport(r) {
    const rs = `${getReportStatus(r) || ""}`.toLowerCase();
    return ARCHIVE_STATUSES.includes(rs);
  }

  function statusLabelOf(status) {
    return `${status || ""}`.replace(/_/g, " ").trim() || "—";
  }

  function renderProgressTimeline(report) {
    const timelineContainer = document.getElementById("cycleTimeline");
    if (!timelineContainer) return;

    const history = normalizeProgressHistory(report);
    const events = history.length ? history : buildLegacyProgressHistory(report);

    if (!events.length) {
      timelineContainer.innerHTML = `<div class="timeline-empty text-muted">No cycle data available.</div>`;
      return;
    }

    timelineContainer.innerHTML = events.map((event) => {
      const actionDate = event.actionAt ? new Date(event.actionAt) : null;
      const dateText = actionDate && !isNaN(actionDate.getTime())
        ? actionDate.toLocaleString()
        : "Date unavailable";

      const actorLine = `${event.actorName || "Unknown User"} • ${event.actorRole || "unknown role"}`;
      const statusText = event.toStatus ? String(event.toStatus).replace(/_/g, " ") : "recorded";

      return `
        <div class="timeline-step completed">
          <div class="step-icon"><i class="bi ${getHistoryIcon(event.eventKey, event.toStatus)}"></i></div>
          <div class="step-content">
            <div class="step-header">
              <strong>${escHtml(event.title)}</strong>
              <span class="step-status completed">${escHtml(statusText)}</span>
            </div>
            <p class="step-desc">${escHtml(event.description)}</p>
            <div class="step-meta">
              <div>${escHtml(dateText)}</div>
              <div>By: ${escHtml(actorLine)}</div>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderReportActionHistory(report) {
    if (!reportActionHistory) return;

    const storedHistory = normalizeProgressHistory(report);
    const legacyHistory = buildLegacyProgressHistory(report);
    const events = [...storedHistory, ...legacyHistory]
      .sort((a, b) => new Date(b.actionAt || 0) - new Date(a.actionAt || 0));

    if (!events.length) {
      reportActionHistory.innerHTML = `<div class="text-muted"><em>No action history recorded yet.</em></div>`;
      return;
    }

    reportActionHistory.innerHTML = events.map((event) => {
      const dt = event.actionAt ? new Date(event.actionAt) : null;
      const when = dt && !isNaN(dt.getTime()) ? dt.toLocaleString() : "Date unavailable";

      return `
        <div class="audit-row">
          <div class="audit-row-icon">
            <i class="bi ${getHistoryIcon(event.eventKey, event.toStatus)}"></i>
          </div>
          <div class="audit-row-main">
            <div class="audit-row-top">
              <strong>${escHtml(event.title)}</strong>
            </div>
            <div class="audit-row-meta">
              <span>${escHtml(when)}</span>
              <span>By: ${escHtml(event.actorName || "Unknown User")}</span>
              <span>Role: ${escHtml(event.actorRole || "unknown")}</span>
            </div>
            <div class="audit-row-desc">${escHtml(event.description || "")}</div>
          </div>
        </div>
      `;
    }).join("");
  }

  /* =========================
     DATE + TIME HELPERS MODULE
  ========================= */
  function getVirtualNow() {
    const offset = parseInt(localStorage.getItem("timeWarpOffset") || "0", 10);
    return new Date(Date.now() + (isNaN(offset) ? 0 : offset));
  }

  function getDaysLeft(targetDate, baseNow = null) {
    if (!targetDate) return "-";
    const today = baseNow ? new Date(baseNow) : new Date();
    today.setHours(0, 0, 0, 0);

    const target = new Date(targetDate);
    target.setHours(0, 0, 0, 0);

    const diff = target - today;
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (days < 0) return "Overdue";
    if (days === 0) return "TODAY";
    return `${days} days`;
  }

  function parseDateInput(val) {
    if (!val) return null;
    const d = new Date(val);
    if (isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function fmtDateShort(d) {
    if (!d) return "—";
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return "—";
    return dt.toLocaleDateString();
  }

  function addDays(dateLike, days) {
    const d = new Date(dateLike);
    if (isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + Number(days || 0));
    return d;
  }

  /* =========================
     SCROLL / OVERLAY HELPERS MODULE
  ========================= */
  function lockScroll() {
    document.body.style.overflow = "hidden";
  }

  function unlockScrollIfNoOverlayOpen() {
    const rdOpen = reportDetailsModal && reportDetailsModal.style.display === "flex";
    if (rdOpen) return;

    const anyOverlayOpen = Array.from(document.querySelectorAll(".modal-overlay")).some(
      (m) => m && m.style.display === "flex"
    );
    if (!anyOverlayOpen) document.body.style.overflow = "";
  }

  function openOverlay(modalEl, { zIndex } = {}) {
    if (!modalEl) return;
    if (zIndex != null) modalEl.style.zIndex = String(zIndex);
    modalEl.style.display = "flex";
    lockScroll();
  }

  function closeOverlay(modalEl) {
    if (!modalEl) return;
    modalEl.style.display = "none";
    unlockScrollIfNoOverlayOpen();
  }

  //Overlay Helper
  function isOverlayOpen(el) {
    return !!el && el.style.display === "flex";
  }

  function ensureProgressPanelAtRoot() {
    if (!progressPanel) return;

    // If the panel is nested inside a modal/overlay, move it to <body>
    if (progressPanel.parentElement !== document.body) {
      document.body.appendChild(progressPanel);
    }
  }

  function closeProgressPanel() {
    if (!progressPanel) return;

    progressPanel.classList.remove("open");

    // Hide after slide-out finishes so it doesn't stay "open behind"
    setTimeout(() => {
      progressPanel.style.display = "none";
      unlockScrollIfNoOverlayOpen();
    }, 300);
  }

  //Evidence Clicker Helper
  function bindEvidenceClicks() {
    if (!evidenceGallery) return;

    // Bind only once
    if (evidenceGallery.dataset.bound === "true") return;
    evidenceGallery.dataset.bound = "true";

    evidenceGallery.addEventListener("click", (e) => {
      const target = e.target.closest("[data-ev-src]");
      if (!target) return;

      e.preventDefault();

      const type = (target.dataset.evType || "").toLowerCase();
      const src = target.dataset.evSrc;
      if (!src) return;

      // Open modal viewer with zoom controls
      openEvidenceViewer({ type: type === "video" ? "video" : "image", src });
    });
  }

  /* =========================
     FEEDBACK MODAL HELPERS MODULE
  ========================= */
  function setFeedbackVariant(variant) {
    if (!appFeedbackIconWrap || !appFeedbackIcon) return;

    const map = {
      info: { bg: "#eef2ff", bd: "#c7d2fe", fg: "#3730a3", icon: "bi-info-circle" },
      success: { bg: "#f0fdf4", bd: "#dcfce7", fg: "#166534", icon: "bi-check2-circle" },
      danger: { bg: "#fff1f2", bd: "#fecdd3", fg: "#be123c", icon: "bi-x-circle" },
      warn: { bg: "#fff7e0", bd: "#fde68a", fg: "#92400e", icon: "bi-exclamation-triangle" }
    };

    const v = map[variant] || map.info;
    appFeedbackIconWrap.style.background = v.bg;
    appFeedbackIconWrap.style.borderColor = v.bd;
    appFeedbackIconWrap.style.color = v.fg;
    appFeedbackIcon.className = `bi ${v.icon}`;
  }

  function showFeedback({ title = "Notice", sub = "—", body = "", variant = "info" } = {}) {
    return new Promise((resolve) => {
      if (!appFeedbackModal) {
        window.alert(body || title);
        return resolve(true);
      }

      if (appFeedbackTitle) appFeedbackTitle.textContent = title;
      if (appFeedbackSub) appFeedbackSub.textContent = sub;
      if (appFeedbackBody) appFeedbackBody.textContent = body;
      setFeedbackVariant(variant);

      const topZ = Array.from(document.querySelectorAll(".modal-overlay"))
        .filter((m) => m && m.style.display === "flex")
        .reduce((maxZ, m) => {
          const z = parseInt(getComputedStyle(m).zIndex || m.style.zIndex || "0", 10);
          return Math.max(maxZ, isNaN(z) ? 0 : z);
        }, 0);

      openOverlay(appFeedbackModal, { zIndex: Math.max(3000, topZ + 200) });

      const done = () => {
        closeOverlay(appFeedbackModal);
        cleanup();
        resolve(true);
      };

      const onBackdrop = (e) => {
        if (e.target === appFeedbackModal) done();
      };

      const onEsc = (e) => {
        if (e.key === "Escape" && appFeedbackModal.style.display === "flex") done();
      };

      const cleanup = () => {
        appFeedbackOkBtn?.removeEventListener("click", done);
        appFeedbackCloseX?.removeEventListener("click", done);
        appFeedbackModal?.removeEventListener("click", onBackdrop);
        document.removeEventListener("keydown", onEsc);
      };

      appFeedbackOkBtn?.addEventListener("click", done);
      appFeedbackCloseX?.addEventListener("click", done);
      appFeedbackModal?.addEventListener("click", onBackdrop);
      document.addEventListener("keydown", onEsc);
    });
  }

  function showConfirm({ title = "Confirm", sub = "Please confirm to continue.", body = "" } = {}) {
    return new Promise((resolve) => {
      if (!appConfirmModal) {
        return resolve(window.confirm(body || title));
      }

      if (appConfirmTitle) appConfirmTitle.textContent = title;
      if (appConfirmSub) appConfirmSub.textContent = sub;
      if (appConfirmBody) appConfirmBody.textContent = body;

      openOverlay(appConfirmModal, { zIndex: 3000 });

      const ok = () => {
        closeOverlay(appConfirmModal);
        cleanup();
        resolve(true);
      };
      const cancel = () => {
        closeOverlay(appConfirmModal);
        cleanup();
        resolve(false);
      };

      const onBackdrop = (e) => {
        if (e.target === appConfirmModal) cancel();
      };

      const onEsc = (e) => {
        if (e.key === "Escape" && appConfirmModal.style.display === "flex") cancel();
      };

      const cleanup = () => {
        appConfirmOkBtn?.removeEventListener("click", ok);
        appConfirmCancelBtn?.removeEventListener("click", cancel);
        appConfirmCloseX?.removeEventListener("click", cancel);
        appConfirmModal?.removeEventListener("click", onBackdrop);
        document.removeEventListener("keydown", onEsc);
      };

      appConfirmOkBtn?.addEventListener("click", ok);
      appConfirmCancelBtn?.addEventListener("click", cancel);
      appConfirmCloseX?.addEventListener("click", cancel);
      appConfirmModal?.addEventListener("click", onBackdrop);
      document.addEventListener("keydown", onEsc);
    });
  }

  /* =========================
     FARROWING MODAL CONTROLS MODULE
  ========================= */
  function openFarrowingModal() {
    if (!farrowingModal) return;
    farrowingModal.style.zIndex = "12000";
    farrowingModal.style.display = "flex";
    lockScroll();
  }

  function closeFarrowingModalFn() {
    if (!farrowingModal) return;
    farrowingModal.style.display = "none";
    unlockScrollIfNoOverlayOpen();
  }

  closeFarrowingModal?.addEventListener("click", closeFarrowingModalFn);
  cancelFarrowingBtn?.addEventListener("click", closeFarrowingModalFn);
  farrowingModal?.addEventListener("click", (e) => {
    if (e.target === farrowingModal) closeFarrowingModalFn();
  });

  function syncTotalLive() {
    const m = Number(maleCountInput?.value || 0);
    const f = Number(femaleCountInput?.value || 0);
    const total = Math.max(m + f, 0);

    const liveHidden = document.getElementById("liveCount");
    if (liveHidden) liveHidden.value = String(total);
    if (totalLiveLabel) totalLiveLabel.textContent = String(total);
  }

  maleCountInput?.addEventListener("input", syncTotalLive);
  femaleCountInput?.addEventListener("input", syncTotalLive);

  // =========================
  // FARROWING FORM SUBMIT MODULE
  // =========================
  if (farrowingForm && !farrowingForm.dataset.bound) {
    farrowingForm.dataset.bound = "true";

    farrowingForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      try {
        if (!currentReportId) {
          await showFeedback({
            title: "Missing report",
            sub: "No active report selected",
            body: "Please open a report first before confirming farrowing.",
            variant: "warn"
          });
          return;
        }

        const farrowingDate = document.getElementById("farrowingDateInput")?.value || null;
        const mortality = Number(document.getElementById("mortalityCount")?.value || 0);

        // liveCount is your hidden input that syncTotalLive updates
        const totalLive = Number(document.getElementById("liveCount")?.value || 0);

        // if (!farrowingDate) {
        //   await showFeedback({
        //     title: "Validation error",
        //     sub: "Farrowing date required",
        //     body: "Please select the actual farrowing date.",
        //     variant: "warn"
        //   });
        //   return;
        // }

        // OPTIONAL: basic sanity check
        if (totalLive <= 0) {
          const ok = await showConfirm({
            title: "No live piglets?",
            sub: "You entered 0 live piglets.",
            body: "Continue confirming farrowing with 0 live piglets?"
          });
          if (!ok) return;
        }

        await action("confirm-farrowing", "Farrowing confirmed. Piglets were registered.", {
          total_live: Number(document.getElementById("liveCount")?.value || 0),
          mortality: Number(document.getElementById("mortalityCount")?.value || 0),
          farrowing_date: document.getElementById("farrowingDateInput")?.value || null
        });

        closeFarrowingModalFn();
      } catch (err) {
        console.error("Farrowing submit failed:", err);
        // action() already shows feedback, so no need to duplicate
      }
    });
  }

  /* =========================
     URL + CHIP HELPERS MODULE
  ========================= */
  function toPublicUrl(path) {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    if (path.startsWith("/uploads")) return `${BACKEND_URL}${path}`;
    return path;
  }

  function setChipText(chipId, text) {
    const el = document.getElementById(chipId);
    if (!el) return;
    const target = el.querySelector(".rd-chip-text");
    if (target) target.textContent = text ?? "—";
  }

  /* =========================
     REPORT DETAILS MODAL HELPERS MODULE
  ========================= */
  function closeReportDetails() {
    if (!reportDetailsModal) return;
    reportDetailsModal.style.display = "none";

    const videos = reportDetailsModal.querySelectorAll("video");
    videos.forEach((v) => {
      v.pause();
      v.currentTime = 0;
    });

    closeProgressPanel();
  if (evidenceGallery) evidenceGallery.innerHTML = "";
    unlockScrollIfNoOverlayOpen();
  }

  if (closeReportModal) closeReportModal.onclick = closeReportDetails;
  if (closeReportModalBtn) closeReportModalBtn.onclick = closeReportDetails;

  reportDetailsModal?.addEventListener("click", (e) => {
    if (e.target === reportDetailsModal) closeReportDetails();
  });

  /* =========================
   EVIDENCE VIEWER MODULE
  ========================= */
  const evState = {
    scale: 1,
    minScale: 1,
    maxScale: 5,
    x: 0,
    y: 0,
    dragging: false,
    dragStartX: 0,
    dragStartY: 0,
    startX: 0,
    startY: 0
  };

  function setEvZoomLabel() {
    if (!evZoomLabel) return;
    evZoomLabel.textContent = `${Math.round(evState.scale * 100)}%`;
  }

  function applyEvTransform() {
    if (!evImage) return;
    evImage.style.transform = `translate(${evState.x}px, ${evState.y}px) scale(${evState.scale})`;
    setEvZoomLabel();
  }

  function computeFitScale() {
    if (!evStage || !evImage) return 1;

    const stageRect = evStage.getBoundingClientRect();
    const stageW = stageRect.width || 1;
    const stageH = stageRect.height || 1;

    const imgW = evImage.naturalWidth || 1;
    const imgH = evImage.naturalHeight || 1;

    // Fit inside stage (contain)
    const fit = Math.min(stageW / imgW, stageH / imgH);

    // Prevent crazy small values, and allow zoom-out below 1 when needed
    return Math.max(0.05, fit);
  }

  function resetEvTransform() {
    // fit-to-view becomes the minimum zoom
    evState.minScale = computeFitScale();
    evState.scale = evState.minScale;

    evState.x = 0;
    evState.y = 0;

    applyEvTransform();
  }

  function clampEv() {
    evState.scale = Math.min(evState.maxScale, Math.max(evState.minScale, evState.scale));
    applyEvTransform();
  }

  function openEvidenceViewer({ type, src }) {
    if (!evidenceViewerModal) {
      window.open(src, "_blank", "noopener,noreferrer");
      return;
    }

    // show correct wrapper
    if (evImageWrap) evImageWrap.style.display = type === "image" ? "block" : "none";
    if (evVideoWrap) evVideoWrap.style.display = type === "video" ? "block" : "none";

    if (type === "image" && evImage) {
      evImage.onload = () => {
        resetEvTransform();
      };
      evImage.src = src;
    }

    if (type === "video" && evVideo) {
      evVideo.src = src;
      evVideo.load();
    }

    openOverlay(evidenceViewerModal, { zIndex: 11000 });
  }

  function closeEvidenceViewerFn() {
    if (!evidenceViewerModal) return;
    closeOverlay(evidenceViewerModal);

    // cleanup media
    if (evVideo) {
      evVideo.pause();
      evVideo.removeAttribute("src");
      evVideo.load();
    }
    if (evImage) {
      evImage.removeAttribute("src");
    }
  }

  function bindEvidenceViewerControls() {
    if (!evidenceViewerModal) return;
    if (evidenceViewerModal.dataset.bound === "true") return;
    evidenceViewerModal.dataset.bound = "true";

    closeEvidenceViewer?.addEventListener("click", closeEvidenceViewerFn);

    evidenceViewerModal.addEventListener("click", (e) => {
      if (e.target === evidenceViewerModal) closeEvidenceViewerFn();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && evidenceViewerModal.style.display === "flex") {
        closeEvidenceViewerFn();
      }
    });

    evZoomIn?.addEventListener("click", () => {
      evState.scale *= 1.15;
      clampEv();
    });

    evZoomOut?.addEventListener("click", () => {
      evState.scale /= 1.15;
      clampEv();
    });

    evZoomReset?.addEventListener("click", resetEvTransform);

    // wheel zoom on stage
    evStage?.addEventListener(
      "wheel",
      (e) => {
        if (!evImageWrap || evImageWrap.style.display === "none") return;
        e.preventDefault();

        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        evState.scale *= delta;
        clampEv();
      },
      { passive: false }
    );

    // drag to pan (only when zoomed)
    evStage?.addEventListener("mousedown", (e) => {
      if (!evImageWrap || evImageWrap.style.display === "none") return;
      if (evState.scale <= 1) return;

      evState.dragging = true;
      evState.dragStartX = e.clientX;
      evState.dragStartY = e.clientY;
      evState.startX = evState.x;
      evState.startY = evState.y;
    });

    window.addEventListener("mousemove", (e) => {
      if (!evState.dragging) return;
      evState.x = evState.startX + (e.clientX - evState.dragStartX);
      evState.y = evState.startY + (e.clientY - evState.dragStartY);
      applyEvTransform();
    });

    window.addEventListener("mouseup", () => {
      evState.dragging = false;
    });
  }

  // call once at init
  bindEvidenceViewerControls();
  bindEvidenceClicks();  

  /* =========================
     REJECT MODAL CONTROLS MODULE
  ========================= */
  const closeRejectModal = document.getElementById("closeRejectModal");
  const cancelRejectModalBtn = document.getElementById("cancelRejectModalBtn");

  function closeRejectModalFn() {
    if (!rejectReasonModal) return;
    rejectReasonModal.style.display = "none";
    unlockScrollIfNoOverlayOpen();
  }

  closeRejectModal?.addEventListener("click", closeRejectModalFn);
  cancelRejectModalBtn?.addEventListener("click", closeRejectModalFn);
  rejectReasonModal?.addEventListener("click", (e) => {
    if (e.target === rejectReasonModal) closeRejectModalFn();
  });

  /* =========================
     AI CONFIRM MODAL CONTROLS MODULE
  ========================= */
  const closeAIConfirmModal = document.getElementById("closeAIConfirmModal");
  const cancelAIConfirmModal = document.getElementById("cancelAIConfirmModal");

  function closeAIConfirmModalFn() {
    if (!aiConfirmModal) return;
    aiConfirmModal.style.display = "none";
    unlockScrollIfNoOverlayOpen();
  }

  closeAIConfirmModal?.addEventListener("click", closeAIConfirmModalFn);
  cancelAIConfirmModal?.addEventListener("click", closeAIConfirmModalFn);
  aiConfirmModal?.addEventListener("click", (e) => {
    if (e.target === aiConfirmModal) closeAIConfirmModalFn();
  });

  /* =========================
     ARCHIVE MODAL CONTROLS MODULE
  ========================= */
  function openArchiveModal() {
    if (!archiveModal) return;

    archivedAll = allReports.filter(isArchivedReport);
    archivedFiltered = [...archivedAll];
    archivePage = 1;

    renderArchiveCards(archivedFiltered);

    archiveModal.style.display = "flex";
    lockScroll();
  }

  function closeArchive() {
    if (!archiveModal) return;
    archiveModal.style.display = "none";
    unlockScrollIfNoOverlayOpen();
  }

  function closeArchiveAndThen(fn) {
    if (archiveModal && archiveModal.style.display === "flex") {
      closeArchive();
      setTimeout(fn, 0);
      return;
    }
    fn();
  }

  archiveBtn?.addEventListener("click", openArchiveModal);
  closeArchiveModal?.addEventListener("click", closeArchive);
  closeArchiveModalBtn?.addEventListener("click", closeArchive);
  archiveModal?.addEventListener("click", (e) => {
    if (e.target === archiveModal) closeArchive();
  });
  backToActiveBtn?.addEventListener("click", closeArchive);

  showArchivedBtn?.addEventListener("click", () => {
    archivedAll = allReports.filter(isArchivedReport);
    archivedFiltered = [...archivedAll];
    archivePage = 1;
    renderArchiveCards(archivedFiltered);
  });

  /* =========================
     ARCHIVE FILTERING MODULE
  ========================= */
  function applyArchiveFilters() {
    archivedAll = allReports.filter(isArchivedReport);

    const statusVal = safeLower(archiveStatusFilter?.value);
    const farmerTerm = safeLower(archiveFarmerSearch?.value).trim();
    const tagTerm = safeLower(archiveTagSearch?.value).trim();

    const fromD = parseDateInput(archiveDateFrom?.value);
    const toD = parseDateInput(archiveDateTo?.value);
    if (toD) toD.setHours(23, 59, 59, 999);

    archivedFiltered = archivedAll.filter((r) => {
      const rs = safeLower(getReportStatus(r));
      const farmerName = safeLower(
        r?.farmer_id ? `${r.farmer_id.first_name || ""} ${r.farmer_id.last_name || ""}`.trim() : ""
      );
      const created = r?.createdAt ? new Date(r.createdAt) : null;

      const statusMatch = !statusVal || rs === statusVal;
      const farmerMatch = !farmerTerm || farmerName.includes(farmerTerm);

      const signs = Array.isArray(r?.signs) ? r.signs : [];
      const signsText = safeLower(signs.join(" | "));
      const tagMatch = !tagTerm || signsText.includes(tagTerm);

      let dateMatch = true;
      if (fromD || toD) {
        if (!created || isNaN(created.getTime())) dateMatch = false;
        else {
          const ts = created.getTime();
          if (fromD && ts < fromD.getTime()) dateMatch = false;
          if (toD && ts > toD.getTime()) dateMatch = false;
        }
      }

      return statusMatch && farmerMatch && tagMatch && dateMatch;
    });

    archivePage = 1;
    renderArchiveCards(archivedFiltered);
  }

  function resetArchiveFilters() {
    if (archiveStatusFilter) archiveStatusFilter.value = "";
    if (archiveFarmerSearch) archiveFarmerSearch.value = "";
    if (archiveTagSearch) archiveTagSearch.value = "";
    if (archiveDateFrom) archiveDateFrom.value = "";
    if (archiveDateTo) archiveDateTo.value = "";

    archivedAll = allReports.filter(isArchivedReport);
    archivedFiltered = [...archivedAll];
    archivePage = 1;
    renderArchiveCards(archivedFiltered);
  }

  archiveFilterForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    applyArchiveFilters();
  });

  archiveResetBtn?.addEventListener("click", resetArchiveFilters);

  archivePrevBtn?.addEventListener("click", () => {
    if (archivePage > 1) {
      archivePage--;
      renderArchiveCards(archivedFiltered);
    }
  });

  archiveNextBtn?.addEventListener("click", () => {
    const totalPages = Math.ceil((archivedFiltered?.length || 0) / ARCHIVE_ROWS_PER_PAGE);
    if (archivePage < totalPages) {
      archivePage++;
      renderArchiveCards(archivedFiltered);
    }
  });

  /* =========================
     FETCH REPORTS MODULE
  ========================= */
  async function loadReports() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/heat/all`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include"
      });

      if (res.status === 401 || res.status === 403) {
        await showFeedback({
          title: "Session expired",
          sub: "Please log in again.",
          body: "Your session has expired. You’ll be redirected to login.",
          variant: "warn"
        });
        window.location.href = "/login";
        return;
      }

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to load reports");

      const raw = data.reports || [];
      allReports = SHOW_REJECTED_IN_LIST ? raw : raw.filter((r) => safeLower(getReportStatus(r)) !== "rejected");

      renderStats(allReports);

      filteredReports = EXCLUDE_ARCHIVED_FROM_ACTIVE_LIST
        ? allReports.filter((r) => !isArchivedReport(r))
        : [...allReports];

      currentPage = 1;
      renderCards(filteredReports);
      await autoOpenReportFromUrl();

      if (archiveModal && archiveModal.style.display === "flex") {
        applyArchiveFilters();
      }
    } catch (err) {
      console.error("Reports load error:", err);
      await showFeedback({
        title: "Load failed",
        sub: "Unable to load reports",
        body: err?.message || "Failed to load reports.",
        variant: "danger"
      });
    }
  }

  /* =========================
     STATS RENDERING MODULE
  ========================= */
  function renderStats(reports) {
    const virtualNow = getVirtualNow();
    const cycle = (r) => safeLower(getCycleStatus(r));

    if (countInHeat) {
      countInHeat.textContent = reports.filter((r) => ["pending", "approved"].includes(cycle(r))).length;
    }

    if (countAwaitingRecheck) {
      countAwaitingRecheck.textContent = reports.filter((r) =>
        ["under_observation", "waiting_heat_check"].includes(cycle(r))
      ).length;
    }

    /* Split Pregnant vs Farrowing Ready based on virtualNow */
    if (countPregnant || countFarrowingReady) {
      let pregnantCount = 0;
      let farrowingReadyCount = 0;

      reports.forEach((r) => {
        const st = cycle(r);
        if (["pregnant", "farrowing_ready", "awaiting_farrowing"].includes(st)) {
          const expected = getExpectedFarrowingDate(r) || r.expected_farrowing || null;

          if (!expected) {
            pregnantCount++;
            return;
          }

          const farrowDate = new Date(expected);
          farrowDate.setHours(0, 0, 0, 0);

          const checkDate = new Date(virtualNow);
          checkDate.setHours(0, 0, 0, 0);

          const diffDays = Math.ceil((farrowDate - checkDate) / (1000 * 60 * 60 * 24));

          if (diffDays <= 7) farrowingReadyCount++;
          else pregnantCount++;
        }
      });

      if (countPregnant) countPregnant.textContent = pregnantCount;
      if (countFarrowingReady) countFarrowingReady.textContent = farrowingReadyCount;
    }

    if (countLactating) {
      countLactating.textContent = reports.filter((r) => cycle(r) === "lactating").length;
    }

    if (archiveBtn) {
      const archivedCount = reports.filter(isArchivedReport).length;
      archiveBtn.innerHTML = `
        <i class="bi bi-archive me-1"></i>
        Archive${archivedCount ? ` <span class="ms-1">(${archivedCount})</span>` : ""}
      `;
    }
  }

  /* =========================
     MAIN CARD LIST RENDERING MODULE
  ========================= */
  function renderCards(reports) {
    const cardList = document.getElementById("reportsCardList");
    if (!cardList) return;

    cardList.innerHTML = "";

    const totalPages = Math.ceil(reports.length / ROWS_PER_PAGE);
    if (currentPage > totalPages) currentPage = totalPages || 1;

    const start = (currentPage - 1) * ROWS_PER_PAGE;
    const pageItems = reports.slice(start, start + ROWS_PER_PAGE);

    if (!pageItems.length) {
      cardList.innerHTML = "<p class='text-muted'>No reports found.</p>";
      if (pageIndicator) pageIndicator.textContent = `Page 1 of 1`;
      if (prevPageBtn) prevPageBtn.disabled = true;
      if (nextPageBtn) nextPageBtn.disabled = true;
      return;
    }

    pageItems.forEach((r) => {
      const probability = r.heat_probability ?? 0;

      const pillStatus = safeLower(getReportStatus(r));
      const pillLabel = statusLabelOf(pillStatus);

      const card = document.createElement("div");
      card.className = "report-card";

      card.innerHTML = `
        <div class="report-card-header">
          <div class="report-head-left">
            <div class="report-mini-icon"><i class="bi bi-piggy-bank"></i></div>

            <div class="report-head-text">
              <strong class="swine-id">${r.swine_id?.swine_id || "-"}</strong>

              <div class="report-meta">
                <span class="report-farmer">
                  Farmer: ${
                    r.farmer_id
                      ? `${r.farmer_id.first_name} ${r.farmer_id.last_name}`
                      : "Unknown Farmer"
                  }
                </span>
                <span class="report-dot">•</span>
                <span class="report-date">Date Created: ${new Date(r.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          <span class="status-badge ${pillStatus}">${pillLabel}</span>
        </div>

        <div class="probability-block">
          <div class="label">Probability</div>
          <div class="progress-row">
            <div class="progress-bar">
              <div class="progress-fill" style="width:${probability}%"></div>
            </div>
            <strong>${probability}%</strong>
          </div>
        </div>

        <div class="indicators">
          ${
            Array.isArray(r.signs) && r.signs.length
              ? r.signs.map((s) => `<span class="indicator-chip">${s}</span>`).join("")
              : `<span class="text-muted">No indicators</span>`
          }
        </div>

        <div class="report-card-actions">
          <button class="btn-nav secondary btn-view" data-id="${r._id}">
            <i class="bi bi-eye me-1"></i> View Details
          </button>

          <button class="btn-nav btn-track" data-id="${r._id}">
            <i class="bi bi-graph-up-arrow me-1"></i> Track Progress
          </button>
        </div>
      `;

      cardList.appendChild(card);
    });

    if (pageIndicator) pageIndicator.textContent = `Page ${currentPage} of ${totalPages || 1}`;
    if (prevPageBtn) prevPageBtn.disabled = currentPage === 1;
    if (nextPageBtn) nextPageBtn.disabled = currentPage === totalPages || totalPages === 0;

    cardList.querySelectorAll(".btn-view").forEach((btn) => {
      btn.onclick = () => viewReport(btn.dataset.id);
    });

    cardList.querySelectorAll(".btn-track").forEach((btn) => {
      btn.onclick = () => openProgressPanel(btn.dataset.id);
    });
  }

  prevPageBtn?.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      renderCards(filteredReports);
    }
  });

  nextPageBtn?.addEventListener("click", () => {
    const totalPages = Math.ceil(filteredReports.length / ROWS_PER_PAGE);
    if (currentPage < totalPages) {
      currentPage++;
      renderCards(filteredReports);
    }
  });

  /* =========================
     ARCHIVE CARD LIST RENDERING MODULE
  ========================= */
  function renderArchiveCards(reports) {
    if (!archiveCardList) return;

    archiveCardList.innerHTML = "";

    const totalPages = Math.ceil((reports?.length || 0) / ARCHIVE_ROWS_PER_PAGE);
    if (archivePage > totalPages) archivePage = totalPages || 1;

    const start = (archivePage - 1) * ARCHIVE_ROWS_PER_PAGE;
    const pageItems = (reports || []).slice(start, start + ARCHIVE_ROWS_PER_PAGE);

    if (!pageItems.length) {
      archiveCardList.innerHTML = "<p class='text-muted'>No archived reports found.</p>";
      if (archivePageIndicator) archivePageIndicator.textContent = "Page 1 of 1";
      if (archivePrevBtn) archivePrevBtn.disabled = true;
      if (archiveNextBtn) archiveNextBtn.disabled = true;
      return;
    }

    pageItems.forEach((r) => {
      const probability = r.heat_probability ?? 0;
      const pillStatus = safeLower(getReportStatus(r));
      const pillLabel = statusLabelOf(pillStatus);

      const card = document.createElement("div");
      card.className = "report-card is-archive";

      card.innerHTML = `
        <div class="report-card-header">
          <div class="report-head-left">
            <div class="report-mini-icon"><i class="bi bi-archive"></i></div>

            <div class="report-head-text">
              <strong class="swine-id">${r.swine_id?.swine_id || "-"}</strong>

              <div class="report-meta">
                <span class="report-farmer">
                  Farmer: ${
                    r.farmer_id
                      ? `${r.farmer_id.first_name} ${r.farmer_id.last_name}`
                      : "Unknown Farmer"
                  }
                </span>
                <span class="report-dot">•</span>
                <span class="report-date">Date Created: ${new Date(r.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          <span class="status-badge ${pillStatus}">${pillLabel}</span>
        </div>

        <div class="probability-block">
          <div class="label">Probability</div>
          <div class="progress-row">
            <div class="progress-bar">
              <div class="progress-fill" style="width:${probability}%"></div>
            </div>
            <strong>${probability}%</strong>
          </div>
        </div>

        <div class="indicators">
          ${
            Array.isArray(r.signs) && r.signs.length
              ? r.signs.slice(0, 6).map((s) => `<span class="indicator-chip">${s}</span>`).join("")
              : `<span class="text-muted">No indicators</span>`
          }
        </div>

        <div class="report-card-actions">
          <button class="btn-nav secondary btn-view" data-id="${r._id}">
            <i class="bi bi-eye me-1"></i> View Details
          </button>

          <button class="btn-nav btn-track" data-id="${r._id}">
            <i class="bi bi-graph-up-arrow me-1"></i> Track Progress
          </button>
        </div>
      `;

      archiveCardList.appendChild(card);
    });

    if (archivePageIndicator) archivePageIndicator.textContent = `Page ${archivePage} of ${totalPages || 1}`;
    if (archivePrevBtn) archivePrevBtn.disabled = archivePage === 1;
    if (archiveNextBtn) archiveNextBtn.disabled = archivePage === totalPages || totalPages === 0;

    archiveCardList.querySelectorAll(".btn-view").forEach((btn) => {
      btn.onclick = () => closeArchiveAndThen(() => viewReport(btn.dataset.id));
    });

    archiveCardList.querySelectorAll(".btn-track").forEach((btn) => {
      btn.onclick = () => closeArchiveAndThen(() => openProgressPanel(btn.dataset.id));
    });
  }

  function escHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatRoleLabel(role) {
    return String(role || "unknown").replace(/_/g, " ");
  }

  function getHistoryIcon(eventKey, toStatus) {
    const key = safeLower(eventKey);
    const st = safeLower(toStatus);

    if (key.includes("submitted")) return "bi-file-earmark-text";
    if (key.includes("approved")) return "bi-check-circle";
    if (key.includes("rejected")) return "bi-x-circle";
    if (key.includes("ai")) return "bi-droplet-half";
    if (key.includes("pregnancy")) return "bi-heart-pulse";
    if (key.includes("farrowing")) return "bi-egg-fried";
    if (key.includes("weaning")) return "bi-basket";
    if (key.includes("reset") || key.includes("still_in_heat")) return "bi-arrow-repeat";

    if (st === "pending") return "bi-file-earmark-text";
    if (st === "approved") return "bi-check-circle";
    if (st === "under_observation") return "bi-eye";
    if (st === "pregnant") return "bi-heart-pulse";
    if (st === "lactating") return "bi-egg-fried";
    if (st === "completed") return "bi-basket";
    if (st === "rejected") return "bi-x-circle";

    return "bi-clock-history";
  }

  function normalizeProgressHistory(report) {
    const raw = Array.isArray(report?.progress_history) ? report.progress_history : [];

    return raw
      .map((item) => ({
        eventKey: item?.event_key || "",
        title: item?.title || "Activity Recorded",
        description: item?.description || "No description available.",
        fromStatus: item?.from_status || "",
        toStatus: item?.to_status || "",
        actorName: item?.actor_name || "Unknown User",
        actorRole: formatRoleLabel(item?.actor_role),
        actionAt: item?.action_at || item?.createdAt || null,
        meta: item?.meta || {}
      }))
      .sort((a, b) => new Date(b.actionAt || 0) - new Date(a.actionAt || 0));
  }

  function buildLegacyProgressHistory(r) {
    const storedKeys = new Set(
      (Array.isArray(r?.progress_history) ? r.progress_history : [])
        .map((item) => String(item?.event_key || "").toLowerCase())
        .filter(Boolean)
    );

    const events = [];
    const st = normalizeLifecycleStatus(r);
    const aiDate = r.ai_confirmed_at || r.ai_date || null;

    const farmerName = r?.farmer_id
      ? `${r.farmer_id.first_name || ""} ${r.farmer_id.last_name || ""}`.trim()
      : "Unknown Farmer";

    if (!storedKeys.has("report_submitted")) {
      events.push({
        eventKey: "report_submitted",
        title: "Report Submitted",
        description: "Farmer submitted the heat detection report.",
        toStatus: "pending",
        actorName: farmerName,
        actorRole: "farmer",
        actionAt: r.createdAt
      });
    }

    if (
      !storedKeys.has("report_approved") &&
      ["approved", "under_observation", "pregnant", "farrowing_ready", "lactating", "completed"].includes(st)
    ) {
      events.push({
        eventKey: "report_approved",
        title: "Report Approved",
        description: "Heat report approved and sow scheduled for AI.",
        toStatus: "approved",
        actorName: r?.approved_by
          ? `${r.approved_by.first_name || ""} ${r.approved_by.last_name || ""}`.trim()
          : "Unknown User",
        actorRole: r?.approved_by?.role || "farm_manager",
        actionAt: r.approved_at || r.updatedAt
      });
    }

    if (
      !storedKeys.has("ai_confirmed") &&
      ["under_observation", "pregnant", "farrowing_ready", "lactating", "completed"].includes(st)
    ) {
      events.push({
        eventKey: "ai_confirmed",
        title: "Artificial Insemination Confirmed",
        description: "Farm manager confirmed AI procedure.",
        toStatus: "under_observation",
        actorName: r?.ai_confirmed_by
          ? `${r.ai_confirmed_by.first_name || ""} ${r.ai_confirmed_by.last_name || ""}`.trim()
          : "Unknown User",
        actorRole: r?.ai_confirmed_by?.role || "farm_manager",
        actionAt: aiDate
      });
    }

    if (
      !storedKeys.has("pregnancy_confirmed") &&
      ["pregnant", "farrowing_ready", "lactating", "completed"].includes(st)
    ) {
      events.push({
        eventKey: "pregnancy_confirmed",
        title: "Pregnancy Confirmed",
        description: "Pregnancy confirmed and gestation monitoring started.",
        toStatus: "pregnant",
        actorName: r?.pregnancy_confirmed_by
          ? `${r.pregnancy_confirmed_by.first_name || ""} ${r.pregnancy_confirmed_by.last_name || ""}`.trim()
          : "Unknown User",
        actorRole: r?.pregnancy_confirmed_by?.role || "farm_manager",
        actionAt: r.pregnancy_confirmed_at
      });
    }

    if (
      !storedKeys.has("farrowing_confirmed") &&
      ["lactating", "completed"].includes(st)
    ) {
      events.push({
        eventKey: "farrowing_confirmed",
        title: "Farrowing Confirmed",
        description: "Birth process recorded successfully.",
        toStatus: "lactating",
        actorName: r?.farrowing_confirmed_by
          ? `${r.farrowing_confirmed_by.first_name || ""} ${r.farrowing_confirmed_by.last_name || ""}`.trim()
          : "Unknown User",
        actorRole: r?.farrowing_confirmed_by?.role || "farmer",
        actionAt: r.actual_farrowing_date
      });
    }

    if (
      !storedKeys.has("weaning_confirmed") &&
      st === "completed"
    ) {
      events.push({
        eventKey: "weaning_confirmed",
        title: "Weaning Confirmed",
        description: "Weaning completed and cycle closed.",
        toStatus: "completed",
        actorName: r?.weaning_confirmed_by
          ? `${r.weaning_confirmed_by.first_name || ""} ${r.weaning_confirmed_by.last_name || ""}`.trim()
          : "Unknown User",
        actorRole: r?.weaning_confirmed_by?.role || "farmer",
        actionAt: r.weaning_date
      });
    }

    if (
      !storedKeys.has("report_rejected") &&
      st === "rejected"
    ) {
      events.push({
        eventKey: "report_rejected",
        title: "Report Rejected",
        description: `Heat report was rejected. Reason: ${r?.rejection_message || "No reason provided"}`,
        toStatus: "rejected",
        actorName: r?.rejected_by
          ? `${r.rejected_by.first_name || ""} ${r.rejected_by.last_name || ""}`.trim()
          : "Unknown User",
        actorRole: r?.rejected_by?.role || "farm_manager",
        actionAt: r.rejected_at
      });
    }

    return events
      .filter((e) => e.actionAt || e.title)
      .sort((a, b) => new Date(b.actionAt || 0) - new Date(a.actionAt || 0));
  }

  function renderProgressTimeline(report) {
    const timelineContainer = document.getElementById("cycleTimeline");
    if (!timelineContainer) return;

    const storedHistory = normalizeProgressHistory(report);
    const legacyHistory = buildLegacyProgressHistory(report);
    const events = [...storedHistory, ...legacyHistory]
      .sort((a, b) => new Date(b.actionAt || 0) - new Date(a.actionAt || 0));

    if (!events.length) {
      timelineContainer.innerHTML = `<div class="timeline-empty text-muted">No cycle data available.</div>`;
      return;
    }

    timelineContainer.innerHTML = events.map((event) => {
      const actionDate = event.actionAt ? new Date(event.actionAt) : null;
      const dateText = actionDate && !isNaN(actionDate.getTime())
        ? actionDate.toLocaleString()
        : "Date unavailable";

      const actorLine = `${event.actorName || "Unknown User"} • ${event.actorRole || "unknown role"}`;
      const statusText = event.toStatus ? String(event.toStatus).replace(/_/g, " ") : "recorded";

      return `
        <div class="timeline-step completed">
          <div class="step-icon"><i class="bi ${getHistoryIcon(event.eventKey, event.toStatus)}"></i></div>
          <div class="step-content">
            <div class="step-header">
              <strong>${escHtml(event.title)}</strong>
              <span class="step-status completed">${escHtml(statusText)}</span>
            </div>
            <p class="step-desc">${escHtml(event.description)}</p>
            <div class="step-meta">
              <div>${escHtml(dateText)}</div>
              <div>By: ${escHtml(actorLine)}</div>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  /* =========================
     PROGRESS PANEL MODULE
     Adds targetDate output (expects element id "targetDate" in the progress panel)
  ========================= */
  async function openProgressPanel(reportId) {
    if (!progressPanel) return;

    // ensure the drawer is not trapped inside reportDetailsModal
    ensureProgressPanelAtRoot();

    // if details modal is open, close it so drawer is not hidden behind it
    if (isOverlayOpen(reportDetailsModal)) {
      closeReportDetails();
    }

    progressPanel.style.zIndex = "9500";
    progressPanel.style.display = "flex";

    progressPanel.classList.remove("open");
    progressPanel.offsetHeight; // reflow
    progressPanel.classList.add("open");

    lockScroll();

    const closeBtn = document.getElementById("closeProgressPanel");
    if (closeBtn && !closeBtn.dataset.bound) {
      closeBtn.dataset.bound = "true";
      closeBtn.addEventListener("click", closeProgressPanel);
    }
    
  try {
      const res = await fetch(`${BACKEND_URL}/api/heat/${reportId}/detail`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include"
      });

      const data = await res.json();
      if (!data.success) return;

      const r = data.report;

      const farmerEl = document.getElementById("progressFarmerName");
      if (farmerEl) {
        farmerEl.textContent = `Farmer: ${
          r.farmer_id ? `${r.farmer_id.first_name} ${r.farmer_id.last_name}` : "N/A"
        }`;
      }

      const swEl = document.getElementById("progressSwineId");
      if (swEl) swEl.textContent = `${r.swine_id?.swine_id || "Unknown"}`;

      const st = normalizeLifecycleStatus(r);

      const targetDateEl = document.getElementById("targetDate");
      if (targetDateEl) targetDateEl.textContent = "—";

      renderProgressTimeline(r);

      const currentStageEl = document.getElementById("currentStage");
      if (currentStageEl) currentStageEl.textContent = st.replace(/_/g, " ").toUpperCase();

      /* Time Remaining and Target Date (Time Warp aware) */
      const remainingEl = document.getElementById("remainingDays");
      const targetEl = document.getElementById("targetDate");

      if (remainingEl) {
        let label = "—";
        let targetDate = null;

        if (st === "approved") {
          if (r.next_heat_check) targetDate = new Date(r.next_heat_check);
          label = r.next_heat_check ? `${getDaysLeft(r.next_heat_check, getVirtualNow())} (AI Due)` : "—";
        } else if (st === "under_observation" || st === "ai_confirmed") {
          if (r.next_heat_check) targetDate = new Date(r.next_heat_check);
          label = r.next_heat_check ? `${getDaysLeft(r.next_heat_check, getVirtualNow())} (Pregnancy Check)` : "—";
        } else if (st === "pregnant" || st === "farrowing_ready") {
          // prefer expected_farrowing; fallback compute from AI date + 114 if missing
          if (r.expected_farrowing) {
            targetDate = new Date(r.expected_farrowing);
            label = `${getDaysLeft(r.expected_farrowing, getVirtualNow())} (Farrowing Due)`;
          } else {
            const base = r.ai_confirmed_at || r.ai_date || r.pregnancy_confirmed_at || null;
            if (base) {
              const computed = addDays(base, 114);
              if (computed) {
                targetDate = new Date(computed);
                label = `${getDaysLeft(computed, getVirtualNow())} (Farrowing Due)`;
              } else {
                label = "—";
              }
            } else {
              label = "—";
            }
          }
        } else if (st === "lactating") {
          try {
            const weaningRes = await fetch(`${BACKEND_URL}/api/heat/weaning-date/${reportId}`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            const weaningData = await weaningRes.json();

            if (weaningData && weaningData.success) {
              if (weaningData.weaningDueDate) targetDate = new Date(weaningData.weaningDueDate);
              label = `${weaningData.daysRemaining} (Weaning Due)`;

              if (!targetDate) {
                const farrowDate = r.actual_farrowing_date || r.expected_farrowing;
                if (farrowDate) targetDate = addDays(farrowDate, 30);
              }
            } else {
              const farrowDate = r.actual_farrowing_date || r.expected_farrowing;
              if (farrowDate) {
                const weaningDue = addDays(farrowDate, 30);
                targetDate = weaningDue;
                label = `${getDaysLeft(weaningDue, getVirtualNow())} (Weaning Due)`;
              }
            }
          } catch (err) {
            console.error("Weaning sync failed:", err);
            const farrowDate = r.actual_farrowing_date || r.expected_farrowing;
            if (farrowDate) {
              const weaningDue = addDays(farrowDate, 30);
              targetDate = weaningDue;
              label = `${getDaysLeft(weaningDue, getVirtualNow())} (Weaning Due)`;
            } else {
              label = "Sync Error";
            }
          }
        }

        remainingEl.textContent = label;
        if (targetEl) targetEl.textContent = targetDate ? fmtDateShort(targetDate) : "—";
      }
    } catch (err) {
      console.error("Error loading dynamic progress:", err);
      await showFeedback({
        title: "Progress load failed",
        sub: "Unable to load progress details",
        body: err?.message || "Error loading progress details.",
        variant: "danger"
      });
    }
  }

  /* =========================
     VIEW DETAILS MODULE
  ========================= */
  async function viewReport(id) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/heat/${id}/detail`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include"
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Could not load report details");

      const r = data.report;
      currentReportId = id;

      const virtualNow = getVirtualNow();

      /* Pig profile photo */
      if (reportSwinePhoto) {
        const pigPhoto = toPublicUrl(r?.swine_id?.profile_photo);
        reportSwinePhoto.src = pigPhoto || "/images/default-pig-profile.png";
        reportSwinePhoto.onerror = () => {
          reportSwinePhoto.onerror = null;
          reportSwinePhoto.src = "/images/default-pig-profile.png";
        };
      }

      /* Health chip */
      const hs = r?.swine_id?.health_status || "—";
      setChipText("reportHealthStatus", hs);
      const hsEl = document.getElementById("reportHealthStatus");
      if (hsEl) hsEl.dataset.health = hs;

      if (reportSwine) reportSwine.innerHTML = `<strong>Swine:</strong> ${r.swine_id?.swine_id || "Unknown"}`;

      const rs = safeLower(getReportStatus(r));
      const rsLabel = statusLabelOf(rs);
      if (reportStatus) {
        reportStatus.textContent = rsLabel;
        reportStatus.setAttribute("data-status", rs);
      }

      if (reportFarmer) {
        reportFarmer.innerHTML = `<strong>Farmer:</strong> ${r.farmer_id?.first_name} ${r.farmer_id?.last_name}`;
      }

      /* Farmer mini card module */
      (function setupFarmerMiniCard() {
        if (!toggleFarmerCardBtn || !farmerMiniCardWrap || !farmerMiniCard) return;

        farmerMiniCardWrap.style.display = "none";
        toggleFarmerCardBtn.innerHTML = `<i class="bi bi-eye me-1"></i> View`;
        toggleFarmerCardBtn.setAttribute("aria-expanded", "false");

        const f = r?.farmer_id && typeof r.farmer_id === "object" ? r.farmer_id : null;

        const fullName = f ? `${f.first_name || ""} ${f.last_name || ""}`.trim() : "Unknown Farmer";
        const farmerCode = f?.farmer_id || "—";
        const address = f?.address || "—";
        const phone = f?.contact_no || "—";
        const pens = f?.num_of_pens ?? "—";
        const cap = f?.pen_capacity ?? "—";

        const imgUrl = toPublicUrl(f?.profile_picture) || "/images/default-avatar.png";

        farmerMiniCard.innerHTML = `
          <div class="rd-farmer-row">
            <div class="rd-avatar">
              <img
                src="${imgUrl}"
                alt="Farmer"
                onerror="this.onerror=null; this.src='/images/default-avatar.png';"
              />
            </div>

            <div class="rd-farmer-main">
              <p class="rd-farmer-name mb-1">${fullName}</p>

              <div class="rd-farmer-sub">
                <span><i class="bi bi-hash"></i>${farmerCode}</span>
                <span><i class="bi bi-geo-alt"></i>${address}</span>
                <span><i class="bi bi-telephone"></i>${phone}</span>
                <span><i class="bi bi-house"></i>Pens: ${pens}</span>
                <span><i class="bi bi-people"></i>Capacity: ${cap}</span>
              </div>
            </div>
          </div>
        `;

        if (!toggleFarmerCardBtn.dataset.bound) {
          toggleFarmerCardBtn.dataset.bound = "true";
          toggleFarmerCardBtn.addEventListener("click", () => {
            const isOpen = farmerMiniCardWrap.style.display !== "none";
            if (isOpen) {
              farmerMiniCardWrap.style.display = "none";
              toggleFarmerCardBtn.innerHTML = `<i class="bi bi-eye me-1"></i> View`;
              toggleFarmerCardBtn.setAttribute("aria-expanded", "false");
            } else {
              farmerMiniCardWrap.style.display = "block";
              toggleFarmerCardBtn.innerHTML = `<i class="bi bi-eye-slash me-1"></i> Hide`;
              toggleFarmerCardBtn.setAttribute("aria-expanded", "true");
            }
          });
        }
      })();

      if (reportProbability) {
        reportProbability.innerHTML = `
          <strong>Probability:</strong>
          ${r.heat_probability != null ? r.heat_probability + "%" : "N/A"}
        `;
      }

      if (reportSigns) {
        if (Array.isArray(r.signs) && r.signs.length) {
          reportSigns.innerHTML = r.signs.map((sign) => `<span class="sign-chip">${sign}</span>`).join("");
        } else {
          reportSigns.innerHTML = `<span class="text-muted">No signs recorded.</span>`;
        }
      }

      /* Notes / remarks */
      const notesEl = document.getElementById("reportNotes");
      if (notesEl) {
        const notes =
          (r?.remarks ?? "") ||
          (r?.notes ?? "") ||
          (r?.remark ?? "") ||
          (r?.farmer_notes ?? "") ||
          (r?.farmer_note ?? "") ||
          (r?.comment ?? "") ||
          "";

        const safe = String(notes).replace(/</g, "&lt;").replace(/>/g, "&gt;").trim();

        notesEl.innerHTML = safe ? `<span>${safe}</span>` : `<em class="text-muted">No remarks provided.</em>`;
      }

      renderReportActionHistory(r);

      /* Created at chip */
      const d = r.createdAt ? new Date(r.createdAt) : null;
      const createdText = d && !isNaN(d.getTime()) ? d.toLocaleString() : "—";
      setChipText("reportCreatedAt", createdText);

      /* Cycle stage chip */
      const stageEl = document.getElementById("reportCycleStage");
      if (stageEl) {
        const stRaw = getCycleStatus(r) || "—";
        const label = String(stRaw || "—").replace(/_/g, " ");
        const span = stageEl.querySelector(".rd-chip-text");
        if (span) span.textContent = label;
      }

      /* Media */
      if (evidenceGallery) evidenceGallery.innerHTML = "";
      const evidences = Array.isArray(r.evidence_url) ? r.evidence_url : r.evidence_url ? [r.evidence_url] : [];

      if (!evidences.length) {
        if (evidenceGallery) evidenceGallery.innerHTML = "<p class='text-muted'><em>No media evidence provided.</em></p>";
      } else {
        evidences.forEach((path) => {
          if (!path || !evidenceGallery) return;

          const cleanPath = String(path).replace(/\\/g, "/");
          const fullUrl = cleanPath.startsWith("http") ? cleanPath : `${BACKEND_URL}/${cleanPath.replace(/^\/+/, "")}`;

          const isVideo = /\.(mp4|mov|webm)$/i.test(fullUrl);
          const wrapper = document.createElement("div");
          wrapper.className = "dynamic-media";

          if (isVideo) {
            wrapper.innerHTML = `
              <div class="rd-media-box">
                <div class="d-flex align-items-center justify-content-center" style="width:100%;height:100%;">
                  <i class="bi bi-play-circle" style="font-size:42px;color:#fff;"></i>
                </div>
              </div>
              <small>
                <a href="#" data-ev-type="video" data-ev-src="..." class="text-decoration-none fw-bold">Open video</a>
              </small>
            `;
          } else {
            wrapper.innerHTML = `
              <div class="rd-media-box">
                <img
                  src="${fullUrl}"
                  alt="Evidence"
                  data-ev-type="image"
                  data-ev-src="${fullUrl}"
                  onerror="this.src='https://placehold.co/400x300?text=Load+Error'">
              </div>
              <small>Tap / click to view</small>
            `;
          }

          evidenceGallery.appendChild(wrapper);
        });
      }

      /* =========================
         ACTION BUTTONS MODULE
      ========================= */
      if (approveBtn) approveBtn.style.display = "none";
      if (rejectBtn) rejectBtn.style.display = "none";
      if (confirmAIBtn) confirmAIBtn.style.display = "none";
      if (confirmPregnancyBtn) confirmPregnancyBtn.style.display = "none";
      if (confirmFarrowingBtn) confirmFarrowingBtn.style.display = "none";
      if (followUpBtn) followUpBtn.style.display = "none";
      if (confirmWeaningBtn) confirmWeaningBtn.style.display = "none";

      /* Weaning fields wrapper default state */
      const weaningWrap = document.getElementById("weaningFieldsWrap");
      if (weaningWrap) weaningWrap.style.display = "none";

      const st = normalizeLifecycleStatus(r);

      if (st === "pending") {
        if (approveBtn) approveBtn.style.display = "inline-flex";
        if (rejectBtn) rejectBtn.style.display = "inline-flex";
      } else if (st === "approved") {
        if (confirmAIBtn) confirmAIBtn.style.display = "inline-flex";
      } else if (st === "under_observation" || st === "ai_confirmed") {
        if (confirmPregnancyBtn) confirmPregnancyBtn.style.display = "inline-flex";
        if (followUpBtn) followUpBtn.style.display = "inline-flex";
      } else if (st === "pregnant" || st === "farrowing_ready") {
        const expected = getExpectedFarrowingDate(r);
        if (expected) {
          const farrowDate = new Date(expected);
          farrowDate.setHours(0, 0, 0, 0);

          const checkTime = new Date(virtualNow);
          checkTime.setHours(0, 0, 0, 0);

          const diffDays = Math.ceil((farrowDate - checkTime) / (1000 * 60 * 60 * 24));
          const isReadyWindow = diffDays <= 7;

          if (isReadyWindow) {
            if (confirmFarrowingBtn) confirmFarrowingBtn.style.display = "inline-flex";
          }
        }
      } else if (st === "lactating") {
        if (confirmWeaningBtn) confirmWeaningBtn.style.display = "inline-flex";

        if (weaningWrap) weaningWrap.style.display = "block";

        if (weaningDateInput && !weaningDateInput.value) {
          weaningDateInput.valueAsDate = new Date();
        }
      }

      if (reportDetailsModal) reportDetailsModal.style.display = "flex";
      lockScroll();
    } catch (err) {
      console.error(err);
      await showFeedback({
        title: "Unable to load report",
        sub: "Please try again.",
        body: err?.message || "We couldn’t load the report details.",
        variant: "danger"
      });
    }
  }

  /* =========================
     ACTION HANDLER MODULE
  ========================= */
  async function action(endpoint, message, extraBody = {}) {
    if (!currentReportId) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/heat/${currentReportId}/${endpoint}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify(extraBody)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Action failed");

      await showFeedback({
        title: "Success",
        sub: "Action completed",
        body: message,
        variant: "success"
      });

      closeReportDetails();
      loadReports();
      return data;
    } catch (err) {
      await showFeedback({
        title: "Action failed",
        sub: "Please review the details",
        body: err?.message || "Action failed",
        variant: "danger"
      });
      throw err;
    }
  }

  /* =========================
     BUTTON WIRING MODULE
  ========================= */
  if (approveBtn) approveBtn.onclick = () => action("approve", "Report approved. AI is now scheduled.");

  if (rejectBtn) {
    rejectBtn.onclick = () => {
      if (rejectReasonInput) rejectReasonInput.value = "";

      if (rejectReasonModal) {
        const topZ = Array.from(document.querySelectorAll(".modal-overlay"))
          .filter((m) => m && m.style.display === "flex")
          .reduce((maxZ, m) => {
            const z = parseInt(getComputedStyle(m).zIndex || m.style.zIndex || "0", 10);
            return Math.max(maxZ, isNaN(z) ? 0 : z);
          }, 0);

        openOverlay(rejectReasonModal, { zIndex: Math.max(12000, topZ + 200) });
      }
    };
  }

  if (confirmAIBtn) {
    confirmAIBtn.onclick = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/swine/all?sex=Male&age_stage=adult`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include"
        });

        const data = await res.json();
        if (!data.success || !data.swine?.length) {
          await showFeedback({
            title: "No boars found",
            sub: "Selection unavailable",
            body: "No adult boars found.",
            variant: "warn"
          });
          return;
        }

        const masterBoars = data.swine.filter((b) => b.swine_id?.startsWith("BOAR-") || b.farmer_id === null);
        if (!masterBoars.length) {
          await showFeedback({
            title: "No Master Boars",
            sub: "Selection unavailable",
            body: "No Master Boars available.",
            variant: "warn"
          });
          return;
        }

        if (boarSelect) {
          boarSelect.innerHTML = masterBoars
            .map((b) => `<option value="${b._id}">${b.swine_id}</option>`)
            .join("");
        }

        if (aiConfirmModal) {
          const topZ = Array.from(document.querySelectorAll(".modal-overlay"))
            .filter((m) => m && m.style.display === "flex")
            .reduce((maxZ, m) => {
              const z = parseInt(getComputedStyle(m).zIndex || m.style.zIndex || "0", 10);
              return Math.max(maxZ, isNaN(z) ? 0 : z);
            }, 0);

          openOverlay(aiConfirmModal, { zIndex: Math.max(2800, topZ + 200) });
        }
      } catch (err) {
        console.error(err);
        await showFeedback({
          title: "Load failed",
          sub: "Unable to load boars",
          body: "Failed to load boars.",
          variant: "danger"
        });
      }
    };
  }

  if (submitAIBtn) {
    submitAIBtn.onclick = async () => {
      const maleSwineId = boarSelect?.value;
      const aiDate = aiDateInput?.value || null;

      if (!maleSwineId) {
        await showFeedback({
          title: "Select a boar",
          sub: "Required field",
          body: "Please select a boar.",
          variant: "warn"
        });
        return;
      }

      await action("confirm-ai", "AI Confirmed! Swine moved to Under Observation.", {
        maleSwineId,
        ai_date: aiDate
      });

      closeAIConfirmModalFn();
    };
  }

  if (confirmRejectBtn) {
    confirmRejectBtn.onclick = async () => {
      const reason = rejectReasonInput?.value.trim() || "";
      if (!reason) {
        await showFeedback({
          title: "Missing reason",
          sub: "Rejection requires a reason.",
          body: "Please enter a rejection reason before submitting.",
          variant: "warn"
        });
        return;
      }

      await action("reject", "Report rejected successfully.", { reason });

      closeRejectModalFn();
      if (rejectReasonInput) rejectReasonInput.value = "";
    };
  }

  if (followUpBtn) {
    followUpBtn.onclick = async () => {
      const ok = await showConfirm({
        title: "Cycle failed",
        sub: "This will return the sow to In-Heat status.",
        body: "Mark cycle as failed and return sow to heat?"
      });
      if (!ok) return;

      await action("still-heat", "Cycle reset. Sow returned to In-Heat status.");
    };
  }

  if (confirmFarrowingBtn) {
    confirmFarrowingBtn.onclick = () => {
      if (!farrowingModal) return;

      const dt = document.getElementById("farrowingDateInput");
      if (dt) dt.valueAsDate = new Date();

      const mortalityInput = document.getElementById("mortalityCount");
      if (mortalityInput) mortalityInput.value = "0";
      if (maleCountInput) maleCountInput.value = "0";
      if (femaleCountInput) femaleCountInput.value = "0";
      syncTotalLive();

      openFarrowingModal();
    };
  }

  if (confirmWeaningBtn) {
    confirmWeaningBtn.onclick = async () => {
      const weaningDate = weaningDateInput?.value || null;
      const weaningWeight = Number(weaningWeightInput?.value || 0);
      const remarks = (weaningRemarksInput?.value || "").trim() || "Standard weaning";

      if (!weaningWeight || weaningWeight <= 0) {
        await showFeedback({
          title: "Validation error",
          sub: "Weaning weight required",
          body: "Please enter a valid weaning weight.",
          variant: "warn"
        });
        return;
      }

      const ok = await showConfirm({
        title: "Confirm Weaning",
        sub: "This will move piglets to Growing and reset the sow.",
        body: "Finalize weaning for this batch?"
      });
      if (!ok) return;

      await action("confirm-weaning", "Weaning confirmed and cycle completed!", {
        weaning_date: weaningDate,
        weight: weaningWeight,
        remarks
      });
    };
  }

  /* Remaining part of your file continues unchanged */
  /* Keep your farrowingForm submit handler, evidence viewer, and filtering modules as-is */
  /* ... */

  function applyFilters() {
    const swineTerm = document.getElementById("filterSwine")?.value.trim().toLowerCase() || "";

    const reportStatusValue =
      document.getElementById("reportStatusFilter")?.value ||
      filterState.selectedReportStatus ||
      "";

    filteredReports = allReports.filter((r) => {
      if (EXCLUDE_ARCHIVED_FROM_ACTIVE_LIST) {
        const wantsArchived = reportStatusValue && ARCHIVE_STATUSES.includes(safeLower(reportStatusValue));
        if (!wantsArchived && isArchivedReport(r)) return false;
      }

      const swineMatch = !swineTerm || (r.swine_id?.swine_id || "").toLowerCase().includes(swineTerm);

      const cycleValue = safeLower(getCycleStatus(r));
      const statusMatch = !filterState.selectedStatus || cycleValue === safeLower(filterState.selectedStatus);

      const reportValue = safeLower(getReportStatus(r));
      const reportStatusMatch = !reportStatusValue || reportValue === safeLower(reportStatusValue);

      let farmerMatch = true;
      if (filterState.selectedFarmerId) {
        const farmerId = typeof r.farmer_id === "object" ? r.farmer_id._id : r.farmer_id;
        farmerMatch = farmerId && farmerId.toString() === filterState.selectedFarmerId.toString();
      }

      return swineMatch && statusMatch && reportStatusMatch && farmerMatch;
    });

    currentPage = 1;
    renderCards(filteredReports);
  }

  function resetToAllAndRender() {
    filteredReports = EXCLUDE_ARCHIVED_FROM_ACTIVE_LIST
      ? allReports.filter((r) => !isArchivedReport(r))
      : [...allReports];

    currentPage = 1;
    renderCards(filteredReports);
  }

  function setFilterState(next) {
    filterState.selectedStatus = next.selectedStatus ?? filterState.selectedStatus;
    filterState.selectedFarmerId = next.selectedFarmerId ?? filterState.selectedFarmerId;
    filterState.selectedReportStatus = next.selectedReportStatus ?? filterState.selectedReportStatus;
  }

  function getFilterState() {
    return filterState;
  }

  return {
    loadReports,
    applyFilters,
    resetToAllAndRender,
    setFilterState,
    getFilterState
  };
}