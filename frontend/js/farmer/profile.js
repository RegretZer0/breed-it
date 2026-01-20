console.log("✅ farmer_profile.js loaded");

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
  const messageEl = document.getElementById("profileMessage");

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

    nameEl.textContent = farmerData.name || "-";
    emailEl.textContent = farmerData.email || "-";
    contactEl.textContent = farmerData.contact_no || "-";
    addressEl.textContent = farmerData.address || "-";
    farmerIdEl.textContent = farmerData.farmer_id || "-";
    numPensEl.textContent = farmerData.num_of_pens ?? "0";
    penCapacityEl.textContent = farmerData.pen_capacity ?? "0";

  } catch (err) {
    console.error(err);
    messageEl.textContent = "Failed to load profile.";
    return;
  }

  /* =======================
     EDIT MODE
  ======================= */
  editBtn.addEventListener("click", () => {
    editName.value = farmerData.name || "";
    editEmail.value = farmerData.email || "";
    editContact.value = farmerData.contact_no || "";
    editAddress.value = farmerData.address || "";
    editNumPens.value = farmerData.num_of_pens ?? 0;
    editPenCapacity.value = farmerData.pen_capacity ?? 0;

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
  saveBtn.addEventListener("click", () => {
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

  previewConfirm?.addEventListener("click", async () => {
    try {
      const payload = {
        name: editName.value,
        email: editEmail.value,
        contact_no: editContact.value,
        address: editAddress.value,
        num_of_pens: Number(editNumPens.value),
        pen_capacity: Number(editPenCapacity.value),
      };

      const res = await fetch("/api/farmer/profile", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Update failed");
      }

      const farmer = data.farmer;

      nameEl.textContent = farmer.name;
      emailEl.textContent = farmer.email;
      contactEl.textContent = farmer.contact_no;
      addressEl.textContent = farmer.address;
      numPensEl.textContent = farmer.num_of_pens ?? "0";
      penCapacityEl.textContent = farmer.pen_capacity ?? "0";


      farmerData = farmer;

      previewModal.classList.add("hidden");
      editSection.classList.add("hidden");
      viewSection.classList.remove("hidden");

      alert("✅ Profile changes have been saved.");

    } catch (err) {
      console.error("❌ Save failed:", err);
      alert("❌ Failed to save profile. Please try again.");
    }
  });
});


/* =======================
   CHANGE PASSWORD (MODAL TOGGLE)
======================= */
document.addEventListener("DOMContentLoaded", () => {
  const openChangeBtn = document.getElementById("openChangePassword");
  const closeChangeBtn = document.getElementById("closeChangePassword");
  const changeModal = document.getElementById("changePasswordModal");

  if (!openChangeBtn || !changeModal) return;

  openChangeBtn.addEventListener("click", () => {
    changeModal.classList.remove("hidden");
  });

  closeChangeBtn?.addEventListener("click", () => {
    changeModal.classList.add("hidden");
  });
});


