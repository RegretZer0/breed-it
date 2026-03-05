// /js/navbar.js
document.addEventListener("DOMContentLoaded", () => {
  /* =========================================================
     Global init guard (prevents double-binding if script is loaded twice)
  ========================================================= */
  if (window.__navbarJsInitialized) return;
  window.__navbarJsInitialized = true;

  /* =========================================================
     Module: Helpers
  ========================================================= */
  const DEFAULT_AVATAR = "/images/default-avatar.png";

  function decodeJwtPayload(token) {
    try {
      const parts = String(token || "").split(".");
      if (parts.length !== 3) return null;
      const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const json = atob(base64);
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  function isJwtExpired(token) {
    const payload = decodeJwtPayload(token);
    const expSec = Number(payload?.exp || 0);
    if (!expSec) return false;
    return Date.now() >= expSec * 1000;
  }

  function getAuthHeaders() {
    const token = localStorage.getItem("token");
    if (!token) return {};

    if (isJwtExpired(token)) {
      localStorage.removeItem("token");
      return {};
    }

    return { Authorization: `Bearer ${token}` };
  }

  async function safeJson(res) {
    try {
      return await res.json();
    } catch {
      return {};
    }
  }

  function isAuthError(status) {
    return status === 401 || status === 403;
  }

  function setImageSafe(imgEl, src) {
    if (!imgEl) return;
    imgEl.onerror = () => {
      imgEl.onerror = null;
      imgEl.src = DEFAULT_AVATAR;
    };
    imgEl.src = src || DEFAULT_AVATAR;
  }

  /* =========================================================
     Module: Feedback Modal (reusable)
  ========================================================= */
  const feedbackModalEl = document.getElementById("accountFeedbackModal");
  const feedbackModal =
    feedbackModalEl && window.bootstrap
      ? bootstrap.Modal.getOrCreateInstance(feedbackModalEl, { backdrop: true, focus: true })
      : null;

  function showFeedback(title = "Message", message = "", sourceModalEl = null) {
    if (!feedbackModal) {
      if (message) alert(`${title}\n\n${message}`);
      return;
    }

    const t = document.getElementById("accountFeedbackTitle");
    const m = document.getElementById("accountFeedbackMessage");
    if (t) t.textContent = title;
    if (m) m.textContent = message;

    if (sourceModalEl && window.bootstrap) {
      const sourceInstance = bootstrap.Modal.getInstance(sourceModalEl);
      if (sourceInstance) {
        const onHidden = () => {
          sourceModalEl.removeEventListener("hidden.bs.modal", onHidden);
          feedbackModal.show();
        };
        sourceModalEl.addEventListener("hidden.bs.modal", onHidden, { once: true });
        sourceInstance.hide();
        return;
      }
    }

    feedbackModal.show();
  }

  /* =========================================================
     Module: Logout
  ========================================================= */
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      } catch (err) {
        console.error("Logout error:", err);
      } finally {
        window.location.href = "/login";
      }
    });
  }

  /* =========================================================
     Module: Notifications (badge + mark all read)
  ========================================================= */
  const notifBadgeEl = document.getElementById("notificationBadge");
  const markAllBtn = document.getElementById("markAllNotificationsReadBtn");
  const markAllBtnHistory = document.getElementById("markAllNotificationsReadBtnModal");

  function setNotificationBadgeCount(n) {
    if (!notifBadgeEl) return;

    const count = Number(n || 0);
    if (!count) {
      notifBadgeEl.style.display = "none";
      notifBadgeEl.textContent = "";
      return;
    }

    notifBadgeEl.textContent = count > 99 ? "99+" : String(count);
    notifBadgeEl.style.display = "inline-flex";
  }

    async function markAllNotificationsRead() {
    try {
      const fn = window.__notificationsApi?.markAllRead;

      if (typeof fn !== "function") {
        throw new Error("Notifications are not ready yet. Please try again.");
      }

      await fn(); // uses notifications.js logic + correct endpoints
      showFeedback("Success", "All notifications marked as read.");
    } catch (err) {
      console.error(err);
      showFeedback("Error", err?.message || "Failed to mark all as read.");
    }
  }
  
  markAllBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    markAllNotificationsRead();
  });

  markAllBtnHistory?.addEventListener("click", (e) => {
    e.preventDefault();
    markAllNotificationsRead();
  });

  /* =========================================================
     Module: Custom notifications side-panel UI (farmer only)
  ========================================================= */
  const openNotificationsBtn = document.getElementById("openNotifications");
  const viewAllBtn = document.getElementById("viewAllNotificationsBtn");

  const notificationsPanel = document.getElementById("notificationsPanel");
  const historyModalEl = document.getElementById("notificationHistoryModal");

  const isCustomSidePanelUI =
    (notificationsPanel && notificationsPanel.classList.contains("side-panel")) ||
    (historyModalEl && historyModalEl.classList.contains("side-panel"));

  if (isCustomSidePanelUI) {
    const notifCloseBtn = document.querySelector('[data-close="notificationsPanel"]');
    const historyCloseBtn = document.querySelector('[data-close="notificationHistoryModal"]');

    function removeAnyBackdrops() {
      document.querySelectorAll(".modal-backdrop, .offcanvas-backdrop, .nav-backdrop").forEach((b) => b.remove());
    }

    function unlockBody() {
      document.body.classList.remove("modal-open");
      document.body.style.removeProperty("overflow");
      document.body.style.removeProperty("padding-right");

      document.querySelectorAll(".fixed-top, .fixed-bottom, .is-fixed, .sticky-top").forEach((el) => {
        el.style.removeProperty("padding-right");
        el.style.removeProperty("margin-right");
      });
    }

    function hardCleanup() {
      removeAnyBackdrops();
      unlockBody();
    }

    function ensureBackdrop() {
      if (document.querySelector(".modal-backdrop, .offcanvas-backdrop, .nav-backdrop")) return;

      const bd = document.createElement("div");
      bd.className = "nav-backdrop";

      Object.assign(bd.style, {
        position: "fixed",
        inset: "0",
        background: "rgba(0,0,0,0.35)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        zIndex: "99999",
      });

      bd.addEventListener("click", () => {
        historyModalEl?.classList.remove("active");
        notificationsPanel?.classList.remove("active");
        hardCleanup();
      });

      document.body.appendChild(bd);
    }

    function lockBody() {
      document.body.style.overflow = "hidden";
    }

    function anyPanelOpen() {
      return Boolean(document.querySelector(".side-panel.active, .mobile-menu.active"));
    }

    function showPanel(el) {
      if (!el) return;
      el.classList.add("active");
      ensureBackdrop();
      lockBody();
    }

    function hidePanel(el) {
      if (!el) return;
      el.classList.remove("active");
      if (!anyPanelOpen()) hardCleanup();
    }

    openNotificationsBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      showPanel(notificationsPanel);
    });

    viewAllBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      hidePanel(notificationsPanel);
      showPanel(historyModalEl);
    });

    notifCloseBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      hidePanel(notificationsPanel);
      hardCleanup();
    });

    historyCloseBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      hidePanel(historyModalEl);
      hardCleanup();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (historyModalEl?.classList.contains("active")) hidePanel(historyModalEl);
      if (notificationsPanel?.classList.contains("active")) hidePanel(notificationsPanel);
      hardCleanup();
    });

    window.addEventListener("pageshow", hardCleanup);
  }

  /* =========================================================
     Module: Account Settings (profile edit + photo upload)
  ========================================================= */
  const accountSettingsModalEl = document.getElementById("accountSettingsModal");

  const editBtn = document.getElementById("editAccountProfileBtn") || document.getElementById("editProfileBtn");
  const form = document.getElementById("accountSettingsForm") || document.getElementById("accountProfileForm");

  const saveBtn =
    document.getElementById("accountSaveBtn") ||
    document.getElementById("saveProfileBtn") ||
    document.getElementById("saveAccountProfileBtn");

  const cancelBtn =
    document.getElementById("accountCancelEditBtn") ||
    document.getElementById("cancelProfileEditBtn") ||
    document.getElementById("cancelAccountProfileBtn");

  const firstName = document.getElementById("accountFirstName");
  const lastName = document.getElementById("accountLastName");
  const address = document.getElementById("accountAddress");
  const contact = document.getElementById("accountContact");

  const fileInput = document.getElementById("accountProfilePhoto") || document.getElementById("accountProfilePhotoInput");
  const uploadBtn = document.getElementById("accountPhotoUploadBtn") || document.getElementById("uploadProfilePhotoBtn");
  const resetPhotoBtn =
    document.getElementById("accountPhotoResetBtn") || document.getElementById("resetProfilePhotoBtn");

  const avatarTop = document.getElementById("accountAvatarPreviewTop");
  const avatarPreview = document.getElementById("accountAvatarPreview");

  const nameNode = document.querySelector(".acct-name");

  const initialState = { first: "", last: "", addr: "", contact: "", photo: DEFAULT_AVATAR };

  let submittingProfile = false;
  let uploadingPhoto = false;
  let lastObjectUrl = null;

  function cacheInitialState() {
    initialState.first = firstName?.value ?? "";
    initialState.last = lastName?.value ?? "";
    initialState.addr = address?.value ?? "";
    initialState.contact = contact?.value ?? "";
    initialState.photo = avatarPreview?.getAttribute("src") || avatarTop?.getAttribute("src") || DEFAULT_AVATAR;
  }

  function setEditMode(on) {
    [firstName, lastName, address, contact].filter(Boolean).forEach((el) => {
      el.readOnly = !on;
    });

    if (saveBtn) saveBtn.disabled = !on;
    if (cancelBtn) cancelBtn.disabled = !on;

    if (fileInput) fileInput.disabled = !on;
    if (uploadBtn) uploadBtn.disabled = !on;
    if (resetPhotoBtn) resetPhotoBtn.disabled = !on;

    if (editBtn) editBtn.disabled = on;

    if (!on) {
      if (fileInput) fileInput.value = "";
      if (lastObjectUrl) {
        URL.revokeObjectURL(lastObjectUrl);
        lastObjectUrl = null;
      }
      setImageSafe(avatarPreview, initialState.photo);
      setImageSafe(avatarTop, initialState.photo);
    }
  }

  function restoreInitial() {
    if (firstName) firstName.value = initialState.first;
    if (lastName) lastName.value = initialState.last;
    if (address) address.value = initialState.addr;
    if (contact) contact.value = initialState.contact;

    setImageSafe(avatarPreview, initialState.photo);
    setImageSafe(avatarTop, initialState.photo);

    if (fileInput) fileInput.value = "";
    if (lastObjectUrl) {
      URL.revokeObjectURL(lastObjectUrl);
      lastObjectUrl = null;
    }
  }

  if (accountSettingsModalEl && window.bootstrap) {
    accountSettingsModalEl.addEventListener("show.bs.modal", () => {
      cacheInitialState();
      setEditMode(false);

      setImageSafe(avatarPreview, avatarPreview?.getAttribute("src") || initialState.photo);
      setImageSafe(avatarTop, avatarTop?.getAttribute("src") || initialState.photo);
    });

    accountSettingsModalEl.addEventListener("hidden.bs.modal", () => {
      submittingProfile = false;
      uploadingPhoto = false;

      if (fileInput) fileInput.value = "";
      if (lastObjectUrl) {
        URL.revokeObjectURL(lastObjectUrl);
        lastObjectUrl = null;
      }

      setEditMode(false);
    });
  }

  editBtn?.addEventListener("click", () => setEditMode(true));

  cancelBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    restoreInitial();
    setEditMode(false);
  });

  /* =========================================================
     Module: Crop Profile Photo (Cropper.js)
     Circle UI, square output. Single-instance cropper.
     Fixes:
     - Prevents duplicate event binding (global init guard above)
     - Initializes cropper only after modal is shown and image is loaded
     - Uses stage class toggle to avoid "double image" perception
  ========================================================= */
  let acctCropper = null;

  const accountCropModalEl = document.getElementById("accountPhotoCropModal");
  const accountCropImgEl = document.getElementById("accountCropImg");

  const accountCropZoomIn = document.getElementById("accountCropZoomIn");
  const accountCropZoomOut = document.getElementById("accountCropZoomOut");
  const accountCropRotate = document.getElementById("accountCropRotate");
  const accountCropReset = document.getElementById("accountCropReset");
  const accountCropApply = document.getElementById("accountCropApplyBtn");
  const accountCropCancel = document.getElementById("accountCropCancelBtn");

  const accountCropModal =
    accountCropModalEl && window.bootstrap
      ? bootstrap.Modal.getOrCreateInstance(accountCropModalEl, { backdrop: true, focus: true })
      : null;

  function hasCropper() {
    return typeof window.Cropper === "function";
  }

  function destroyAcctCropper() {
    if (!acctCropper) return;
    try {
      acctCropper.destroy();
    } catch {}
    acctCropper = null;
  }

  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  function setInputFile(inputEl, file) {
    const dt = new DataTransfer();
    dt.items.add(file);
    inputEl.files = dt.files;
  }

  function canvasToFile(canvas, fileName, mimeType = "image/jpeg", quality = 0.92) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("Failed to create blob"));
          resolve(new File([blob], fileName, { type: mimeType }));
        },
        mimeType,
        quality
      );
    });
  }

  function setPreviewFromUrl(url) {
    setImageSafe(avatarPreview, url);
    setImageSafe(avatarTop, url);
  }

  function applyCircleMask() {
    try {
      const box = accountCropModalEl?.querySelector(".cropper-view-box");
      const face = accountCropModalEl?.querySelector(".cropper-face");
      if (box) box.style.borderRadius = "50%";
      if (face) face.style.borderRadius = "50%";
    } catch {}
  }

  function setStageReady(on) {
    const stage = accountCropModalEl?.querySelector(".fm-crop-stage");
    if (!stage) return;
    stage.classList.toggle("is-cropper-ready", Boolean(on));
  }

  let pendingCropDataUrl = null;

  function initAccountCropperFromPending() {
    if (!pendingCropDataUrl || !accountCropImgEl || !hasCropper()) return;

    setStageReady(false);
    destroyAcctCropper();

    accountCropImgEl.onload = () => {
      accountCropImgEl.onload = null;

      acctCropper = new window.Cropper(accountCropImgEl, {
        aspectRatio: 1,
        viewMode: 1,
        dragMode: "move",
        autoCropArea: 1,
        responsive: true,
        background: false,
        guides: false,
        center: true,
        zoomOnWheel: true,
        minCropBoxWidth: 240,
        minCropBoxHeight: 240,
        ready() {
          applyCircleMask();
          setStageReady(true);

          try {
            const imgData = acctCropper.getImageData();
            const cropData = acctCropper.getCropBoxData();
            const sx = cropData.width / imgData.width;
            const sy = cropData.height / imgData.height;
            const z = Math.max(sx, sy);
            if (Number.isFinite(z) && z > 0) acctCropper.zoomTo(z);
          } catch {}
        },
        crop() {
          applyCircleMask();
        },
      });
    };

    accountCropImgEl.src = pendingCropDataUrl;
  }

  accountCropModalEl?.addEventListener("shown.bs.modal", () => {
    initAccountCropperFromPending();
  });

  accountCropModalEl?.addEventListener("hidden.bs.modal", () => {
    pendingCropDataUrl = null;
    setStageReady(false);
    destroyAcctCropper();

    if (accountCropImgEl) {
      accountCropImgEl.onload = null;
      accountCropImgEl.src = "";
    }
  });

  if (fileInput) {
    fileInput.addEventListener("change", async () => {
      const f = fileInput.files?.[0];

      if (lastObjectUrl) {
        URL.revokeObjectURL(lastObjectUrl);
        lastObjectUrl = null;
      }

      if (!f) {
        setImageSafe(avatarPreview, initialState.photo);
        setImageSafe(avatarTop, initialState.photo);
        return;
      }

      if (!f.type?.startsWith("image/")) {
        fileInput.value = "";
        showFeedback("Invalid File", "Please choose an image file.");
        setImageSafe(avatarPreview, initialState.photo);
        setImageSafe(avatarTop, initialState.photo);
        return;
      }

      if (f.size > 2 * 1024 * 1024) {
        fileInput.value = "";
        showFeedback("Too Large", "Image too large. Please use an image under 2MB.");
        setImageSafe(avatarPreview, initialState.photo);
        setImageSafe(avatarTop, initialState.photo);
        return;
      }

      if (!hasCropper() || !accountCropModal || !accountCropModalEl || !accountCropImgEl) {
        lastObjectUrl = URL.createObjectURL(f);
        setPreviewFromUrl(lastObjectUrl);
        return;
      }

      pendingCropDataUrl = await fileToDataURL(f);
      accountCropModal.show();
    });
  }

  accountCropZoomIn?.addEventListener("click", () => acctCropper?.zoom(0.08));
  accountCropZoomOut?.addEventListener("click", () => acctCropper?.zoom(-0.08));
  accountCropRotate?.addEventListener("click", () => acctCropper?.rotate(90));
  accountCropReset?.addEventListener("click", () => acctCropper?.reset());

  accountCropCancel?.addEventListener("click", () => {
    if (fileInput) fileInput.value = "";
    if (lastObjectUrl) {
      URL.revokeObjectURL(lastObjectUrl);
      lastObjectUrl = null;
    }
    pendingCropDataUrl = null;
    setStageReady(false);
    setImageSafe(avatarPreview, initialState.photo);
    setImageSafe(avatarTop, initialState.photo);
  });

  accountCropApply?.addEventListener("click", async () => {
    try {
      if (!acctCropper || !fileInput?.files?.[0]) return;

      const canvas = acctCropper.getCroppedCanvas({
        width: 512,
        height: 512,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: "high",
      });

      const croppedFile = await canvasToFile(canvas, `profile_${Date.now()}.jpg`, "image/jpeg", 0.92);
      setInputFile(fileInput, croppedFile);

      const croppedUrl = canvas.toDataURL("image/jpeg", 0.92);
      setPreviewFromUrl(croppedUrl);

      if (resetPhotoBtn) resetPhotoBtn.disabled = false;
      if (uploadBtn) uploadBtn.disabled = false;

      pendingCropDataUrl = null;
      accountCropModal?.hide();
    } catch (err) {
      console.error("Account photo crop failed:", err);
      showFeedback("Error", "Failed to crop image. Please try another photo.");
      pendingCropDataUrl = null;
      accountCropModal?.hide();
    }
  });

  resetPhotoBtn?.addEventListener("click", (e) => {
    e.preventDefault();

    if (fileInput) fileInput.value = "";
    if (lastObjectUrl) {
      URL.revokeObjectURL(lastObjectUrl);
      lastObjectUrl = null;
    }

    pendingCropDataUrl = null;
    setStageReady(false);
    setImageSafe(avatarPreview, initialState.photo);
    setImageSafe(avatarTop, initialState.photo);
  });

  /* =========================================================
     Module: Save Profile
  ========================================================= */
  async function submitProfile() {
    if (submittingProfile) return;
    submittingProfile = true;

    try {
      const payload = {
        first_name: (firstName?.value || "").trim(),
        last_name: (lastName?.value || "").trim(),
        address: (address?.value || "").trim(),
        contact_info: (contact?.value || "").trim(),
      };

      if (!payload.first_name || !payload.last_name) {
        showFeedback("Missing Fields", "First name and last name are required.");
        return;
      }

      if (saveBtn) saveBtn.disabled = true;

      const res = await fetch("/api/auth/update-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await safeJson(res);

      if (isAuthError(res.status)) throw new Error("Session expired or unauthorized. Please login again.");
      if (!res.ok || !data?.success) throw new Error(data?.message || "Failed to update profile.");

      initialState.first = payload.first_name;
      initialState.last = payload.last_name;
      initialState.addr = payload.address;
      initialState.contact = payload.contact_info;

      if (nameNode) nameNode.textContent = `${payload.first_name} ${payload.last_name}`.trim() || "—";

      setEditMode(false);
      showFeedback("Success", "Profile updated successfully.");
    } catch (err) {
      console.error(err);
      showFeedback("Error", err?.message || "Something went wrong while saving.");
    } finally {
      if (saveBtn) saveBtn.disabled = false;
      submittingProfile = false;
    }
  }

  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      submitProfile();
    });
  } else {
    saveBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      submitProfile();
    });
  }

  /* =========================================================
     Module: Upload Profile Photo
  ========================================================= */
  uploadBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    if (uploadingPhoto) return;
    uploadingPhoto = true;

    try {
      const f = fileInput?.files?.[0];
      if (!f) {
        showFeedback("Notice", "Please choose a photo first.");
        return;
      }

      const fd = new FormData();
      fd.append("profile_photo", f);

      uploadBtn.disabled = true;

      const res = await fetch("/api/auth/update-profile-photo", {
        method: "PUT",
        headers: { ...getAuthHeaders() },
        credentials: "include",
        body: fd,
      });

      const data = await safeJson(res);

      if (isAuthError(res.status)) throw new Error("Session expired or unauthorized. Please login again.");
      if (!res.ok || !data?.success) throw new Error(data?.message || "Failed to upload photo.");

      const newSrc = data.profile_photo || DEFAULT_AVATAR;

      initialState.photo = newSrc;
      setImageSafe(avatarPreview, newSrc);
      setImageSafe(avatarTop, newSrc);

      if (fileInput) fileInput.value = "";
      if (lastObjectUrl) {
        URL.revokeObjectURL(lastObjectUrl);
        lastObjectUrl = null;
      }

      showFeedback("Success", "Profile photo uploaded successfully.");
    } catch (err) {
      console.error(err);
      showFeedback("Error", err?.message || "Upload failed.");
    } finally {
      if (uploadBtn) uploadBtn.disabled = false;
      uploadingPhoto = false;
    }
  });

  /* =========================================================
     Module: Password toggle (show/hide)
  ========================================================= */
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".toggle-password-btn");
    if (!btn) return;

    const inputId = btn.getAttribute("data-target");
    const input = document.getElementById(inputId);
    if (!input) return;

    const icon = btn.querySelector("i");

    if (input.type === "password") {
      input.type = "text";
      if (icon) {
        icon.classList.remove("bi-eye");
        icon.classList.add("bi-eye-slash");
      }
    } else {
      input.type = "password";
      if (icon) {
        icon.classList.remove("bi-eye-slash");
        icon.classList.add("bi-eye");
      }
    }
  });

  /* =========================================================
     Module: Help ticket submit
  ========================================================= */
  const helpForm = document.getElementById("helpTicketForm");
  const helpModalEl = document.getElementById("helpModal");

  const helpCategoryEl = document.getElementById("helpCategory");
  const helpPriorityEl = document.getElementById("helpPriority");

  const CATEGORY_TO_PRIORITY = {
    bug: "high",
    account: "high",
    data: "normal",
    feature: "low",
    other: "normal",
  };

  function applyAutoPriorityFromCategory() {
    if (!helpCategoryEl || !helpPriorityEl) return;
    const cat = (helpCategoryEl.value || "").toLowerCase().trim();
    const autoPriority = CATEGORY_TO_PRIORITY[cat] || "normal";
    helpPriorityEl.value = autoPriority;
    helpPriorityEl.disabled = true;
  }

  if (helpForm) {
    const helpModal =
      helpModalEl && window.bootstrap
        ? bootstrap.Modal.getOrCreateInstance(helpModalEl, { backdrop: true, focus: true })
        : null;

    function resetTicketFormFields() {
      const cat = document.getElementById("helpCategory");
      const pri = document.getElementById("helpPriority");
      const sub = document.getElementById("helpSubject");
      const msg = document.getElementById("helpMessage");

      if (cat) cat.value = "";
      if (pri) pri.value = "normal";
      applyAutoPriorityFromCategory();
      if (sub) sub.value = "";
      if (msg) msg.value = "";
    }

    helpForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const payload = {
        name: (document.getElementById("helpName")?.value || "").trim(),
        email: (document.getElementById("helpEmail")?.value || "").trim(),
        category: document.getElementById("helpCategory")?.value || "",
        priority: (() => {
          const cat = (document.getElementById("helpCategory")?.value || "").toLowerCase().trim();
          return CATEGORY_TO_PRIORITY[cat] || "normal";
        })(),
        subject: (document.getElementById("helpSubject")?.value || "").trim(),
        message: (document.getElementById("helpMessage")?.value || "").trim(),
        page: window.location.pathname,
      };

      if (!payload.name || !payload.email || !payload.category || !payload.subject || !payload.message) {
        showFeedback("Missing Fields", "Please complete all required fields before submitting.", helpModalEl);
        return;
      }

      const submitBtn = document.getElementById("helpSubmitTicketBtn");
      if (submitBtn) submitBtn.disabled = true;

      try {
        const res = await fetch("/api/support/ticket", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          credentials: "include",
          body: JSON.stringify(payload),
        });

        const data = await safeJson(res);

        if (isAuthError(res.status)) throw new Error("Session expired or unauthorized. Please login again.");
        if (!res.ok || !data?.success) throw new Error(data?.message || "Ticket submission failed.");

        resetTicketFormFields();
        helpModal?.hide();
        showFeedback("Submitted", `Ticket sent successfully. Ref: ${data.ticket_id || "—"}`, helpModalEl);
      } catch (err) {
        console.error(err);
        helpModal?.hide();
        showFeedback("Error", err?.message || "Ticket submission failed.", helpModalEl);
      } finally {
        const submitBtn = document.getElementById("helpSubmitTicketBtn");
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  helpCategoryEl?.addEventListener("change", applyAutoPriorityFromCategory);
  helpModalEl?.addEventListener("shown.bs.modal", applyAutoPriorityFromCategory);

  /* =========================================================
     Module: Ticket history modal
  ========================================================= */
  const openTicketHistoryBtn = document.getElementById("openTicketHistoryBtn");
  const ticketHistoryModalEl = document.getElementById("ticketHistoryModal");

  const ticketHistoryList = document.getElementById("ticketHistoryList");
  const ticketHistoryEmpty = document.getElementById("ticketHistoryEmpty");
  const ticketHistoryMeta = document.getElementById("ticketHistoryMeta");

  const ticketPrevBtn = document.getElementById("ticketPrevBtn");
  const ticketNextBtn = document.getElementById("ticketNextBtn");
  const ticketPageLabel = document.getElementById("ticketPageLabel");

  const ticketFilterStatus = document.getElementById("ticketFilterStatus");
  const ticketFilterCategory = document.getElementById("ticketFilterCategory");
  const ticketFilterPriority = document.getElementById("ticketFilterPriority");
  const ticketSearch = document.getElementById("ticketSearch");
  const ticketDateFrom = document.getElementById("ticketDateFrom");
  const ticketDateTo = document.getElementById("ticketDateTo");

  const ticketFilterResetBtn = document.getElementById("ticketFilterResetBtn");
  const ticketFilterApplyBtn = document.getElementById("ticketFilterApplyBtn");

  const TICKET_LIST_ENDPOINT = "/api/support/tickets";
  const TICKET_PAGE_SIZE = 6;

  let ticketPage = 1;
  let ticketTotal = 0;
  let ticketTotalPages = 1;

  function safeText(v) {
    return v == null ? "" : String(v);
  }

  function fmtDateTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString();
  }

  function renderTicketRow(t) {
    const ref = safeText(t.ticket_id || t.ref || t._id || "—");
    const subject = safeText(t.subject || "—");
    const message = safeText(t.message || "");
    const status = (t.status || "open").toLowerCase();
    const category = (t.category || "other").toLowerCase();
    const priority = (t.priority || "normal").toLowerCase();
    const created = fmtDateTime(t.createdAt || t.created_at || t.timestamp);

    const statusClass = status.replace(/\s+/g, "_");
    const priorityClass = priority.replace(/\s+/g, "_");

    return `
      <div class="ticket-card">
        <div class="ticket-top">
          <div class="min-w-0">
            <div class="ticket-ref">${ref}</div>
            <div class="ticket-subject text-truncate">${subject}</div>
          </div>
          <div class="d-flex flex-column align-items-end gap-1">
            <span class="ticket-pill ${statusClass}">${status.replace(/_/g, " ")}</span>
            <span class="ticket-pill ${priorityClass}">${priority}</span>
          </div>
        </div>

        <div class="ticket-meta">
          <span class="ticket-pill">${category}</span>
          ${created ? `<span class="ticket-pill">${created}</span>` : ""}
        </div>

        ${message ? `<div class="ticket-msg">${message}</div>` : ""}
      </div>
    `;
  }

  function setTicketPagerState() {
    ticketTotalPages = Math.max(1, Math.ceil(ticketTotal / TICKET_PAGE_SIZE));
    ticketPage = Math.min(ticketPage, ticketTotalPages);

    if (ticketPageLabel) ticketPageLabel.textContent = `Page ${ticketPage} / ${ticketTotalPages}`;
    if (ticketPrevBtn) ticketPrevBtn.disabled = ticketPage <= 1;
    if (ticketNextBtn) ticketNextBtn.disabled = ticketPage >= ticketTotalPages;

    if (ticketHistoryMeta) {
      ticketHistoryMeta.textContent = ticketTotal
        ? `${ticketTotal} ticket${ticketTotal > 1 ? "s" : ""} found`
        : "—";
    }
  }

  async function fetchTickets() {
    if (!ticketHistoryList) return;

    const params = new URLSearchParams();
    params.set("page", String(ticketPage));
    params.set("limit", String(TICKET_PAGE_SIZE));

    if (ticketFilterStatus?.value) params.set("status", ticketFilterStatus.value);
    if (ticketFilterCategory?.value) params.set("category", ticketFilterCategory.value);
    if (ticketFilterPriority?.value) params.set("priority", ticketFilterPriority.value);

    const q = (ticketSearch?.value || "").trim();
    if (q) params.set("q", q);

    if (ticketDateFrom?.value) params.set("from", ticketDateFrom.value);
    if (ticketDateTo?.value) params.set("to", ticketDateTo.value);

    ticketHistoryList.innerHTML = `<div class="text-muted small">Loading...</div>`;
    ticketHistoryEmpty?.classList.add("d-none");

    try {
      const res = await fetch(`${TICKET_LIST_ENDPOINT}?${params.toString()}`, {
        method: "GET",
        headers: { ...getAuthHeaders() },
        credentials: "include",
      });

      const data = await safeJson(res);

      if (isAuthError(res.status)) throw new Error("Session expired or unauthorized. Please login again.");
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to load tickets.");

      const items = Array.isArray(data.tickets) ? data.tickets : [];
      ticketTotal = Number(data.total || items.length || 0);

      setTicketPagerState();

      if (!items.length) {
        ticketHistoryList.innerHTML = "";
        ticketHistoryEmpty?.classList.remove("d-none");
        return;
      }

      ticketHistoryList.innerHTML = items.map(renderTicketRow).join("");
    } catch (err) {
      console.error(err);
      ticketHistoryList.innerHTML = `<div class="text-danger small fw-semibold">${safeText(
        err.message || "Error loading tickets."
      )}</div>`;
    }
  }

  function resetTicketFilters() {
    if (ticketFilterStatus) ticketFilterStatus.value = "";
    if (ticketFilterCategory) ticketFilterCategory.value = "";
    if (ticketFilterPriority) ticketFilterPriority.value = "";
    if (ticketSearch) ticketSearch.value = "";
    if (ticketDateFrom) ticketDateFrom.value = "";
    if (ticketDateTo) ticketDateTo.value = "";
    ticketPage = 1;
  }

  if (openTicketHistoryBtn && ticketHistoryModalEl && window.bootstrap) {
    const ticketModal = bootstrap.Modal.getOrCreateInstance(ticketHistoryModalEl, { backdrop: true, focus: true });

    openTicketHistoryBtn.addEventListener("click", () => {
      ticketPage = 1;
      ticketModal.show();
    });

    ticketHistoryModalEl.addEventListener("shown.bs.modal", () => {
      fetchTickets();
    });
  }

  ticketPrevBtn?.addEventListener("click", () => {
    ticketPage = Math.max(1, ticketPage - 1);
    fetchTickets();
  });

  ticketNextBtn?.addEventListener("click", () => {
    ticketPage = ticketPage + 1;
    fetchTickets();
  });

  ticketFilterResetBtn?.addEventListener("click", () => {
    resetTicketFilters();
    fetchTickets();
  });

  ticketFilterApplyBtn?.addEventListener("click", () => {
    ticketPage = 1;
    fetchTickets();
  });

  let ticketSearchTimer = null;
  ticketSearch?.addEventListener("input", () => {
    clearTimeout(ticketSearchTimer);
    ticketSearchTimer = setTimeout(() => {
      ticketPage = 1;
      fetchTickets();
    }, 350);
  });
});