// farmer_swine.js
import { authGuard } from "./authGuard.js";
import { PerformanceHelper } from "./performance_helper.js"; // Integrated Helper

document.addEventListener("DOMContentLoaded", async () => {
  // 🔐 Protect the page: only farmers
  const user = await authGuard("farmer");
  if (!user) return;

  const token = localStorage.getItem("token");
  const swineTableBody = document.querySelector("#swineTableBody");
  const loadingMessage = document.querySelector("#loadingMessage");
  const BACKEND_URL = "http://localhost:5000";

  // Store data globally to access in the recordGrowth function
  let currentSwineData = [];

  // --- HELPER: SEND NOTIFICATIONS ---
  const sendAdminNotification = async (title, message, type = "info") => {
    try {
      await fetch(`${BACKEND_URL}/api/notifications/admin`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ title, message, type })
      });
    } catch (err) {
      console.error("Failed to notify admin:", err);
    }
  };

  // --- HELPER: DISPLAY FORMATTER ---
  const formatStageDisplay = (stage) => {
    const mapping = {
      'Monitoring (Day 1-30)': 'piglet',
      'Weaned (Monitoring 3 Months)': 'weaner',
      'Final Selection': 'selection',
      'adult': 'adult',
      'piglet': 'piglet'
    };
    return mapping[stage] || stage;
  };

  // --- FUNCTION TO UPDATE HEALTH STATUS ---
  async function updateHealthStatus(swineId, newStatus) {
    try {
      const response = await fetch(`${BACKEND_URL}/api/swine/update/${swineId}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ health_status: newStatus }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        alert("Error: " + (data.message || "Failed to update health status."));
      } else {
        if (newStatus === "Sick" || newStatus === "Deceased") {
          const nType = newStatus === "Deceased" ? "error" : "warning";
          await sendAdminNotification(
            `Health Alert: ${swineId}`,
            `Farmer ${user.first_name} marked ${swineId} as ${newStatus}.`,
            nType
          );
        }
      }
    } catch (error) {
      console.error("Update Error:", error);
      alert("Server error while updating health status.");
    }
  }

  // --- UPDATED: FUNCTION TO RECORD MONTHLY GROWTH ---
  window.recordGrowth = async (swineId) => {
    const swine = currentSwineData.find(s => s.swine_id === swineId);
    const today = new Date();
    const currentMonthYear = `${today.getMonth() + 1}-${today.getFullYear()}`;

    // Check if a record exists for this month
    const existingRecordIndex = swine.performance_records?.findIndex(rec => {
      const recDate = new Date(rec.record_date);
      return (recDate.getMonth() === today.getMonth() && recDate.getFullYear() === today.getFullYear());
    });

    if (existingRecordIndex !== -1) {
      const confirmOverwrite = confirm(`A record for this month already exists. Do you want to overwrite it with new data?`);
      if (!confirmOverwrite) return;
    }

    const weight = prompt(`[Monthly Update]\nEnter Weight (kg):`);
    if (weight === null) return; 

    const length = prompt("Enter Body Length (cm):");
    const girth = prompt("Enter Heart Girth (cm):");
    const teeth = prompt("Enter Teeth Count:");
    const deformity = prompt("Enter Deformities (leave blank for 'None'):") || "None";
    
    const payload = {
      // Pass a flag so the backend knows to replace the existing monthly entry if necessary
      overwrite_monthly: existingRecordIndex !== -1,
      performance_records: {
        weight: parseFloat(weight),
        body_length: parseFloat(length),
        heart_girth: parseFloat(girth),
        teeth_count: parseInt(teeth),
        deformities: [deformity],
        stage: swine.current_status,
        record_date: new Date()
      }
    };

    try {
      const res = await fetch(`${BACKEND_URL}/api/swine/update/${swineId}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        alert(`Monthly update saved for ${swineId}!`);
        await sendAdminNotification(
          "Monthly Growth Updated",
          `Farmer ${user.first_name} updated ${swineId}. Weight: ${weight}kg, Girth: ${girth}cm.`,
          "info"
        );
        location.reload(); 
      } else {
        alert("Error: " + data.message);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to save growth record.");
    }
  };

  try {
    loadingMessage.textContent = "Loading your swine records...";

    const response = await fetch(`${BACKEND_URL}/api/swine/farmer`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      credentials: "include",
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      loadingMessage.textContent = data.message || "Failed to fetch swine.";
      return;
    }

    currentSwineData = data.swine; // Save for the recordGrowth function
    swineTableBody.innerHTML = "";
    
    if (!data.swine || data.swine.length === 0) {
      loadingMessage.textContent = "You don't have any assigned swine yet.";
      return;
    }

    loadingMessage.textContent = "";

    data.swine.forEach(swine => {
      const records = swine.performance_records || [];
      const latestPerf = records.length > 0 ? records[records.length - 1] : {};
      
      // Calculate Average Daily Gain (ADG) if at least 2 records exist
      let adgDisplay = "N/A";
      if (records.length >= 2) {
        const last = records[records.length - 1];
        const prev = records[records.length - 2];
        const weightDiff = last.weight - prev.weight;
        const dateDiff = (new Date(last.record_date) - new Date(prev.record_date)) / (1000 * 60 * 60 * 24);
        if (dateDiff > 0) {
          adgDisplay = `${(weightDiff / dateDiff).toFixed(3)} kg/day`;
        }
      }

      const statusResult = PerformanceHelper.getSelectionStatus(swine);

      // Format Deformities
      let deformityText = "None";
      let deformityColor = "green";
      const activeDeformities = (latestPerf.deformities || []).filter(d => d !== "None");
      if (activeDeformities.length > 0) {
          deformityText = activeDeformities.join(", ");
          deformityColor = "red";
      }

      const row = document.createElement("tr");
      row.innerHTML = `
        <td><strong>${swine.swine_id || "-"}</strong></td>
        <td>${swine.breed || "-"}</td>
        <td>${swine.sex || "-"}</td>
        
        <td>
          <select class="health-update-dropdown" data-id="${swine.swine_id}">
            <option value="Healthy" ${swine.health_status === 'Healthy' ? 'selected' : ''}>Healthy</option>
            <option value="Sick" ${swine.health_status === 'Sick' ? 'selected' : ''}>Sick</option>
            <option value="Deceased" ${swine.health_status === 'Deceased' ? 'selected' : ''}>Deceased</option>
          </select>
        </td>

        <td>${formatStageDisplay(swine.age_stage)}</td> 
        <td>
            <strong>${swine.current_status || "-"}</strong><br>
            <span style="font-size: 0.8rem; font-weight: bold; color: ${statusResult.color}; background: ${statusResult.bg || 'transparent'}; padding: 2px 4px; border-radius: 3px;">
                ${statusResult.suggestion}
            </span>
        </td>
        
        <td class="performance-cell">
          <ul style="list-style: none; padding: 0; margin: 0; font-size: 0.85rem;">
            <li><strong>Weight:</strong> ${latestPerf.weight ? latestPerf.weight + ' kg' : "-"}</li>
            <li><strong>Dimensions:</strong> ${latestPerf.body_length || '-'}L / ${latestPerf.heart_girth || '-'}G</li>
            <li><strong>ADG:</strong> <span class="text-primary">${adgDisplay}</span></li>
            <li><strong>Deformities:</strong> <span style="color: ${deformityColor};"> ${deformityText} </span></li>
          </ul>
          
          <button onclick="recordGrowth('${swine.swine_id}')" class="btn-update-growth">
            Monthly Update
          </button>
        </td>
      `;
      swineTableBody.appendChild(row);
    });

    swineTableBody.addEventListener("change", (event) => {
      if (event.target.classList.contains("health-update-dropdown")) {
        const swineId = event.target.getAttribute("data-id");
        const newStatus = event.target.value;
        if (newStatus === "Deceased" && !confirm(`Confirm Deceased status for ${swineId}?`)) {
            location.reload(); 
            return;
        }
        updateHealthStatus(swineId, newStatus);
      }
    });

  } catch (error) {
    console.error("Error:", error);
    loadingMessage.innerHTML = `<span style="color: red;">${error.message}</span>`;
  }
});