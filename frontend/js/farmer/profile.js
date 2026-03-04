console.log(" farmer_profile.js loaded");

document.addEventListener("DOMContentLoaded", async () => {
  /* =======================
     VIEW MODE ELEMENTS
  ======================= */
  const viewSection = document.getElementById("viewProfile");
  const editSection = document.getElementById("editProfile");

  const nameEl = document.getElementById("profileName");
  const emailEl = document.getElementById("email");
  const contactEl = document.getElementById("contact_no");
  const addressEl = document.getElementById("address");
  const farmerIdEl = document.getElementById("farmer_id");
  const numPensEl = document.getElementById("num_of_pens");
  const penCapacityEl = document.getElementById("pen_capacity");

  /* =======================
    AVATAR ELEMENTS
  ======================= */
  const avatarImg = document.getElementById("profileAvatarImg");
  const editAvatarImg = document.getElementById("editAvatarImg");
  const avatarInput = document.getElementById("avatarInput");
  const changeAvatarBtn = document.getElementById("changeAvatarBtn");

  /* =======================
     CROP MODAL ELEMENTS
     Notes:
     - IDs matched to your EJS modal
     - We toggle both `hidden` and Bootstrap-like `show`
  ======================= */
  let cropper = null;

  const cropModal = document.getElementById("cropAvatarModal");
  const cropImgEl = document.getElementById("cropAvatarImg");

  const closeCropBtn = document.getElementById("closeCropAvatar");
  const cancelCropBtn = document.getElementById("cancelCropAvatar");
  const applyCropBtn = document.getElementById("applyCropAvatar");

  const zoomInBtn = document.getElementById("cropZoomIn");
  const zoomOutBtn = document.getElementById("cropZoomOut");
  const rotateBtn = document.getElementById("cropRotate");
  const resetBtn = document.getElementById("cropReset");

  function ensureCropperAvailable() {
    return typeof window.Cropper === "function";
  }

  function safeDestroyCropper() {
    if (cropper) {
      try {
        cropper.destroy();
      } catch (e) {
        console.warn("Cropper destroy failed:", e);
      }
      cropper = null;
    }
  }

  function openCropModal() {
    if (!cropModal) return;

    // Important: Bootstrap CSS uses `.modal { display:none }` unless `.show`
    cropModal.classList.remove("hidden");
    cropModal.classList.add("show");

    // prevent background scroll
    document.body.style.overflow = "hidden";
  }

  function closeCropModal({ clearInput = false } = {}) {
    if (!cropModal) return;

    cropModal.classList.add("hidden");
    cropModal.classList.remove("show");

    safeDestroyCropper();

    if (cropImgEl) cropImgEl.src = "";
    if (clearInput && avatarInput) avatarInput.value = "";

    // restore scroll
    document.body.style.overflow = "";
  }

  function setInputFile(inputEl, file) {
    const dt = new DataTransfer();
    dt.items.add(file);
    inputEl.files = dt.files;
  }

  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  function canvasToFile(canvas, fileName, mimeType = "image/jpeg", quality = 0.92) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("Failed to create image blob"));
          resolve(new File([blob], fileName, { type: mimeType }));
        },
        mimeType,
        quality
      );
    });
  }

  function applyCircleCropMask() {
    // Make the crop box look like a circle (UI only)
    // Output remains square for best avatar rendering.
    try {
      const box = cropModal?.querySelector(".cropper-view-box");
      const face = cropModal?.querySelector(".cropper-face");
      if (box) box.style.borderRadius = "50%";
      if (face) face.style.borderRadius = "50%";
    } catch (e) {
      // ignore
    }
  }

  /* =======================
   CHANGE PASSWORD (MODAL TOGGLE)
  ======================= */
  const openChangeBtn = document.getElementById("openChangePassword");
  const closeChangeBtn = document.getElementById("closeChangePassword");
  const changeModal = document.getElementById("changePasswordModal");

  if (openChangeBtn && changeModal) {
    openChangeBtn.addEventListener("click", () => {
      changeModal.classList.remove("hidden");
      changeModal.classList.add("show");
      document.body.style.overflow = "hidden";
    });

    closeChangeBtn?.addEventListener("click", () => {
      changeModal.classList.add("hidden");
      changeModal.classList.remove("show");
      document.body.style.overflow = "";
    });
  }

  /* =======================
     EDIT MODE ELEMENTS
  ======================= */
  const editName = document.getElementById("editName");
  const editEmail = document.getElementById("editEmail");
  const editContact = document.getElementById("editContact_no");
  const editAddress = document.getElementById("editAddress");
  const editNumPens = document.getElementById("editNumPens");
  const editPenCapacity = document.getElementById("editPenCapacity");

  const editBtn = document.getElementById("editProfileBtn");
  const cancelBtn = document.getElementById("cancelEdit");
  const saveBtn = editSection?.querySelector(".save-btn");

  /* =======================
     MODAL ELEMENTS
     Note: Your EJS has duplicate id="previewCancel" in two places.
     IDs should be unique, but we won't change your EJS here.
     We'll queryAll and bind safely below.
  ======================= */
  const previewModal = document.getElementById("previewModal");
  const previewName = document.getElementById("previewName");
  const previewEmail = document.getElementById("previewEmail");
  const previewContact = document.getElementById("previewContact");
  const previewAddress = document.getElementById("previewAddress");
  const previewNumPens = document.getElementById("previewNumPens");
  const previewPenCapacity = document.getElementById("previewPenCapacity");
  const previewConfirm = document.getElementById("previewConfirm");

  // Handle duplicate previewCancel IDs safely
  const previewCancelBtns = document.querySelectorAll("#previewCancel");

  let farmerData = null;

  /* =======================
     LOAD PROFILE
  ======================= */
  try {
    const res = await fetch("/api/farmer/profile", {
      credentials: "include",
      headers: { Accept: "application/json" },
    });

    if (!res.ok) throw new Error("Failed to fetch profile");

    const data = await res.json();
    if (!data.success || !data.farmer) throw new Error("Invalid profile response");

    farmerData = data.farmer;

    nameEl.textContent = `${farmerData.first_name} ${farmerData.last_name}` || "-";
    emailEl.textContent = farmerData.email || "-";
    contactEl.textContent = farmerData.contact_no || "-";
    addressEl.textContent = farmerData.address || "-";
    farmerIdEl.textContent = farmerData.farmer_id || "-";
    numPensEl.textContent = farmerData.num_of_pens ?? "0";
    penCapacityEl.textContent = farmerData.pen_capacity ?? "0";

    if (avatarImg) avatarImg.src = farmerData.profile_picture || "/images/default-avatar.png";
    if (editAvatarImg) editAvatarImg.src = farmerData.profile_picture || "/images/default-avatar.png";
  } catch (err) {
    console.error(err);
    alert("Failed to load profile.");
    return;
  }

  /* =======================
   AVATAR UPLOAD TOGGLE
  ======================= */
  if (changeAvatarBtn && avatarInput) {
    changeAvatarBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();

      if (!avatarInput.dataset.opening) {
        avatarInput.dataset.opening = "true";
        avatarInput.click();

        setTimeout(() => {
          avatarInput.dataset.opening = "";
        }, 500);
      }
    });
  }

  /* =======================
   AVATAR CROP FLOW (Circle UI)
   Requirements:
   - Cropper.js must be included on the page
  ======================= */
  if (avatarInput) {
    avatarInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.type.startsWith("image/")) {
        alert("Please select a valid image file.");
        avatarInput.value = "";
        return;
      }

      if (!cropModal || !cropImgEl) {
        console.warn("Crop modal elements not found. Check IDs in EJS.");
        // fallback preview only
        const url = await fileToDataURL(file);
        if (editAvatarImg) editAvatarImg.src = url;
        return;
      }

      if (!ensureCropperAvailable()) {
        console.warn("Cropper.js not loaded. Add cropperjs script/css to enable cropping.");
        // fallback preview only
        const url = await fileToDataURL(file);
        if (editAvatarImg) editAvatarImg.src = url;
        return;
      }

      // Reset previous instance before opening
      safeDestroyCropper();

      // Load image into modal
      const dataUrl = await fileToDataURL(file);
      cropImgEl.src = dataUrl;

      // Open modal
      openCropModal();

      // Create cropper
      cropper = new window.Cropper(cropImgEl, {
        aspectRatio: 1,
        viewMode: 1,
        dragMode: "move",
        autoCropArea: 1,
        responsive: true,
        background: false,
        guides: false,
        center: true,
        zoomOnWheel: true,
        ready() {
          applyCircleCropMask();
        },
        crop() {
          // keep circular UI mask applied
          applyCircleCropMask();
        },
      });
    });
  }

  /* =======================
   CROP MODAL BUTTONS
  ======================= */
  closeCropBtn?.addEventListener("click", () => closeCropModal({ clearInput: false }));
  cancelCropBtn?.addEventListener("click", () => closeCropModal({ clearInput: true }));

  zoomInBtn?.addEventListener("click", () => cropper?.zoom(0.08));
  zoomOutBtn?.addEventListener("click", () => cropper?.zoom(-0.08));
  rotateBtn?.addEventListener("click", () => cropper?.rotate(90));
  resetBtn?.addEventListener("click", () => cropper?.reset());

  applyCropBtn?.addEventListener("click", async () => {
    try {
      if (!cropper || !avatarInput?.files?.[0]) return;

      // Export square output (best for circular avatar display)
      const canvas = cropper.getCroppedCanvas({
        width: 512,
        height: 512,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: "high",
      });

      const croppedFile = await canvasToFile(
        canvas,
        `avatar_${Date.now()}.jpg`,
        "image/jpeg",
        0.92
      );

      setInputFile(avatarInput, croppedFile);

      // Update edit preview
      if (editAvatarImg) editAvatarImg.src = canvas.toDataURL("image/jpeg", 0.92);

      closeCropModal({ clearInput: false });
    } catch (err) {
      console.error("Crop apply failed:", err);
      alert("Failed to crop image. Please try another image.");
      closeCropModal({ clearInput: true });
    }
  });

  // Click outside modal content to close (optional)
  cropModal?.addEventListener("click", (e) => {
    if (e.target === cropModal) closeCropModal({ clearInput: false });
  });

  /* =======================
     EDIT MODE
  ======================= */
  editBtn?.addEventListener("click", () => {
    editEmail.value = farmerData.email || "";
    editContact.value = farmerData.contact_no || "";
    editAddress.value = farmerData.address || "";
    editNumPens.value = farmerData.num_of_pens ?? 0;
    editPenCapacity.value = farmerData.pen_capacity ?? 0;
    editName.value = `${farmerData.first_name} ${farmerData.last_name}` || "";

    viewSection?.classList.add("hidden");
    editSection?.classList.remove("hidden");
  });

  cancelBtn?.addEventListener("click", () => {
    editSection?.classList.add("hidden");
    viewSection?.classList.remove("hidden");
  });

  /* =======================
     SAVE → PREVIEW MODAL
  ======================= */
  saveBtn?.addEventListener("click", (e) => {
    e.preventDefault();

    if (!editContact.value || !editAddress.value) {
      alert("Please complete required fields.");
      return;
    }

    if (Number(editNumPens.value) < 0 || Number(editPenCapacity.value) < 0) {
      alert("Values cannot be negative.");
      return;
    }

    previewName.textContent = editName.value;
    previewEmail.textContent = editEmail.value;
    previewContact.textContent = editContact.value;
    previewAddress.textContent = editAddress.value;
    previewNumPens.textContent = editNumPens.value;
    previewPenCapacity.textContent = editPenCapacity.value;

    previewModal?.classList.remove("hidden");
    previewModal?.classList.add("show");
    document.body.style.overflow = "hidden";
  });

  previewCancelBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      previewModal?.classList.add("hidden");
      previewModal?.classList.remove("show");
      document.body.style.overflow = "";
    });
  });

  previewConfirm?.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      const formData = new FormData();
      formData.append("contact_no", editContact.value);
      formData.append("address", editAddress.value);
      formData.append("num_of_pens", editNumPens.value);
      formData.append("pen_capacity", editPenCapacity.value);

      if (avatarInput && avatarInput.files && avatarInput.files[0]) {
        formData.append("profile_picture", avatarInput.files[0]);
      }

      const res = await fetch("/api/farmer/profile", {
        method: "PUT",
        credentials: "include",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Update failed");

      const farmer = data.farmer;

      nameEl.textContent = `${farmer.first_name} ${farmer.last_name}`;
      emailEl.textContent = farmer.email;
      contactEl.textContent = farmer.contact_no;
      addressEl.textContent = farmer.address;
      numPensEl.textContent = farmer.num_of_pens ?? "0";
      penCapacityEl.textContent = farmer.pen_capacity ?? "0";

      if (avatarImg) avatarImg.src = farmer.profile_picture || avatarImg.src;
      if (editAvatarImg) editAvatarImg.src = farmer.profile_picture || editAvatarImg.src;

      farmerData = farmer;

      previewModal?.classList.add("hidden");
      previewModal?.classList.remove("show");
      document.body.style.overflow = "";

      editSection?.classList.add("hidden");
      viewSection?.classList.remove("hidden");

      document.getElementById("successModal")?.classList.remove("hidden");
      document.getElementById("successModal")?.classList.add("show");
    } catch (err) {
      console.error("Save failed:", err);
      document.getElementById("errorModal")?.classList.remove("hidden");
      document.getElementById("errorModal")?.classList.add("show");
    }
  });

  // SUCCESS MODAL CLOSE
  document.getElementById("closeSuccessModal")?.addEventListener("click", () => {
    document.getElementById("successModal")?.classList.add("hidden");
    document.getElementById("successModal")?.classList.remove("show");
  });

  // CLOSE ERROR MODAL
  document.getElementById("closeErrorModal")?.addEventListener("click", () => {
    document.getElementById("errorModal")?.classList.add("hidden");
    document.getElementById("errorModal")?.classList.remove("show");
  });
});