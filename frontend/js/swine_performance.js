import { authGuard } from "./authGuard.js";

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

  const generateID = (prefix = "R") =>
    `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;

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
    }
  };

  // Fetch Performance Records
  const fetchPerformanceRecords = async () => {
    try {
      const res = await fetch(`http://localhost:5000/api/swine-records/performance/all?adminId=${encodeURIComponent(adminId)}`);
      const data = await res.json();
      console.log("Fetched Performance Records:", data.records);

      if (!data.success) throw new Error(data.message);

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
      await savePerformance(payload);
    } else {
      await updatePerformance(editingPerformanceId, payload);
    }

    performanceForm.reset();
    editingPerformanceId = null;
  });

  const savePerformance = async (payload) => {
    try {
      const res = await fetch("http://localhost:5000/api/swine-records/performance/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      console.log("Response from savePerformance:", data);
      if (!data.success) throw new Error(data.message);
      await fetchPerformanceRecords();
    } catch (err) {
      console.error("Error saving performance:", err);
    }
  };

  const updatePerformance = async (id, payload) => {
    try {
      const res = await fetch(`http://localhost:5000/api/swine-records/performance/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      console.log("Response from updatePerformance:", data);
      if (!data.success) throw new Error(data.message);
      await fetchPerformanceRecords();
    } catch (err) {
      console.error("Error updating performance:", err);
    }
  };

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
      const res = await fetch("http://localhost:5000/api/swine-records/ai/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      console.log("Response from saveAIRecord:", data);
      if (!data.success) throw new Error(data.message);
      await fetchAIRecords();
    } catch (err) {
      console.error("Error saving AI record:", err);
    }
  };

  const updateAIRecord = async (id, payload) => {
    try {
      const res = await fetch(`http://localhost:5000/api/swine-records/ai/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      console.log("Response from updateAIRecord:", data);
      if (!data.success) throw new Error(data.message);
      await fetchAIRecords();
    } catch (err) {
      console.error("Error updating AI record:", err);
    }
  };

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
    }
  };

  window.editAIRecord = async (id) => {
    try {
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
  await fetchSwines();
  await fetchPerformanceRecords();
  await fetchAIRecords();
});
