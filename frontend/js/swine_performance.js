import { authGuard } from "./authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  // 🔐 Protect page: allow farm_managers AND encoders
  const user = await authGuard(["farm_manager", "encoder"]); // ✅ get authenticated user
  if (!user) return; // stop execution if not logged in or access denied

  const performanceForm = document.getElementById("performanceForm");
  const aiForm = document.getElementById("aiForm");

  const swineSelect = document.getElementById("swineSelect");
  const femaleSwineSelect = document.getElementById("femaleSwineSelect");
  const maleSwineSelect = document.getElementById("maleSwineSelect");

  const performanceTableBody = document.querySelector("#performanceTable tbody");
  const aiTableBody = document.querySelector("#aiTable tbody");

  let editingPerformanceId = null;
  let editingAIId = null;

  // ✅ Use returned user info to determine managerId
  const managerId = user.role === "farm_manager" ? user.id : user.managerId;
  const token = localStorage.getItem("token"); // 🔐 for API requests

  const generateID = (prefix = "R") =>
    `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;

  // ❗ Safety check (same pattern as manage_swine.js)
  if (!managerId) {
    console.error("No managerId resolved for user:", user);
    alert("Your account is not linked to a farm manager.");
    return;
  }

  // Fetch Swines
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

  // Fetch Performance Records
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

  // Fetch AI Records
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

  // Performance Form Submit
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
      managerId: managerId,
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

  // AI Form Submit
  aiForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = Object.fromEntries(new FormData(aiForm).entries());
    const payload = {
      swine_id: formData.swine_id || formData.female_swine_id || formData.swineSelect,
      male_swine_id: formData.male_swine_id || formData.maleSwineSelect,
      insemination_date: formData.insemination_date || formData.inseminationDate,
      managerId: managerId,
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

  // Edit Functions
  window.editPerformance = async (id) => {
    try {
      const res = await fetch(`http://localhost:5000/api/swine-records/performance/${id}?managerId=${encodeURIComponent(managerId)}`);
      const data = await res.json();
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

  // Initial Load
  await fetchSwines();
  await fetchPerformanceRecords();
  await fetchAIRecords();
});
