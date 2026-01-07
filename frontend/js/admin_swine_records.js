// admin_swine_records.js
import { authGuard } from "./authGuard.js"; // 🔐 import authGuard

document.addEventListener("DOMContentLoaded", async () => {
  // 🔐 Protect the page
  await authGuard("admin"); // only admins

  const performanceTableBody = document.getElementById("performanceTableBody");
  const aiTableBody = document.getElementById("aiTableBody");

  const BACKEND_URL = "http://localhost:5000";
  const token = localStorage.getItem("token"); // include token for secure requests

  // Fetch Swine Performance Records
  async function loadPerformanceRecords() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/swine-records/performance/all`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      performanceTableBody.innerHTML = "";

      data.records.forEach(record => {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${record.reproduction_id}</td>
          <td>${record.swine_id?.swine_id || "Unknown"}</td>
          <td>${record.parent_type}</td>
          <td>${new Date(record.record_date).toLocaleDateString()}</td>
          <td>${record.weight || "-"}</td>
          <td>${record.body_length || "-"}</td>
          <td>${record.heart_girth || "-"}</td>
          <td>
            <button onclick="editPerformance('${record._id}')">Edit</button>
          </td>
        `;
        performanceTableBody.appendChild(row);
      });
    } catch (err) {
      console.error("Error loading performance records:", err);
      performanceTableBody.innerHTML = "<tr><td colspan='8'>Failed to load records</td></tr>";
    }
  }

  // Fetch AI Records
  async function loadAIRecords() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/swine-records/ai/all`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      aiTableBody.innerHTML = "";

      data.records.forEach(record => {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${record.insemination_id}</td>
          <td>${record.swine_id?.swine_id || "Unknown"}</td>
          <td>${new Date(record.insemination_date).toLocaleDateString()}</td>
          <td>${record.male_swine_id || "-"}</td>
          <td>
            <button onclick="editAIRecord('${record._id}')">Edit</button>
          </td>
        `;
        aiTableBody.appendChild(row);
      });
    } catch (err) {
      console.error("Error loading AI records:", err);
      aiTableBody.innerHTML = "<tr><td colspan='5'>Failed to load records</td></tr>";
    }
  }

  // Add New Performance Record
  document.getElementById("addPerformanceBtn").addEventListener("click", async () => {
    try {
      const swineId = prompt("Enter Swine ID:");
      const parentType = prompt("Parent Type (Sire/Dam):");
      const recordDate = prompt("Record Date (YYYY-MM-DD):");
      const weight = prompt("Weight:");
      const bodyLength = prompt("Body Length:");
      const heartGirth = prompt("Heart Girth:");

      const payload = {
        swine_id: swineId,
        parent_type: parentType,
        record_date: recordDate,
        weight,
        body_length: bodyLength,
        heart_girth: heartGirth
      };

      const res = await fetch(`${BACKEND_URL}/api/swine-records/performance/add`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      alert("Performance record added!");
      loadPerformanceRecords();
    } catch (err) {
      console.error("Error adding performance record:", err);
      alert("Failed to add record");
    }
  });

  // Add New AI Record
  document.getElementById("addAIRecordBtn").addEventListener("click", async () => {
    try {
      const swineId = prompt("Enter Female Swine ID:");
      const inseminationDate = prompt("Insemination Date (YYYY-MM-DD):");
      const maleSwineId = prompt("Male Swine ID:");

      const payload = { swine_id: swineId, insemination_date: inseminationDate, male_swine_id: maleSwineId };

      const res = await fetch(`${BACKEND_URL}/api/swine-records/ai/add`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      alert("AI record added!");
      loadAIRecords();
    } catch (err) {
      console.error("Error adding AI record:", err);
      alert("Failed to add AI record");
    }
  });

  // Placeholder Edit Functions
  window.editPerformance = (id) => alert(`Edit Performance Record ID: ${id}`);
  window.editAIRecord = (id) => alert(`Edit AI Record ID: ${id}`);

  // Initial Load
  loadPerformanceRecords();
  loadAIRecords();
});
