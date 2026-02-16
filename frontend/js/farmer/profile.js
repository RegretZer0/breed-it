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
   CHANGE PASSWORD (MODAL TOGGLE)
  ======================= */
  const openChangeBtn = document.getElementById("openChangePassword");
  const closeChangeBtn = document.getElementById("closeChangePassword");
  const changeModal = document.getElementById("changePasswordModal");

  if (openChangeBtn && changeModal) {
    openChangeBtn.addEventListener("click", () => {
      changeModal.classList.remove("hidden");
    });

    closeChangeBtn?.addEventListener("click", () => {
      changeModal.classList.add("hidden");
    });
  }

  /* =======================
   AVATAR PREVIEW
  ======================= */
  if (avatarInput) {
    avatarInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        if (editAvatarImg) {
          editAvatarImg.src = reader.result;
        }
      };
      reader.readAsDataURL(file);
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
  const saveBtn = editSection.querySelector(".save-btn");

  /* =======================
     MODAL ELEMENTS
  ======================= */
  const previewModal = document.getElementById("previewModal");
  const previewName = document.getElementById("previewName");
  const previewEmail = document.getElementById("previewEmail");
  const previewContact = document.getElementById("previewContact");
  const previewAddress = document.getElementById("previewAddress");
  const previewNumPens = document.getElementById("previewNumPens");
  const previewPenCapacity = document.getElementById("previewPenCapacity");
  const previewCancel = document.getElementById("previewCancel");
  const previewConfirm = document.getElementById("previewConfirm");

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
    if (!data.success || !data.farmer) {
      throw new Error("Invalid profile response");
    }

    farmerData = data.farmer;

    nameEl.textContent = `${farmerData.first_name} ${farmerData.last_name}` || "-";
    emailEl.textContent = farmerData.email || "-";
    contactEl.textContent = farmerData.contact_no || "-";
    addressEl.textContent = farmerData.address || "-";
    farmerIdEl.textContent = farmerData.farmer_id || "-";
    numPensEl.textContent = farmerData.num_of_pens ?? "0";
    penCapacityEl.textContent = farmerData.pen_capacity ?? "0";

    // Load profile picture
    if (avatarImg) {
      avatarImg.src = farmerData.profile_picture || "/images/default-avatar.png";
    }

    if (editAvatarImg) {
      editAvatarImg.src = farmerData.profile_picture || "/images/default-avatar.png";
    }

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
     EDIT MODE
  ======================= */
  editBtn.addEventListener("click", () => {
    // editName.value = farmerData.name || "";
    editEmail.value = farmerData.email || "";
    editContact.value = farmerData.contact_no || "";
    editAddress.value = farmerData.address || "";
    editNumPens.value = farmerData.num_of_pens ?? 0;
    editPenCapacity.value = farmerData.pen_capacity ?? 0;
    editName.value = `${farmerData.first_name} ${farmerData.last_name}` || "";


    viewSection.classList.add("hidden");
    editSection.classList.remove("hidden");
  });

  cancelBtn.addEventListener("click", () => {
    editSection.classList.add("hidden");
    viewSection.classList.remove("hidden");
  });

  /* =======================
     SAVE → PREVIEW MODAL
  ======================= */
  saveBtn.addEventListener("click", (e) => {
    e.preventDefault();

    if (!editContact.value || !editAddress.value) {
      alert("Please complete required fields.");
      return;
    }

    if (editNumPens.value < 0 || editPenCapacity.value < 0) {
      alert("Values cannot be negative.");
      return;
    }

    previewName.textContent = editName.value;
    previewEmail.textContent = editEmail.value;
    previewContact.textContent = editContact.value;
    previewAddress.textContent = editAddress.value;
    previewNumPens.textContent = editNumPens.value;
    previewPenCapacity.textContent = editPenCapacity.value;

    previewModal.classList.remove("hidden");
  });


  previewCancel?.addEventListener("click", () => {
    previewModal.classList.add("hidden");
  });

  
  previewConfirm?.addEventListener("click", async (e) => {
  e.preventDefault();
    try {
      const formData = new FormData();
      formData.append("contact_no", editContact.value);
      formData.append("address", editAddress.value);
      formData.append("num_of_pens", editNumPens.value);
      formData.append("pen_capacity", editPenCapacity.value);

      if (avatarInput && avatarInput.files[0]) {
        formData.append("profile_picture", avatarInput.files[0]);
      }

      const res = await fetch("/api/farmer/profile", {
        method: "PUT",
        credentials: "include",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Update failed");
      }

      const farmer = data.farmer;

      nameEl.textContent = `${farmer.first_name} ${farmer.last_name}`;
      emailEl.textContent = farmer.email;
      contactEl.textContent = farmer.contact_no;
      addressEl.textContent = farmer.address;
      numPensEl.textContent = farmer.num_of_pens ?? "0";
      penCapacityEl.textContent = farmer.pen_capacity ?? "0";


      farmerData = farmer;

      previewModal.classList.add("hidden");
      editSection.classList.add("hidden");
      viewSection.classList.remove("hidden");

      document.getElementById("successModal").classList.remove("hidden");

    } catch (err) {
      console.error("❌ Save failed:", err);
      document.getElementById("errorModal")
        .classList.remove("hidden");
    }
  });

  // SUCCESS MODAL CLOSE
  document.getElementById("closeSuccessModal")
    ?.addEventListener("click", () => {
      document.getElementById("successModal")
        .classList.add("hidden");
  });

  // CLOSE ERROR MODAL
  document.getElementById("closeErrorModal")
    ?.addEventListener("click", () => {
      document.getElementById("errorModal")
        .classList.add("hidden");
  });
});