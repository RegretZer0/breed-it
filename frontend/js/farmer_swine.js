// farmer_swine.js
import { authGuard } from "./authGuard.js";
import { PerformanceHelper } from "./performance_helper.js"; // Integrated Helper

document.addEventListener("DOMContentLoaded", async () => {
  // 🔐 Protect the page: only farmers
  await authGuard("farmer");

  const token = localStorage.getItem("token");
  const swineTableBody = document.querySelector("#swineTableBody");
  const loadingMessage = document.querySelector("#loadingMessage");
  const BACKEND_URL = "http://localhost:5000";

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
        console.log(`Swine ${swineId} database updated to: ${newStatus}`);
      }
    } catch (error) {
      console.error("Update Error:", error);
      alert("Server error while updating health status.");
    }
  }

  // --- FUNCTION TO RECORD GROWTH (PERFORMANCE) ---
  window.recordGrowth = async (swineId, currentStatus) => {
    const nextStage = PerformanceHelper.getNextStage(currentStatus);
    
    const weight = prompt(`[Recording for ${nextStage}]\nEnter Weight (kg):`);
    if (weight === null) return; 

    const length = prompt("Enter Body Length (cm):");
    const teeth = prompt("Enter Teeth Count:");
    const deformity = prompt("Enter Deformities (leave blank for 'None'):") || "None";
    
    const payload = {
      current_status: nextStage, 
      performance_records: {
        weight: parseFloat(weight),
        body_length: parseFloat(length),
        teeth_count: parseInt(teeth),
        deformities: [deformity],
        stage: nextStage,
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
        alert(`Record added! Swine status moved to: ${nextStage}`);
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

    swineTableBody.innerHTML = "";
    if (!data.swine || data.swine.length === 0) {
      loadingMessage.textContent = "You don't have any assigned swine yet.";
      return;
    }

    loadingMessage.textContent = "";

    data.swine.forEach(swine => {
      const latestPerf = swine.performance_records?.length > 0 
        ? swine.performance_records[swine.performance_records.length - 1] 
        : {};

      const monitoringStages = [
        "Monitoring (Day 1-30)",
        "Weaned (Monitoring 3 Months)",
        "Final Selection"
      ];
      
      const isPigletInPipeline = monitoringStages.includes(swine.current_status);
      const isAllowedToUpdate = PerformanceHelper.isUpdateAllowed(swine.current_status);
      const statusResult = PerformanceHelper.getSelectionStatus(swine);

      // --- TIMER CALCULATIONS ---
      // Start from record_date of the last update, or transfer date if it's the first phase
      const phaseStartDate = latestPerf.record_date 
        ? new Date(latestPerf.record_date) 
        : new Date(swine.date_transfer || swine.createdAt);
      
      const today = new Date();
      const diffTime = today - phaseStartDate;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      let daysRequired = 0;
      let isTimerComplete = true;
      let daysLeft = 0;

      if (swine.current_status === "Monitoring (Day 1-30)") {
        daysRequired = 30;
      } else if (swine.current_status === "Weaned (Monitoring 3 Months)") {
        daysRequired = 90; // 3 months roughly
      }

      if (daysRequired > 0) {
        daysLeft = daysRequired - diffDays;
        isTimerComplete = diffDays >= daysRequired;
      }

      // Format Deformities
      let deformityText = "None";
      let deformityColor = "green";
      if (latestPerf.deformities && Array.isArray(latestPerf.deformities)) {
        const activeDeformities = latestPerf.deformities.filter(d => d !== "None");
        if (activeDeformities.length > 0) {
          deformityText = activeDeformities.join(", ");
          deformityColor = "red";
        }
      }

      const row = document.createElement("tr");
      row.innerHTML = `
        <td><strong>${swine.swine_id || "-"}</strong></td>
        <td>${swine.breed || "-"}</td>
        <td>${swine.sex || "-"}</td>
        
        <td>
          <select class="health-update-dropdown" data-id="${swine.swine_id}" style="padding: 4px; border-radius: 4px;">
            <option value="Healthy" ${swine.health_status === 'Healthy' ? 'selected' : ''}>Healthy</option>
            <option value="Sick" ${swine.health_status === 'Sick' ? 'selected' : ''}>Sick</option>
            <option value="Deceased" ${swine.health_status === 'Deceased' ? 'selected' : ''}>Deceased</option>
          </select>
        </td>

        <td>${formatStageDisplay(swine.age_stage)}</td> 
        <td>
            <strong>${swine.current_status || "-"}</strong><br>
            ${isPigletInPipeline ? `
              <span style="font-size: 0.8rem; font-weight: bold; color: ${statusResult.color}; background: ${statusResult.bg || 'transparent'}; padding: 2px 4px; border-radius: 3px;">
                  ${statusResult.suggestion}
              </span>
            ` : `<small style="color: #666;">Standard Record</small>`}
        </td>
        
        <td class="performance-cell">
          <ul style="list-style: none; padding: 0; margin: 0; font-size: 0.85rem;">
            <li><strong>Weight:</strong> ${latestPerf.weight ? latestPerf.weight + ' kg' : "-"}</li>
            <li><strong>Deformities:</strong> <span style="color: ${deformityColor};"> ${deformityText} </span></li>
            <li><strong>Recorded at:</strong> ${latestPerf.stage || "Initial"}</li>
          </ul>
          
          ${isPigletInPipeline ? (
            isAllowedToUpdate ? (
              (!isTimerComplete) ? `
                <div style="margin-top: 5px; font-size: 0.75rem; color: #e67e22; font-weight: bold;">
                  Locked: ${daysLeft} days left
                </div>
              ` : `
                <button onclick="recordGrowth('${swine.swine_id}', '${swine.current_status}')" style="margin-top: 5px; cursor: pointer; padding: 2px 8px; background: #3498db; color: white; border: none; border-radius: 3px; font-size: 0.75rem;">
                  Update Growth
                </button>
              `
            ) : `
              <div style="margin-top: 5px; font-size: 0.7rem; color: #888; font-style: italic;">
                Final Selection Pending...
              </div>
            `
          ) : `
            <div style="margin-top: 5px; font-size: 0.7rem; color: #2e7d32; font-weight: bold;">
              Cycle active
            </div>
          `}
        </td>
      `;
      swineTableBody.appendChild(row);
    });

    swineTableBody.addEventListener("change", (event) => {
      if (event.target.classList.contains("health-update-dropdown")) {
        const swineId = event.target.getAttribute("data-id");
        const newStatus = event.target.value;
        if (newStatus.includes("Deceased") && !confirm(`Confirm Deceased status?`)) {
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