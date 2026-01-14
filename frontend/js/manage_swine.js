import { authGuard } from "./authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  // 🔐 Protect page: Allow farm managers OR encoders
  const user = await authGuard(["farm_manager", "encoder"]);
  if (!user) return;

  const token = localStorage.getItem("token");
  const role = user.role;
  const BACKEND_URL = "http://localhost:5000";

  // ---------------- STATE VARIABLES ----------------
  let managerId = null;
  let isEditing = false;
  let currentEditingSwineId = null; 
  let allSwine = []; // 🔍 Local cache for instant filtering

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
  const swineTableBody = document.getElementById("swineTableBody");
  
  const sexSelect = document.getElementById("sex");
  const ageStageSelect = document.getElementById("ageStage");
  const teatCountGroup = document.getElementById("teatCountGroup");
  const deformityChecklist = document.getElementById("deformityChecklist");
  const medicalChecklist = document.getElementById("medicalChecklist");

  // 🔍 Filter Inputs
  const filterBatch = document.getElementById("filterBatch");
  const filterFarmer = document.getElementById("filterFarmer"); // Now treated as a <select>

  const modal = document.getElementById("swineModal");
  const closeModal = document.querySelector(".close-modal");

  const cancelEditBtn = document.createElement("button");
  cancelEditBtn.type = "button";
  cancelEditBtn.textContent = "Cancel Edit";
  cancelEditBtn.className = "btn-secondary"; 
  cancelEditBtn.style.display = "none";
  cancelEditBtn.style.marginLeft = "10px";
  submitBtn.parentNode.appendChild(cancelEditBtn);

  // ---------------- UI LOGIC: CONDITIONAL TEAT COUNT ----------------
  const toggleTeatField = () => {
    if (sexSelect.value === "Female" && ageStageSelect.value === "adult") {
      teatCountGroup.style.display = "block";
    } else {
      teatCountGroup.style.display = "none";
      const teatInput = document.getElementById("teatCount");
      if(teatInput) teatInput.value = "";
    }
  };

  sexSelect.addEventListener("change", toggleTeatField);
  ageStageSelect.addEventListener("change", toggleTeatField);

  // ---------------- FETCH FARMERS (Populates both selects) ----------------
  async function loadFarmers() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/farmers/${managerId}`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      const data = await res.json();
      
      // Clear current options
      farmerSelect.innerHTML = `<option value="">Select Farmer</option>`;
      if (filterFarmer) filterFarmer.innerHTML = `<option value="">All Farmers</option>`;

      if (data.success && data.farmers) {
        data.farmers.forEach((f) => {
          const fullName = `${f.first_name} ${f.last_name}`.trim();
          
          // Populate Register Form Select
          const optReg = document.createElement("option");
          optReg.value = f._id;
          optReg.textContent = fullName;
          farmerSelect.appendChild(optReg);

          // Populate Filter Select
          if (filterFarmer) {
            const optFilter = document.createElement("option");
            optFilter.value = f._id; // Filter by ID for accuracy
            optFilter.textContent = fullName;
            filterFarmer.appendChild(optFilter);
          }
        });
      }
    } catch (err) {
      console.error("Error loading farmers:", err);
    }
  }

  // ---------------- FILTERING LOGIC ----------------
  const applyFilters = () => {
    const batchQuery = filterBatch.value.toLowerCase();
    const selectedFarmerId = filterFarmer.value; // Filter by ID

    const filteredData = allSwine.filter(sw => {
      const matchBatch = (sw.batch || "").toLowerCase().includes(batchQuery);
      
      // If "All Farmers" is selected, match all. Otherwise match specific farmer ID.
      const matchFarmer = selectedFarmerId === "" || (sw.farmer_id?._id === selectedFarmerId || sw.farmer_id === selectedFarmerId);

      return matchBatch && matchFarmer;
    });

    displaySwine(filteredData);
  };

  if (filterBatch) filterBatch.addEventListener("input", applyFilters);
  if (filterFarmer) filterFarmer.addEventListener("change", applyFilters); // Changed to 'change' for dropdown

  // ---------------- DISPLAY LOGIC ----------------
  function displaySwine(swineList) {
    swineTableBody.innerHTML = "";

    if (swineList.length > 0) {
      swineList.forEach((sw) => {
        const farmerName = sw.farmer_id 
          ? `${sw.farmer_id.first_name || ''} ${sw.farmer_id.last_name || ''}`.trim() 
          : "N/A";

        const latestPerf = (sw.performance_records || []).slice(-1)[0] || {};
        const cycles = sw.breeding_cycles || [];
        const totalPiglets = cycles.reduce((sum, c) => sum + (c.farrowing_results?.total_piglets || 0), 0);
        const totalMortality = cycles.reduce((sum, c) => sum + (c.farrowing_results?.mortality_count || 0), 0);

        let currentStatus = sw.current_status || 'Open';
        const statusColors = { "Open": "#7f8c8d", "In-Heat": "#e67e22", "Awaiting Recheck": "#3498db", "Pregnant": "#9b59b6", "Farrowing": "#e74c3c", "Lactating": "#2ecc71" };
        const statusColor = statusColors[currentStatus] || "#7f8c8d";

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>
            <strong>${sw.swine_id || 'N/A'}</strong><br>
            <small>Batch: ${sw.batch || 'N/A'}</small><br>
            <div style="margin-top: 5px;">
              <button class="view-btn" data-id="${sw.swine_id}">History</button>
              <button class="edit-btn" data-swine='${JSON.stringify(sw)}'>Edit</button>
            </div>
          </td>
          <td>${farmerName}</td>
          <td>Sex: ${sw.sex}<br>Breed: ${sw.breed}<br>Age: ${sw.age_stage}</td>
          <td>
            Status: <span class="status-badge" style="background-color: ${statusColor}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.85em;">${currentStatus}</span><br>
            Health: <strong style="color: ${sw.health_status === 'Healthy' ? '#2ecc71' : '#e74c3c'};">${sw.health_status}</strong>
          </td>
          <td>S: ${sw.sire_id || 'N/A'}<br>D: ${sw.dam_id || 'N/A'}</td>
          <td>Piglets: ${totalPiglets}<br>Mortality: ${totalMortality}</td>
          <td>Wt: ${latestPerf.weight || '--'} kg<br>L: ${latestPerf.body_length || '--'} cm</td>
        `;
        swineTableBody.appendChild(tr);
      });
    } else {
      swineTableBody.innerHTML = "<tr><td colspan='7'>No matching swine found.</td></tr>";
    }
  }

  // ---------------- FETCH SWINE ----------------
  async function fetchSwine() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/swine/all`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      const data = await res.json();

      if (data.success && data.swine) {
        allSwine = data.swine.reverse(); 
        displaySwine(allSwine);
      }
    } catch (err) {
      console.error("Error loading swine list:", err);
    }
  }

  // ---------------- EDIT LOGIC ----------------
  const startEditing = (swine) => {
    isEditing = true;
    currentEditingSwineId = swine.swine_id;
    submitBtn.textContent = "Update Swine Info";
    cancelEditBtn.style.display = "inline-block";
    swineMessage.textContent = `Editing Swine: ${swine.swine_id}`;
    swineMessage.className = "message info";
    registerForm.scrollIntoView({ behavior: 'smooth' });

    farmerSelect.value = swine.farmer_id?._id || "";
    document.getElementById("batch").value = swine.batch || "";
    document.getElementById("sex").value = swine.sex || "Female";
    document.getElementById("ageStage").value = swine.age_stage || "piglet";
    document.getElementById("color").value = swine.color || "";
    document.getElementById("breed").value = swine.breed || "";
    document.getElementById("health_status").value = swine.health_status || "Healthy";
    document.getElementById("sire_id").value = swine.sire_id || "";
    document.getElementById("dam_id").value = swine.dam_id || "";
    
    if (swine.birth_date) document.getElementById("birth_date").value = swine.birth_date.split('T')[0];
    if (swine.date_transfer) document.getElementById("date_transfer").value = swine.date_transfer.split('T')[0];

    const latest = swine.performance_records?.slice(-1)[0] || {};
    document.getElementById("weight").value = latest.weight || "";
    document.getElementById("bodyLength").value = latest.body_length || "";
    document.getElementById("heartGirth").value = latest.heart_girth || "";
    document.getElementById("teethCount").value = latest.teeth_count || "";
    document.getElementById("teatCount").value = latest.teat_count || swine.teat_count || "";

    toggleTeatField();
  };

  const cancelEditing = () => {
    isEditing = false;
    currentEditingSwineId = null;
    submitBtn.textContent = "Register Swine";
    cancelEditBtn.style.display = "none";
    swineMessage.textContent = "";
    registerForm.reset();
    toggleTeatField();
  };

  cancelEditBtn.addEventListener("click", cancelEditing);

  // ---------------- MODAL LOGIC ----------------
  const openSwineModal = async (swineId) => {
    try {
      const sw = allSwine.find(s => s.swine_id === swineId);
      if (!sw) return;

      document.getElementById("modalSwineId").textContent = `Detailed Record: ${sw.swine_id}`;

      const reproBody = document.getElementById("reproductiveHistoryBody");
      reproBody.innerHTML = (sw.breeding_cycles || []).length ? "" : "<tr><td colspan='6'>No cycles found.</td></tr>";
      sw.breeding_cycles.forEach(cycle => {
        reproBody.innerHTML += `<tr><td>${cycle.cycle_number}</td><td>${cycle.ai_service_date ? new Date(cycle.ai_service_date).toLocaleDateString() : 'N/A'}</td><td>${cycle.actual_farrowing_date ? new Date(cycle.actual_farrowing_date).toLocaleDateString() : 'N/A'}</td><td>${cycle.farrowing_results?.total_piglets || 0}</td><td>${(cycle.farrowing_results?.total_piglets || 0) - (cycle.farrowing_results?.mortality_count || 0)}</td><td>${cycle.farrowing_results?.mortality_count || 0}</td></tr>`;
      });

      const perfBody = document.getElementById("performanceTimelineBody");
      perfBody.innerHTML = (sw.performance_records || []).length ? "" : "<tr><td colspan='6'>No records found.</td></tr>";
      sw.performance_records.forEach(perf => {
        const teats = perf.teat_count || 'N/A';
        perfBody.innerHTML += `
          <tr>
            <td>${perf.stage}</td>
            <td>${new Date(perf.record_date).toLocaleDateString()}</td>
            <td>${perf.weight || '--'} kg</td>
            <td>${perf.body_length || '--'}x${perf.heart_girth || '--'} cm</td>
            <td>${teats}</td>
            <td>${(perf.deformities && perf.deformities.length > 0) ? perf.deformities.join(", ") : 'None'}</td>
          </tr>`;
      });

      modal.style.display = "block";
    } catch (err) { console.error(err); }
  };

  swineTableBody.addEventListener("click", (e) => {
    if (e.target.classList.contains("view-btn")) openSwineModal(e.target.dataset.id);
    if (e.target.classList.contains("edit-btn")) startEditing(JSON.parse(e.target.getAttribute("data-swine")));
  });

  if (closeModal) closeModal.onclick = () => modal.style.display = "none";
  window.onclick = (e) => { if (e.target === modal) modal.style.display = "none"; };

  // ---------------- REGISTER / UPDATE ----------------
  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const deformities = Array.from(deformityChecklist.querySelectorAll('input:checked')).map(cb => cb.value);
      const medical = Array.from(medicalChecklist.querySelectorAll('input:checked')).map(cb => cb.value);

      const payload = {
        farmer_id: farmerSelect.value,
        batch: document.getElementById("batch").value.trim(),
        sex: sexSelect.value,
        age_stage: ageStageSelect.value,
        color: document.getElementById("color").value.trim(),
        breed: document.getElementById("breed").value.trim(),
        birth_date: document.getElementById("birth_date").value,
        health_status: document.getElementById("health_status").value,
        sire_id: document.getElementById("sire_id").value.trim(),
        dam_id: document.getElementById("dam_id").value.trim(),
        weight: document.getElementById("weight").value,
        bodyLength: document.getElementById("bodyLength").value,
        heartGirth: document.getElementById("heartGirth").value,
        teethCount: document.getElementById("teethCount").value,
        teatCount: document.getElementById("teatCount").value || null,
        deformities: deformities.length ? deformities : ["None"],
        medical_initial: medical,
        date_transfer: document.getElementById("date_transfer").value,
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
          swineMessage.textContent = isEditing ? "Updated!" : "Registered!";
          cancelEditing();
          fetchSwine();
        } else {
          swineMessage.className = "message error";
          swineMessage.textContent = data.message;
        }
      } catch (err) { swineMessage.textContent = "Network Error."; }
    });
  }

  const backBtn = document.getElementById("backDashboardBtn");
  if (backBtn) backBtn.addEventListener("click", () => {
    window.location.href = (role === "encoder") ? "encoder_dashboard.html" : "admin_dashboard.html";
  });

  await loadFarmers();
  await fetchSwine();
  toggleTeatField();
});