document.addEventListener("DOMContentLoaded", async () => {
  // ================= AUTH =================
  const token = localStorage.getItem("token");

  const userRes = await fetch("/api/auth/me", { credentials: "include" });
  const userData = await userRes.json();
  if (!userData.success) return;

  const user = userData.user;
  const managerId = user.role === "farm_manager" ? user.id : user.managerId;

  // ================= DOM =================
  const form = document.getElementById("registerSwineForm");
  const farmerSelect = document.getElementById("farmerSelect");
  const messageEl = document.getElementById("swineMessage");

  const sexSelect = document.getElementById("sex");
  const ageStageSelect = document.getElementById("ageStage");
  const teatGroup = document.getElementById("teatCountGroup");

  const externalCheckbox = document.getElementById("isExternalBoar");
  const dateTransferInput = document.getElementById("date_transfer");

  const damSelect = document.getElementById("dam_id");
  const sireSelect = document.getElementById("sire_id");

  const deformityChecklist = document.getElementById("deformityChecklist");
  const medicalChecklist = document.getElementById("medicalChecklist");

  const openPreviewBtn = document.getElementById("openPreviewBtn");
  const confirmSaveBtn = document.getElementById("confirmSaveBtn");

  // ================= STATE =================
  let pendingPayload = null;

  // ================= CONDITIONAL TEAT COUNT =================
  function toggleTeatField() {
    if (sexSelect.value === "Female" && ageStageSelect.value === "adult") {
      teatGroup.classList.remove("d-none");
    } else {
      teatGroup.classList.add("d-none");
      document.getElementById("teatCount").value = "";
    }
  }

  sexSelect.addEventListener("change", toggleTeatField);
  ageStageSelect.addEventListener("change", toggleTeatField);

  // ================= EXTERNAL BOAR LOGIC =================
  function handleExternalBoarToggle() {
    if (externalCheckbox.checked) {
      farmerSelect.value = "";
      farmerSelect.disabled = true;

      sexSelect.value = "Male";
      sexSelect.disabled = true;

      ageStageSelect.value = "adult";
      ageStageSelect.disabled = true;

      document.getElementById("breed").value = "Native";
      document.getElementById("breed").readOnly = true;
    } else {
      farmerSelect.disabled = false;
      sexSelect.disabled = false;
      ageStageSelect.disabled = false;
      document.getElementById("breed").readOnly = false;
    }

    toggleTeatField();
  }

  externalCheckbox.addEventListener("change", handleExternalBoarToggle);

  // ================= LOAD FARMERS =================
  async function loadFarmers() {
    try {
      const res = await fetch(`/api/auth/farmers/${managerId}`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });

      const data = await res.json();
      farmerSelect.innerHTML = `<option value="">Select Farmer</option>`;

      if (data.success) {
        data.farmers.forEach(f => {
          const opt = document.createElement("option");
          opt.value = f._id;
          opt.textContent = `${f.first_name} ${f.last_name}`.trim();
          farmerSelect.appendChild(opt);
        });
      }
    } catch (err) {
      console.error("Failed to load farmers", err);
    }
  }

  // ================= LOAD PARENTAGE (DAM → SIRE) =================
  farmerSelect.addEventListener("change", async () => {
    damSelect.innerHTML = '<option value="">-- Select Sow --</option>';
    sireSelect.innerHTML = '<option value="">-- Select Boar --</option>';

    if (!farmerSelect.value) return;

    const res = await fetch(
      `/api/swine/all?farmer_id=${farmerSelect.value}&sex=Female&age_stage=adult`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const data = await res.json();
    if (data.success) {
      data.swine.forEach(sow => {
        damSelect.add(new Option(sow.swine_id, sow.swine_id));
      });
    }
  });

  // ================= BUILD PAYLOAD (CRITICAL) =================
  function buildPayload() {
    const deformities = [...deformityChecklist.querySelectorAll("input:checked")]
      .map(i => i.value);

    const medical = [...medicalChecklist.querySelectorAll("input:checked")]
      .map(i => i.value);

    return {
      farmer_id: externalCheckbox.checked ? null : farmerSelect.value,
      batch: document.getElementById("batch").value.trim(),
      sex: sexSelect.value,
      age_stage: ageStageSelect.value,
      breed: document.getElementById("breed").value,
      color: document.getElementById("color").value,
      birth_date: document.getElementById("birth_date").value,
      date_transfer:
        dateTransferInput.value ||
        new Date().toISOString().split("T")[0],
      health_status: document.getElementById("health_status").value,
      sire_id: sireSelect.value || null,
      dam_id: damSelect.value || null,
      weight: document.getElementById("weight").value,
      bodyLength: document.getElementById("bodyLength").value,
      heartGirth: document.getElementById("heartGirth").value,
      teethCount: document.getElementById("teethCount").value,
      teatCount: document.getElementById("teatCount").value || null,
      deformities: deformities.length ? deformities : ["None"],
      medical_initial: medical,
      managerId
    };
  }

  // ================= PREVIEW RENDER =================
  function renderPreview(payload) {
    const farmerName =
      farmerSelect.options[farmerSelect.selectedIndex]?.text || "—";

    const previewRows = [
      ["External Boar", externalCheckbox.checked ? "Yes" : "No"],
      ["Date Registered", payload.date_transfer],
      ["Farmer", farmerName],
      ["Batch", payload.batch],
      ["Sex", payload.sex],
      ["Age Stage", payload.age_stage],
      ["Breed", payload.breed],
      ["Color", payload.color],
      ["Birth Date", payload.birth_date || "—"],
      ["Health Status", payload.health_status],
      ["Weight (kg)", payload.weight],
      ["Body Length (cm)", payload.bodyLength || "—"],
      ["Heart Girth (cm)", payload.heartGirth || "—"],
      ["Teeth Count", payload.teethCount || "—"],
      ["Teat Count", payload.teatCount || "—"],
      ["Dam ID", payload.dam_id || "—"],
      ["Sire ID", payload.sire_id || "—"],
      ["Deformities", payload.deformities.join(", ")],
      ["Medical Records", payload.medical_initial.join(", ") || "—"]
    ];

    const container = document.getElementById("previewContent");
    container.innerHTML = `
      <div class="preview-section">Pig Registration Summary</div>
      ${previewRows.map(r => `
        <div class="preview-row">
          <span>${r[0]}</span>
          <span>${r[1]}</span>
        </div>
      `).join("")}
    `;
  }

  // ================= SAVE → PREVIEW =================
  openPreviewBtn.addEventListener("click", () => {
    messageEl.textContent = "";

    pendingPayload = buildPayload();

    if (
      !pendingPayload.batch ||
      !pendingPayload.sex ||
      !pendingPayload.age_stage
    ) {
      messageEl.textContent = "Please complete all required fields.";
      messageEl.style.color = "red";
      return;
    }

    renderPreview(pendingPayload);

    new bootstrap.Modal(
      document.getElementById("previewSwineModal")
    ).show();
  });

  // ================= CONFIRM → SUBMIT =================
  confirmSaveBtn.addEventListener("click", async () => {
    if (!pendingPayload) return;

    try {
      const res = await fetch("/api/swine/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(pendingPayload)
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      bootstrap.Modal.getInstance(
        document.getElementById("previewSwineModal")
      ).hide();

      messageEl.textContent = "✅ Native pig registered successfully";
      messageEl.style.color = "green";

      form.reset();
      pendingPayload = null;
      toggleTeatField();
      handleExternalBoarToggle();

    } catch (err) {
      messageEl.textContent = err.message || "Registration failed";
      messageEl.style.color = "red";
    }
  });

  // ================= INIT =================
  await loadFarmers();
  toggleTeatField();
  handleExternalBoarToggle();
});
