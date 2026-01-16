import { authGuard } from "./authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  const user = await authGuard(["farm_manager", "encoder"]);
  if (!user) return;

  const token = localStorage.getItem("token");
  const role = user.role;
  const BACKEND_URL = "http://localhost:5000";

  let managerId = null;
  let isEditing = false;
  let currentEditingSwineId = null; 
  let allSwine = []; 

  try {
    if (role === "farm_manager") {
      managerId = user.id;
    } else if (role === "encoder") {
      managerId = user.managerId || null;
      if (!managerId) {
        const res = await fetch(`${BACKEND_URL}/api/auth/encoders/single/${user.id}`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        });
        const data = await res.json();
        managerId = data.encoder?.managerId;
      }
    }
  } catch (err) {
    console.error("Failed to determine managerId:", err);
    return;
  }

  // ---------------- DOM ELEMENTS ----------------
  const registerForm = document.getElementById("registerSwineForm");
  const submitBtn = registerForm.querySelector('button[type="submit"]');
  const swineMessage = document.getElementById("swineMessage");
  const farmerSelect = document.getElementById("farmerSelect");
  const damSelect = document.getElementById("dam_id"); 
  const sireSelect = document.getElementById("sire_id"); 
  const batchInput = document.getElementById("batch");
  const swineTableBody = document.getElementById("swineTableBody");
  
  const sexSelect = document.getElementById("sex");
  const ageStageSelect = document.getElementById("ageStage");
  const teatCountGroup = document.getElementById("teatCountGroup");
  const deformityChecklist = document.getElementById("deformityChecklist");

  const filterBatch = document.getElementById("filterBatch");
  const filterFarmer = document.getElementById("filterFarmer"); 

  const modal = document.getElementById("swineModal");
  const closeModal = document.querySelector(".close-modal");

  const cancelEditBtn = document.createElement("button");
  cancelEditBtn.type = "button";
  cancelEditBtn.textContent = "Cancel Edit";
  cancelEditBtn.className = "btn-secondary"; 
  cancelEditBtn.style.display = "none";
  cancelEditBtn.style.marginLeft = "10px";
  submitBtn.parentNode.appendChild(cancelEditBtn);

  // ---------------- UI & INCREMENTAL BATCH LOGIC ----------------

  const updateBatchField = () => {
    if (isEditing) return;

    if (ageStageSelect.value === "piglet") {
      batchInput.readOnly = true;
      if (damSelect.value) {
        const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const baseBatch = `${damSelect.value}-${todayStr}`;
        const existingCount = allSwine.filter(s => s.batch && s.batch.startsWith(baseBatch)).length;
        const nextSequence = (existingCount + 1).toString().padStart(2, '0');
        batchInput.value = `${baseBatch}-${nextSequence}`;
      } else {
        batchInput.value = "";
        batchInput.placeholder = "Select Sow to generate Batch ID";
      }
    } else {
      batchInput.readOnly = false;
      batchInput.placeholder = "Enter Batch ID (e.g. B127-4)";
    }
  };

  const toggleTeatField = () => {
    if (sexSelect.value === "Female" || ageStageSelect.value === "adult") {
      teatCountGroup.style.display = "block";
    } else {
      teatCountGroup.style.display = "none";
      const teatInput = document.getElementById("teatCount");
      if(teatInput) teatInput.value = "";
    }
  };

  sexSelect.addEventListener("change", toggleTeatField);
  ageStageSelect.addEventListener("change", () => {
    toggleTeatField();
    updateBatchField();
  });

  // ---------------- CASCADING DROPDOWNS ----------------

  async function loadFarmers() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/farmers/${managerId}`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      const data = await res.json();
      farmerSelect.innerHTML = `<option value="">Select Farmer</option>`;
      if (filterFarmer) filterFarmer.innerHTML = `<option value="">All Farmers</option>`;
      if (data.success && data.farmers) {
        data.farmers.forEach((f) => {
          const fullName = `${f.first_name} ${f.last_name}`.trim();
          const opt = new Option(fullName, f._id);
          farmerSelect.add(opt.cloneNode(true));
          if (filterFarmer) filterFarmer.add(opt.cloneNode(true));
        });
      }
    } catch (err) { console.error("Error loading farmers:", err); }
  }

  async function updateSowDropdown(selectedFarmerId) {
    damSelect.innerHTML = '<option value="">-- Select Sow --</option>';
    sireSelect.innerHTML = '<option value="">-- Select Boar --</option>';
    if (!selectedFarmerId) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/swine/all?farmer_id=${selectedFarmerId}&sex=Female&age_stage=adult`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        data.swine.forEach(sow => {
          damSelect.add(new Option(`${sow.swine_id} (${sow.breed})`, sow.swine_id));
        });
      }
    } catch (err) { console.error("Error loading sows:", err); }
  }

  async function updateBoarDropdown(sowId) {
    sireSelect.innerHTML = '<option value="">-- Select Boar --</option>';
    if (!sowId) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/swine/history/boars/${sowId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        if (data.historicalBoars?.length > 0) {
          const histGroup = document.createElement("optgroup");
          histGroup.label = "Previously Used (History)";
          data.historicalBoars.forEach(boar => {
            histGroup.appendChild(new Option(`${boar.swine_id} (${boar.breed})`, boar.swine_id));
          });
          sireSelect.appendChild(histGroup);
        }
        if (data.allActiveBoars?.length > 0) {
          const genGroup = document.createElement("optgroup");
          genGroup.label = "All Other Active Boars";
          data.allActiveBoars.forEach(boar => {
            genGroup.appendChild(new Option(`${boar.swine_id} (${boar.breed})`, boar.swine_id));
          });
          sireSelect.appendChild(genGroup);
        }
      }
    } catch (err) { console.error("Error loading boar history:", err); }
  }

  farmerSelect.addEventListener("change", (e) => updateSowDropdown(e.target.value));
  damSelect.addEventListener("change", (e) => {
    updateBoarDropdown(e.target.value);
    updateBatchField(); 
  });

  // ---------------- DISPLAY & FETCH ----------------
  const applyFilters = () => {
    const batchQuery = filterBatch.value.toLowerCase();
    const selectedFarmerId = filterFarmer.value;
    const filteredData = allSwine.filter(sw => {
      const matchBatch = (sw.batch || "").toLowerCase().includes(batchQuery);
      const matchFarmer = selectedFarmerId === "" || (sw.farmer_id?._id === selectedFarmerId || sw.farmer_id === selectedFarmerId);
      return matchBatch && matchFarmer;
    });
    displaySwine(filteredData);
  };

  if (filterBatch) filterBatch.addEventListener("input", applyFilters);
  if (filterFarmer) filterFarmer.addEventListener("change", applyFilters);

  function displaySwine(swineList) {
    swineTableBody.innerHTML = "";
    swineList.forEach((sw) => {
      const farmerName = sw.farmer_id ? `${sw.farmer_id.first_name || ''} ${sw.farmer_id.last_name || ''}`.trim() : "N/A";
      const latestPerf = (sw.performance_records || []).slice(-1)[0] || {};
      const statusColors = { "Open": "#7f8c8d", "In-Heat": "#e67e22", "Pregnant": "#9b59b6", "Farrowing": "#e74c3c" };
      const statusColor = statusColors[sw.current_status] || "#7f8c8d";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>${sw.swine_id}</strong><br><small>Batch: ${sw.batch}</small><br>
          <div style="margin-top:5px;"><button class="view-btn" data-id="${sw.swine_id}">History</button>
          <button class="edit-btn" data-swine='${JSON.stringify(sw)}'>Edit</button></div></td>
        <td>${farmerName}</td>
        <td>Sex: ${sw.sex}<br>Breed: ${sw.breed}<br>Age: ${sw.age_stage}</td>
        <td>Status: <span class="status-badge" style="background:${statusColor};color:white;padding:2px 8px;border-radius:4px;">${sw.current_status || 'Open'}</span><br>
          Health: <strong style="color:${sw.health_status === 'Healthy' ? '#2ecc71' : '#e74c3c'};">${sw.health_status}</strong></td>
        <td>S: ${sw.sire_id || 'N/A'}<br>D: ${sw.dam_id || 'N/A'}</td>
        <td>Piglets: ${sw.total_piglets_count || 0}<br>Mortality: ${sw.total_mortality_count || 0}</td>
        <td>Wt: ${latestPerf.weight || '--'} kg<br>L: ${latestPerf.body_length || '--'} cm</td>
      `;
      swineTableBody.appendChild(tr);
    });
  }

  async function fetchSwine() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/swine/all`, {
        headers: { Authorization: `Bearer ${token}` }, credentials: "include",
      });
      const data = await res.json();
      if (data.success) { 
        allSwine = data.swine.reverse(); 
        displaySwine(allSwine); 
        updateBatchField();
      }
    } catch (err) { console.error("Error loading swine:", err); }
  }

  // ---------------- EDIT & CANCEL ----------------
  const startEditing = async (swine) => {
    isEditing = true;
    currentEditingSwineId = swine.swine_id;
    submitBtn.textContent = "Update Swine Info";
    cancelEditBtn.style.display = "inline-block";
    swineMessage.textContent = `Editing Swine: ${swine.swine_id}`;
    swineMessage.className = "message info";
    registerForm.scrollIntoView({ behavior: 'smooth' });

    const fId = swine.farmer_id?._id || swine.farmer_id || "";
    farmerSelect.value = fId;
    await updateSowDropdown(fId);
    if (swine.dam_id) {
        damSelect.value = swine.dam_id;
        await updateBoarDropdown(swine.dam_id);
    }
    if (swine.sire_id) sireSelect.value = swine.sire_id;
    batchInput.value = swine.batch || "";
    batchInput.readOnly = (swine.age_stage === "piglet"); 
    
    document.getElementById("sex").value = swine.sex || "Female";
    document.getElementById("ageStage").value = swine.age_stage || "piglet";
    document.getElementById("color").value = swine.color || "";
    document.getElementById("breed").value = swine.breed || "";
    document.getElementById("health_status").value = swine.health_status || "Healthy";
    if (swine.birth_date) document.getElementById("birth_date").value = swine.birth_date.split('T')[0];
    if (swine.date_transfer) document.getElementById("date_transfer").value = swine.date_transfer.split('T')[0];

    const latest = swine.performance_records?.slice(-1)[0] || {};
    document.getElementById("weight").value = latest.weight || "";
    document.getElementById("bodyLength").value = latest.body_length || "";
    document.getElementById("heartGirth").value = latest.heart_girth || "";
    document.getElementById("teethCount").value = latest.teeth_count || "";
    document.getElementById("teatCount").value = latest.teat_count || "";
    const currentDeformities = latest.deformities || [];
    deformityChecklist.querySelectorAll('input').forEach(cb => cb.checked = currentDeformities.includes(cb.value));
    toggleTeatField();
  };

  const cancelEditing = () => {
    isEditing = false;
    currentEditingSwineId = null;
    submitBtn.textContent = "Complete Registration";
    cancelEditBtn.style.display = "none";
    swineMessage.textContent = "";
    registerForm.reset();
    deformityChecklist.querySelectorAll('input').forEach(cb => cb.checked = false);
    damSelect.innerHTML = '<option value="">-- Select Sow --</option>';
    sireSelect.innerHTML = '<option value="">-- Select Boar --</option>';
    toggleTeatField();
    updateBatchField();
  };

  cancelEditBtn.addEventListener("click", cancelEditing);

  // ---------------- SUBMIT ----------------
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const deformities = Array.from(deformityChecklist.querySelectorAll('input:checked')).map(cb => cb.value);
    const payload = {
      farmer_id: farmerSelect.value, batch: batchInput.value.trim(), sex: sexSelect.value,
      age_stage: ageStageSelect.value, color: document.getElementById("color").value.trim(),
      breed: document.getElementById("breed").value.trim(), birth_date: document.getElementById("birth_date").value,
      health_status: document.getElementById("health_status").value, sire_id: sireSelect.value,
      dam_id: damSelect.value, weight: document.getElementById("weight").value,
      bodyLength: document.getElementById("bodyLength").value, heartGirth: document.getElementById("heartGirth").value,
      teethCount: document.getElementById("teethCount").value, teatCount: document.getElementById("teatCount").value || null,
      deformities: deformities.length ? deformities : ["None"],
      date_transfer: document.getElementById("date_transfer").value || new Date().toISOString().split('T')[0],
      managerId
    };

    try {
      const endpoint = isEditing ? `${BACKEND_URL}/api/swine/update/${currentEditingSwineId}` : `${BACKEND_URL}/api/swine/add`;
      const res = await fetch(endpoint, {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        swineMessage.className = "message success";
        swineMessage.textContent = isEditing ? "Successfully Updated!" : "Successfully Registered!";
        cancelEditing();
        await fetchSwine();
      } else {
        swineMessage.className = "message error";
        swineMessage.textContent = data.message;
      }
    } catch (err) { swineMessage.textContent = "Server connection error."; }
  });

  // ---------------- VIEW MODAL WITH FAMILY TREE ----------------
  swineTableBody.addEventListener("click", (e) => {
    if (e.target.classList.contains("view-btn")) {
        const sw = allSwine.find(s => s.swine_id === e.target.dataset.id);
        if(!sw) return;

        // 1. Pedigree Info
        const damObj = allSwine.find(s => s.swine_id === sw.dam_id);
        const sireObj = allSwine.find(s => s.swine_id === sw.sire_id);
        
        document.getElementById("modalSwineId").innerHTML = `
            Record: ${sw.swine_id} <br>
            <small style="color: #666;">Childhood Batch: ${sw.batch || 'N/A'}</small>
        `;

        // Create/Update a Pedigree Section (Ensure these IDs exist in your HTML modal)
        const familyInfo = document.getElementById("familyInfoSection") || document.createElement("div");
        familyInfo.id = "familyInfoSection";
        familyInfo.style.margin = "15px 0";
        familyInfo.style.padding = "10px";
        familyInfo.style.background = "#f9f9f9";
        familyInfo.style.borderRadius = "8px";
        familyInfo.innerHTML = `
            <div style="display:flex; justify-content: space-between;">
                <div><strong>Sire (Father):</strong> ${sw.sire_id || 'Unknown'}<br><small>${sireObj ? sireObj.breed : ''}</small></div>
                <div><strong>Dam (Mother):</strong> ${sw.dam_id || 'Unknown'}<br><small>${damObj ? damObj.breed : ''}</small></div>
            </div>
        `;
        document.getElementById("modalSwineId").after(familyInfo);

        // 2. Children List (Offspring)
        const children = allSwine.filter(s => s.dam_id === sw.swine_id || s.sire_id === sw.swine_id);
        const offspringSection = document.getElementById("offspringListSection") || document.createElement("div");
        offspringSection.id = "offspringListSection";
        offspringSection.innerHTML = `
            <h4>Offspring (Family Tree)</h4>
            <table class="swine-table" style="width:100%; font-size: 0.85em;">
                <thead>
                    <tr><th>ID</th><th>Batch</th><th>Sex</th><th>Stage</th></tr>
                </thead>
                <tbody id="offspringTableBody"></tbody>
            </table>
        `;
        // Append to modal (e.g., at the end)
        const modalContent = modal.querySelector(".modal-content");
        if(!document.getElementById("offspringListSection")) modalContent.appendChild(offspringSection);
        
        const offspringTable = document.getElementById("offspringTableBody");
        offspringTable.innerHTML = children.length ? "" : "<tr><td colspan='4'>No recorded offspring.</td></tr>";
        children.forEach(child => {
            offspringTable.innerHTML += `
                <tr>
                    <td>${child.swine_id}</td>
                    <td>${child.batch}</td>
                    <td>${child.sex}</td>
                    <td>${child.age_stage}</td>
                </tr>
            `;
        });

        // 3. Populate existing history tables
        const repoBody = document.getElementById("reproductiveHistoryBody");
        repoBody.innerHTML = (sw.breeding_cycles || []).length ? "" : "<tr><td colspan='6'>No cycle data.</td></tr>";
        (sw.breeding_cycles || []).forEach(c => {
          repoBody.innerHTML += `
            <tr>
              <td>${c.cycle_number}</td>
              <td>${c.ai_service_date ? new Date(c.ai_service_date).toLocaleDateString() : '--'}</td>
              <td>${c.actual_farrowing_date ? new Date(c.actual_farrowing_date).toLocaleDateString() : '--'}</td>
              <td>${c.farrowing_results?.total_born || 0}</td>
              <td>${c.farrowing_results?.live_born || 0}</td>
              <td>${sw.current_status || 'Active'}</td>
            </tr>`;
        });

        const perfBody = document.getElementById("performanceTimelineBody");
        perfBody.innerHTML = (sw.performance_records || []).length ? "" : "<tr><td colspan='5'>No growth records.</td></tr>";
        (sw.performance_records || []).forEach(p => {
          perfBody.innerHTML += `
            <tr>
              <td>${new Date(p.record_date).toLocaleDateString()}</td>
              <td>${p.weight} kg</td>
              <td>${p.body_length}x${p.heart_girth}</td>
              <td>${p.stage}</td>
              <td>${p.remarks || 'Initial'}</td>
            </tr>`;
        });

        modal.style.display = "block";
    }
    if (e.target.classList.contains("edit-btn")) startEditing(JSON.parse(e.target.getAttribute("data-swine")));
  });

  if (closeModal) closeModal.onclick = () => modal.style.display = "none";
  window.onclick = (e) => { if (e.target === modal) modal.style.display = "none"; };

  const backBtn = document.getElementById("backDashboardBtn");
  if (backBtn) backBtn.addEventListener("click", () => {
    window.location.href = (role === "encoder") ? "encoder_dashboard.html" : "admin_dashboard.html";
  });

  await loadFarmers();
  await fetchSwine();
  toggleTeatField();
  updateBatchField();
});