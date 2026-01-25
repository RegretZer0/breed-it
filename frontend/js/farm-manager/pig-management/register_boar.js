import { authGuard } from "/js/authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  // ================= AUTH =================
  const user = await authGuard(["farm_manager", "encoder"]);
  if (!user) return;

  const BACKEND_URL = "http://localhost:5000";
  const token = localStorage.getItem("token");

  // ================= RESOLVE MANAGER ID =================
  const managerId =
    user.role === "farm_manager" ? (user.id || user._id) : user.managerId;

  // ================= DOM =================
  const form = document.getElementById("registerBoarForm");
  const messageEl = document.getElementById("boarMessage");

  const breedInput = document.getElementById("breed");
  const colorSelect = document.getElementById("colorSelect");
  const otherColorGroup = document.getElementById("otherColorGroup");
  const otherColorInput = document.getElementById("otherColorInput");
  const dateTransferInput = document.getElementById("dateTransfer");

  // Preview modal
  const previewModalEl = document.getElementById("previewBoarModal");
  const previewContent = document.getElementById("previewBoarContent");
  const confirmBoarBtn = document.getElementById("confirmBoarBtn");

  // Success modal
  const successModalEl = document.getElementById("successBoarModal");
  const successBoarIdEl = document.getElementById("successBoarId");

  // Optional ID preview
  const nextIdPreview = document.getElementById("nextBoarIdPreview");

  // ================= UTIL: SAFE MODAL CLEANUP =================
  function forceModalCleanup() {
    document.body.classList.remove("modal-open");
    document.body.style.overflow = "";
    document.querySelectorAll(".modal-backdrop").forEach(b => b.remove());
  }

  // ================= LOCK BREED =================
  breedInput.value = "Native";
  breedInput.readOnly = true;

  // ================= DEFAULT DATE =================
  dateTransferInput.value = new Date().toISOString().split("T")[0];

  // ================= ID PREVIEW =================
  async function updateNextBoarId() {
    if (!nextIdPreview) return;
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/swine/next-boar-id?managerId=${managerId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (data.success) {
        nextIdPreview.textContent = `Next ID: ${data.nextId}`;
      }
    } catch (err) {
      console.error("Error fetching next Boar ID", err);
    }
  }

  // ================= COLOR LOGIC =================
  function handleColorChange() {
    if (colorSelect.value === "Other") {
      otherColorGroup.classList.remove("d-none");
    } else {
      otherColorGroup.classList.add("d-none");
      otherColorInput.value = "";
    }
  }

  colorSelect.addEventListener("change", handleColorChange);

  // ================= PREVIEW HELPERS =================
  function previewRow(label, value) {
    return `
      <div class="preview-row d-flex justify-content-between">
        <span class="text-muted">${label}</span>
        <span class="fw-semibold">${value || "-"}</span>
      </div>
    `;
  }

  // ================= INITIAL UI =================
  handleColorChange();
  updateNextBoarId();

  // ================= FORM SUBMIT (SHOW PREVIEW) =================
  form.addEventListener("submit", e => {
    e.preventDefault();
    messageEl.textContent = "";

    const finalColor =
      colorSelect.value === "Other"
        ? otherColorInput.value.trim()
        : colorSelect.value;

    if (!finalColor) {
      messageEl.textContent = "Please select or specify a color.";
      messageEl.className = "text-danger fw-bold";
      return;
    }

    previewContent.innerHTML = `
      <div class="preview-section">Boar Information</div>
      ${previewRow("Breed", "Native")}
      ${previewRow("Color", finalColor)}
      ${previewRow("Date Registered", dateTransferInput.value)}

      <div class="preview-section mt-3">Initial Measurements</div>
      ${previewRow("Weight (kg)", document.getElementById("weight").value)}
      ${previewRow("Body Length (cm)", document.getElementById("bodyLength").value)}
      ${previewRow("Heart Girth (cm)", document.getElementById("heartGirth").value)}
      ${previewRow("Teeth Count", document.getElementById("teethCount").value)}
    `;

    // 🔑 Ensure clean state before opening preview
    forceModalCleanup();

    let previewModal = bootstrap.Modal.getInstance(previewModalEl);
    if (!previewModal) {
      previewModal = new bootstrap.Modal(previewModalEl, {
        backdrop: "static",
        keyboard: false
      });
    }
    previewModal.show();
  });

  // ================= CONFIRM & SAVE =================
  confirmBoarBtn.addEventListener("click", async () => {
    confirmBoarBtn.disabled = true;

    const finalColor =
      colorSelect.value === "Other"
        ? otherColorInput.value.trim()
        : colorSelect.value;

    const payload = {
      breed: "Native",
      color: finalColor,
      weight: parseFloat(document.getElementById("weight").value),
      bodyLength: parseFloat(document.getElementById("bodyLength").value),
      heartGirth: parseFloat(document.getElementById("heartGirth").value),
      teethCount: parseInt(document.getElementById("teethCount").value),
      date_transfer: dateTransferInput.value,
      health_status: "Healthy",
      current_status: "Active",
      managerId
    };

    try {
      const res = await fetch(`${BACKEND_URL}/api/swine/add-master-boar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      // Close preview modal cleanly
      bootstrap.Modal.getInstance(previewModalEl).hide();
      forceModalCleanup();

      // Show success modal
      successBoarIdEl.textContent = `Boar ID: ${data.swine.swine_id}`;
      new bootstrap.Modal(successModalEl).show();

      // Reset form
      form.reset();
      breedInput.value = "Native";
      dateTransferInput.value = new Date().toISOString().split("T")[0];
      handleColorChange();

      setTimeout(updateNextBoarId, 500);

    } catch (err) {
      messageEl.textContent = err.message || "Registration failed";
      messageEl.className = "text-danger fw-bold";
    } finally {
      confirmBoarBtn.disabled = false;
    }
  });

  // Cleanup ONLY after success modal closes
  successModalEl.addEventListener("hidden.bs.modal", forceModalCleanup);
});
