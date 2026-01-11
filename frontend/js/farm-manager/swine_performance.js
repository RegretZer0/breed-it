import { authGuard } from "../auth/authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  // 🔐 Protect page: only admins
  await authGuard("admin");

  const performanceForm = document.getElementById("performanceForm");
  const aiForm = document.getElementById("aiForm");

  const swineSelect = document.getElementById("swineSelect");
  const femaleSwineSelect = document.getElementById("femaleSwineSelect");
  const maleSwineSelect = document.getElementById("maleSwineSelect");

  const performanceTableBody = document.querySelector("#performanceTable tbody");
  const aiTableBody = document.querySelector("#aiTable tbody");

  let editingPerformanceId = null;
  let editingAIId = null;

<<<<<<< HEAD
  const userId = "PUT_ADMIN_ID_HERE"; 
  const role = "admin";
=======
  // get current admin
  const role = localStorage.getItem("role");
  let adminId = null;

  if (role === "admin") {
    adminId = localStorage.getItem("userId");
  }

  if (!adminId) {
    console.error("⚠ No adminId found in localStorage. You must log in as admin.");
    return;
  }
>>>>>>> c77026dfb006471fe2f49bc6d2dea04e554358c5

  const generateID = (prefix = "R") => `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;

<<<<<<< HEAD
  // Fetch Swines for dropdowns
const fetchSwines = async () => {
  try {
    console.log("Fetching swines for userId:", userId, "role:", role);
    const res = await fetch(`http://localhost:5000/api/swine/all?userId=${userId}&role=${role}`);
    console.log("Raw fetch response:", res);

    const data = await res.json();
    console.log("Parsed JSON data:", data);

    if (!data.success) throw new Error(data.message);

    const swines = data.swine;
    console.log("Swines array:", swines);

    swineSelect.innerHTML = "<option value=''>Select Swine</option>";
    femaleSwineSelect.innerHTML = "<option value=''>Select Female Swine</option>";
    maleSwineSelect.innerHTML = "<option value=''>Select Male Swine</option>";

    if (!swines || swines.length === 0) {
      console.warn("No swines found for this user/admin");
      swineSelect.innerHTML += "<option value=''>No swines available</option>";
      femaleSwineSelect.innerHTML += "<option value=''>No females available</option>";
      maleSwineSelect.innerHTML += "<option value=''>No males available</option>";
      return;
=======
  // Fetch Swines
  const fetchSwines = async () => {
    try {
      const res = await fetch(`http://localhost:5000/api/swine/all?adminId=${encodeURIComponent(adminId)}`);
      const data = await res.json();
      console.log("Fetched Swines:", data);

      if (!data.success) throw new Error(data.message);

      swineSelect.innerHTML = "";
      femaleSwineSelect.innerHTML = "";
      maleSwineSelect.innerHTML = "";

      const list = data.swine || [];
      list.forEach((s) => {
        const option = `<option value="${s._id}">${s.swine_id} (${s.breed || "-"})</option>`;
        swineSelect.innerHTML += option;
        if (s.sex?.toLowerCase() === "female") femaleSwineSelect.innerHTML += option;
        if (s.sex?.toLowerCase() === "male") maleSwineSelect.innerHTML += option;
      });
    } catch (err) {
      console.error("Failed to fetch swines:", err);
>>>>>>> c77026dfb006471fe2f49bc6d2dea04e554358c5
    }

<<<<<<< HEAD
    swines.forEach(s => {
      console.log("Adding swine to dropdown:", s);
      const option = `<option value="${s._id}">${s.swine_id} (${s.breed || "-"})</option>`;
      swineSelect.innerHTML += option;
      if (s.sex.toLowerCase() === "female") femaleSwineSelect.innerHTML += option;
      if (s.sex.toLowerCase() === "male") maleSwineSelect.innerHTML += option;
    });
=======
  // Fetch Performance Records
  const fetchPerformanceRecords = async () => {
    try {
      const res = await fetch(`http://localhost:5000/api/swine-records/performance/all?adminId=${encodeURIComponent(adminId)}`);
      const data = await res.json();
      console.log("Fetched Performance Records:", data.records);
>>>>>>> c77026dfb006471fe2f49bc6d2dea04e554358c5

  } catch (err) {
    console.error("Failed to fetch swines:", err);
    swineSelect.innerHTML = "<option value=''>Failed to load swines</option>";
    femaleSwineSelect.innerHTML = "<option value=''>Failed to load females</option>";
    maleSwineSelect.innerHTML = "<option value=''>Failed to load males</option>";
  }
};

<<<<<<< HEAD

  // Submit performance form
  performanceForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(performanceForm);
    const payload = Object.fromEntries(formData.entries());

    if (!editingPerformanceId) {
      payload.reproduction_id = generateID("R");
=======
      performanceTableBody.innerHTML = "";
      (data.records || []).forEach((r) => {
        performanceTableBody.innerHTML += `
          <tr>
            <td>${r.reproductionId || r.reproduction_id}</td>
            <td>${r.swine_id?.swine_id || "Unknown"}</td>
            <td>${r.parentType || r.parent_type || "-"}</td>
            <td>${r.weight || "-"}</td>
            <td>${r.bodyLength || r.body_length || "-"}</td>
            <td>${r.heartGirth || r.heart_girth || "-"}</td>
            <td>${r.color || "-"}</td>
            <td>${r.teethCount || r.teeth_count || "-"}</td>
            <td>${r.teethAlignment || r.teeth_alignment || "-"}</td>
            <td>${r.legConformation || r.leg_conformation || "-"}</td>
            <td>${r.hoofCondition || r.hoof_condition || "-"}</td>
            <td>${r.bodySymmetryAndMuscling || r.body_symmetry_and_muscling || "-"}</td>
            <td>${r.noOfPiglets || r.no_of_piglets || "-"}</td>
            <td><button onclick="editPerformance('${r._id}')">Edit</button></td>
          </tr>
        `;
      });
    } catch (err) {
      console.error("Failed to fetch performance records:", err);
    }
  };

  // Fetch AI Records
  const fetchAIRecords = async () => {
    try {
      const res = await fetch(`http://localhost:5000/api/swine-records/ai/all?adminId=${encodeURIComponent(adminId)}`);
      const data = await res.json();
      console.log("Fetched AI Records:", data.records);

      if (!data.success) throw new Error(data.message);

      aiTableBody.innerHTML = "";
      (data.records || []).forEach((r) => {
        aiTableBody.innerHTML += `
          <tr>
            <td>${r.swine_id?.swine_id || "Unknown"}</td>
            <td>${r.male_swine_id?.swine_id || "Unknown"}</td>
            <td>${r.insemination_date ? new Date(r.insemination_date).toLocaleDateString() : "-"}</td>
            <td><button onclick="editAIRecord('${r._id}')">Edit</button></td>
          </tr>
        `;
      });
    } catch (err) {
      console.error("Failed to fetch AI records:", err);
    }
  };

  // Submit Performance 
  performanceForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = Object.fromEntries(new FormData(performanceForm).entries());

    const payload = {
    swine_id: formData.swine_id || formData.swineSelect || formData.swineId,
    parentType: formData.parent_type || formData.parentType,
    recordDate: formData.recordDate,
    weight: formData.weight,
    bodyLength: formData.body_length || formData.bodyLength,
    heartGirth: formData.heart_girth || formData.heartGirth,
    color: formData.color,
    teethCount: formData.teeth_count || formData.teethCount,
    teethAlignment: formData.teeth_alignment || formData.teethAlignment,
    legConformation: formData.leg_conformation || formData.legConformation,
    hoofCondition: formData.hoof_condition || formData.hoofCondition,
    bodySymmetryAndMuscling: formData.body_symmetry_and_muscling || formData.bodySymmetryAndMuscling,
    noOfPiglets: formData.no_of_piglets || formData.noOfPiglets,
    adminId: adminId,
    };

    if (!editingPerformanceId) {
      payload.reproductionId = generateID("R");
>>>>>>> c77026dfb006471fe2f49bc6d2dea04e554358c5
      await savePerformance(payload);
    } else {
      await updatePerformance(editingPerformanceId, payload);
    }

    performanceForm.reset();
    editingPerformanceId = null;
  });

  const savePerformance = async (payload) => {
    try {
      const res = await fetch("http://localhost:5000/api/swine/performance/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      console.log("Response from savePerformance:", data);
      if (!data.success) throw new Error(data.message);
<<<<<<< HEAD
      alert("Performance record saved!");
      fetchPerformanceRecords();
=======
      await fetchPerformanceRecords();
>>>>>>> c77026dfb006471fe2f49bc6d2dea04e554358c5
    } catch (err) {
      console.error("Error saving performance:", err);
      alert("Failed to save performance");
    }
  };

  const updatePerformance = async (id, payload) => {
    try {
<<<<<<< HEAD
      const res = await fetch(`http://localhost:5000/api/swine/performance/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
=======
      const res = await fetch(`http://localhost:5000/api/swine-records/performance/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
>>>>>>> c77026dfb006471fe2f49bc6d2dea04e554358c5
      });
      const data = await res.json();
      console.log("Response from updatePerformance:", data);
      if (!data.success) throw new Error(data.message);
<<<<<<< HEAD
      alert("Performance record updated!");
      fetchPerformanceRecords();
=======
      await fetchPerformanceRecords();
>>>>>>> c77026dfb006471fe2f49bc6d2dea04e554358c5
    } catch (err) {
      console.error("Error updating performance:", err);
      alert("Failed to update performance");
    }
  };

