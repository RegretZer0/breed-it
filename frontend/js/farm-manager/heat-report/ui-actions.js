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

  // Farrowing modal controls (must exist in your updated HTML)
  const closeFarrowingModal = document.getElementById("closeFarrowingModal");
  const cancelFarrowingBtn = document.getElementById("cancelFarrowingBtn");

  // Farrowing inputs (must exist in your updated HTML)
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

  const aiDateInput = document.getElementById("ai_date_input"); 
  const confirmWeaningBtn = document.getElementById("confirmWeaningBtn");
  const weaningDateInput = document.getElementById("weaning_date_input");
  const weaningWeightInput = document.getElementById("weaning_weight_input");
  const weaningRemarksInput = document.getElementById("weaning_remarks_input");

  // Evidence viewer modal
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

  // Archive filters (IDs must exist in modal HTML)
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
     FEEDBACK + CONFIRM MODALS (REPLACE alert/confirm)
     (IDs must exist in modal.ejs)
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

  /* =========================
     URL HELPERS
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

    // open Report Details modal directly
    await viewReport(rid);

    // optional: remove reportId from URL after opening (prevents reopening on refresh)
    // const url = new URL(window.location.href);
    // url.searchParams.delete("reportId");
    // window.history.replaceState({}, "", url.toString());
  }

  const filterState = {
    selectedStatus: "", // cycle tabs
    selectedFarmerId: null, // farmer dropdown
    selectedReportStatus: "" // workflow status dropdown
  };

  // Main pagination
  let currentPage = 1;
  const ROWS_PER_PAGE = 5;

  // Archive pagination (limit to 5)
  let archivePage = 1;
  const ARCHIVE_ROWS_PER_PAGE = 5;

  // Keep rejected available (for Archive)
  const SHOW_REJECTED_IN_LIST = true;

  // Default: hide archived from active list
  const EXCLUDE_ARCHIVED_FROM_ACTIVE_LIST = true;
  const ARCHIVE_STATUSES = ["completed", "rejected"];

  // Cache archive derived lists
  let archivedAll = [];
  let archivedFiltered = [];

  //Helper - Normalize Life Cycle Status
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
      farrowing_due: "farrowing_ready"
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
     STATUS RESOLUTION
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
    const candidate =
      r?.report_status ||
      r?.workflow_status ||
      r?.review_status ||
      r?.reportStatus;

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

  function safeLower(s) {
    return `${s || ""}`.toLowerCase();
  }

  /* =========================
     HELPERS
  ========================= */
  function getDaysLeft(targetDate) {
    if (!targetDate) return "-";
    const today = new Date();
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

  /* =========================
     SCROLL / OVERLAY HELPERS
  ========================= */
  function lockScroll() {
    document.body.style.overflow = "hidden";
  }

  function unlockScrollIfNoOverlayOpen() {
    // If report details is open, keep locked
    const rdOpen = reportDetailsModal && reportDetailsModal.style.display === "flex";
    if (rdOpen) return;

    // Any overlay still open?
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

  /* =========================
     FEEDBACK MODAL HELPERS
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

      openOverlay(appFeedbackModal, { zIndex: 3000 });

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

  /* =========================
     CONFIRM MODAL HELPERS
  ========================= */
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
     FARROWING MODAL CONTROLS
  ========================= */
  function openFarrowingModal() {
    if (!farrowingModal) return;

    // ensure it sits above report details
    farrowingModal.style.zIndex = "2600";
    farrowingModal.style.display = "flex";

    // keep scroll locked
    lockScroll();
  }

  function closeFarrowingModalFn() {
    if (!farrowingModal) return;
    farrowingModal.style.display = "none";
    // do NOT unlock if report modal is still open
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

  /* =========================
     URL + CHIP HELPERS
  ========================= */
  function toPublicUrl(path) {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;

    // backend-served uploads
    if (path.startsWith("/uploads")) return `${BACKEND_URL}${path}`;

    // keep public assets (/images/...)
    return path;
  }

  function setChipText(chipId, text) {
    const el = document.getElementById(chipId);
    if (!el) return;
    const target = el.querySelector(".rd-chip-text");
    if (target) target.textContent = text ?? "—";
  }

  /* =========================
     REPORT DETAILS MODAL HELPERS
  ========================= */
  function closeReportDetails() {
    if (!reportDetailsModal) return;
    reportDetailsModal.style.display = "none";

    const videos = reportDetailsModal.querySelectorAll("video");
    videos.forEach((v) => {
      v.pause();
      v.currentTime = 0;
    });

    if (evidenceGallery) evidenceGallery.innerHTML = "";
    unlockScrollIfNoOverlayOpen();
  }

  if (closeReportModal) closeReportModal.onclick = closeReportDetails;
  if (closeReportModalBtn) closeReportModalBtn.onclick = closeReportDetails;

  reportDetailsModal?.addEventListener("click", (e) => {
    if (e.target === reportDetailsModal) closeReportDetails();
  });

  /* =========================
     REJECT MODAL CONTROLS
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

  /* ======================================================
    MANAGER ACTIONS (Time Warp & Schema Compatible)
====================================================== */

// 1. Confirm Artificial Insemination (AI)
async function handleConfirmAI(reportId) {
    // These IDs must exist in your Manager Action Modal HTML
    const maleSwineId = document.getElementById(`male_swine_id_${reportId}`)?.value;
    const aiDate = document.getElementById(`ai_date_${reportId}`)?.value; // Time Warp date picker

    if (!maleSwineId) {
        await showFeedback({
            title: "Data Required",
            body: "Please provide a Boar ID for the AI record.",
            variant: "warn"
        });
        return;
    }

    try {
        const res = await fetch(`${BACKEND_URL}/api/heat/${reportId}/confirm-ai`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ 
                maleSwineId, 
                ai_date: aiDate // Sends selected date to backend
            })
        });

        const data = await res.json();
        if (data.success) {
            await showFeedback({ title: "Success", body: "AI Procedure recorded successfully.", variant: "success" });
            location.reload();
        } else {
            await showFeedback({ title: "Error", body: data.message, variant: "danger" });
        }
    } catch (err) {
        console.error("AI Error:", err);
    }
}

  // 2. Confirm Weaning (Graduates piglets to 'growing' stage)
  async function handleConfirmWeaning(reportId) {
      const weaningDate = document.getElementById(`weaning_date_${reportId}`)?.value;
      const weight = document.getElementById(`weaning_weight_${reportId}`)?.value;
      const remarks = document.getElementById(`weaning_remarks_${reportId}`)?.value;

      try {
          const res = await fetch(`${BACKEND_URL}/api/heat/${reportId}/confirm-weaning`, {
              method: "POST",
              headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${token}`
              },
              body: JSON.stringify({ 
                  weaning_date: weaningDate, // Time Warp
                  weight: weight,            // Required for ADG in Swine.js
                  remarks: remarks 
              })
          });

          const data = await res.json();
          if (data.success) {
              await showFeedback({ title: "Graduated", body: "Weaning confirmed. Piglets are now in Growing stage.", variant: "success" });
              location.reload();
          } else {
              await showFeedback({ title: "Error", body: data.message, variant: "danger" });
          }
      } catch (err) {
          console.error("Weaning Error:", err);
      }
  }

  // =========================
  // AI CONFIRM MODAL (themed) close wiring
  // (IDs must exist: closeAIConfirmModal, cancelAIConfirmModal)
  // =========================
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
     ARCHIVE MODAL CONTROLS
  ========================= */
  function openArchiveModal() {
    if (!archiveModal) return;

    // Build archive lists fresh
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
    // Track progress / view details must not go under the archive modal
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
     ARCHIVE FILTERING
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
        r?.farmer_id
          ? `${r.farmer_id.first_name || ""} ${r.farmer_id.last_name || ""}`.trim()
          : ""
      );
      const created = r?.createdAt ? new Date(r.createdAt) : null;

      // status
      const statusMatch = !statusVal || rs === statusVal;

      // farmer search
      const farmerMatch = !farmerTerm || farmerName.includes(farmerTerm);

      // tag/signs search
      const signs = Array.isArray(r?.signs) ? r.signs : [];
      const signsText = safeLower(signs.join(" | "));
      const tagMatch = !tagTerm || signsText.includes(tagTerm);

      // date range
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
     FETCH REPORTS
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
        window.location.href = "login.html";
        return;
      }

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error("Failed to load reports");

      const raw = data.reports || [];
      allReports = SHOW_REJECTED_IN_LIST
        ? raw
        : raw.filter((r) => safeLower(getReportStatus(r)) !== "rejected");

      renderStats(allReports);

      // active list excludes archive by default
      if (EXCLUDE_ARCHIVED_FROM_ACTIVE_LIST) {
        filteredReports = allReports.filter((r) => !isArchivedReport(r));
      } else {
        filteredReports = [...allReports];
      }

      currentPage = 1;
      renderCards(filteredReports);
      await autoOpenReportFromUrl();

      // If archive modal open, keep it updated
      if (archiveModal && archiveModal.style.display === "flex") {
        applyArchiveFilters(); // respects current archive filter inputs
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
      STATS (MAIN)
   ========================= */
function renderStats(reports) {
  // ✅ NEW: Get Virtual Time to calculate "Ready" status correctly
  const offset = parseInt(localStorage.getItem('timeWarpOffset') || "0");
  const virtualNow = new Date(Date.now() + offset);

  const cycle = (r) => safeLower(getCycleStatus(r));

  if (countInHeat) 
    countInHeat.textContent = reports.filter((r) => ["pending", "approved"].includes(cycle(r))).length;
  
  if (countAwaitingRecheck)
    countAwaitingRecheck.textContent = reports.filter((r) => ["under_observation", "waiting_heat_check"].includes(cycle(r))).length;

  // ✅ UPDATED: Split "Pregnant" and "Farrowing Ready" based on Virtual Time
  if (countPregnant || countFarrowingReady) {
    let pregnantCount = 0;
    let farrowingReadyCount = 0;

    reports.forEach((r) => {
      const st = cycle(r);
      // Include the new awaiting_farrowing status from the Cron Job
      if (["pregnant", "farrowing_ready", "awaiting_farrowing"].includes(st)) {
        if (!r.expected_farrowing) {
          pregnantCount++;
          return;
        }

        const farrowDate = new Date(r.expected_farrowing);
        // Set to midnight for consistent "Day" comparison
        farrowDate.setHours(0, 0, 0, 0);
        const checkDate = new Date(virtualNow);
        checkDate.setHours(0, 0, 0, 0);

        // Calculate difference in days using virtual time
        const diffTime = farrowDate - checkDate;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // Logic: Ready if Overdue, Today, or within 7 days (as per your original feature)
        if (diffDays <= 7) {
          farrowingReadyCount++;
        } else {
          pregnantCount++;
        }
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
     CARDS (MAIN)
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

      console.log("BADGE SOURCE CHECK:", {
        id: r._id,
        status: r.status,
        report_status: r.report_status,
        workflow_status: r.workflow_status,
        review_status: r.review_status,
        reportStatus: r.reportStatus
      });

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
     CARDS (ARCHIVE MODAL) + PAGINATION 5
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

      // smaller card: add class hook "is-archive"
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

    // Pagination UI
    if (archivePageIndicator) archivePageIndicator.textContent = `Page ${archivePage} of ${totalPages || 1}`;
    if (archivePrevBtn) archivePrevBtn.disabled = archivePage === 1;
    if (archiveNextBtn) archiveNextBtn.disabled = archivePage === totalPages || totalPages === 0;

    // Important fix: close archive before opening overlays/panels
    archiveCardList.querySelectorAll(".btn-view").forEach((btn) => {
      btn.onclick = () => closeArchiveAndThen(() => viewReport(btn.dataset.id));
    });

    archiveCardList.querySelectorAll(".btn-track").forEach((btn) => {
      btn.onclick = () => closeArchiveAndThen(() => openProgressPanel(btn.dataset.id));
    });
  }

  /* =========================
    PROGRESS PANEL
  ========================= */
  async function openProgressPanel(reportId) {
    if (!progressPanel) return;

    // ensure it’s above other overlays (CSS ideally, but this helps)
    progressPanel.style.zIndex = "2000";

    const closeBtn = document.getElementById("closeProgressPanel");
    if (closeBtn) closeBtn.onclick = () => progressPanel.classList.remove("open");

    progressPanel.classList.add("open");

    try {
      const res = await fetch(`${BACKEND_URL}/api/heat/${reportId}/detail`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include"
      });

      const data = await res.json();
      if (!data.success) return;

      const r = data.report;
      console.log("REPORT RAW:", {
        status: r?.status,
        report_status: r?.report_status,
        workflow_status: r?.workflow_status,
        review_status: r?.review_status,
        reportStatus: r?.reportStatus,
        cycle_status: r?.cycle_status,
        heat_cycle_status: r?.heat_cycle_status
      });

      const farmerEl = document.getElementById("progressFarmerName");
      if (farmerEl) {
        farmerEl.textContent = `Farmer: ${
          r.farmer_id ? `${r.farmer_id.first_name} ${r.farmer_id.last_name}` : "N/A"
        }`;
      }

      const swEl = document.getElementById("progressSwineId");
      if (swEl) swEl.textContent = `${r.swine_id?.swine_id || "Unknown"}`;

      const timelineContainer = document.getElementById("cycleTimeline");
      if (!timelineContainer) return;
      timelineContainer.innerHTML = "";

      const events = [];

      // Use HeatReport.status as the lifecycle source of truth
      const st = normalizeLifecycleStatus(r);

      // Prefer correct backend fields
      const aiDate = r.ai_confirmed_at || r.ai_date || null;

      if (st === "lactating") {
        events.push({
          title: "Lactating",
          desc: "Sow is currently nursing piglets.",
          icon: "bi-heart-pulse-fill",
          date: "Currently Active"
        });

        events.push({
          title: "Farrowing Confirmed",
          desc: "Birth process recorded successfully.",
          icon: "bi-piggy-bank",
          date: r.actual_farrowing_date ? new Date(r.actual_farrowing_date).toLocaleDateString() : "Check Records"
        });
      }

      if (st === "pregnant" || st === "farrowing_ready" || st === "lactating") {
        events.push({
          title: "Pregnant Monitoring",
          desc: "Pregnancy confirmed. Monitoring gestation period.",
          icon: "bi-person-hearts",
          date: r.expected_farrowing ? `Due: ${new Date(r.expected_farrowing).toLocaleDateString()}` : "Ongoing"
        });
      }

      if (st === "under_observation" || st === "pregnant" || st === "farrowing_ready" || st === "lactating") {
        events.push({
          title: "Under Observation",
          desc: "Monitoring for return to heat signs post-AI.",
          icon: "bi-eye",
          date: aiDate ? `Started: ${new Date(aiDate).toLocaleDateString()}` : "Ongoing"
        });

        events.push({
          title: "Artificial Insemination Performed",
          desc: "Farm Manager confirmed Artificial Insemination procedure.",
          icon: "bi-droplet-half",
          date: aiDate ? new Date(aiDate).toLocaleDateString() : "Date N/A"
        });
      }

      if (st !== "pending" && st !== "rejected") {
        events.push({
          title: "Sow In Heat & Scheduled for AI",
          desc: "Report approved by Farm Manager. AI preparation started.",
          icon: "bi-calendar-check",
          date: r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : "Approved"
        });
      }

      events.push({
        title: "Report Submitted",
        desc: "Farmer submitted the heat detection report.",
        icon: "bi-file-earmark-text",
        date: r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "Pending"
      });

      events.forEach((event) => {
        const stepDiv = document.createElement("div");
        stepDiv.className = "timeline-step completed";
        stepDiv.innerHTML = `
          <div class="step-icon"><i class="bi ${event.icon}"></i></div>
          <div class="step-content">
            <div class="step-header">
              <strong>${event.title}</strong>
              <span class="step-status completed">recorded</span>
            </div>
            <p class="step-desc">${event.desc}</p>
            <div class="step-meta"><span>${event.date}</span></div>
          </div>
        `;
        timelineContainer.appendChild(stepDiv);
      });

      const currentStageEl = document.getElementById("currentStage");
      if (currentStageEl) currentStageEl.textContent = st.replace(/_/g, " ").toUpperCase();

      // Time Remaining uses the correct date per stage
      const remainingEl = document.getElementById("remainingDays");
      if (remainingEl) {
        let label = "—";

        if (st === "approved") {
          label = r.next_heat_check ? `${getDaysLeft(r.next_heat_check)} (AI Due)` : "—";
        } else if (st === "under_observation") {
          label = r.next_heat_check ? `${getDaysLeft(r.next_heat_check)} (Pregnancy Check)` : "—";
        } else if (st === "pregnant" || st === "farrowing_ready") {
          label = r.expected_farrowing ? `${getDaysLeft(r.expected_farrowing)} (Farrowing Due)` : "—";
        } else if (st === "lactating") {
          const farrowDate = r.actual_farrowing_date || r.expected_farrowing;
          if (farrowDate) {
            const weaningDue = new Date(farrowDate);
            weaningDue.setDate(weaningDue.getDate() + 30);
            label = `${getDaysLeft(weaningDue)} (Weaning Due)`;
          }
        }

        remainingEl.textContent = label;
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
      VIEW DETAILS
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

    // ✅ NEW: Support for Time Warp in UI
    // Decides "Now" based on the stored offset if it exists
    const offset = parseInt(localStorage.getItem('timeWarpOffset') || "0");
    const virtualNow = new Date(Date.now() + offset);

    // =========================
    // Pig profile photo (default pig profile)
    // =========================
    if (reportSwinePhoto) {
      const pigPhoto = toPublicUrl(r?.swine_id?.profile_photo);
      reportSwinePhoto.src = pigPhoto || "/images/default-pig-profile.png";
      reportSwinePhoto.onerror = () => {
        reportSwinePhoto.onerror = null;
        reportSwinePhoto.src = "/images/default-pig-profile.png";
      };
    }

    // Health status chip text
    const hs = r?.swine_id?.health_status || "—";
    setChipText("reportHealthStatus", hs);

    const hsEl = document.getElementById("reportHealthStatus");
    if (hsEl) hsEl.dataset.health = hs;

    reportSwine.innerHTML = `<strong>Swine:</strong> ${r.swine_id?.swine_id || "Unknown"}`;

    const rs = safeLower(getReportStatus(r));
    const rsLabel = statusLabelOf(rs);
    reportStatus.textContent = rsLabel;
    reportStatus.setAttribute("data-status", rs);

    reportFarmer.innerHTML = `<strong>Farmer:</strong> ${r.farmer_id?.first_name} ${r.farmer_id?.last_name}`;

    // =========================
    // Farmer mini card (View/Hide) — UPDATED default avatar
    // =========================
    (function setupFarmerMiniCard() {
      if (!toggleFarmerCardBtn || !farmerMiniCardWrap || !farmerMiniCard) return;

      // reset default state every time modal opens
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

      // Bind once (avoid stacking handlers)
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

    reportProbability.innerHTML = `
        <strong>Probability:</strong>
        ${r.heat_probability != null ? r.heat_probability + "%" : "N/A"}
      `;

    if (Array.isArray(r.signs) && r.signs.length) {
      reportSigns.innerHTML = r.signs.map((sign) => `<span class="sign-chip">${sign}</span>`).join("");
    } else {
      reportSigns.innerHTML = `<span class="text-muted">No signs recorded.</span>`;
    }

    // Notes / remarks (FIXED: prioritize schema field "remarks" and trim)
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

      notesEl.innerHTML = safe
        ? `<span>${safe}</span>`
        : `<em class="text-muted">No remarks provided.</em>`;
    }

    // Created at + cycle stage chips
    const d = r.createdAt ? new Date(r.createdAt) : null;
    const createdText = d && !isNaN(d.getTime()) ? d.toLocaleString() : "—";
    setChipText("reportCreatedAt", createdText);

    const stageEl = document.getElementById("reportCycleStage");
    if (stageEl) {
      const st = r.cycle_status || r.heat_cycle_status || r.cycleStage || r.cycleStatus || r.status || "—";
      const label = String(st || "—").replace(/_/g, " ");
      const span = stageEl.querySelector(".rd-chip-text");
      if (span) span.textContent = label;
    }

    // Media
    if (evidenceGallery) evidenceGallery.innerHTML = "";
    const evidences = Array.isArray(r.evidence_url)
      ? r.evidence_url
      : r.evidence_url
      ? [r.evidence_url]
      : [];

    if (!evidences.length) {
      if (evidenceGallery)
        evidenceGallery.innerHTML = "<p class='text-muted'><em>No media evidence provided.</em></p>";
    } else {
      evidences.forEach((path) => {
        if (!path || !evidenceGallery) return;

        const cleanPath = String(path).replace(/\\/g, "/");
        const fullUrl = cleanPath.startsWith("http")
          ? cleanPath
          : `${BACKEND_URL}/${cleanPath.replace(/^\/+/, "")}`;

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
                <a href="javascript:void(0)"
                  data-ev-type="video"
                  data-ev-src="${fullUrl}"
                  class="text-decoration-none fw-bold">
                  Open video
                </a>
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

    // Action buttons - Hidden by default
    if (approveBtn) approveBtn.style.display = "none";
    if (rejectBtn) rejectBtn.style.display = "none";
    if (confirmAIBtn) confirmAIBtn.style.display = "none";
    if (confirmPregnancyBtn) confirmPregnancyBtn.style.display = "none";
    if (confirmFarrowingBtn) confirmFarrowingBtn.style.display = "none";
    if (followUpBtn) followUpBtn.style.display = "none";

    // ✅ UPDATED Action Button Logic
    const reportStatusValue = safeLower(r.status);

    switch (reportStatusValue) {
      case "pending":
        if (approveBtn) approveBtn.style.display = "inline-block";
        if (rejectBtn) rejectBtn.style.display = "inline-block";
        break;

      case "approved":
        if (confirmAIBtn) confirmAIBtn.style.display = "inline-block";
        break;

      case "ai_confirmed":
      case "under_observation":
        if (confirmPregnancyBtn) confirmPregnancyBtn.style.display = "inline-block";
        if (followUpBtn) followUpBtn.style.display = "inline-block";
        break;

      // ✅ FIXED: Added awaiting_farrowing and used Virtual Time
      case "pregnant":
      case "farrowing_ready":
      case "awaiting_farrowing": {
        if (!r.expected_farrowing) break;

        const farrowDate = new Date(r.expected_farrowing);
        farrowDate.setHours(0, 0, 0, 0);
        
        // Use virtualNow instead of 'new Date()' to respect the warp
        const checkTime = new Date(virtualNow);
        checkTime.setHours(0, 0, 0, 0);

        if (checkTime >= farrowDate) {
          if (confirmFarrowingBtn) {
            confirmFarrowingBtn.style.display = "inline-block";
            // Ensure click actually triggers the modal
            confirmFarrowingBtn.onclick = () => {
              if (typeof openFarrowingModal === 'function') openFarrowingModal();
            };
          }
        }
        break;
      }
    }

    if (reportDetailsModal) reportDetailsModal.style.display = "flex";
    lockScroll();
  } catch (err) {
    console.error(err);
    await showFeedback({
      title: "Unable to load report",
      sub: "Please try again.",
      body: "We couldn’t load the report details.",
      variant: "danger"
    });
  }
}

  /* =========================
     ACTION HANDLER
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

  if (approveBtn) approveBtn.onclick = () => action("approve", "Report approved. AI is now scheduled.");

  if (rejectBtn) {
    rejectBtn.onclick = () => {
      if (rejectReasonInput) rejectReasonInput.value = "";
      if (rejectReasonModal) openOverlay(rejectReasonModal, { zIndex: 2800 });
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

        if (aiConfirmModal) openOverlay(aiConfirmModal, { zIndex: 2800 });
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
      // 1. Get the Boar ID
      const maleSwineId = boarSelect?.value;

      // 2. TIME WARP: Capture the specific date
      const aiDate = document.getElementById("ai_date_input")?.value;

      // 3. Keep your existing validation feature
      if (!maleSwineId) {
        // If showFeedback is a custom function in your UI
        if (typeof showFeedback === "function") {
          await showFeedback({
            title: "Select a boar",
            sub: "Required field",
            body: "Please select a boar before confirming.",
            variant: "warn"
          });
        } else {
          alert("Please select a boar.");
        }
        return;
      }

      // 4. Trigger the action with the Time Warp payload
      // We send 'ai_date' so the backend can set the insemination_date in AIRecord.js
      await action(
        "confirm-ai", 
        "AI Confirmed! Swine moved to Under Observation.", 
        { 
          maleSwineId,
          ai_date: aiDate || null, // Sends null if empty, letting backend use Date.now()
          reportId: currentReportId // Ensuring the ID is explicitly linked
        }
      );

      // 5. Keep your existing feature to close the modal
      if (typeof closeAIConfirmModalFn === "function") {
        closeAIConfirmModalFn();
      } else if (aiConfirmModal) {
        aiConfirmModal.style.display = "none";
      }
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

  /* ======================================================
     UPDATE: CONFIRM PREGNANCY (With Time Warp)
  ====================================================== */
  if (confirmPregnancyBtn) {
    confirmPregnancyBtn.onclick = async () => {
      // 1. TIME WARP: Capture the specific date from the UI
      // Ensure you have an <input type="date" id="preg_date_input"> in your HTML/Modal
      const pregDateInput = document.getElementById("preg_date_input");
      const checkDate = pregDateInput ? pregDateInput.value : null;

      // 2. Keep your existing confirmation feature
      const ok = await showConfirm({
        title: "Confirm pregnancy",
        sub: "This will update the swine’s cycle stage.",
        body: "Confirm pregnancy for this sow?"
      });
      if (!ok) return;

      // 3. Trigger the action, passing the check_date to the backend
      // This matches the 'const { check_date } = req.body' in heatReportRoutes.js
      await action(
        "confirm-pregnancy", 
        "Pregnancy confirmed. Expected farrowing date calculated.",
        {
          check_date: checkDate // Sends the warped date or null to use current time
        }
      );
    };
  }

  /* ======================================================
     CONFIRM WEANING (Integrated with Time Portal)
  ====================================================== */
  if (confirmWeaningBtn) {
    confirmWeaningBtn.onclick = async () => {
      // 1. Capture the data from the modal
      const weaningDate = weaningDateInput?.value;
      const weaningWeight = weaningWeightInput?.value;
      const remarks = weaningRemarksInput?.value || "Standard weaning";

      // 2. Validation
      if (!weaningWeight || weaningWeight <= 0) {
        alert("Please enter a valid weaning weight.");
        return;
      }

      // 3. User Confirmation
      const ok = await showConfirm({
        title: "Confirm Weaning",
        sub: "This will move piglets to 'Growing' and reset the Sow to 'Open'.",
        body: "Are you sure you want to finalize weaning for this batch?"
      });
      if (!ok) return;

      // 4. Send to Backend (Matches the route we updated earlier)
      await action("confirm-weaning", "Weaning confirmed and cycle completed!", {
        weaning_date: weaningDate,
        weight: weaningWeight,
        remarks: remarks
      });
    };
  }

  // backend route is /still-heat
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

  // Open farrowing modal above report details + reset values + calc total live
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

  if (farrowingForm) {
    farrowingForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const submitBtn = farrowingForm.querySelector('button[type="submit"]');
      if (submitBtn?.disabled) return;

      let originalText = "";
      if (submitBtn) {
        submitBtn.disabled = true;
        originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Processing...`;
      }

      const farrowingDateInput = document.getElementById("farrowingDateInput");
      const liveInput = document.getElementById("liveCount");
      const mortalityInput = document.getElementById("mortalityCount");

      const male = Number(maleCountInput?.value || 0);
      const female = Number(femaleCountInput?.value || 0);
      const total_live = Number(liveInput?.value || male + female);
      const mortality = Number(mortalityInput?.value || 0);

      if (male + female !== total_live) {
        await showFeedback({
          title: "Validation error",
          sub: "Please check the counts.",
          body: "Male + Female must equal Total Live.",
          variant: "warn"
        });
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalText;
        }
        return;
      }

      const payload = {
        farrowing_date: farrowingDateInput?.value || null,
        total_live,
        mortality,
        male_count: male,
        female_count: female
      };

      try {
        await action("confirm-farrowing", "Farrowing registered! Sow is now Lactating.", payload);

        closeFarrowingModalFn();
        farrowingForm.reset();

        // reset derived label/hidden after reset()
        if (maleCountInput) maleCountInput.value = "0";
        if (femaleCountInput) femaleCountInput.value = "0";
        const liveHidden = document.getElementById("liveCount");
        if (liveHidden) liveHidden.value = "0";
        if (totalLiveLabel) totalLiveLabel.textContent = "0";
      } catch (err) {
        console.error("Farrowing registration failed:", err);
        await showFeedback({
          title: "Farrowing failed",
          sub: "Please try again",
          body: err?.message || "Action failed",
          variant: "danger"
        });
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalText;
        }
      }
    });
  }

  /* =========================
     EVIDENCE VIEWER (IMAGE/VIDEO)
  ========================= */
  let evScale = 1;
  let isDragging = false;
  let startX = 0,
    startY = 0;
  let imgX = 0,
    imgY = 0;

  function setZoomLabel() {
    if (evZoomLabel) evZoomLabel.textContent = `${Math.round(evScale * 100)}%`;
  }

  function applyImageTransform() {
    if (!evImage) return;
    evImage.style.transform = `translate(${imgX}px, ${imgY}px) scale(${evScale})`;
    setZoomLabel();
  }

  function resetImageView() {
    evScale = 1;
    imgX = 0;
    imgY = 0;
    applyImageTransform();
  }

  function openEvidenceViewer({ type, src }) {
    if (!evidenceViewerModal) return;

    // reset
    if (evImageWrap) evImageWrap.style.display = "none";
    if (evVideoWrap) evVideoWrap.style.display = "none";

    // stop video if open
    if (evVideo) {
      evVideo.pause();
      evVideo.removeAttribute("src");
      evVideo.load();
    }

    // open modal
    evidenceViewerModal.style.display = "flex";
    lockScroll();

    if (type === "image") {
      if (evImageWrap) evImageWrap.style.display = "block";
      if (evImage) {
        evImage.src = src;
        resetImageView();
      }
    } else {
      if (evVideoWrap) evVideoWrap.style.display = "block";
      if (evVideo) {
        evVideo.src = src;
        evVideo.load();
      }
    }
  }

  function closeEvidenceViewerModal() {
    if (!evidenceViewerModal) return;

    // stop video
    if (evVideo) {
      evVideo.pause();
      evVideo.removeAttribute("src");
      evVideo.load();
    }

    evidenceViewerModal.style.display = "none";
    unlockScrollIfNoOverlayOpen();
  }

  closeEvidenceViewer?.addEventListener("click", closeEvidenceViewerModal);
  evidenceViewerModal?.addEventListener("click", (e) => {
    if (e.target === evidenceViewerModal) closeEvidenceViewerModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && evidenceViewerModal?.style.display === "flex") {
      closeEvidenceViewerModal();
    }
  });

  /* Zoom buttons */
  evZoomIn?.addEventListener("click", () => {
    evScale = Math.min(evScale + 0.2, 4);
    applyImageTransform();
  });
  evZoomOut?.addEventListener("click", () => {
    evScale = Math.max(evScale - 0.2, 0.4);
    applyImageTransform();
  });
  evZoomReset?.addEventListener("click", resetImageView);

  /* Wheel zoom */
  evStage?.addEventListener(
    "wheel",
    (e) => {
      if (evImageWrap?.style.display !== "block") return;
      e.preventDefault();

      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      evScale = Math.min(Math.max(evScale + delta, 0.4), 4);
      applyImageTransform();
    },
    { passive: false }
  );

  /* Drag to pan (image) */
  evStage?.addEventListener("mousedown", (e) => {
    if (evImageWrap?.style.display !== "block") return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    startX = e.clientX;
    startY = e.clientY;
    imgX += dx;
    imgY += dy;
    applyImageTransform();
  });

  window.addEventListener("mouseup", () => {
    isDragging = false;
  });

  /* Click handler on evidence items (delegated) */
  evidenceGallery?.addEventListener("click", (e) => {
    const t = e.target.closest("[data-ev-type][data-ev-src]");
    if (!t) return;

    const type = t.getAttribute("data-ev-type");
    const src = t.getAttribute("data-ev-src");
    if (!type || !src) return;

    openEvidenceViewer({ type, src });
  });

  /* =========================
     FILTERING (MAIN)
  ========================= */
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
    filteredReports = EXCLUDE_ARCHIVED_FROM_ACTIVE_LIST ? allReports.filter((r) => !isArchivedReport(r)) : [...allReports];

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