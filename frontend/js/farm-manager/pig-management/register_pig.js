document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("token");

  const userRes = await fetch("/api/auth/me", { credentials: "include" });
  const userData = await userRes.json();
  if (!userData.success) return;

  const user = userData.user;
  const managerId =
    user.role === "farm_manager" ? user.id : user.managerId;
  const BACKEND_URL = "http://localhost:5000"; // Ensure this matches your setup

  // ================= DOM =================
  const form = document.getElementById("registerSwineForm");
  const farmerSelect = document.getElementById("farmerSelect");
  const messageEl = document.getElementById("swineMessage");

  const sexSelect = document.getElementById("sex");
  const ageStageSelect = document.getElementById("ageStage");
  const teatGroup = document.getElementById("teatCountGroup");

  const damSelect = document.getElementById("dam_id");
  const sireSelect = document.getElementById("sire_id");

  const deformityChecklist = document.getElementById("deformityChecklist");

  const colorSelect = document.getElementById("colorSelect");
  const otherColorGroup = document.getElementById("otherColorGroup");
  const otherColorInput = document.getElementById("otherColorInput");
  const batchInput = document.getElementById("batch");

  // ================= LOCK BREED =================
  const breedInput = document.getElementById("breed");
  breedInput.value = "Native";
  breedInput.readOnly = true;

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

  // ================= UI TOGGLES =================
  function toggleTeatField() {
    if (sexSelect.value === "Female" && ageStageSelect.value === "adult") {
      teatGroup.classList.remove("d-none");
    } else {
      teatGroup.classList.add("d-none");
      const teatInput = document.getElementById("teatCount");
      if (teatInput) teatInput.value = "";
    }
  }

  function toggleDeformities() {
    deformityChecklist.style.display =
      ageStageSelect.value === "adult" ? "none" : "block";

    if (ageStageSelect.value === "adult") {
      deformityChecklist
        .querySelectorAll("input")
        .forEach(cb => (cb.checked = false));
    }
  }

  sexSelect.addEventListener("change", toggleTeatField);
  ageStageSelect.addEventListener("change", () => {
    toggleTeatField();
    toggleDeformities();
    updateBatchField();
  });

  // ================= LOAD FARMERS =================
  let farmers = [];

  const farmerDropdownBtn = document.getElementById("farmerDropdownBtn");
  const farmerOptions = document.getElementById("farmerOptions");
  const farmerSearch = document.getElementById("farmerSearch");

  async function loadFarmers() {
    const res = await fetch(`/api/auth/farmers/${managerId}`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include"
    });

    const data = await res.json();
    farmers = data.success ? data.farmers : [];
    renderFarmers(farmers);
  }

  function renderFarmers(list) {
    farmerOptions.innerHTML = "";

    if (!list.length) {
      farmerOptions.innerHTML =
        `<div class="text-muted small p-2">No farmers found</div>`;
      return;
    }

    list.forEach(f => {
      const div = document.createElement("div");
      div.className = "dropdown-item";
      div.textContent = `${f.first_name} ${f.last_name}`.trim();

      div.onclick = () => {
        farmerDropdownBtn.textContent = div.textContent;
        document.getElementById("farmerSelect").value = f._id;
        updateSows(f._id); 
      };

      farmerOptions.appendChild(div);
    });
  }

  // Search filter
  farmerSearch.addEventListener("input", e => {
    const q = e.target.value.toLowerCase();
    renderFarmers(
      farmers.filter(f =>
        `${f.first_name} ${f.last_name}`.toLowerCase().includes(q)
      )
    );
  });

  // ================= CASCADE =================
  async function updateSows(farmerId) {
    damSelect.innerHTML = `<option value="">-- Select Sow --</option>`;
    sireSelect.innerHTML = `<option value="">-- Select Boar --</option>`;
    if (!farmerId) return;

    const res = await fetch(
      `/api/swine/all?farmer_id=${farmerId}&sex=Female&age_stage=adult`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();
    if (data.success) {
      data.swine.forEach(s =>
        damSelect.add(new Option(`${s.swine_id} (${s.breed})`, s.swine_id))
      );
    }
  }

  async function updateBoars(sowId) {
    sireSelect.innerHTML = `<option value="">-- Select Boar --</option>`;
    if (!sowId) return;

    const res = await fetch(`/api/swine/history/boars/${sowId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success) {
      [...(data.historicalBoars || []), ...(data.allActiveBoars || [])]
        .forEach(b =>
          sireSelect.add(new Option(`${b.swine_id} (${b.breed})`, b.swine_id))
        );
    }
  }

  damSelect.addEventListener("change", e => {
    updateBoars(e.target.value);
    updateBatchField();
  });

  // ================= BATCH AUTO (UPDATED FOR A-0002 LOGIC) =================
  async function updateBatchField() {
    const isAdult = ageStageSelect.value === "adult";
    const isPiglet = ageStageSelect.value === "piglet";
    
    if (isPiglet && damSelect.value) {
      // Extract the Mother's Batch Letter from her full ID (e.g., "LIPA-A-0001" -> "A")
      const idParts = damSelect.value.split("-");
      if (idParts.length >= 2) {
        // If the ID structure is PREFIX-BATCH-NUMBER, index 1 is the batch letter
        batchInput.value = idParts[1]; 
      } else {
        batchInput.value = damSelect.value; // Fallback to full ID if parts not found
      }
      batchInput.readOnly = true;
    } else if (isAdult) {
      batchInput.readOnly = true;
      batchInput.placeholder = "Generating...";
      
      try {
        // Fetch the next letter specifically for THIS manager
        const res = await fetch(`/api/swine/preview/next-batch-letter`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        
        if (data.success) {
          batchInput.value = data.nextLetter; 
        } else {
          batchInput.value = "A";
        }
      } catch (err) {
        console.error("Batch generation error:", err);
        batchInput.value = "";
        batchInput.readOnly = false;
      }
    } else {
      batchInput.readOnly = false;
      batchInput.value = "";
      batchInput.placeholder = "Enter Batch ID";
    }
  }

  // ================= SUBMIT =================
  form.addEventListener("submit", async e => {
    e.preventDefault();

    const deformities = [...deformityChecklist.querySelectorAll("input:checked")]
      .map(cb => cb.value);

    const finalColor =
      colorSelect.value === "Other"
        ? otherColorInput.value.trim()
        : colorSelect.value;

    const payload = {
      farmer_id: farmerSelect.value || null,
      batch: batchInput.value.trim(), 
      sex: sexSelect.value,
      age_stage: ageStageSelect.value,
      breed: "Native",
      color: finalColor,
      birth_date: document.getElementById("birth_date").value,
      date_transfer:
        document.getElementById("date_transfer").value ||
        new Date().toISOString().split("T")[0],
      health_status: document.getElementById("health_status").value,
      dam_id: damSelect.value || null,
      sire_id: sireSelect.value || null,
      weight: document.getElementById("weight").value,
      bodyLength: document.getElementById("bodyLength").value,
      heartGirth: document.getElementById("heartGirth").value,
      teethCount: document.getElementById("teethCount").value,
      teatCount: document.getElementById("teatCount") ? document.getElementById("teatCount").value : null,
      deformities: deformities.length ? deformities : ["None"],
      managerId
    };

    const res = await fetch("/api/swine/add", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    
    messageEl.className = data.success ? "text-success fw-bold" : "text-danger fw-bold";
    messageEl.textContent = data.success
      ? "✅ Pig registered successfully"
      : "❌ " + data.message;

    if (data.success) {
        form.reset();
        if(farmerDropdownBtn) farmerDropdownBtn.textContent = "Search/Select Farmer";
        breedInput.value = "Native";
        handleColorChange();
        toggleTeatField();
        toggleDeformities();
        // Delay to ensure DB updates before we calculate the next sequence
        setTimeout(updateBatchField, 500);
    }
  });

  await loadFarmers();
  toggleTeatField();
  toggleDeformities();
  updateBatchField();
});