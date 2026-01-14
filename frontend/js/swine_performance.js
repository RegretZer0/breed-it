import { authGuard } from "./authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  // 🔐 Protect page
  const user = await authGuard(["farm_manager", "encoder"]);
  if (!user) return;

  const performanceForm = document.getElementById("performanceForm");
  const aiForm = document.getElementById("aiForm");

  const swineSelect = document.getElementById("swineSelect");
  const femaleSwineSelect = document.getElementById("femaleSwineSelect");
  const maleSwineSelect = document.getElementById("maleSwineSelect");

  const performanceTableBody = document.querySelector("#performanceTable tbody");
  const aiTableBody = document.querySelector("#aiTable tbody");

  let editingPerformanceId = null;
  let editingAIId = null;

  // Determine managerId based on user role
  const managerId = user.role === "farm_manager" ? user.id : user.managerId;
  const token = localStorage.getItem("token");

  const generateID = (prefix = "R") =>
    `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;

  if (!managerId) {
    console.error("No managerId resolved for user:", user);
    alert("Your account is not linked to a farm manager.");
    return;
  }

  // ----------------------
  // Fetch Swines
  // ----------------------
  const fetchSwines = async () => {
    try {
      const res = await fetch(`http://localhost:5000/api/swine/all?managerId=${encodeURIComponent(managerId)}`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      swineSelect.innerHTML = "";
      femaleSwineSelect.innerHTML = "";
      maleSwineSelect.innerHTML = "";

      (data.swine || []).forEach((s) => {
        const option = `<option value="${s._id}">${s.swine_id} (${s.breed || "-"})</option>`;
        swineSelect.innerHTML += option;
        if (s.sex?.toLowerCase() === "female") femaleSwineSelect.innerHTML += option;
        if (s.sex?.toLowerCase() === "male") maleSwineSelect.innerHTML += option;
      });
    } catch (err) {
      console.error("Failed to fetch swines:", err);
    }
  };

  // ----------------------
  // Fetch Performance Records
  // ----------------------
  const fetchPerformanceRecords = async () => {
    try {
      const res = await fetch(`http://localhost:5000/api/swine-records/performance/all?managerId=${encodeURIComponent(managerId)}`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      const data = await res.json();
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

  // ----------------------
  // Fetch AI Records
  // ----------------------
  const fetchAIRecords = async () => {
    try {
      const res = await fetch(`http://localhost:5000/api/swine-records/ai/all?managerId=${encodeURIComponent(managerId)}`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      const data = await res.json();
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

  // ----------------------
  // Save / Update Functions
  // ----------------------
  const savePerformance = async (payload) => {
    try {
      const res = await fetch("http://localhost:5000/api/swine-records/performance/add", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Failed to save performance");
      fetchPerformanceRecords();
    } catch (err) {
      console.error("Error saving performance:", err);
      alert("Error saving performance: " + err.message);
    }
  };

  const updatePerformance = async (id, payload) => {
    try {
      const res = await fetch(`http://localhost:5000/api/swine-records/performance/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Failed to update performance");
      fetchPerformanceRecords();
    } catch (err) {
      console.error("Error updating performance:", err);
      alert("Error updating performance: " + err.message);
    }
  };

  const saveAIRecord = async (payload) => {
    try {
      const res = await fetch("http://localhost:5000/api/swine-records/ai/add", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Failed to save AI record");
      fetchAIRecords();
    } catch (err) {
      console.error("Error saving AI record:", err);
      alert("Error saving AI record: " + err.message);
    }
  };

  const updateAIRecord = async (id, payload) => {
    try {
      const res = await fetch(`http://localhost:5000/api/swine-records/ai/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Failed to update AI record");
      fetchAIRecords();
    } catch (err) {
      console.error("Error updating AI record:", err);
      alert("Error updating AI record: " + err.message);
    }
  };

  // ----------------------
  // Edit Functions
  // ----------------------
  window.editPerformance = async (id) => {
    try {
      const res = await fetch(`http://localhost:5000/api/swine-records/performance/${id}?managerId=${encodeURIComponent(managerId)}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      const r = data.record;
      editingPerformanceId = id;
      swineSelect.value = r.swine_id?._id || "";
      performanceForm.parentType.value = r.parentType || r.parent_type || "";
      performanceForm.recordDate.value = r.recordDate || "";
      performanceForm.weight.value = r.weight || "";
      performanceForm.bodyLength.value = r.bodyLength || r.body_length || "";
      performanceForm.heartGirth.value = r.heartGirth || r.heart_girth || "";
      performanceForm.color.value = r.color || "";
      performanceForm.teethCount.value = r.teethCount || r.teeth_count || "";
      performanceForm.teethAlignment.value = r.teethAlignment || r.teeth_alignment || "";
      performanceForm.legConformation.value = r.legConformation || r.leg_conformation || "";
      performanceForm.hoofCondition.value = r.hoofCondition || r.hoof_condition || "";
      performanceForm.bodySymmetryAndMuscling.value = r.bodySymmetryAndMuscling || r.body_symmetry_and_muscling || "";
      performanceForm.noOfPiglets.value = r.noOfPiglets || r.no_of_piglets || "";
    } catch (err) {
      console.error(err);
    }
  };

  window.editAIRecord = async (id) => {
    try {
      const res = await fetch(`http://localhost:5000/api/swine-records/ai/${id}?managerId=${encodeURIComponent(managerId)}`);
      const data = await res.json();
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

  // ----------------------
  // Generate Breeding Analytics Report
  // ----------------------
  const generateReportBtn = document.getElementById("generateReportBtn");
  const reportOutput = document.getElementById("reportOutput");

  generateReportBtn.addEventListener("click", async () => {
    try {
      reportOutput.innerHTML = "Generating report...";
      const res = await fetch("http://localhost:5000/api/breeding/report", {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      let html = "<h4>Performance Scores</h4><ul>";
      data.performance_scores.forEach(p => {
        html += `<li>${p.swine_id}: ${p.performance_score}</li>`;
      });
      html += "</ul>";

      html += "<h4>Reproduction Scores</h4><ul>";
      data.reproduction_scores.forEach(r => {
        html += `<li>${r.swine_id}: ${r.reproduction_score} (Piglets: ${r.total_piglets}, Age: ${r.age_months}m)</li>`;
      });
      html += "</ul>";

      html += "<h4>Compatibility Scores</h4><ul>";
      data.compatibility_scores.forEach(c => {
        html += `<li>${c.female} + ${c.male}: ${c.compatibility_score}</li>`;
      });
      html += "</ul>";

      html += "<h4>Ranking by Performance</h4><ol>";
      data.ranking_performance.forEach(r => {
        html += `<li>${r.swine_id} - ${r.performance_score}</li>`;
      });
      html += "</ol>";

      html += "<h4>Ranking by Compatibility</h4><ol>";
      data.ranking_compatibility.forEach(r => {
        html += `<li>${r.female} + ${r.male}: ${r.compatibility_score}</li>`;
      });
      html += "</ol>";

      reportOutput.innerHTML = html;
    } catch (err) {
      console.error("Error generating report:", err);
      reportOutput.innerHTML = `<span style="color:red;">Error: ${err.message}</span>`;
    }
  });

  // ----------------------
  // Initial Load
  // ----------------------
  await fetchSwines();
  await fetchPerformanceRecords();
  await fetchAIRecords();
});
