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
  if (!form) return;

  const messageEl = document.getElementById("boarMessage"); // optional legacy
  const batchInput = document.getElementById("batch");
  const breedInput = document.getElementById("breed");
  const colorSelect = document.getElementById("colorSelect");
  const otherColorGroup = document.getElementById("otherColorGroup");
  const otherColorInput = document.getElementById("otherColorInput");
  const dateTransferInput = document.getElementById("dateTransfer");

  // ✅ new fields
  const birthDateInput = document.getElementById("birthDate");
  const healthStatusSelect = document.getElementById("healthStatus");

  // Measurements
  const weightInput = document.getElementById("weight");
  const bodyLengthInput = document.getElementById("bodyLength");
  const heartGirthInput = document.getElementById("heartGirth");
  const teethCountInput = document.getElementById("teethCount");

  // Preview modal
  const previewModalEl = document.getElementById("previewBoarModal");
  const previewContent = document.getElementById("previewBoarContent");
  const confirmBoarBtn = document.getElementById("confirmBoarBtn");

  // Success modal
  const successModalEl = document.getElementById("successBoarModal");
  const successBoarIdEl = document.getElementById("successBoarId");

  // Optional ID preview
  const nextIdPreview = document.getElementById("nextBoarIdPreview");

  // Guard: if critical modal elements missing, don’t break page
  const hasPreviewModal = !!(previewModalEl && previewContent && confirmBoarBtn);
  const hasSuccessModal = !!(successModalEl && successBoarIdEl);

  // ================= UTIL: SAFE MODAL CLEANUP =================
  function forceModalCleanup() {
    document.body.classList.remove("modal-open");
    document.body.style.overflow = "";
    document.querySelectorAll(".modal-backdrop").forEach((b) => b.remove());
  }

  function setInlineMessage(type, text) {
    if (!messageEl) return;
    messageEl.textContent = text || "";
    messageEl.className =
      type === "error"
        ? "text-danger fw-bold small"
        : type === "success"
        ? "text-success fw-bold small"
        : "text-muted fw-bold small";
  }

  // ================= LOCK BREED =================
  if (breedInput) {
    breedInput.value = "Native";
    breedInput.readOnly = true;
  }

  // ================= DEFAULT DATES =================
  function setTodayDate(el) {
    if (!el) return;
    const today = new Date().toISOString().split("T")[0];
    el.value = today;
    el.max = today;
  }

  setTodayDate(dateTransferInput);
  // Birth date should not be in the future (optional but safe)
  if (birthDateInput) birthDateInput.max = new Date().toISOString().split("T")[0];

  // ================= SMALLER BUTTONS (NO HTML CHANGES NEEDED) =================
  // Your EJS uses btn-md already, but this guarantees smaller buttons even if not updated.
  // (doesn't change any IDs)
  form.querySelectorAll('button[type="reset"], button[type="submit"]').forEach((btn) => {
    btn.classList.remove("btn-lg");
    btn.classList.add("btn-sm"); // ✅ smaller
  });

  // ================= ID PREVIEW =================
  async function updateNextBoarId() {
    if (!nextIdPreview) return;
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/swine/next-boar-id?managerId=${encodeURIComponent(
          managerId
        )}`,
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
    if (!colorSelect || !otherColorGroup || !otherColorInput) return;

    if (colorSelect.value === "Other") {
      otherColorGroup.classList.remove("d-none");
    } else {
      otherColorGroup.classList.add("d-none");
      otherColorInput.value = "";
    }
  }

  colorSelect?.addEventListener("change", handleColorChange);

  // ================= PREVIEW HELPERS =================
  function previewRow(label, value) {
    const safeVal = value || "-";
    return `
      <div class="preview-row d-flex justify-content-between gap-3">
        <span class="text-muted">${label}</span>
        <span class="fw-semibold text-end">${safeVal}</span>
      </div>
    `;
  }

  function getFinalColor() {
    if (!colorSelect) return "";
    return colorSelect.value === "Other"
      ? (otherColorInput?.value || "").trim()
      : colorSelect.value;
  }

  function validateRequired() {
    const finalColor = getFinalColor();
    if (!finalColor) {
      setInlineMessage("error", "Please select or specify a color.");
      return { ok: false };
    }

    if (!birthDateInput?.value) {
      setInlineMessage("error", "Birth date is required.");
      return { ok: false };
    }

    if (!dateTransferInput?.value) {
      setInlineMessage("error", "Date registered / transferred is required.");
      return { ok: false };
    }

    // measurements required (as your form expects)
    if (!weightInput?.value || !bodyLengthInput?.value || !heartGirthInput?.value || !teethCountInput?.value) {
      setInlineMessage("error", "Please complete all required measurements.");
      return { ok: false };
    }

    return { ok: true, finalColor };
  }

  // ================= INITIAL UI =================
  handleColorChange();
  updateNextBoarId();

  // ================= FORM SUBMIT (SHOW PREVIEW) =================
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    setInlineMessage("info", "");

    const v = validateRequired();
    if (!v.ok) return;

    // If preview modal missing, fallback to direct submit
    if (!hasPreviewModal) {
      showConfirmAndSave(v.finalColor);
      return;
    }

    previewContent.innerHTML = `
      <div class="preview-section">Boar Information</div>
      ${previewRow("Batch ID / Source ID", (batchInput?.value || "").trim())}
      ${previewRow("Breed", "Native")}
      ${previewRow("Color", v.finalColor)}
      ${previewRow("Birth Date", birthDateInput.value)}
      ${previewRow("Health Status", healthStatusSelect?.value || "Healthy")}
      ${previewRow("Date Registered", dateTransferInput.value)}

      <div class="preview-section mt-3">Initial Measurements</div>
      ${previewRow("Weight (kg)", weightInput.value)}
      ${previewRow("Body Length (cm)", bodyLengthInput.value)}
      ${previewRow("Heart Girth (cm)", heartGirthInput.value)}
      ${previewRow("Teeth Count", teethCountInput.value)}
    `;

    // 🔑 Ensure clean state before opening preview
    forceModalCleanup();

    let previewModal = bootstrap.Modal.getInstance(previewModalEl);
    if (!previewModal) {
      previewModal = new bootstrap.Modal(previewModalEl, {
        backdrop: "static",
        keyboard: false,
      });
    }
    previewModal.show();
  });

  // ✅ Fix: avoid duplicate listeners if script reloaded / turbo nav
  confirmBoarBtn?.replaceWith(confirmBoarBtn.cloneNode(true));
  const confirmBoarBtnFresh = document.getElementById("confirmBoarBtn");

  async function showConfirmAndSave(finalColor) {
    // This is used both from the confirm button and from fallback direct submit
    if (!confirmBoarBtnFresh) return;

    confirmBoarBtnFresh.disabled = true;

    const payload = {
      batch: (batchInput?.value || "").trim(),
      breed: "Native",
      color: finalColor,
      weight: parseFloat(weightInput.value),
      bodyLength: parseFloat(bodyLengthInput.value),
      heartGirth: parseFloat(heartGirthInput.value),
      teethCount: parseInt(teethCountInput.value, 10),
      date_transfer: dateTransferInput.value,
      birth_date: birthDateInput.value,
      health_status: healthStatusSelect?.value || "Healthy",
      current_status: "Active",
      managerId,
    };

    try {
      const res = await fetch(`${BACKEND_URL}/api/swine/add-master-boar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Registration failed");

      // Close preview modal cleanly (if open)
      if (hasPreviewModal) {
        const inst = bootstrap.Modal.getInstance(previewModalEl);
        inst?.hide();
        forceModalCleanup();
      }

      // Show success modal (if exists)
      if (hasSuccessModal) {
        successBoarIdEl.textContent = `Boar ID: ${data.swine?.swine_id || "—"}`;
        forceModalCleanup();
        new bootstrap.Modal(successModalEl).show();
      } else {
        setInlineMessage("success", `Registered! Boar ID: ${data.swine?.swine_id || "—"}`);
      }

      // Reset form
      form.reset();
      if (breedInput) {
        breedInput.value = "Native";
        breedInput.readOnly = true;
      }
      setTodayDate(dateTransferInput);
      handleColorChange();
      setInlineMessage("info", "");

      setTimeout(updateNextBoarId, 500);
    } catch (err) {
      console.error(err);
      setInlineMessage("error", err.message || "Registration failed");
    } finally {
      confirmBoarBtnFresh.disabled = false;
    }
  }

  // ================= CONFIRM & SAVE (from modal) =================
  confirmBoarBtnFresh?.addEventListener("click", async () => {
    setInlineMessage("info", "");
    const v = validateRequired();
    if (!v.ok) return;
    await showConfirmAndSave(v.finalColor);
  });

  // Cleanup ONLY after success modal closes
  successModalEl?.addEventListener("hidden.bs.modal", forceModalCleanup);

  // Also cleanup after preview closes (prevents "buttons not working" due to stuck backdrop)
  previewModalEl?.addEventListener("hidden.bs.modal", forceModalCleanup);
});