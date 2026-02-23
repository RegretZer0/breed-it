// /js/reports.ui.js
export function buildUIHelpers(state, dom) {
  const { BACKEND_URL } = state;

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
    if (!dom.reportDetailsModal) return null;

    const modalBody = dom.reportDetailsModal.querySelector(".modal-body");
    if (!modalBody) return null;

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
    if (!dom.reportDetailsModal) return;
    dom.reportDetailsModal.style.display = "flex";
    document.body.style.overflow = "hidden";

    const overlay = ensureReportLoadingOverlay();
    if (overlay) overlay.style.display = "flex";
  }

  function hideReportLoading() {
    const overlay = document.getElementById("reportLoadingOverlay");
    if (overlay) overlay.style.display = "none";
  }

  function resolveImageUrl(path) {
    if (!path) return "/images/default-avatar.png";
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    if (path.startsWith("/")) return `${BACKEND_URL}${path}`;
    return `${BACKEND_URL}/uploads/profiles/${path}`;
  }

  function setImageEl(imgEl, src) {
    if (!imgEl) return;

    const finalSrc = resolveImageUrl(src);
    const cacheBust = finalSrc.includes("?") ? "&" : "?";

    imgEl.onload = () => {
      imgEl.style.display = "block";
      const fallback = imgEl.nextElementSibling;
      if (fallback) fallback.style.display = "none";
    };

    imgEl.onerror = () => {
      imgEl.onerror = null;
      imgEl.style.display = "none";
      const fallback = imgEl.nextElementSibling;
      if (fallback) fallback.style.display = "flex";
    };

    imgEl.src = `${finalSrc}${cacheBust}v=${Date.now()}`;
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

  function closeReportDetails() {
    // safe guards
    if (!dom.reportDetailsModal) return;

    dom.reportDetailsModal.style.display = "none";
    document.body.style.overflow = "";

    const videos = dom.reportDetailsModal.querySelectorAll("video");
    videos.forEach(v => {
      v.pause();
      v.currentTime = 0;
    });

    const preview = document.getElementById("evidencePreview");
    if (preview) {
      preview.style.display = "none";
      preview.innerHTML = "";
    }

    if (dom.evidenceGallery) dom.evidenceGallery.innerHTML = "";
  }

  // hook modal close buttons (kept same behavior)
  if (dom.closeReportModal) dom.closeReportModal.onclick = closeReportDetails;
  if (dom.closeReportModalBtn) dom.closeReportModalBtn.onclick = closeReportDetails;
  dom.reportDetailsModal?.addEventListener("click", e => {
    if (e.target === dom.reportDetailsModal) closeReportDetails();
  });

  /* ================= EVIDENCE PANEL OVERLAY ================= */
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

    const closeBtn = panel.querySelector("#evidencePanelClose");
    closeBtn?.addEventListener("click", () => closeEvidencePanel());

    panel.addEventListener("click", (e) => {
      if (e.target === panel) closeEvidencePanel();
    });

    const img = panel.querySelector("#evidencePanelImg");
    const zoomInBtn = panel.querySelector("#evidenceZoomIn");
    const zoomOutBtn = panel.querySelector("#evidenceZoomOut");
    const zoomResetBtn = panel.querySelector("#evidenceZoomReset");

    let scale = 1, tx = 0, ty = 0;
    let isPanning = false, startX = 0, startY = 0, startTx = 0, startTy = 0;

    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

    const applyTransform = () => {
      if (!img) return;
      img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
      img.style.cursor = scale > 1 ? (isPanning ? "grabbing" : "grab") : "default";
    };

    const setScale = (next) => {
      scale = clamp(next, 1, 6);
      if (scale === 1) { tx = 0; ty = 0; }
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

    img?.addEventListener("pointerup", () => { isPanning = false; applyTransform(); });
    img?.addEventListener("pointercancel", () => { isPanning = false; applyTransform(); });

    const stage = panel.querySelector("#evidenceStage");
    stage?.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = Math.sign(e.deltaY);
      setScale(scale + (delta > 0 ? -0.2 : 0.2));
    }, { passive: false });

    panel._state = {
      reset() { scale = 1; tx = 0; ty = 0; applyTransform(); },
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

    panel._state?.reset?.();

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
    if (!dom.reportDetailsModal || dom.reportDetailsModal.style.display !== "flex") {
      document.body.style.overflow = "";
    }
  }

  return {
    getDaysLeft,
    showReportLoading,
    hideReportLoading,
    closeReportDetails,
    ensureEvidencePanel,
    openEvidencePanel,
    closeEvidencePanel,
    setImageEl,
    setFarmerCardVisible,
  };
}