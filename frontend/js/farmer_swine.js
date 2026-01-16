// farmer_swine.js
import { authGuard } from "./authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  // 🔐 Protect the page: only farmers
  await authGuard("farmer");

  const token = localStorage.getItem("token");
  const swineTableBody = document.querySelector("#swineTableBody");
  const loadingMessage = document.querySelector("#loadingMessage");

  // --- FUNCTION TO UPDATE HEALTH STATUS (Synced with Swine.js Model) ---
  async function updateHealthStatus(swineId, newStatus) {
    try {
      const response = await fetch(`http://localhost:5000/api/swine/update/${swineId}`, {
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
        // Visual feedback: brief highlight or toast could be added here
      }
    } catch (error) {
      console.error("Update Error:", error);
      alert("Server error while updating health status.");
    }
  }

  try {
    loadingMessage.textContent = "Loading your swine records...";

    // Ensure this matches your backend URL
    const response = await fetch(`http://localhost:5000/api/swine/farmer`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      credentials: "include",
    });

    // --- FIX: CHECK CONTENT TYPE BEFORE PARSING ---
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text(); 
        console.error("Server returned non-JSON response:", text);
        throw new Error("Server returned an invalid response (HTML instead of JSON). Check backend routes.");
    }

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
      // 1. Get the most recent measurement
      const latestPerf = swine.performance_records?.length > 0 
        ? swine.performance_records[swine.performance_records.length - 1] 
        : {};

      // 2. Format Deformities
      let deformityText = "None";
      let deformityColor = "green";

      if (latestPerf.deformities && Array.isArray(latestPerf.deformities)) {
        const activeDeformities = latestPerf.deformities.filter(d => d !== "None");
        if (activeDeformities.length > 0) {
          deformityText = activeDeformities.join(", ");
          deformityColor = "red";
        }
      } else if (latestPerf.deformities && latestPerf.deformities !== "None") {
        deformityText = latestPerf.deformities;
        deformityColor = "red";
      }

      const row = document.createElement("tr");
      row.innerHTML = `
        <td><strong>${swine.swine_id || "-"}</strong></td>
        <td>${swine.breed || "-"}</td>
        <td>${swine.color || "-"}</td>
        <td>${swine.sex || "-"}</td>
        
        <td>
          <select class="health-update-dropdown" data-id="${swine.swine_id}" style="padding: 4px; border-radius: 4px; border: 1px solid #ccc;">
            <option value="Healthy" ${swine.health_status === 'Healthy' ? 'selected' : ''}>Healthy</option>
            <option value="Sick" ${swine.health_status === 'Sick' ? 'selected' : ''}>Sick</option>
            <option value="Deceased (Before Weaning)" ${swine.health_status === 'Deceased (Before Weaning)' ? 'selected' : ''}>Deceased (Before Weaning)</option>
            <option value="Deceased" ${swine.health_status === 'Deceased' ? 'selected' : ''}>Deceased</option>
          </select>
        </td>

        <td>${swine.age_stage || "-"}</td> 
        <td><strong>${swine.current_status || "-"}</strong></td>
        <td>${swine.batch || "-"}</td>
        <td>${swine.date_registered ? new Date(swine.date_registered).toLocaleDateString() : "-"}</td>
        <td class="performance-cell">
          <ul style="list-style: none; padding: 0; margin: 0; font-size: 0.85rem;">
            <li><strong>Weight:</strong> ${latestPerf.weight ? latestPerf.weight + ' kg' : "-"}</li>
            <li><strong>Length:</strong> ${latestPerf.body_length || "-"} cm</li>
            <li><strong>Teeth:</strong> ${latestPerf.teeth_count || "-"}</li>
            <li><strong>Deformities:</strong> <span style="color: ${deformityColor}; font-weight: ${deformityColor === 'red' ? 'bold' : 'normal'}">
              ${deformityText}
            </span></li>
            <li><strong>Stage:</strong> ${latestPerf.stage || "Initial"}</li>
          </ul>
        </td>
      `;
      swineTableBody.appendChild(row);
    });

    // --- EVENT LISTENER FOR DROPDOWN CHANGES ---
    swineTableBody.addEventListener("change", (event) => {
      if (event.target.classList.contains("health-update-dropdown")) {
        const swineId = event.target.getAttribute("data-id");
        const newStatus = event.target.value;
        
        // Confirmation for irreversible status changes
        if (newStatus.includes("Deceased")) {
          if (!confirm(`Are you sure you want to mark Swine ${swineId} as Deceased? This is a permanent health record change.`)) {
            // Reset the dropdown if they cancel
            location.reload(); 
            return;
          }
        }
        
        updateHealthStatus(swineId, newStatus);
      }
    });

  } catch (error) {
    console.error("Error fetching swine:", error);
    loadingMessage.innerHTML = `<span style="color: red;">${error.message}</span>`;
  }
});