<<<<<<< HEAD
  // Submit AI form
  aiForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(aiForm);
    const payload = Object.fromEntries(formData.entries());
=======
  // Submit AI
  aiForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = Object.fromEntries(new FormData(aiForm).entries());

    const payload = {
      swine_id: formData.swine_id || formData.female_swine_id || formData.swineSelect,
      male_swine_id: formData.male_swine_id || formData.maleSwineSelect,
      insemination_date: formData.insemination_date || formData.inseminationDate,
      adminId: adminId, // ✅ changed to match backend
    };
>>>>>>> c77026dfb006471fe2f49bc6d2dea04e554358c5

    if (!editingAIId) {
      payload.insemination_id = generateID("AI");
      await saveAIRecord(payload);
    } else {
      await updateAIRecord(editingAIId, payload);
    }

    aiForm.reset();
    editingAIId = null;
  });

  const saveAIRecord = async (payload) => {
    try {
      const res = await fetch("http://localhost:5000/api/swine/ai/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      console.log("Response from saveAIRecord:", data);
      if (!data.success) throw new Error(data.message);
<<<<<<< HEAD
      alert("AI record saved!");
      fetchAIRecords();
=======
      await fetchAIRecords();
>>>>>>> c77026dfb006471fe2f49bc6d2dea04e554358c5
    } catch (err) {
      console.error("Error saving AI record:", err);
      alert("Failed to save AI record");
    }
  };

  const updateAIRecord = async (id, payload) => {
    try {
      const res = await fetch(`http://localhost:5000/api/swine/ai/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      console.log("Response from updateAIRecord:", data);
      if (!data.success) throw new Error(data.message);
<<<<<<< HEAD
      alert("AI record updated!");
      fetchAIRecords();
=======
      await fetchAIRecords();
>>>>>>> c77026dfb006471fe2f49bc6d2dea04e554358c5
    } catch (err) {
      console.error("Error updating AI record:", err);
      alert("Failed to update AI record");
    }
  };

<<<<<<< HEAD
  // Edit functions
  window.editPerformance = async (id) => {
    try {
      const res = await fetch("http://localhost:5000/api/swine/performance/all");
      const data = await res.json();
      const record = data.records.find(r => r._id === id);
      if (!record) throw new Error("Record not found");

      editingPerformanceId = id;
      swineSelect.value = record.swine_id?._id || "";
      performanceForm.parent_type.value = record.parent_type || "";
      performanceForm.weight.value = record.weight || "";
      performanceForm.body_length.value = record.body_length || "";
      performanceForm.heart_girth.value = record.heart_girth || "";
      performanceForm.color.value = record.color || "";
      performanceForm.teeth_count.value = record.teeth_count || "";
      performanceForm.teeth_alignment.value = record.teeth_alignment || "";
      performanceForm.leg_conformation.value = record.leg_conformation || "";
      performanceForm.hoof_condition.value = record.hoof_condition || "";
      performanceForm.body_symmetry_and_muscling.value = record.body_symmetry_and_muscling || "";
      performanceForm.no_of_piglets.value = record.no_of_piglets || "";
    } catch (err) {
      console.error(err);
      alert("Failed to load record for editing");
=======
  // Edit Functions 
  window.editPerformance = async (id) => {
    try {
      const res = await fetch(`http://localhost:5000/api/swine-records/performance/${id}?adminId=${encodeURIComponent(adminId)}`);
      const data = await res.json();
      console.log("Editing Performance Record:", data.record);
      if (!data.success) throw new Error(data.message);
      const r = data.record;

      editingPerformanceId = id;
      swineSelect.value = r.swine_id?._id || "";
      performanceForm.parent_type.value = r.parentType || r.parent_type || "";
      performanceForm.weight.value = r.weight || "";
      performanceForm.body_length.value = r.bodyLength || r.body_length || "";
      performanceForm.heart_girth.value = r.heartGirth || r.heart_girth || "";
      performanceForm.color.value = r.color || "";
      performanceForm.teeth_count.value = r.teethCount || "";
      performanceForm.teeth_alignment.value = r.teethAlignment || "";
      performanceForm.leg_conformation.value = r.legConformation || "";
      performanceForm.hoof_condition.value = r.hoofCondition || "";
      performanceForm.body_symmetry_and_muscling.value = r.bodySymmetryAndMuscling || "";
      performanceForm.no_of_piglets.value = r.noOfPiglets || r.no_of_piglets || "";
    } catch (err) {
      console.error(err);
>>>>>>> c77026dfb006471fe2f49bc6d2dea04e554358c5
    }
  };

  window.editAIRecord = async (id) => {
    try {
<<<<<<< HEAD
      const res = await fetch("http://localhost:5000/api/swine/ai/all");
      const data = await res.json();
      const record = data.records.find(r => r._id === id);
      if (!record) throw new Error("Record not found");

      editingAIId = id;
      femaleSwineSelect.value = record.swine_id?._id || "";
      maleSwineSelect.value = record.male_swine_id?._id || "";
      aiForm.insemination_date.value = record.insemination_date?.split("T")[0] || "";
    } catch (err) {
      console.error(err);
      alert("Failed to load AI record for editing");
    }
  };

  // Initial load
=======
      const res = await fetch(`http://localhost:5000/api/swine-records/ai/${id}?adminId=${encodeURIComponent(adminId)}`);
      const data = await res.json();
      console.log("Editing AI Record:", data.record);
      if (!data.success) throw new Error(data.message);
      const r = data.record;

      editingAIId = id;
      femaleSwineSelect.value = r.swine_id?._id || "";
      maleSwineSelect.value = r.male_swine_id?._id || "";
      aiForm.insemination_date.value = r.insemination_date?.split("T")[0] || "";
    } catch (err) {
      console.error(err);
    }
  };

  // Generate Breeding Analytics Report (aayusin pa to)
  const generateReportBtn = document.getElementById("generateReportBtn");
  const reportOutput = document.getElementById("reportOutput");

  generateReportBtn.addEventListener("click", async () => {
  reportOutput.innerHTML = `<p>Loading report...</p>`; // Show loading
  console.log("FINAL HTML:", reportOutput.innerHTML);


    try {
      const res = await fetch(`http://localhost:5000/api/breeding/report?adminId=${encodeURIComponent(adminId)}`);
      const data = await res.json();

      console.log("Breeding Report Data:", data);
      console.log("DATA KEYS:", Object.keys(data));
      console.log("FULL JSON:", JSON.stringify(data, null, 2));
      console.log("reportOutput element:", reportOutput);

      if (data.success === false) {
        reportOutput.innerHTML = `<p style="color:red;">${data.message}</p>`;
        return;
      }

      const { performance_scores = [], reproduction_scores = [], compatibility_scores = [], ranking = [] } = data;

      // Helper function to flatten object for display
      const flattenValue = (val) => {
        if (val === null || val === undefined) return "-";
        if (typeof val === "object") {
          // Try to display meaningful nested values
          return val.swine_id || val.total_score || JSON.stringify(val);
        }
        return val;
      };

      // Render a generic table from array of objects
      const renderTable = (title, records) => {
        if (!records.length) return `<p>No data available for ${title}.</p>`;
        const headers = Object.keys(records[0]);
        return `
          <h4>${title}</h4>
          <table class="report-table">
            <thead>
              <tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr>
            </thead>
            <tbody>
              ${records.map(r => `
                <tr>
                  ${headers.map(h => `<td>${flattenValue(r[h])}</td>`).join("")}
                </tr>
              `).join("")}
            </tbody>
          </table>
        `;
      };

      // Top 5 Ranking Table
      const rankingHTML = ranking.length
        ? `<h4>🏆 Top 5 Breeding Pairs</h4>
          <table class="report-table">
            <thead>
              <tr>
                <th>Female Swine</th>
                <th>Male Swine</th>
                <th>Total Score</th>
              </tr>
            </thead>
            <tbody>
              ${ranking.slice(0, 5).map(r => `
                <tr>
                  <td>${flattenValue(r.female_swine_id)}</td>
                  <td>${flattenValue(r.male_swine_id)}</td>
                  <td>${flattenValue(r.total_score)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>`
        : `<p>No ranking data available.</p>`;

      // Render full report
      reportOutput.innerHTML = `
        <h3>🐷 Breeding Analytics Report</h3>
        ${rankingHTML}
        ${renderTable("📈 Performance Scores", performance_scores)}
        ${renderTable("👶 Reproduction Scores", reproduction_scores)}
        ${renderTable("❤️ Compatibility Scores", compatibility_scores)}
      `;
    } catch (err) {
      console.error("Failed to generate report:", err);
      reportOutput.innerHTML = `<p style="color:red;">Failed to generate report.</p>`;
    }
  });

  //  Initial Load
>>>>>>> c77026dfb006471fe2f49bc6d2dea04e554358c5
  await fetchSwines();
  await fetchPerformanceRecords();
  await fetchAIRecords();
});
