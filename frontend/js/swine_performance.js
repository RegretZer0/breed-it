document.addEventListener("DOMContentLoaded", async () => {
  const performanceForm = document.getElementById("performanceForm");
  const aiForm = document.getElementById("aiForm");

  const swineSelect = document.getElementById("swineSelect");
  const femaleSwineSelect = document.getElementById("femaleSwineSelect");
  const maleSwineSelect = document.getElementById("maleSwineSelect");

  const performanceTableBody = document.querySelector("#performanceTable tbody");
  const aiTableBody = document.querySelector("#aiTable tbody");

  let editingPerformanceId = null;
  let editingAIId = null;

  const userId = "PUT_ADMIN_ID_HERE";
  const role = "admin";

  const generateID = (prefix = "R") =>
    `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;

  // Fetch Swines
  const fetchSwines = async () => {
    try {
      const res = await fetch(
        `http://localhost:5000/api/swine/all?userId=${userId}&role=${role}`
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      const swines = data.swine;

      swineSelect.innerHTML = "<option value=''>Select Swine</option>";
      femaleSwineSelect.innerHTML = "<option value=''>Select Female Swine</option>";
      maleSwineSelect.innerHTML = "<option value=''>Select Male Swine</option>";

      swines.forEach((s) => {
        const option = `<option value="${s._id}">${s.swine_id} (${s.breed || "-"})</option>`;
        swineSelect.innerHTML += option;
        if (s.sex.toLowerCase() === "female") femaleSwineSelect.innerHTML += option;
        if (s.sex.toLowerCase() === "male") maleSwineSelect.innerHTML += option;
      });
    } catch (err) {
      console.error("Failed to fetch swines:", err);
    }
  };

  // Fetch Performance Records
  const fetchPerformanceRecords = async () => {
    try {
      const res = await fetch("http://localhost:5000/api/swine-records/performance/all");
      const data = await res.json();

      if (!data.success) throw new Error(data.message);

      performanceTableBody.innerHTML = "";
      data.records.forEach((record) => {
        const row = `
          <tr>
            <td>${record.swine_id?.swine_id || "-"}</td>
            <td>${record.parentType || "-"}</td>
            <td>${record.recordDate ? record.recordDate.split("T")[0] : "-"}</td>
            <td>${record.weight || "-"}</td>
            <td>${record.bodyLength || "-"}</td>
            <td>${record.heartGirth || "-"}</td>
            <td>${record.color || "-"}</td>
            <td>${record.teethCount || "-"}</td>
            <td>${record.teethAlignment || "-"}</td>
            <td>${record.legConformation || "-"}</td>
            <td>${record.hoofCondition || "-"}</td>
            <td>${record.bodySymmetryAndMuscling || "-"}</td>
            <td>${record.noOfPiglets || "-"}</td>
            <td><button onclick="editPerformance('${record._id}')">Edit</button></td>
          </tr>`;
        performanceTableBody.innerHTML += row;
      });
    } catch (err) {
      console.error("Failed to fetch performance records:", err);
    }
  };

  // Fetch AI Records
  const fetchAIRecords = async () => {
    try {
      const res = await fetch("http://localhost:5000/api/swine-records/ai/all");
      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      aiTableBody.innerHTML = "";
      data.records.forEach((record) => {
        const row = `
          <tr>
            <td>${record.swine_id?.swine_id || "-"}</td>
            <td>${record.male_swine_id?.swine_id || "-"}</td>
            <td>${record.insemination_date ? record.insemination_date.split("T")[0] : "-"}</td>
            <td><button onclick="editAIRecord('${record._id}')">Edit</button></td>
          </tr>`;
        aiTableBody.innerHTML += row;
      });
    } catch (err) {
      console.error("Failed to fetch AI records:", err);
    }
  };

  // Submit Performance Form
  performanceForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = Object.fromEntries(new FormData(performanceForm).entries());

    const payload = {
      reproductionId: generateID("R"),
      swine_id: formData.swine_id,
      parentType: formData.parentType || formData.parent_type || "",
      weight: formData.weight ? Number(formData.weight) : undefined,
      bodyLength: formData.bodyLength ? Number(formData.bodyLength) : undefined,
      heartGirth: formData.heartGirth ? Number(formData.heartGirth) : undefined,
      color: formData.color || "",
      teethCount: formData.teethCount ? Number(formData.teethCount) : undefined,
      teethAlignment: formData.teethAlignment || "",
      legConformation: formData.legConformation || "",
      hoofCondition: formData.hoofCondition || "",
      bodySymmetryAndMuscling: formData.bodySymmetryAndMuscling || "",
      noOfPiglets: formData.noOfPiglets ? Number(formData.noOfPiglets) : undefined,
    };

    if (!editingPerformanceId) {
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
      if (!data.success) throw new Error(data.message);

      alert("Performance record saved!");
      fetchPerformanceRecords();
    } catch (err) {
      console.error("Error saving performance:", err);
    }
  };

  const updatePerformance = async (id, payload) => {
    try {
      const res = await fetch(
        `http://localhost:5000/api/swine-records/performance/${id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      alert("Performance record updated!");
      fetchPerformanceRecords();
    } catch (err) {
      console.error("Error updating performance:", err);
    }
  };

  // Submit AI Form
  aiForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = Object.fromEntries(new FormData(aiForm).entries());

    const payload = {
      insemination_id: generateID("AI"),
      swine_id: formData.swine_id,
      male_swine_id: formData.male_swine_id,
      insemination_date: formData.insemination_date,
    };

    if (!editingAIId) {
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
      if (!data.success) throw new Error(data.message);

      alert("AI record saved!");
      fetchAIRecords();
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
      if (!data.success) throw new Error(data.message);

      alert("AI record updated!");
      fetchAIRecords();
    } catch (err) {
      console.error("Error updating AI record:", err);
    }
  };

  // Generate Breeding Report with HTML tables
  document.getElementById("generateReportBtn").addEventListener("click", async () => {
    try {
      const response = await fetch("http://localhost:5000/api/breeding/report");
      const result = await response.json();

      const box = document.getElementById("reportOutput");
      box.style.display = "block";

      const renderTable = (data, headers) => {
        if (!data || !data.length) return "<p>No data available</p>";
        let html = "<table border='1' cellpadding='5' cellspacing='0'><tr>";
        headers.forEach(h => html += `<th>${h}</th>`);
        html += "</tr>";
        data.forEach(item => {
          html += "<tr>";
          headers.forEach(h => html += `<td>${item[h] !== undefined ? item[h] : '-'}</td>`);
          html += "</tr>";
        });
        html += "</table>";
        return html;
      };

      box.innerHTML = `
        <h3>Breeding Analytics Report</h3>
        <h4>Performance Scores</h4>
        ${renderTable(result.performance_scores, ["swine_id", "performance_score"])}
        <h4>Reproduction Scores</h4>
        ${renderTable(result.reproduction_scores, ["swine_id", "reproduction_score"])}
        <h4>Compatibility Scores</h4>
        ${renderTable(result.compatibility_scores, ["female", "male", "compatibility_score"])}
        <h4>Ranking</h4>
        ${renderTable(result.ranking, ["swine_id", "performance_score"])}
      `;
    } catch (error) {
      alert("Failed to generate report.");
      console.error(error);
    }
  });

  // Edit Performance
  window.editPerformance = async (id) => {
    try {
      const res = await fetch("http://localhost:5000/api/swine-records/performance/all");
      const data = await res.json();
      const record = data.records.find((r) => r._id === id);
      if (!record) throw new Error("Record not found");

      editingPerformanceId = id;
      swineSelect.value = record.swine_id?._id || "";
      performanceForm.parentType.value = record.parentType || "";
      performanceForm.weight.value = record.weight || "";
      performanceForm.bodyLength.value = record.bodyLength || "";
      performanceForm.heartGirth.value = record.heartGirth || "";
      performanceForm.color.value = record.color || "";
      performanceForm.teethCount.value = record.teethCount || "";
      performanceForm.teethAlignment.value = record.teethAlignment || "";
      performanceForm.legConformation.value = record.legConformation || "";
      performanceForm.hoofCondition.value = record.hoofCondition || "";
      performanceForm.bodySymmetryAndMuscling.value = record.bodySymmetryAndMuscling || "";
      performanceForm.noOfPiglets.value = record.noOfPiglets || "";
    } catch (err) {
      console.error(err);
      alert("Failed to load record for editing");
    }
  };

  // Edit AI Record
  window.editAIRecord = async (id) => {
    try {
      const res = await fetch("http://localhost:5000/api/swine-records/ai/all");
      const data = await res.json();
      const record = data.records.find((r) => r._id === id);
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

  // Initial Load
  await fetchSwines();
  await fetchPerformanceRecords();
  await fetchAIRecords();
});
