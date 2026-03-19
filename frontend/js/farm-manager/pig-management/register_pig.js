document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("token");

  // ================= AUTH =================
  let user, managerId;
  try {
    const userRes = await fetch("/api/auth/me", { credentials: "include" });
    const userData = await userRes.json();
    if (!userData.success) return;

    user = userData.user;
    managerId = user.role === "farm_manager" ? user.id : user.managerId;
  } catch (err) {
    console.error("Auth check failed:", err);
  }

  // ================= DOM =================
  const form = document.getElementById("registerSwineForm");

  const farmerSelect = document.getElementById("farmerSelect");
  const openFarmerModalBtn = document.getElementById("openFarmerModalBtn");
  const selectFarmerCtaBtn = document.getElementById("selectFarmerCtaBtn");
  const changeFarmerBtn = document.getElementById("changeFarmerBtn");
  const clearFarmerBtn = document.getElementById("clearFarmerBtn");

  const farmerEmptyCard = document.getElementById("farmerEmptyCard");
  const selectedFarmerCard = document.getElementById("selectedFarmerCard");

  const selectedFarmerImg = document.getElementById("selectedFarmerImg");
  const selectedFarmerName = document.getElementById("selectedFarmerName");
  const selectedFarmerId = document.getElementById("selectedFarmerId");
  const selectedFarmerAddress = document.getElementById("selectedFarmerAddress");
  const selectedFarmerContact = document.getElementById("selectedFarmerContact");
  const selectedFarmerPenCount = document.getElementById("selectedFarmerPenCount");
  const selectedFarmerPenCap = document.getElementById("selectedFarmerPenCap");

  const farmerPickerModalEl = document.getElementById("farmerPickerModal");
  const farmerPickerModal = farmerPickerModalEl ? new bootstrap.Modal(farmerPickerModalEl) : null;

  const farmerPanelSearch = document.getElementById("farmerPanelSearch");
  const farmerSearchClearBtn = document.getElementById("farmerSearchClearBtn");
  const farmerPanelList = document.getElementById("farmerPanelList");

  const sexSelect = document.getElementById("sex");
  const ageStageSelect = document.getElementById("ageStage");
  const teatGroup = document.getElementById("teatCountGroup");
  const teatAlignmentGroup = document.getElementById("teatAlignmentGroup");
  const teatAlignmentSelect = document.getElementById("teatAlignment");

  const damSelect = document.getElementById("dam_id");
  const sireSelect = document.getElementById("sire_id");

  const deformityChecklist = document.getElementById("deformityChecklist");

  const colorSelect = document.getElementById("colorSelect");
  const otherColorGroup = document.getElementById("otherColorGroup");
  const otherColorInput = document.getElementById("otherColorInput");
  const batchInput = document.getElementById("batch");
  const batchYearInput = document.getElementById("batchYear");

  const dateTransferInput = document.getElementById("date_transfer");

  // Feedback modal
  const feedbackModalEl = document.getElementById("feedbackModal");
  const feedbackModal = feedbackModalEl ? new bootstrap.Modal(feedbackModalEl, { backdrop: "static", keyboard: true }) : null;
  const feedbackTitle = document.getElementById("feedbackTitle");
  const feedbackMsg = document.getElementById("feedbackMsg");
  const feedbackIcon = document.getElementById("feedbackIcon");
  const feedbackModalLabel = document.getElementById("feedbackModalLabel");

  // ================= HELPERS =================
  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeProfilePicPath(p) {
    if (!p) return "/images/default-avatar.png";
    if (p.startsWith("http://") || p.startsWith("https://")) return p;
    return p.startsWith("/") ? p : `/${p}`;
  }

  function setImgSafe(imgEl, src) {
    if (!imgEl) return;
    imgEl.onerror = () => {
      imgEl.onerror = null;
      imgEl.src = "/images/default-avatar.png";
    };
    imgEl.src = normalizeProfilePicPath(src);
  }

  function showFeedback({ type = "info", title = "Notice", message = "—" }) {
    if (!feedbackModal) return;
    const map = {
      success: { icon: "bi-check-circle-fill", label: "Success" },
      error: { icon: "bi-x-circle-fill", label: "Error" },
      warn: { icon: "bi-exclamation-triangle-fill", label: "Warning" },
      info: { icon: "bi-info-circle-fill", label: "Info" }
    };
    const pick = map[type] || map.info;
    if (feedbackModalLabel) feedbackModalLabel.textContent = pick.label;
    if (feedbackTitle) feedbackTitle.textContent = title;
    if (feedbackMsg) feedbackMsg.textContent = message;
    if (feedbackIcon) {
      feedbackIcon.className = `bi ${pick.icon}`;
      feedbackIcon.dataset.type = type;
    }
    feedbackModal.show();
  }

  function setTodayDefaultDate() {
    if (!dateTransferInput) return;
    const today = new Date().toISOString().split("T")[0];
    dateTransferInput.value = today;
    dateTransferInput.max = today;
  }

  function setDefaultYear() {
    if (!batchYearInput) return;
    batchYearInput.value = new Date().getFullYear();
  }

  function handleColorChange() {
    if (!colorSelect || !otherColorGroup || !otherColorInput) return;
    if (colorSelect.value === "Other") {
      otherColorGroup.classList.remove("d-none");
    } else {
      otherColorGroup.classList.add("d-none");
      otherColorInput.value = "";
    }
  }

  function toggleTeatField() {
    if (!sexSelect || !ageStageSelect) return;
    if (sexSelect.value === "Female" && ageStageSelect.value === "adult") {
      teatGroup?.classList.remove("d-none");
      teatAlignmentGroup?.classList.remove("d-none");
    } else {
      teatGroup?.classList.add("d-none");
      teatAlignmentGroup?.classList.add("d-none");
      const teatInput = document.getElementById("teatCount");
      if (teatInput) teatInput.value = "";
      if (teatAlignmentSelect) teatAlignmentSelect.value = "Even";
    }
  }

  function toggleDeformities() {
    if (!deformityChecklist || !ageStageSelect) return;
    const isAdult = ageStageSelect.value === "adult";
    deformityChecklist.style.display = isAdult ? "none" : "flex";
    if (isAdult) {
      deformityChecklist.querySelectorAll("input").forEach(cb => (cb.checked = false));
    }
  }

  // ================= FARMERS (MODAL) =================
  let farmers = [];
  let selectedFarmer = null;

  function getFarmerDisplayName(f) {
    return `${f.first_name || ""} ${f.last_name || ""}`.trim() || "Unnamed Farmer";
  }

  function getFarmerIdLabel(f) {
    return f.farmer_id || f._id || "—";
  }

  function getFarmerAvatar(f) {
    return normalizeProfilePicPath(
      f?.profile_picture || f?.profile_photo || f?.avatar || "/images/default-avatar.png"
    );
  }

  function showSelectedFarmer(f) {
    setImgSafe(selectedFarmerImg, getFarmerAvatar(f));
    if (selectedFarmerName) selectedFarmerName.textContent = getFarmerDisplayName(f);
    if (selectedFarmerId) selectedFarmerId.textContent = `ID: ${getFarmerIdLabel(f)}`;
    if (selectedFarmerAddress) selectedFarmerAddress.textContent = f.address || "—";
    if (selectedFarmerContact) selectedFarmerContact.textContent = f.contact_no || f.email || "—";
    if (selectedFarmerPenCount) selectedFarmerPenCount.textContent = (f.num_of_pens ?? "—");
    if (selectedFarmerPenCap) selectedFarmerPenCap.textContent = (f.pen_capacity ?? "—");
    farmerEmptyCard?.classList.add("d-none");
    selectedFarmerCard?.classList.remove("d-none");
  }

  function clearSelectedFarmer() {
    selectedFarmer = null;
    if (farmerSelect) farmerSelect.value = "";
    if (damSelect) damSelect.innerHTML = `<option value="">-- Select Sow --</option>`;
    if (sireSelect) sireSelect.innerHTML = `<option value="">-- Select Boar --</option>`;
    selectedFarmerCard?.classList.add("d-none");
    farmerEmptyCard?.classList.remove("d-none");
    setImgSafe(selectedFarmerImg, "/images/default-avatar.png");
  }

  function getFilteredFarmers() {
    const q = (farmerPanelSearch?.value || "").toLowerCase().trim();
    if (!q) return farmers;
    return farmers.filter(f => {
      const name = getFarmerDisplayName(f).toLowerCase();
      const id = String(getFarmerIdLabel(f)).toLowerCase();
      const addr = String(f.address || "").toLowerCase();
      return name.includes(q) || id.includes(q) || addr.includes(q);
    });
  }

  function farmerCardTemplate(f) {
    const isSelected = selectedFarmer && selectedFarmer._id === f._id;
    return `
      <div class="farmer-card ${isSelected ? "selected" : ""}" data-id="${escapeHtml(f._id)}">
        <div class="farmer-card-left">
          <div class="farmer-avatar">
            <img src="${escapeHtml(getFarmerAvatar(f))}" alt="Farmer" onerror="this.onerror=null;this.src='/images/default-avatar.png';" />
          </div>
          <div class="farmer-meta">
            <div class="farmer-name">${escapeHtml(getFarmerDisplayName(f))}</div>
            <div class="farmer-sub">ID: ${escapeHtml(getFarmerIdLabel(f))}</div>
            <div class="farmer-badges">
              <span class="mini-pill"><i class="bi bi-geo-alt"></i> ${escapeHtml(f.address || "—")}</span>
              <span class="mini-pill"><i class="bi bi-telephone"></i> ${escapeHtml(f.contact_no || f.email || "—")}</span>
              <span class="mini-pill"><i class="bi bi-grid-3x3-gap"></i> Pens: <b>${escapeHtml(String(f.num_of_pens ?? "—"))}</b></span>
              <span class="mini-pill"><i class="bi bi-boxes"></i> Cap: <b>${escapeHtml(String(f.pen_capacity ?? "—"))}</b></span>
            </div>
          </div>
        </div>
        <div class="farmer-card-right">
          ${isSelected ? `<span class="badge-soft-inline"><i class="bi bi-check-circle"></i> Selected</span>` : `<button type="button" class="btn btn-success farmer-select-btn"><i class="bi bi-check2-circle me-1"></i> Select</button>`}
        </div>
      </div>`;
  }

  function renderFarmers(list) {
    if (!farmerPanelList) return;
    farmerPanelList.innerHTML = list.length ? list.map(farmerCardTemplate).join("") : `<div class="text-muted small p-2">No farmers found</div>`;
    farmerPanelList.querySelectorAll(".farmer-card").forEach(card => {
      card.addEventListener("click", () => {
        const f = farmers.find(x => x._id === card.getAttribute("data-id"));
        if (f) selectFarmer(f);
      });
    });
  }

  function selectFarmer(f) {
    selectedFarmer = f;
    if (farmerSelect) farmerSelect.value = f._id;
    showSelectedFarmer(f);
    updateSows(f._id);
    renderFarmers(getFilteredFarmers());
    farmerPickerModal?.hide();
  }

  async function loadFarmers() {
    try {
      const res = await fetch(`/api/auth/farmers/${managerId}`, { headers: { Authorization: `Bearer ${token}` }, credentials: "include" });
      const data = await res.json();
      farmers = data.success ? (data.farmers || []) : [];
      renderFarmers(farmers);
    } catch (err) {
      console.error("Load farmers error:", err);
      showFeedback({ type: "error", title: "Failed to load farmers", message: "Please refresh the page." });
    }
  }

  openFarmerModalBtn?.addEventListener("click", () => farmerPickerModal?.show());
  selectFarmerCtaBtn?.addEventListener("click", () => farmerPickerModal?.show());
  changeFarmerBtn?.addEventListener("click", () => farmerPickerModal?.show());
  clearFarmerBtn?.addEventListener("click", () => { clearSelectedFarmer(); renderFarmers(getFilteredFarmers()); });
  farmerPanelSearch?.addEventListener("input", () => renderFarmers(getFilteredFarmers()));
  farmerSearchClearBtn?.addEventListener("click", () => { if (farmerPanelSearch) { farmerPanelSearch.value = ""; renderFarmers(farmers); farmerPanelSearch.focus(); } });

  // ================= CASCADE: SOWS + BOARS =================
  async function updateSows(farmerId) {
    if (damSelect) damSelect.innerHTML = `<option value="">-- Select Sow --</option>`;
    if (sireSelect) sireSelect.innerHTML = `<option value="">-- Select Boar --</option>`;
    if (!farmerId) return;
    try {
      const res = await fetch(`/api/swine/all?farmer_id=${encodeURIComponent(farmerId)}&sex=Female&age_stage=adult`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success && Array.isArray(data.swine)) {
        data.swine.forEach(s => damSelect?.add(new Option(`${s.swine_id} (${s.breed})`, s.swine_id)));
      }
    } catch (err) { console.error("Update sows error:", err); }
  }

  async function updateBoars(sowId) {
    if (sireSelect) sireSelect.innerHTML = `<option value="">-- Select Boar --</option>`;
    if (!sowId) return;
    try {
      const res = await fetch(`/api/swine/history/boars/${encodeURIComponent(sowId)}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success) {
        const combined = [...(data.historicalBoars || []), ...(data.allActiveBoars || [])];
        const seen = new Set();
        combined.forEach(b => {
          if (b?.swine_id && !seen.has(b.swine_id)) {
            seen.add(b.swine_id);
            sireSelect?.add(new Option(`${b.swine_id} (${b.breed})`, b.swine_id));
          }
        });
      }
    } catch (err) { console.error("Update boars error:", err); }
  }

  damSelect?.addEventListener("change", (e) => { updateBoars(e.target.value); updateBatchField(); });

  // ================= BATCH AUTO =================
  async function updateBatchField() {
    if (!batchInput || !ageStageSelect) return;
    const yearInput = batchYearInput;
    const isAdult = ageStageSelect.value === "adult";
    const isPiglet = ageStageSelect.value === "piglet";

    if (isPiglet && damSelect?.value) {
      const idParts = String(damSelect.value).split("-");
      batchInput.value = idParts.length >= 2 ? idParts[1] : damSelect.value;
      batchInput.readOnly = true;
      if (yearInput) { yearInput.value = new Date().getFullYear(); yearInput.readOnly = false; }
      return;
    }

    if (isAdult) {
      batchInput.readOnly = true;
      batchInput.placeholder = "Generating...";
      if (yearInput) { yearInput.value = new Date().getFullYear(); yearInput.readOnly = false; }
      try {
        const res = await fetch(`/api/swine/preview/next-batch-letter`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        batchInput.value = data.success ? data.nextLetter : "A";
      } catch (err) { console.error("Batch generation error:", err); batchInput.value = ""; batchInput.readOnly = false; }
      return;
    }

    batchInput.readOnly = false;
    batchInput.value = "";
    batchInput.placeholder = "Enter Batch ID";
    if (yearInput) { yearInput.readOnly = false; if (!yearInput.value) yearInput.value = new Date().getFullYear(); }
  }

  function requireFarmerSelected() {
    if (!farmerSelect?.value) {
      showFeedback({ type: "warn", title: "Farmer required", message: "Please select a farmer first." });
      return false;
    }
    return true;
  }

  colorSelect?.addEventListener("change", handleColorChange);
  sexSelect?.addEventListener("change", toggleTeatField);
  ageStageSelect?.addEventListener("change", () => { toggleTeatField(); toggleDeformities(); updateBatchField(); });

  // ================= SUBMIT (REPAIRING 403 ERROR CRASH) =================
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!requireFarmerSelected()) return;

    const deformities = deformityChecklist ? [...deformityChecklist.querySelectorAll("input:checked")].map(cb => cb.value) : [];
    const finalColor = colorSelect?.value === "Other" ? (otherColorInput?.value || "").trim() : (colorSelect?.value || "");
    const birthDate = document.getElementById("birth_date")?.value;
    const weight = document.getElementById("weight")?.value;

    if (!birthDate || !sexSelect?.value || !ageStageSelect?.value || !weight) {
      showFeedback({ type: "warn", title: "Missing fields", message: "Please complete required fields." });
      return;
    }

    const payload = {
      farmer_id: farmerSelect.value || null,
      batch: (batchInput?.value || "").trim(),
      batch_year: batchYearInput?.value || new Date().getFullYear(),
      sex: sexSelect.value,
      age_stage: ageStageSelect.value,
      breed: "Native",
      color: finalColor,
      birth_date: birthDate,
      date_transfer: document.getElementById("date_transfer")?.value || new Date().toISOString().split("T")[0],
      health_status: document.getElementById("health_status")?.value || "Healthy",
      dam_id: damSelect?.value || null,
      sire_id: sireSelect?.value || null,
      weight: weight,
      bodyLength: document.getElementById("bodyLength")?.value || null,
      heartGirth: document.getElementById("heartGirth")?.value || null,
      teethCount: document.getElementById("teethCount")?.value || null,
      teatCount: document.getElementById("teatCount") ? document.getElementById("teatCount").value : null,
      teat_alignment: document.getElementById("teatAlignment") ? document.getElementById("teatAlignment").value : "N/A",
      deformities: deformities.length ? deformities : ["None"],
      managerId
    };

    try {
      const res = await fetch("/api/swine/add", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });

      // CHECK FOR 403 FORBIDDEN
      if (res.status === 403) {
        showFeedback({ type: "error", title: "Permission Denied", message: "You do not have permission to add records. Check your role or login again." });
        return;
      }

      // PREVENT SYNTAX ERROR IF NOT JSON
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Server error: Did not receive JSON.");
      }

      const data = await res.json();
      if (data.success) {
        showFeedback({ type: "success", title: "Saved", message: "Pig registered successfully." });
        form.reset();
        clearSelectedFarmer();
        handleColorChange();
        toggleTeatField();
        toggleDeformities();
        setTodayDefaultDate();
        setDefaultYear();
        setTimeout(updateBatchField, 300);
        renderFarmers(getFilteredFarmers());
      } else {
        showFeedback({ type: "error", title: "Registration failed", message: data.message });
      }
    } catch (err) {
      console.error(err);
      showFeedback({ type: "error", title: "Network error", message: err.message });
    }
  });

  // ================= INIT =================
  setTodayDefaultDate();
  handleColorChange();
  toggleTeatField();
  toggleDeformities();
  await loadFarmers();
  await updateBatchField();
});