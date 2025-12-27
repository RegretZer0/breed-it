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

  const generateID = (prefix = "R") => `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;

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
    }

    swines.forEach(s => {
      console.log("Adding swine to dropdown:", s);
      const option = `<option value="${s._id}">${s.swine_id} (${s.breed || "-"})</option>`;
      swineSelect.innerHTML += option;
      if (s.sex.toLowerCase() === "female") femaleSwineSelect.innerHTML += option;
      if (s.sex.toLowerCase() === "male") maleSwineSelect.innerHTML += option;
    });

  } catch (err) {
    console.error("Failed to fetch swines:", err);
    swineSelect.innerHTML = "<option value=''>Failed to load swines</option>";
    femaleSwineSelect.innerHTML = "<option value=''>Failed to load females</option>";
    maleSwineSelect.innerHTML = "<option value=''>Failed to load males</option>";
  }
};


  // Submit performance form
  performanceForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(performanceForm);
    const payload = Object.fromEntries(formData.entries());

    if (!editingPerformanceId) {
      payload.reproduction_id = generateID("R");
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
      if (!data.success) throw new Error(data.message);
      alert("Performance record saved!");
      fetchPerformanceRecords();
    } catch (err) {
      console.error("Error saving performance:", err);
      alert("Failed to save performance");
    }
  };

  const updatePerformance = async (id, payload) => {
    try {
      const res = await fetch(`http://localhost:5000/api/swine/performance/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      alert("Performance record updated!");
      fetchPerformanceRecords();
    } catch (err) {
      console.error("Error updating performance:", err);
      alert("Failed to update performance");
    }
  };

  // Submit AI form
  aiForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(aiForm);
    const payload = Object.fromEntries(formData.entries());

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
      if (!data.success) throw new Error(data.message);
      alert("AI record saved!");
      fetchAIRecords();
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
      if (!data.success) throw new Error(data.message);
      alert("AI record updated!");
      fetchAIRecords();
    } catch (err) {
      console.error("Error updating AI record:", err);
      alert("Failed to update AI record");
    }
  };

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
    }
  };

  window.editAIRecord = async (id) => {
    try {
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
  await fetchSwines();
  await fetchPerformanceRecords();
  await fetchAIRecords();
});
