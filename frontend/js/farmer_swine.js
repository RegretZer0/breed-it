// farmer_swine.js
import { authGuard } from "./authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  // 🔐 Protect the page: only farmers
  await authGuard("farmer");

  const token = localStorage.getItem("token");
  const swineTableBody = document.querySelector("#swineTableBody");
  const loadingMessage = document.querySelector("#loadingMessage");

  try {
    loadingMessage.textContent = "Loading your swine records...";

    const response = await fetch(`http://localhost:5000/api/swine/farmer`, {
      headers: {
        "Authorization": `Bearer ${token}`,
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
      // 1. Get the most recent measurement from the performance_records array
      const latestPerf = swine.performance_records?.length > 0 
        ? swine.performance_records[swine.performance_records.length - 1] 
        : {};

      // 2. Format Deformities array into a readable string
      let deformityText = "None";
      let deformityColor = "green";

      if (latestPerf.deformities && Array.isArray(latestPerf.deformities)) {
        // Filter out "None" if other deformities exist, then join with commas
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
        <td><span class="status-badge">${swine.health_status || "Healthy"}</span></td>
        <td>${swine.age_stage || "-"}</td> 
        <td><strong>${swine.current_status || "-"}</strong></td>
        <td>${swine.batch || "-"}</td>
        <td>${swine.date_registered ? new Date(swine.date_registered).toLocaleDateString() : "-"}</td>
        <td class="performance-cell">
          <ul>
            <li><strong>Weight:</strong> ${latestPerf.weight ? latestPerf.weight + ' kg' : "-"}</li>
            <li><strong>Body Length:</strong> ${latestPerf.body_length || "-"} cm</li>
            <li><strong>Teeth Count:</strong> ${latestPerf.teeth_count || "-"}</li>
            <li><strong>Deformities:</strong> <span style="color: ${deformityColor}; font-weight: ${deformityColor === 'red' ? 'bold' : 'normal'}">
              ${deformityText}
            </span></li>
            <li><strong>Stage:</strong> ${latestPerf.stage || "Initial Selection"}</li>
          </ul>
        </td>
      `;
      swineTableBody.appendChild(row);
    });
  } catch (error) {
    console.error("Error fetching swine:", error);
    loadingMessage.textContent = "Server error occurred while loading swine.";
  }
});