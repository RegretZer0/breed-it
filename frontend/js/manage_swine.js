import { authGuard } from "./authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  // 🔐 Protect page: Allow farm managers OR encoders
  const user = await authGuard(["farm_manager", "encoder"]);
  if (!user) return;

  const token = localStorage.getItem("token");
  const role = user.role;

  // ---------------- DETERMINE MANAGER ID ----------------
  let managerId = null;
  try {
    if (role === "farm_manager") {
      managerId = user.id;
    } else if (role === "encoder") {
      managerId = user.managerId || null;
      if (!managerId) {
        const res = await fetch(`http://localhost:5000/api/auth/encoders/single/${user.id}`, {
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
  const swineMessage = document.getElementById("swineMessage");
  const farmerSelect = document.getElementById("farmerSelect");
  const swineTableBody = document.getElementById("swineTableBody");
  
  const sexSelect = document.getElementById("sex");
  const ageStageSelect = document.getElementById("ageStage");
  const teatCountGroup = document.getElementById("teatCountGroup");
  const deformityChecklist = document.getElementById("deformityChecklist");
  const medicalChecklist = document.getElementById("medicalChecklist");

  // Modal Elements
  const modal = document.getElementById("swineModal");
  const closeModal = document.querySelector(".close-modal");

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

  // ---------------- FETCH FARMERS ----------------
  async function loadFarmers() {
    try {
      const res = await fetch(`http://localhost:5000/api/auth/farmers/${managerId}`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      const data = await res.json();
      farmerSelect.innerHTML = `<option value="">Select Farmer</option>`;
      if (data.success && data.farmers) {
        data.farmers.forEach((f) => {
          const opt = document.createElement("option");
          opt.value = f._id;
          opt.textContent = `${f.first_name} ${f.last_name}`.trim();
          farmerSelect.appendChild(opt);
        });
      }
    } catch (err) {
      console.error("Error loading farmers:", err);
    }
  }

  // ---------------- FETCH SWINE (DETAILED MASTER LIST) ----------------
  async function fetchSwine() {
    try {
      const res = await fetch(`http://localhost:5000/api/swine/all`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      const data = await res.json();
      swineTableBody.innerHTML = "";

      if (data.success && data.swine?.length > 0) {
        data.swine.reverse().forEach((sw) => {
          // 1. Correct Farmer Name Handling
          const farmerName = sw.farmer_id 
            ? `${sw.farmer_id.first_name || ''} ${sw.farmer_id.last_name || ''}`.trim() 
            : "N/A";

          // 2. Safe Performance Access
          const perfArray = sw.performance_records || [];
          const latestPerf = perfArray.length > 0 ? perfArray[perfArray.length - 1] : {};

          // 3. Reproductive Calculations (Totals)
          const cycles = sw.breeding_cycles || [];
          const totalPiglets = cycles.reduce((sum, c) => sum + (c.farrowing_results?.total_piglets || 0), 0);
          const totalMortality = cycles.reduce((sum, c) => sum + (c.farrowing_results?.mortality_count || 0), 0);

          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>
              <strong>${sw.swine_id || 'N/A'}</strong><br>
              <small>Batch: ${sw.batch || 'N/A'}</small><br>
              <button class="view-btn" data-id="${sw.swine_id}">View History</button>
            </td>
            <td>${farmerName}</td>
            <td>
              Sex: ${sw.sex || 'N/A'}<br>
              Breed: ${sw.breed || 'N/A'}<br>
              Age: ${sw.age_stage || 'N/A'}
            </td>
            <td>
              Status: <span class="status-badge">${sw.current_status || 'N/A'}</span><br>
              Health: <strong style="color: ${sw.health_status === 'Healthy' ? '#2ecc71' : '#e74c3c'};">${sw.health_status || 'Healthy'}</strong>
            </td>
            <td>
              S: ${sw.sire_id || 'N/A'}<br>
              D: ${sw.dam_id || 'N/A'}
            </td>
            <td>
              Piglets: ${totalPiglets}<br>
              Mortality: ${totalMortality}
            </td>
            <td>
              Wt: ${latestPerf.weight || '--'} kg<br>
              L: ${latestPerf.body_length || '--'} cm
            </td>
          `;
          swineTableBody.appendChild(tr);
        });
      } else {
        swineTableBody.innerHTML = "<tr><td colspan='7'>No swine registered yet.</td></tr>";
      }
    } catch (err) {
      console.error("Error loading swine list:", err);
      swineTableBody.innerHTML = "<tr><td colspan='7'>Error loading records.</td></tr>";
    }
  }

  // ---------------- MODAL LOGIC: VIEW DETAILS ----------------
  const openSwineModal = async (swineId) => {
    try {
      const res = await fetch(`http://localhost:5000/api/swine/all`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      const sw = data.swine.find(s => s.swine_id === swineId);

      if (!sw) return;

      document.getElementById("modalSwineId").textContent = `Detailed Record: ${sw.swine_id}`;

      // 1. Populate Reproductive History
      const reproBody = document.getElementById("reproductiveHistoryBody");
      const cycles = sw.breeding_cycles || [];
      reproBody.innerHTML = cycles.length ? "" : "<tr><td colspan='6'>No reproductive cycles found.</td></tr>";
      
      cycles.forEach(cycle => {
        const total = cycle.farrowing_results?.total_piglets || 0;
        const mort = cycle.farrowing_results?.mortality_count || 0;
        reproBody.innerHTML += `
          <tr>
            <td>${cycle.cycle_number || 'N/A'}</td>
            <td>${cycle.ai_service_date ? new Date(cycle.ai_service_date).toLocaleDateString() : 'N/A'}</td>
            <td>${cycle.actual_farrowing_date ? new Date(cycle.actual_farrowing_date).toLocaleDateString() : 'N/A'}</td>
            <td>${total}</td>
            <td>${total - mort}</td>
            <td>${mort}</td>
          </tr>`;
      });

      // 2. Populate Performance Timeline
      const perfBody = document.getElementById("performanceTimelineBody");
      const records = sw.performance_records || [];
      perfBody.innerHTML = records.length ? "" : "<tr><td colspan='6'>No performance records found.</td></tr>";
      
      records.forEach(perf => {
        perfBody.innerHTML += `
          <tr>
            <td>${perf.stage || 'Routine'}</td>
            <td>${perf.record_date ? new Date(perf.record_date).toLocaleDateString() : 'N/A'}</td>
            <td>${perf.weight || '--'} kg</td>
            <td>${perf.body_length || '--'}x${perf.heart_girth || '--'} cm</td>
            <td>${perf.teat_count || 'N/A'}</td>
            <td>${(perf.deformities && perf.deformities.length > 0) ? perf.deformities.join(", ") : 'None'}</td>
          </tr>`;
      });

      modal.style.display = "block";
    } catch (err) {
      console.error("Error fetching modal data:", err);
    }
  };

  // Delegate clicks to the "View History" buttons
  swineTableBody.addEventListener("click", (e) => {
    if (e.target.classList.contains("view-btn")) {
      openSwineModal(e.target.dataset.id);
    }
  });

  if (closeModal) closeModal.onclick = () => modal.style.display = "none";
  window.onclick = (e) => { if (e.target === modal) modal.style.display = "none"; };

  // ---------------- REGISTER NEW SWINE ----------------
  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const selectedDeformities = Array.from(deformityChecklist.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
      const selectedMedical = Array.from(medicalChecklist.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);

      const payload = {
        farmer_id: farmerSelect.value,
        batch: document.getElementById("batch").value.trim(),
        sex: sexSelect.value,
        ageStage: ageStageSelect.value,
        color: document.getElementById("color").value.trim(),
        breed: document.getElementById("breed").value.trim(),
        birthDate: document.getElementById("birth_date").value,
        health_status: document.getElementById("health_status").value,
        sireId: document.getElementById("sire_id").value.trim(),
        damId: document.getElementById("dam_id").value.trim(),
        weight: document.getElementById("weight").value,
        bodyLength: document.getElementById("bodyLength").value,
        heartGirth: document.getElementById("heartGirth").value,
        teethCount: document.getElementById("teethCount").value,
        teatCount: document.getElementById("teatCount").value || null,
        deformities: selectedDeformities.length > 0 ? selectedDeformities : ["None"],
        medical_initial: selectedMedical,
        dateTransfer: document.getElementById("date_transfer").value,
        managerId
      };

      try {
        const res = await fetch("http://localhost:5000/api/swine/add", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          credentials: "include",
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (data.success) {
          swineMessage.className = "message success";
          swineMessage.textContent = `Successfully added ${data.swine.swine_id}!`;
          registerForm.reset();
          toggleTeatField();
          registerForm.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
          fetchSwine(); 
        } else {
          swineMessage.className = "message error";
          swineMessage.textContent = data.message || "Registration failed.";
        }
      } catch (err) {
        swineMessage.textContent = "Server connection error.";
      }
    });
  }

  // ---------------- NAVIGATION ----------------
  const backBtn = document.getElementById("backDashboardBtn");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      window.location.href = (role === "encoder") ? "encoder_dashboard.html" : "admin_dashboard.html";
    });
  }

  await loadFarmers();
  await fetchSwine();
  toggleTeatField();
});