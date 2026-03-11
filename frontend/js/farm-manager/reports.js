import { authGuard } from "/js/authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  // ---------------- AUTH ----------------
  const user = await authGuard(["farm_manager", "encoder"]);
  if (!user) return;

  const token = localStorage.getItem("token");
  const BACKEND_URL = "http://localhost:5000";

  // ------------- FILTER LOGIG -------------
  let selectedStatus = "";

  document.querySelectorAll(".heat-tab").forEach(tab => {
    tab.addEventListener("click", function () {

      document.querySelectorAll(".heat-tab")
        .forEach(t => t.classList.remove("active"));

      this.classList.add("active");
      selectedStatus = this.dataset.status || "";

      applyFilters();
    });
  });

  let selectedFarmerId = null;

  async function loadFarmerForFilter() {
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/auth/farmers/${user.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const data = await res.json();
      const list = data.farmers || [];

      const wrap = document.getElementById("farmerOptions");
      const searchInput = document.getElementById("farmerSearch");
      const dropdownBtn = document.getElementById("farmerDropdownBtn");

      if (!wrap || !dropdownBtn) return;

      function render(listToRender) {
        wrap.innerHTML = "";

        if (!listToRender.length) {
          wrap.innerHTML =
            `<div class="text-muted small px-2">No farmers found</div>`;
          return;
        }

        listToRender.forEach(f => {
          const div = document.createElement("div");
          div.className = "dropdown-item small";
          div.textContent =
            `${f.first_name} ${f.last_name}`.trim();

          div.addEventListener("click", () => {
            selectedFarmerId = f._id;
            dropdownBtn.textContent = div.textContent;

            bootstrap.Dropdown
              .getInstance(dropdownBtn)
              ?.hide();

            applyFilters();
          });

          wrap.appendChild(div);
        });
      }

      render(list);

      // Search filter
      if (searchInput && !searchInput.dataset.bound) {
        searchInput.dataset.bound = "true";
        searchInput.addEventListener("input", () => {
          const term = searchInput.value.toLowerCase();
          render(
            list.filter(f =>
              `${f.first_name} ${f.last_name}`
                .toLowerCase()
                .includes(term)
            )
          );
        });
      }

    } catch (err) {
      console.error("Load farmers failed", err);
    }
  }

  loadFarmerForFilter();


  // ---------------- DOM ----------------
  const countInHeat = document.getElementById("countInHeat");
  const countAwaitingRecheck = document.getElementById("countAwaitingRecheck");
  const countPregnant = document.getElementById("countPregnant");
  const countFarrowingReady = document.getElementById("countFarrowingReady");
  const countLactating = document.getElementById("countLactating");

  const reportDetailsModal = document.getElementById("reportDetailsModal");
  const closeReportModal = document.getElementById("closeReportModal");
  const closeReportModalBtn = document.getElementById("closeReportModalBtn");

  const reportSwine = document.getElementById("reportSwine");
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

  const clearFilterBtn = document.getElementById("clearFilter");

  // Farrowing modal
  const farrowingModal = document.getElementById("farrowingModal");
  const farrowingForm = document.getElementById("farrowingForm");


  // Media Elements
  const evidenceGallery = document.getElementById("evidenceGallery");

  const approveBtn = document.getElementById("approveBtn");
  const rejectBtn = document.getElementById("rejectBtn");
  const confirmAIBtn = document.getElementById("confirmAIBtn");
  const confirmFarrowingBtn = document.getElementById("confirmFarrowingBtn"); // Added for Farrowing

  const aiConfirmModal = document.getElementById("aiConfirmModal");
  const boarSelect = document.getElementById("boarSelect");
  const submitAIBtn = document.getElementById("submitAI");

  // Track Progress panel (placeholder)
  const progressPanel = document.getElementById("trackProgressPanel");
  const closeProgressPanel = document.getElementById("closeProgressPanel");

  const heatFilterForm = document.getElementById("heatFilterForm");

  heatFilterForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    applyFilters();
  });

  const toggleFarmerBtn = document.getElementById("toggleFarmerBtn");
  if (toggleFarmerBtn && !toggleFarmerBtn.dataset.bound) {
    toggleFarmerBtn.dataset.bound = "true";
    toggleFarmerBtn.addEventListener("click", () => {
      const farmerCard = document.getElementById("farmerInfoCard");
      const isVisible = farmerCard && farmerCard.style.display !== "none";
      setFarmerCardVisible(!isVisible);
    });
  }

  // ---------------- MODAL HELPERS ----------------
  function closeReportDetails() {
    // Purpose: close modal and safely reset dynamic media preview
    reportDetailsModal.style.display = "none";
    document.body.style.overflow = "";

    const videos = reportDetailsModal.querySelectorAll("video");
    videos.forEach(v => {
      v.pause();
      v.currentTime = 0;
    });

    const preview = document.getElementById("evidencePreview");
    if (preview) {
      preview.style.display = "none";
      preview.innerHTML = "";
    }

    evidenceGallery.innerHTML = "";
  }

  if (closeReportModal) {
    closeReportModal.onclick = closeReportDetails;
  }

  if (closeReportModalBtn) closeReportModalBtn.onclick = closeReportDetails;

  reportDetailsModal.addEventListener("click", e => {
    if (e.target === reportDetailsModal) closeReportDetails();
  });

  let allReports = [];
  let filteredReports = [];
  let currentReportId = null;
  let currentReportData = null;

  // ===== MAIN TABLE PAGINATION =====
  let currentPage = 1;
  const ROWS_PER_PAGE = 10;

  // ---------------- HELPERS ----------------
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

  function ensureReportLoadingOverlay() {
    if (!reportDetailsModal) return null;

    const modalBody = reportDetailsModal.querySelector(".modal-body");
    if (!modalBody) return null;

    // make sure modal body can contain an absolute overlay
    const style = window.getComputedStyle(modalBody);
    if (style.position === "static") modalBody.style.position = "relative";

    let overlay = document.getElementById("reportLoadingOverlay");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "reportLoadingOverlay";
    overlay.style.cssText = `
      position:absolute; inset:0;
      display:none;
      align-items:center;
      justify-content:center;
      background:rgba(255,255,255,.92);
      z-index:50;
      border-radius:12px;
    `;

    overlay.innerHTML = `
      <div style="text-align:center; padding:30px;">
        <div class="spinner-border text-success"></div>
        <p class="mt-3 text-muted mb-0">Loading report details...</p>
      </div>
    `;

    modalBody.appendChild(overlay);
    return overlay;
  }

  function showReportLoading() {
    if (!reportDetailsModal) return;

    // open modal (keep your current behavior)
    reportDetailsModal.style.display = "flex";
    document.body.style.overflow = "hidden";

    const overlay = ensureReportLoadingOverlay();
    if (overlay) overlay.style.display = "flex";
  }

  function hideReportLoading() {
    const overlay = document.getElementById("reportLoadingOverlay");
    if (overlay) overlay.style.display = "none";
  }

  /* ================= IMAGE HELPERS (match reproduction-monitoring.js) ================= */
  function resolveImageUrl(path) {
    if (!path) return "/images/default-avatar.png";
    if (path.startsWith("http://") || path.startsWith("https://")) return path;

    // IMPORTANT: make /uploads/... load from backend
    if (path.startsWith("/")) return `${BACKEND_URL}${path}`;

    // filename only → profiles folder (backend)
    return `${BACKEND_URL}/uploads/profiles/${path}`;
  }

  function setImageEl(imgEl, src) {
    if (!imgEl) return;

    const finalSrc = resolveImageUrl(src);
    const cacheBust = finalSrc.includes("?") ? "&" : "?";

    imgEl.onload = () => {
      imgEl.style.display = "block";          // 👈 SHOW IMAGE
      const fallback = imgEl.nextElementSibling;
      if (fallback) fallback.style.display = "none"; // 👈 HIDE ICON
    };

    imgEl.onerror = () => {
      imgEl.onerror = null;
      imgEl.style.display = "none";
      const fallback = imgEl.nextElementSibling;
      if (fallback) fallback.style.display = "flex";
    };

    imgEl.src = `${finalSrc}${cacheBust}v=${Date.now()}`;
  }

  function ensureAvatarSlot(slotId, imgId, fallbackIconClass = "bi-person") {
    const slot = document.getElementById(slotId);
    if (!slot) return null;

    let img = document.getElementById(imgId);
    if (img) return img;

    // If slot currently only has an icon, keep it as fallback behind the image
    slot.innerHTML = `
      <img id="${imgId}" src="/images/default-avatar.png" alt="Avatar"
           style="width:100%; height:100%; object-fit:cover; border-radius:12px; display:block;" />
      <i class="bi ${fallbackIconClass}" aria-hidden="true"
         style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; opacity:.25; font-size:22px;"></i>
    `;

    // Ensure slot can position the fallback icon
    slot.style.position = slot.style.position || "relative";
    slot.style.overflow = "hidden";

    img = document.getElementById(imgId);
    return img;
  }

  function setFarmerCardVisible(visible) {
    const farmerCard = document.getElementById("farmerInfoCard");
    const toggleBtn = document.getElementById("toggleFarmerBtn");

    if (farmerCard) farmerCard.style.display = visible ? "block" : "none";

    if (toggleBtn) {
      toggleBtn.setAttribute("aria-expanded", visible ? "true" : "false");
      toggleBtn.innerHTML = visible
        ? `<i class="bi bi-person-vcard"></i> Hide Farmer`
        : `<i class="bi bi-person-vcard"></i> Show Farmer`;
    }
  }

  /* ================= EVIDENCE PANEL OVERLAY (zoom like screenshot) ================= */
  function ensureEvidencePanel() {
    let panel = document.getElementById("evidencePanelOverlay");
    if (panel) return panel;

    panel = document.createElement("div");
    panel.id = "evidencePanelOverlay";
    panel.style.cssText = `
      position:fixed; inset:0; z-index:9999; display:none;
      background:rgba(17,24,39,.55);
      padding:18px;
      box-sizing:border-box;
    `;

    panel.innerHTML = `
      <div id="evidencePanelCard"
           style="
            height:100%;
            max-width:1100px;
            margin:0 auto;
            background:#fff;
            border-radius:18px;
            box-shadow:0 18px 60px rgba(0,0,0,.25);
            display:flex;
            flex-direction:column;
            overflow:hidden;
           ">
        <div style="
          display:flex; align-items:center; justify-content:space-between;
          padding:14px 16px; border-bottom:1px solid #eef1f4;">
          <div style="display:flex; align-items:center; gap:10px; font-weight:800; color:#111827;">
            <i class="bi bi-images"></i>
            <span>Evidence Preview</span>
          </div>

          <div style="display:flex; align-items:center; gap:10px;">
            <button type="button" id="evidenceZoomOut"
              style="border:1px solid #d1d5db; background:#fff; border-radius:10px; padding:8px 10px; font-weight:700;">
              <i class="bi bi-zoom-out"></i>
            </button>
            <button type="button" id="evidenceZoomReset"
              style="border:1px solid #d1d5db; background:#fff; border-radius:10px; padding:8px 10px; font-weight:700;">
              <i class="bi bi-aspect-ratio"></i>
            </button>
            <button type="button" id="evidenceZoomIn"
              style="border:1px solid #d1d5db; background:#fff; border-radius:10px; padding:8px 10px; font-weight:700;">
              <i class="bi bi-zoom-in"></i>
            </button>
            <button type="button" id="evidencePanelClose"
              style="border:1px solid #c7f0df; background:#fff; border-radius:999px; width:42px; height:42px; font-weight:900;">
              <i class="bi bi-x-lg"></i>
            </button>
          </div>
        </div>

        <div id="evidencePanelBody"
             style="flex:1; padding:14px; background:#f8fafc;">
          <div id="evidenceStage"
               style="
                height:100%;
                background:#fff;
                border-radius:16px;
                border:1px solid #eef1f4;
                overflow:hidden;
                position:relative;
                display:flex;
                align-items:center;
                justify-content:center;">
            <img id="evidencePanelImg" alt="Evidence"
                 style="
                  max-width:100%;
                  max-height:100%;
                  transform:translate(0px, 0px) scale(1);
                  transform-origin:center center;
                  user-select:none;
                  -webkit-user-drag:none;
                  cursor:grab;
                  display:none;
                 " />
            <video id="evidencePanelVideo" controls
                   style="max-width:100%; max-height:100%; border-radius:14px; display:none;"></video>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(panel);

    // Close behavior
    const closeBtn = panel.querySelector("#evidencePanelClose");
    closeBtn?.addEventListener("click", () => closeEvidencePanel());

    panel.addEventListener("click", (e) => {
      if (e.target === panel) closeEvidencePanel();
    });

    // Zoom + pan behavior (image only)
    const img = panel.querySelector("#evidencePanelImg");
    const zoomInBtn = panel.querySelector("#evidenceZoomIn");
    const zoomOutBtn = panel.querySelector("#evidenceZoomOut");
    const zoomResetBtn = panel.querySelector("#evidenceZoomReset");

    let scale = 1;
    let tx = 0;
    let ty = 0;

    let isPanning = false;
    let startX = 0;
    let startY = 0;
    let startTx = 0;
    let startTy = 0;

    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

    const applyTransform = () => {
      if (!img) return;
      img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
      img.style.cursor = scale > 1 ? (isPanning ? "grabbing" : "grab") : "default";
    };

    const setScale = (next) => {
      scale = clamp(next, 1, 6);
      if (scale === 1) {
        tx = 0;
        ty = 0;
      }
      applyTransform();
    };

    zoomInBtn?.addEventListener("click", () => setScale(scale + 0.25));
    zoomOutBtn?.addEventListener("click", () => setScale(scale - 0.25));
    zoomResetBtn?.addEventListener("click", () => setScale(1));

    img?.addEventListener("pointerdown", (e) => {
      if (scale <= 1) return;
      isPanning = true;
      startX = e.clientX;
      startY = e.clientY;
      startTx = tx;
      startTy = ty;
      img.setPointerCapture(e.pointerId);
      applyTransform();
    });

    img?.addEventListener("pointermove", (e) => {
      if (!isPanning || scale <= 1) return;
      tx = startTx + (e.clientX - startX);
      ty = startTy + (e.clientY - startY);
      applyTransform();
    });

    img?.addEventListener("pointerup", () => {
      isPanning = false;
      applyTransform();
    });

    img?.addEventListener("pointercancel", () => {
      isPanning = false;
      applyTransform();
    });

    // Wheel zoom (desktop)
    const stage = panel.querySelector("#evidenceStage");
    stage?.addEventListener("wheel", (e) => {
      // allow normal scroll outside, but on overlay we want zoom
      e.preventDefault();
      const delta = Math.sign(e.deltaY);
      setScale(scale + (delta > 0 ? -0.2 : 0.2));
    }, { passive: false });

    // Expose small API via dataset (no globals)
    panel._state = {
      reset() {
        scale = 1; tx = 0; ty = 0;
        applyTransform();
      },
      setScale
    };

    return panel;
  }

  function openEvidencePanel({ url, isVideo }) {
    const panel = ensureEvidencePanel();
    const img = panel.querySelector("#evidencePanelImg");
    const vid = panel.querySelector("#evidencePanelVideo");
    const zoomInBtn = panel.querySelector("#evidenceZoomIn");
    const zoomOutBtn = panel.querySelector("#evidenceZoomOut");
    const zoomResetBtn = panel.querySelector("#evidenceZoomReset");

    // reset state
    panel._state?.reset?.();

    // toggle controls for video
    const showZoom = !isVideo;
    if (zoomInBtn) zoomInBtn.style.display = showZoom ? "inline-flex" : "none";
    if (zoomOutBtn) zoomOutBtn.style.display = showZoom ? "inline-flex" : "none";
    if (zoomResetBtn) zoomResetBtn.style.display = showZoom ? "inline-flex" : "none";

    if (isVideo) {
      if (img) img.style.display = "none";
      if (vid) {
        vid.style.display = "block";
        vid.src = url;
        vid.currentTime = 0;
        vid.play().catch(() => {});
      }
    } else {
      if (vid) {
        vid.pause?.();
        vid.removeAttribute("src");
        vid.load?.();
        vid.style.display = "none";
      }
      if (img) {
        img.style.display = "block";
        img.src = url;
        img.onerror = () => {
          img.onerror = null;
          img.src = "https://placehold.co/1200x800?text=Load+Error";
        };
      }
    }

    panel.style.display = "block";
    document.body.style.overflow = "hidden";
  }

  function closeEvidencePanel() {
    const panel = document.getElementById("evidencePanelOverlay");
    if (!panel) return;

    const vid = panel.querySelector("#evidencePanelVideo");
    if (vid) {
      vid.pause?.();
      vid.removeAttribute("src");
      vid.load?.();
      vid.style.display = "none";
    }

    const img = panel.querySelector("#evidencePanelImg");
    if (img) {
      img.removeAttribute("src");
      img.style.display = "none";
    }

    panel.style.display = "none";
    // if report modal is open, keep body locked; otherwise unlock
    if (!reportDetailsModal || reportDetailsModal.style.display !== "flex") {
      document.body.style.overflow = "";
    }
  }

  // ---------------- FETCH REPORTS ----------------
  async function loadReports() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/heat/all`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include"
      });

      if (res.status === 401 || res.status === 403) {
        alert("Session expired. Please log in again.");
        window.location.href = "/login";
        return;
      }

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error("Failed to load reports");

      // This is the specific line that prevents rejected reports from displaying
      allReports = (data.reports || []).filter(r => r.status !== "rejected");

      filteredReports = [...allReports];

      renderStats(allReports);
      renderCards(filteredReports);

    } catch (err) {
      console.error("Reports load error:", err);
    }
  }

  // ---------------- STATS ----------------
  function renderStats(reports) {
    if (countInHeat) {
      countInHeat.textContent = reports.filter(r =>
        ["pending", "approved", "ai_confirmed"].includes(r.status)
      ).length;
    }
    if (countAwaitingRecheck) countAwaitingRecheck.textContent = reports.filter(r => ["under_observation", "waiting_heat_check", "ai_confirmed"].includes(r.status)).length;
    if (countPregnant) countPregnant.textContent = reports.filter(r => r.status === "pregnant").length;
    if (countLactating) {
      countLactating.textContent = reports.filter(r => r.status === "lactating").length;
    }

    if (countFarrowingReady) {
      countFarrowingReady.textContent = reports.filter(r => {
        if (!["pregnant", "farrowing_ready"].includes(r.status) || !r.expected_farrowing) {
          return false;
        }
        const daysStr = getDaysLeft(r.expected_farrowing);
        if (daysStr === "Overdue" || daysStr === "TODAY") return true;
        const daysNum = parseInt(daysStr);
        return !isNaN(daysNum) && daysNum <= 7;
      }).length;
    }
  }

  // ---------------- TABLE ----------------
  function renderCards(reports) {
    const cardList = document.getElementById("reportsCardList");
    if (!cardList) return;

    cardList.innerHTML = "";

    const totalPages = Math.max(1, Math.ceil(reports.length / ROWS_PER_PAGE));
    if (currentPage > totalPages) currentPage = totalPages || 1;

    const start = (currentPage - 1) * ROWS_PER_PAGE;
    const pageItems = reports.slice(start, start + ROWS_PER_PAGE);

    if (!pageItems.length) {
      cardList.innerHTML = "<p class='text-muted'>No reports found.</p>";
      pageIndicator.textContent = `Page 1 of 1`;
      prevPageBtn.disabled = true;
      nextPageBtn.disabled = true;
      return;
    }

    pageItems.forEach(r => {
      const probability = r.heat_probability ?? 0;
      const status = r.status || "pending";
      const statusLabel = status.replace(/_/g, " ");

      const card = document.createElement("div");
      card.className = "report-card";

      card.innerHTML = `
        <div class="report-card-header">
          <div>
            <strong class="swine-id">
              ${r.swine_id?.swine_id || "-"}
            </strong>
            <div class="subtext">
              ${r.farmer_id
        ? `${r.farmer_id.first_name} ${r.farmer_id.last_name}`
        : "Unknown Farmer"}
            </div>
            <div class="date">
              ${new Date(r.createdAt).toLocaleDateString()}
            </div>
          </div>

          <span class="status-badge ${status}">
            ${statusLabel}
          </span>
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
          ${Array.isArray(r.signs) && r.signs.length
        ? r.signs
          .map(
            s => `<span class="indicator-chip">${s}</span>`
          )
          .join("")
        : `<span class="text-muted">No indicators</span>`
        }
        </div>

        <div class="report-card-actions">
          <button
            class="btn-nav secondary btn-view"
            data-id="${r._id}">
            View Details
          </button>

          <button
            class="btn-nav btn-track"
            data-id="${r._id}">
            Track Progress
          </button>
        </div>
      `;

      cardList.appendChild(card);
    });

    //Open Progress Panel
    async function openProgressPanel(reportId) {
      if (!progressPanel) return;

      const closeBtn = document.getElementById("closeProgressPanel");
      if (closeBtn) closeBtn.onclick = () => progressPanel.classList.remove("open");

      progressPanel.classList.add("open");

      try {
        // use cached report detail if available
        let r = currentReportData && currentReportData._id === reportId
          ? currentReportData
          : null;

        if (!r) {
          const res = await fetch(`${BACKEND_URL}/api/heat/${reportId}/detail`, {
            headers: { Authorization: `Bearer ${token}` },
            credentials: "include"
          });

          const data = await res.json();
          if (!res.ok || !data.success) return;

          r = data.report;
          currentReportData = r; // refresh cache
        }

        // 1) header
        const farmerEl = document.getElementById("progressFarmerName");
        if (farmerEl) {
          farmerEl.textContent = `Farmer: ${
            r.farmer_id ? `${r.farmer_id.first_name} ${r.farmer_id.last_name}` : "N/A"
          }`;
        }

        const swineIdEl = document.getElementById("progressSwineId");
        if (swineIdEl) swineIdEl.textContent = r.swine_id?.swine_id || "Unknown";

        const timelineContainer = document.getElementById("cycleTimeline");
        if (!timelineContainer) return;
        timelineContainer.innerHTML = "";

        const events = [];

        if (r.status === "lactating") {
          events.push({
            title: "Lactating",
            desc: "Sow is currently nursing piglets.",
            icon: "bi-heart-pulse-fill",
            date: "Currently Active"
          });
        }

        if (["farrowing_ready", "lactating"].includes(r.status)) {
          events.push({
            title: "Farrowing Confirmed",
            desc: "Birth process recorded successfully.",
            icon: "bi-piggy-bank",
            date: r.actual_farrowing_date ? new Date(r.actual_farrowing_date).toLocaleDateString() : "Check Records"
          });
        }

        if (["pregnant", "farrowing_ready", "lactating"].includes(r.status)) {
          events.push({
            title: "Pregnant & Under 115 Days Monitoring",
            desc: "Pregnancy confirmed. Monitoring gestation period.",
            icon: "bi-person-hearts",
            date: r.expected_farrowing ? `Due: ${new Date(r.expected_farrowing).toLocaleDateString()}` : "Ongoing"
          });
        }

        if (["under_observation", "pregnant", "farrowing_ready", "lactating"].includes(r.status)) {
          events.push({
            title: "Under 30 Days Monitoring",
            desc: "Monitoring for 'return to heat' signs post-AI.",
            icon: "bi-eye",
            date: r.ai_date ? `Started: ${new Date(r.ai_date).toLocaleDateString()}` : "Ongoing"
          });
        }

        if (["ai_confirmed", "under_observation", "pregnant", "farrowing_ready", "lactating"].includes(r.status)) {
          events.push({
            title: "Artificial Insemination Performed",
            desc: "Farm Manager/Encoder confirmed Artificial Insemination procedure.",
            icon: "bi-droplet-half",
            date: r.ai_date ? new Date(r.ai_date).toLocaleDateString() : "Date N/A"
          });
        }

        if (r.status !== "pending" && r.status !== "rejected") {
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

        events.forEach(event => {
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
        if (currentStageEl) currentStageEl.textContent = (r.status || "").replace(/_/g, " ").toUpperCase();

        const remainingEl = document.getElementById("remainingDays");
        if (remainingEl) {
          remainingEl.textContent = r.expected_farrowing
            ? `${getDaysLeft(r.expected_farrowing)} remaining`
            : "—";
        }
      } catch (err) {
        console.error("Error loading dynamic progress:", err);
      }
    }

    // Pagination UI
    pageIndicator.textContent = `Page ${currentPage} of ${totalPages || 1}`;
    prevPageBtn.disabled = currentPage === 1;
    nextPageBtn.disabled = currentPage === totalPages || totalPages === 0;

    // View details binding
    cardList.querySelectorAll(".btn-view").forEach(btn => {
      btn.onclick = () => viewReport(btn.dataset.id);
    });

    // Track progress (placeholder)
    cardList.querySelectorAll(".btn-track").forEach(btn => {
      btn.onclick = () => openProgressPanel(btn.dataset.id);
    });

  }

  // ================= MAIN TABLE PAGINATION CONTROLS =================
  prevPageBtn?.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      renderCards(filteredReports);

      // Optional: keep scroll position UX consistent
      document.getElementById("reportsCardList")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  nextPageBtn?.addEventListener("click", () => {
    const totalPages = Math.ceil(filteredReports.length / ROWS_PER_PAGE);

    if (currentPage < totalPages) {
      currentPage++;
      renderCards(filteredReports);

      // Optional: keep scroll position UX consistent
      document.getElementById("reportsCardList")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  // ---------------- VIEW DETAILS ----------------  
  async function viewReport(id) {
    try {
      showReportLoading();

      const res = await fetch(`${BACKEND_URL}/api/heat/${id}/detail`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include"
      });
      const data = await res.json();

      console.log("DETAIL RESPONSE:", data);
      console.log("STATUS CODE:", res.status);

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Could not load report details");
      }

      const r = data.report;
      currentReportId = id;
      currentReportData = r;

      /* ================= LOCAL RESOLVERS (MVP SAFE) ================= */
      const toNumberOrNull = (v) => {
        if (v === null || v === undefined || v === "") return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };

      const pickLatestByDate = (arr, dateKeys = ["date", "createdAt", "updatedAt", "recordedAt"]) => {
        if (!Array.isArray(arr) || !arr.length) return null;
        const withDate = arr
          .map(x => {
            const d = dateKeys.map(k => x?.[k]).find(Boolean);
            const t = d ? new Date(d).getTime() : NaN;
            return { x, t };
          })
          .filter(o => Number.isFinite(o.t))
          .sort((a, b) => b.t - a.t);

        return withDate[0]?.x || arr[arr.length - 1] || null;
      };

      const resolveCurrentWeight = (swine) => {
        if (!swine || typeof swine !== "object") return null;

        // common direct fields
        const directKeys = [
          "current_weight", "currentWeight",
          "latest_weight", "latestWeight",
          "weight", "weight_kg", "currentKg"
        ];

        for (const k of directKeys) {
          const n = toNumberOrNull(swine[k]);
          if (n !== null) return n;
        }

        // nested object
        const nested = swine.weight_record || swine.latest_weight_record || swine.latestWeightRecord;
        const nestedVal = toNumberOrNull(nested?.weight ?? nested?.kg ?? nested?.value);
        if (nestedVal !== null) return nestedVal;

        // arrays
        const candidates = [
          swine.weight_records,
          swine.weightRecords,
          swine.weights,
          swine.growth_records,
          swine.growthRecords
        ].find(a => Array.isArray(a) && a.length);

        if (candidates) {
          const latest = pickLatestByDate(candidates);
          const n = toNumberOrNull(latest?.weight ?? latest?.kg ?? latest?.value ?? latest?.current_weight);
          if (n !== null) return n;
        }

        return null;
      };

      const resolveCurrentCycle = (swine, report) => {
        // prefer report-level cycle if present
        const reportCycle = toNumberOrNull(report?.cycle_no ?? report?.cycleNo ?? report?.cycle);
        if (reportCycle !== null) return reportCycle;

        if (!swine || typeof swine !== "object") return null;

        const directKeys = [
          "cycle_no", "cycleNo",
          "current_cycle", "currentCycle",
          "cycle", "cycle_number", "cycleNumber",
          "parity", "parity_no", "parityNo"
        ];

        for (const k of directKeys) {
          const n = toNumberOrNull(swine[k]);
          if (n !== null) return n;
        }

        // cycles array fallback
        const cyclesArr = swine.cycles || swine.breeding_cycles || swine.breedingCycles;
        if (Array.isArray(cyclesArr) && cyclesArr.length) {
          const latest = pickLatestByDate(cyclesArr);
          const n = toNumberOrNull(latest?.cycle_no ?? latest?.cycleNo ?? latest?.cycle);
          if (n !== null) return n;
          return cyclesArr.length; // MVP fallback
        }

        return null;
      };

      const tryFetchSwineDetail = async (swineMongoId) => {
        if (!swineMongoId) return null;

        const endpoints = [
          `${BACKEND_URL}/api/swine/${swineMongoId}`,
          `${BACKEND_URL}/api/swine/single/${swineMongoId}`,
          `${BACKEND_URL}/api/swine/view/${swineMongoId}`
        ];

        for (const url of endpoints) {
          try {
            const rr = await fetch(url, {
              headers: { Authorization: `Bearer ${token}` },
              credentials: "include"
            });
            if (!rr.ok) continue;

            const dd = await rr.json();
            const sw = dd?.swine || dd?.data || dd;
            if (sw && typeof sw === "object") return sw;
          } catch (_) {}
        }

        return null;
      };

      // ================= STATUS (CAPSULE) =================
      const status = r.status || "pending";
      const statusLabel = status.replace(/_/g, " ");

      if (reportStatus) {
        reportStatus.textContent = statusLabel;
        reportStatus.setAttribute("data-status", status);
      }

      // ================= NEW MODAL FIELDS (IF PRESENT) =================
      const pigTagEl = document.getElementById("pigTag");
      const pigWeightEl = document.getElementById("pigWeight");
      const pigCycleEl = document.getElementById("pigCycle");
      // NOTE: pigStage pill removed in UI (replaced by health pill). Keep only if element exists.
      const pigStageEl = document.getElementById("pigStage");

      if (pigTagEl) pigTagEl.textContent = r.swine_id?.swine_id || "—";

      // ================= WEIGHT + CYCLE (FIXED + FALLBACK FETCH) =================
      let swineObj = r.swine_id && typeof r.swine_id === "object" ? r.swine_id : null;

      let weightVal = resolveCurrentWeight(swineObj);
      let cycleVal = resolveCurrentCycle(swineObj, r);

      if ((weightVal === null || cycleVal === null) && swineObj?._id) {
        const swineDetail = await tryFetchSwineDetail(swineObj._id);
        if (swineDetail) {
          weightVal = weightVal ?? resolveCurrentWeight(swineDetail);
          cycleVal = cycleVal ?? resolveCurrentCycle(swineDetail, r);
        }
      }

      if (pigWeightEl) pigWeightEl.textContent = (weightVal !== null) ? `${weightVal} kg` : "—";
      if (pigCycleEl) pigCycleEl.textContent = (cycleVal !== null) ? `Cycle ${cycleVal}` : "—";

      // Keep old id (compat)
      if (pigStageEl) pigStageEl.textContent = statusLabel || "—";

      // ================= HEALTH PILL (NEW) =================
      const healthPill = document.getElementById("pigHealthPill");
      const healthText = document.getElementById("pigHealthText");

      const rawHealth =
        r.swine_id?.health_status ??
        r.swine_id?.healthStatus ??
        r.swine_id?.status_health ??
        r.swine_id?.condition ??
        r.swine_id?.health ??
        "unknown";

      const normalizedHealth = String(rawHealth || "unknown").toLowerCase();

      const healthLabel =
        normalizedHealth === "healthy" ? "Healthy" :
        normalizedHealth === "sick" ? "Sick" :
        normalizedHealth === "injured" ? "Injured" :
        normalizedHealth === "quarantine" ? "Quarantine" :
        "Unknown";

      if (healthText) healthText.textContent = healthLabel;

      if (healthPill) {
        const key =
          normalizedHealth === "healthy" ? "healthy" :
          normalizedHealth === "sick" ? "sick" :
          "unknown";
        healthPill.setAttribute("data-health", key);
      }

      // ================= FARMER (TOGGLE + REPORTED BY LINE) =================
      const farmerNameEl = document.getElementById("farmerName");
      const farmerIdEl = document.getElementById("farmerIdText");
      const farmerPhoneEl = document.getElementById("farmerPhone");
      const farmerAddressEl = document.getElementById("farmerAddress");

      const farmerObj = r.farmer_id && typeof r.farmer_id === "object" ? r.farmer_id : null;

      // (D) Reported-by line (always visible)
      const reportedByName = document.getElementById("reportedByName");
      const reportedById = document.getElementById("reportedById");

      const farmerDisplayName = farmerObj
        ? `${farmerObj.first_name || ""} ${farmerObj.last_name || ""}`.trim()
        : "Unknown Farmer";

      if (reportedByName) reportedByName.textContent = farmerDisplayName || "Unknown Farmer";
      if (reportedById) {
        const fid = farmerObj?.farmer_id || farmerObj?._id || "";
        reportedById.textContent = fid ? `(${fid})` : "";
      }

      // (A) default: hide farmer card whenever opening a report
      // IMPORTANT: setFarmerCardVisible() must exist in your file (from our A+D toggle work)
      setFarmerCardVisible(false);

      // Fill farmer card fields (even if hidden by default)
      if (farmerNameEl) farmerNameEl.textContent = farmerDisplayName || "Unknown Farmer";
      if (farmerIdEl) farmerIdEl.textContent = farmerObj?.farmer_id || farmerObj?._id || "—";
      if (farmerPhoneEl) farmerPhoneEl.textContent = farmerObj?.contact_no || farmerObj?.phone || "—";
      if (farmerAddressEl) farmerAddressEl.textContent = farmerObj?.address || "—";

    
      // ================= AVATARS (FARMER + PIG) =================
      const farmerImg = document.getElementById("farmerAvatarImg");
      const pigImg = document.getElementById("pigAvatarImg");

      console.log("Farmer profile:", farmerObj?.profile_picture);

      // Force show/hide handled by setImageEl onload/onerror
      setImageEl(farmerImg, farmerObj?.profile_picture);

      // pig picture if available in schema
      const pigPic =
        r.swine_id?.profile_picture ||
        r.swine_id?.image ||
        r.swine_id?.photo ||
        r.swine_id?.picture ||
        null;

      setImageEl(pigImg, pigPic);

      // Purpose: report meta card fields
      const probEl = document.getElementById("reportProbabilityValue");
      const dtEl = document.getElementById("reportDateTime");

      if (probEl) probEl.textContent = r.heat_probability != null ? `${r.heat_probability}%` : "—";
      if (dtEl) dtEl.textContent = r.createdAt ? new Date(r.createdAt).toLocaleString() : "—";

      // Purpose: notes/remarks placeholder
      const notesEl = document.getElementById("reportNotes");
      const notesText = (r.remarks || r.notes || r.comment || "").toString().trim();
      if (notesEl) {
        notesEl.innerHTML = notesText
          ? notesText
          : `<span class="text-muted">No remarks provided.</span>`;
      }

      // ================= BACKWARD-COMPAT FIELDS (ONLY IF THEY EXIST) =================
      if (reportSwine) {
        reportSwine.innerHTML = `<strong>Swine:</strong> ${r.swine_id?.swine_id || "Unknown"}`;
      }
      if (reportFarmer) {
        const farmerName = farmerObj
          ? `${farmerObj.first_name || ""} ${farmerObj.last_name || ""}`.trim()
          : "Unknown Farmer";
        reportFarmer.innerHTML = `<strong>Farmer:</strong> ${farmerName || "Unknown Farmer"}`;
      }
      if (reportProbability) {
        reportProbability.innerHTML = `
          <strong>Probability:</strong>
          ${r.heat_probability != null ? r.heat_probability + "%" : "N/A"}
        `;
      }

      // ================= OBSERVED SIGNS =================
      // Purpose: render signs as chips
      if (reportSigns) {
        if (Array.isArray(r.signs) && r.signs.length) {
          reportSigns.innerHTML = r.signs
            .map(sign => `<span class="sign-chip">${sign}</span>`)
            .join("");
        } else {
          reportSigns.innerHTML = `<span class="text-muted">No signs recorded.</span>`;
        }
      }

      // ================= MEDIA GALLERY =================
      // Purpose: render thumbnails + open overlay panel with zoom controls
      if (evidenceGallery) evidenceGallery.innerHTML = "";

      const preview = document.getElementById("evidencePreview");
      if (preview) {
        preview.style.display = "none";
        preview.innerHTML = "";
      }

      const evidences = Array.isArray(r.evidence_url)
        ? r.evidence_url
        : (r.evidence_url ? [r.evidence_url] : []);

      if (!evidenceGallery) {
        // If modal markup changed and gallery is missing, do not crash
        console.warn("evidenceGallery not found in DOM");
      } else if (!evidences.length) {
        evidenceGallery.innerHTML =
          "<p class='text-muted'><em>No media evidence provided.</em></p>";
      } else {
        evidences.forEach((path, idx) => {
          if (!path) return;

          const cleanPath = path.replace(/\\/g, "/");
          const fullUrl = cleanPath.startsWith("http")
            ? cleanPath
            : cleanPath.startsWith("/uploads")
              ? `${BACKEND_URL}${cleanPath}`
              : `${BACKEND_URL}/${cleanPath.replace(/^\/+/, "")}`;

          const isVideo = /\.(mp4|mov|webm)$/i.test(fullUrl);

          const wrapper = document.createElement("div");
          wrapper.className = "dynamic-media";
          wrapper.style.cursor = "pointer";

          wrapper.innerHTML = isVideo
            ? `<video muted preload="metadata" style="width:100%; border-radius:10px;">
                <source src="${fullUrl}">
              </video>
              <small>Tap to view</small>`
            : `<img src="${fullUrl}" alt="Evidence ${idx + 1}"
                  onerror="this.src='https://placehold.co/400x300?text=Load+Error'">
              <small>Tap to view</small>`;

          wrapper.addEventListener("click", () => {
            openEvidencePanel({ url: fullUrl, isVideo });
          });

          evidenceGallery.appendChild(wrapper);
        });
      }

      // ================= ACTION BUTTONS (NO CHANGE) =================
      approveBtn.style.display = "none";
      if (rejectBtn) rejectBtn.style.display = "none";
      confirmAIBtn.style.display = "none";
      if (confirmPregnancyBtn) confirmPregnancyBtn.style.display = "none";
      if (confirmFarrowingBtn) confirmFarrowingBtn.style.display = "none";
      if (followUpBtn) followUpBtn.style.display = "none";

      switch (r.status) {
        case "pending":
          approveBtn.style.display = "inline-block";
          if (rejectBtn) rejectBtn.style.display = "inline-block";
          break;

        case "approved":
          confirmAIBtn.style.display = "inline-block";
          break;

        case "ai_confirmed":
        case "under_observation":
          if (confirmPregnancyBtn) confirmPregnancyBtn.style.display = "inline-block";
          if (followUpBtn) followUpBtn.style.display = "inline-block";
          break;

        case "pregnant":
        case "farrowing_ready": {
          if (!r.expected_farrowing) break;

          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const farrowDate = new Date(r.expected_farrowing);
          farrowDate.setHours(0, 0, 0, 0);

          if (today >= farrowDate) {
            confirmFarrowingBtn.style.display = "inline-block";
          }
          break;
        }
      }

      // ================= SHOW MODAL =================
      if (reportDetailsModal) {
        reportDetailsModal.style.display = "flex";
        document.body.style.overflow = "hidden";
      }

      hideReportLoading();
      } catch (err) {
        console.error(err);
        alert("Error loading report details.");
      }
    }

  // ---------------- ACTION HANDLER ----------------
  async function action(endpoint, message, extraBody = {}, btnRef = null) {
    if (!currentReportId) return;

    try {
      if (btnRef) btnRef.disabled = true;

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

      alert(message);
      closeEvidencePanel();
      closeReportDetails();
      loadReports();
    } catch (err) {
      alert(err.message || "Action failed");
    } finally {
      if (btnRef) btnRef.disabled = false;
    }
  }

  approveBtn.onclick = (e) => action("approve", "Report approved. AI is now scheduled.", {}, e.target);

  if (rejectBtn) {
    rejectBtn.onclick = () => {
      rejectReasonInput.value = "";
      rejectReasonModal.style.display = "flex";
    };
  }

  confirmAIBtn.onclick = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/swine/all?sex=Male&age_stage=adult`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include"
      });
      const data = await res.json();
      if (!data.success || !data.swine?.length) return alert("No adult boars found.");
      const masterBoars = data.swine.filter(b => b.swine_id?.startsWith("BOAR-") || b.farmer_id === null);
      if (!masterBoars.length) return alert("No Master Boars available.");
      boarSelect.innerHTML = masterBoars.map(b => `<option value="${b._id}">${b.swine_id}</option>`).join("");
      aiConfirmModal.style.display = "flex";
    } catch (err) {
      console.error(err);
      alert("Failed to load boars.");
    }
  };

  submitAIBtn.onclick = async () => {
    const maleSwineId = boarSelect.value;
    if (!maleSwineId) return alert("Please select a boar.");
    action("confirm-ai", "AI Confirmed! Swine moved to Under Observation.", { maleSwineId });
    aiConfirmModal.style.display = "none";
  };

  // Confirm Reject Action
  confirmRejectBtn.onclick = () => {
    const reason = rejectReasonInput.value.trim();

    if (!reason) {
      alert("Rejection reason is required.");
      return;
    }

    action(
      "reject",
      "Report rejected successfully.",
      { reason }
    );

    rejectReasonModal.style.display = "none";
    rejectReasonInput.value = "";
  };


  // Confirm Pregnancy Action
  if (confirmPregnancyBtn) {
    confirmPregnancyBtn.onclick = () => {
      if (!confirm("Confirm pregnancy for this sow?")) return;
      action(
        "confirm-pregnancy",
        "Pregnancy confirmed. Expected farrowing date calculated."
      );
    };
  }

  // Cycle Failed / Return to Heat
  if (followUpBtn) {
    followUpBtn.onclick = () => {
      if (!confirm("Mark cycle as failed and return sow to heat?")) return;
      action(
        "cycle-failed",
        "Cycle failed. Sow returned to In-Heat status."
      );
    };
  }

  // Open Farrowing Modal
  if (confirmFarrowingBtn) {
    confirmFarrowingBtn.onclick = () => {
      if (!farrowingModal) return;
      farrowingModal.style.display = "flex";
      document.getElementById("farrowingDateInput").valueAsDate = new Date();
    };
  }

  // ================= FARROWING SUBMIT =================
  if (farrowingForm) {
    farrowingForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      // 1. SELECT THE SUBMIT BUTTON
      const submitBtn = farrowingForm.querySelector('button[type="submit"]');

      // 2. GUARD: IF BUTTON IS ALREADY DISABLED, STOP EXECUTION
      if (submitBtn.disabled) return;

      // 3. DISABLE BUTTON & SHOW LOADING STATE
      submitBtn.disabled = true;
      const originalText = submitBtn.innerHTML;
      submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Processing...`;

      const farrowingDateInput = document.getElementById("farrowingDateInput");
      const liveInput = document.getElementById("liveCount");
      const mortalityinput = document.getElementById("mortalityCount");

      const payload = {
        farrowing_date: farrowingDateInput?.value || null,
        total_live: Number(liveInput?.value || 0),
        mortality_born: Number(mortalityinput?.value || 0),
      };

      try {
        // 4. CALL THE ACTION HANDLER
        await action(
          "confirm-farrowing",
          "Farrowing registered! Sow is now Lactating.",
          payload
        );

        // SUCCESS: Reset form and close modal
        if (farrowingModal) farrowingModal.style.display = "none";
        farrowingForm.reset();
      } catch (err) {
        console.error("Farrowing registration failed:", err);
        alert("Error: " + err.message);
      } finally {
        // 5. RE-ENABLE BUTTON (ONLY IF MODAL STAYS OPEN OR ON ERROR)
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    });
  }


  // ================= CLEAR FILTER =================
  clearFilterBtn?.addEventListener("click", () => {

    const dropdownBtn = document.getElementById("farmerDropdownBtn");
    if (dropdownBtn) {
      dropdownBtn.textContent = "Farmer";
    }

    document.getElementById("filterSwine").value = "";

    selectedStatus = "";
    selectedFarmerId = null;

    // Reset tabs
    document.querySelectorAll(".heat-tab")
      .forEach(t => t.classList.remove("active"));

    document.querySelector(".heat-tab")
      ?.classList.add("active");

    filteredReports = [...allReports];
    currentPage = 1;

    renderCards(filteredReports);
  });


  function applyFilters() {

    const swineTerm =
      document.getElementById("filterSwine")
        ?.value.trim().toLowerCase() || "";

    filteredReports = allReports.filter(r => {

      // Swine filter
      const swineMatch =
        !swineTerm ||
        (r.swine_id?.swine_id || "")
          .toLowerCase()
          .includes(swineTerm);

      // Status filter (tabs)
      const statusMatch =
        !selectedStatus ||
        r.status === selectedStatus;

      // Farmer filter
      let farmerMatch = true;

      if (selectedFarmerId) {
        const farmerId =
          typeof r.farmer_id === "object"
            ? r.farmer_id._id
            : r.farmer_id;

        farmerMatch =
          farmerId &&
          farmerId.toString() === selectedFarmerId.toString();
      }

      return swineMatch && statusMatch && farmerMatch;
    });

    currentPage = 1;
    renderCards(filteredReports);
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (reportDetailsModal?.style.display === "flex") {
        closeReportDetails();
      }
      closeEvidencePanel();
    }
  });

  // Ensure overlay exists early (no visible impact until used)
  ensureEvidencePanel();

  loadReports();
});