document.addEventListener("DOMContentLoaded", () => {
  const logoutBtn = document.getElementById("logoutBtn");

  // =========================
  // Logout
  // =========================
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

  // =========================
  // Notifications: Offcanvas -> History modal (SAFE HANDOFF)
  // =========================
  const viewAllBtn = document.getElementById("viewAllNotificationsBtn");
  const notificationsPanel = document.getElementById("notificationsPanel");
  const historyModalEl = document.getElementById("notificationHistoryModal");

  if (viewAllBtn && notificationsPanel && historyModalEl) {
    const offcanvas = bootstrap.Offcanvas.getOrCreateInstance(notificationsPanel);
    const historyModal = bootstrap.Modal.getOrCreateInstance(historyModalEl, {
      backdrop: true,
      focus: true
    });

    const hardCleanup = () => {
      document.body.classList.remove("modal-open");
      document.body.style.removeProperty("overflow");
      document.body.style.removeProperty("padding-right");

      document.querySelectorAll(".fixed-top, .fixed-bottom, .is-fixed, .sticky-top").forEach((el) => {
        el.style.removeProperty("padding-right");
        el.style.removeProperty("margin-right");
      });

      document.querySelectorAll(".modal-backdrop, .offcanvas-backdrop").forEach((b) => b.remove());
    };

    const openHistoryModalSafely = () => {
      hardCleanup();
      requestAnimationFrame(() => {
        hardCleanup();
        historyModal.show();
      });
    };

    viewAllBtn.addEventListener("click", () => {
      offcanvas.hide();
      notificationsPanel.addEventListener(
        "hidden.bs.offcanvas",
        () => openHistoryModalSafely(),
        { once: true }
      );
    });

    historyModalEl.addEventListener("hidden.bs.modal", hardCleanup);
    historyModalEl.addEventListener("hide.bs.modal", () => setTimeout(hardCleanup, 50));
  }

  // =========================================================
  // Account Settings: Profile Editor (UI-first; backend-safe)
  // =========================================================
  const accountSettingsModalEl = document.getElementById("accountSettingsModal");

  const toggleProfileEditBtn = document.getElementById("toggleProfileEditBtn");
  const editorWrap = document.getElementById("accountProfileEditor");

  const form = document.getElementById("accountProfileForm");
  const msg = document.getElementById("accountProfileMessage");

  const firstNameEl = document.getElementById("accountFirstName");
  const lastNameEl = document.getElementById("accountLastName");
  const addressEl = document.getElementById("accountAddress");
  const contactEl = document.getElementById("accountContact");

  const emailText = document.getElementById("accountEmailText");

  const imgMain = document.getElementById("accountProfileImg");
  const imgPreview = document.getElementById("accountProfileImgPreview");
  const photoInput = document.getElementById("accountProfilePhotoInput");
  const photoResetBtn = document.getElementById("accountProfilePhotoResetBtn");

  const saveBtn = document.getElementById("saveAccountProfileBtn");
  const cancelBtn = document.getElementById("cancelAccountProfileBtn");

  const DEFAULT_AVATAR = "../../images/default-avatar.png";

  function setMessage(type, text) {
    if (!msg) return;
    msg.className = "small mt-2 mb-0";
    if (!text) {
      msg.textContent = "";
      return;
    }
    if (type === "success") msg.classList.add("text-success", "fw-semibold");
    if (type === "error") msg.classList.add("text-danger", "fw-semibold");
    if (type === "info") msg.classList.add("text-muted");
    msg.textContent = text;
  }

  function collapseEditor(forceHide = false) {
    if (!editorWrap) return;
    const inst = bootstrap.Collapse.getOrCreateInstance(editorWrap, { toggle: false });
    if (forceHide) inst.hide();
    else inst.toggle();
  }

  function syncPreviewToMain() {
    if (imgMain && imgPreview) imgMain.src = imgPreview.src;
  }

  function resetPhoto() {
    if (photoInput) photoInput.value = "";
    if (imgPreview) imgPreview.src = DEFAULT_AVATAR;
    syncPreviewToMain();
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handlePhotoChange() {
    if (!photoInput || !imgPreview) return;

    const file = photoInput.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setMessage("error", "Please select an image file.");
      photoInput.value = "";
      return;
    }

    // 2MB soft limit (UI guard)
    if (file.size > 2 * 1024 * 1024) {
      setMessage("error", "Image too large. Please use an image under 2MB.");
      photoInput.value = "";
      return;
    }

    try {
      const dataUrl = await readFileAsDataURL(file);
      imgPreview.src = dataUrl;
      syncPreviewToMain();
      setMessage("info", "Photo selected (preview only).");
    } catch (e) {
      console.error(e);
      setMessage("error", "Failed to preview image.");
    }
  }

  // Save profile (gracefully handles missing backend)
  async function saveProfile() {
    setMessage("", "");
    if (!firstNameEl || !lastNameEl) return;

    const payload = {
      first_name: (firstNameEl.value || "").trim(),
      last_name: (lastNameEl.value || "").trim(),
      address: (addressEl?.value || "").trim(),
      contact_info: (contactEl?.value || "").trim(),
      // photo: not uploaded yet (needs backend + multer/storage)
    };

    if (!payload.first_name || !payload.last_name) {
      setMessage("error", "First name and last name are required.");
      return;
    }

    // MVP: attempt a future endpoint; if it doesn't exist, show friendly message
    try {
      saveBtn && (saveBtn.disabled = true);

      const res = await fetch("/api/auth/update-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        // No backend yet -> likely 404/405
        const txt = await res.text().catch(() => "");
        console.warn("Profile update not available yet:", res.status, txt);
        setMessage("info", "Saved UI state. Backend profile update is not wired yet (optional endpoint needed).");
        // still close editor to feel responsive:
        collapseEditor(true);
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (data?.success) {
        setMessage("success", "Profile updated successfully.");
        // update the visible summary name without reloading
        const fullName = `${payload.first_name} ${payload.last_name}`.trim();
        const nameNode = document.querySelector(".acct-name");
        if (nameNode) nameNode.textContent = fullName;

        // update email text if server returns it (we keep email readonly)
        if (data?.user?.email && emailText) emailText.textContent = data.user.email;

        collapseEditor(true);
      } else {
        setMessage("error", data?.message || "Failed to update profile.");
      }
    } catch (err) {
      console.error(err);
      setMessage("info", "Saved UI state. Backend profile update is not wired yet (optional endpoint needed).");
      collapseEditor(true);
    } finally {
      saveBtn && (saveBtn.disabled = false);
    }
  }

  function cancelEdit() {
    setMessage("", "");
    // Just collapse; we keep current values in inputs to avoid surprises
    collapseEditor(true);
  }

  // Wire events (safe if elements missing)
  if (toggleProfileEditBtn && editorWrap) {
    toggleProfileEditBtn.addEventListener("click", () => collapseEditor(false));
  }
  if (photoInput) photoInput.addEventListener("change", handlePhotoChange);
  if (photoResetBtn) photoResetBtn.addEventListener("click", resetPhoto);
  if (saveBtn) saveBtn.addEventListener("click", saveProfile);
  if (cancelBtn) cancelBtn.addEventListener("click", cancelEdit);

  // When modal opens: ensure preview mirrors current avatar
  if (accountSettingsModalEl) {
    accountSettingsModalEl.addEventListener("shown.bs.modal", () => {
      if (imgPreview && imgMain) imgPreview.src = imgMain.src || DEFAULT_AVATAR;
      setMessage("", "");
    });

    // When modal closes: collapse editor to keep it clean next open
    accountSettingsModalEl.addEventListener("hidden.bs.modal", () => {
      setMessage("", "");
      if (editorWrap) {
        const inst = bootstrap.Collapse.getOrCreateInstance(editorWrap, { toggle: false });
        inst.hide();
      }
    });
  }
    // =============================
    // Password Toggle (Show/Hide)
    // =============================
    document.addEventListener("click", function (e) {
      const btn = e.target.closest(".toggle-password-btn");
      if (!btn) return;

      const inputId = btn.getAttribute("data-target");
      const input = document.getElementById(inputId);
      if (!input) return;

      const icon = btn.querySelector("i");

      if (input.type === "password") {
        input.type = "text";
        icon.classList.remove("bi-eye");
        icon.classList.add("bi-eye-slash");
      } else {
        input.type = "password";
        icon.classList.remove("bi-eye-slash");
        icon.classList.add("bi-eye");
      }
    });
});

  // =========================
  // Account Settings: Profile update + Photo upload (farm_manager/encoder)
  // =========================
  const accountSettingsModalEl = document.getElementById("accountSettingsModal");
  const feedbackModalEl = document.getElementById("accountFeedbackModal");

  if (accountSettingsModalEl && feedbackModalEl) {
    const feedbackModal = bootstrap.Modal.getOrCreateInstance(feedbackModalEl, {
      backdrop: true,
      focus: true,
    });

    const showFeedback = (title, message) => {
      const t = document.getElementById("accountFeedbackTitle");
      const m = document.getElementById("accountFeedbackMessage");
      if (t) t.textContent = title || "Message";
      if (m) m.textContent = message || "";
      feedbackModal.show();
    };

    const editBtn = document.getElementById("editProfileBtn");
    const cancelBtn = document.getElementById("cancelProfileEditBtn");
    const saveBtn = document.getElementById("saveProfileBtn");

    const form = document.getElementById("accountProfileForm");

    const firstName = document.getElementById("accountFirstName");
    const lastName = document.getElementById("accountLastName");
    const address = document.getElementById("accountAddress");
    const contact = document.getElementById("accountContact");

    const fileInput = document.getElementById("accountProfilePhotoInput");
    const uploadBtn = document.getElementById("uploadProfilePhotoBtn");
    const resetPhotoBtn = document.getElementById("resetProfilePhotoBtn");

    const heroImg = document.getElementById("accountProfileImg");
    const previewImg = document.getElementById("accountProfileImgPreview");

    const DEFAULT_AVATAR = "/images/default-avatar.png";

    // store initial values so Cancel can restore
    const initialState = {
      first: firstName?.value ?? "",
      last: lastName?.value ?? "",
      addr: address?.value ?? "",
      contact: contact?.value ?? "",
      photo: heroImg?.getAttribute("src") || DEFAULT_AVATAR,
      file: null,
    };

    const setEditMode = (on) => {
      [firstName, lastName, address, contact, fileInput, uploadBtn, resetPhotoBtn, cancelBtn, saveBtn]
        .filter(Boolean)
        .forEach((el) => (el.disabled = !on));

      if (editBtn) editBtn.disabled = on;
      if (!on) {
        // reset preview to current hero image
        if (previewImg && heroImg) previewImg.src = heroImg.src || DEFAULT_AVATAR;
        if (fileInput) fileInput.value = "";
      }
    };

    setEditMode(false);

    editBtn?.addEventListener("click", () => setEditMode(true));

    cancelBtn?.addEventListener("click", () => {
      if (firstName) firstName.value = initialState.first;
      if (lastName) lastName.value = initialState.last;
      if (address) address.value = initialState.addr;
      if (contact) contact.value = initialState.contact;
      if (heroImg) heroImg.src = initialState.photo || DEFAULT_AVATAR;
      if (previewImg) previewImg.src = initialState.photo || DEFAULT_AVATAR;
      setEditMode(false);
    });

    // live preview on file pick
    fileInput?.addEventListener("change", () => {
      const f = fileInput.files?.[0];
      if (!f) {
        if (previewImg && heroImg) previewImg.src = heroImg.src || DEFAULT_AVATAR;
        return;
      }
      const url = URL.createObjectURL(f);
      if (previewImg) previewImg.src = url;
    });

    resetPhotoBtn?.addEventListener("click", () => {
      if (fileInput) fileInput.value = "";
      if (previewImg && heroImg) previewImg.src = heroImg.src || DEFAULT_AVATAR;
    });

    const getAuthHeaders = () => {
      const token = localStorage.getItem("token");
      // requireSessionAndToken might require Authorization; include if present
      return token ? { Authorization: `Bearer ${token}` } : {};
    };

    // SAVE TEXT PROFILE
    form?.addEventListener("submit", async (e) => {
      e.preventDefault();

      try {
        const payload = {
          first_name: (firstName?.value || "").trim(),
          last_name: (lastName?.value || "").trim(),
          address: (address?.value || "").trim(),
          contact_info: (contact?.value || "").trim(),
        };

        const res = await fetch("/api/auth/update-profile", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(),
          },
          credentials: "include",
          body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.success) {
          throw new Error(data.message || "Failed to update profile.");
        }

        // update local initial state (for cancel)
        initialState.first = payload.first_name;
        initialState.last = payload.last_name;
        initialState.addr = payload.address;
        initialState.contact = payload.contact_info;

        // Update hero display name (optional UI)
        const displayName = document.getElementById("acctDisplayName");
        if (displayName) displayName.textContent = `${payload.first_name} ${payload.last_name}`.trim() || "User";

        setEditMode(false);
        showFeedback("Success", "Profile updated successfully.");
      } catch (err) {
        console.error(err);
        showFeedback("Error", err.message || "Something went wrong.");
      }
    });

    // UPLOAD PHOTO
    uploadBtn?.addEventListener("click", async () => {
      try {
        const f = fileInput?.files?.[0];
        if (!f) {
          showFeedback("Notice", "Please choose a photo first.");
          return;
        }

        const fd = new FormData();
        // ✅ MUST MATCH: uploadUserProfilePhoto.single("profile_photo")
        fd.append("profile_photo", f);

        const res = await fetch("/api/auth/update-profile-photo", {
          method: "PUT",
          headers: {
            ...getAuthHeaders(),
          },
          credentials: "include",
          body: fd,
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.success) {
          throw new Error(data.message || "Failed to upload photo.");
        }

        const newSrc = data.profile_photo || DEFAULT_AVATAR;

        if (heroImg) heroImg.src = newSrc;
        if (previewImg) previewImg.src = newSrc;

        initialState.photo = newSrc;

        showFeedback("Success", "Profile photo uploaded successfully.");
      } catch (err) {
        console.error(err);
        showFeedback("Error", err.message || "Upload failed.");
      }
    });

    // reset when modal opens (avoid stale edit mode)
    accountSettingsModalEl.addEventListener("show.bs.modal", () => {
      // refresh initial state based on current inputs
      initialState.first = firstName?.value ?? "";
      initialState.last = lastName?.value ?? "";
      initialState.addr = address?.value ?? "";
      initialState.contact = contact?.value ?? "";
      initialState.photo = heroImg?.getAttribute("src") || DEFAULT_AVATAR;

      setEditMode(false);
    });
  }