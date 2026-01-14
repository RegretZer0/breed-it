// admin_heat_reports.js
import { authGuard } from "./authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  // ---------------- AUTHENTICATION ----------------
  const user = await authGuard(["farm_manager", "encoder"]);
  if (!user) return;

  const token = localStorage.getItem("token");
  const BACKEND_URL = "http://localhost:5000";

  // ---------------- DOM ELEMENTS ----------------
  const tableBody = document.getElementById("reportsTableBody");
  const reportDetails = document.getElementById("reportDetails");
  const reportSwine = document.getElementById("reportSwine");
  const reportFarmer = document.getElementById("reportFarmer");
  const reportSigns = document.getElementById("reportSigns");
  const reportProbability = document.getElementById("reportProbability");
  const mediaGallery = document.getElementById("mediaGallery"); 
  const searchInput = document.getElementById("searchInput");

  const approveBtn = document.getElementById("approveBtn");
  const confirmAIBtn = document.getElementById("confirmAIBtn");
  const confirmPregnancyBtn = document.getElementById("confirmPregnancyBtn");
  const followUpBtn = document.getElementById("followUpBtn");

  const addMaleForm = document.getElementById("addMaleForm");
  const maleModal = document.getElementById("addMaleModal");

  const aiConfirmModal = document.getElementById("aiConfirmModal");
  const boarSelect = document.getElementById("boarSelect");
  const submitAIBtn = document.getElementById("submitAI");

  let currentReportId = null;
  let allReports = [];

  // ---------------- HELPER: CALCULATE DAYS LEFT ----------------
  function getDaysLeft(targetDate) {
    if (!targetDate) return "-";
    const now = new Date();
    const target = new Date(targetDate);
    const diffMs = target - now;
    if (diffMs <= 0) return "Due/Overdue";
    return `${Math.ceil(diffMs / (1000 * 60 * 60 * 24))} days`;
  }

  // ---------------- FETCH HEAT REPORTS ----------------
  async function loadReports() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/heat/all`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });

      if (res.status === 401 || res.status === 403) {
        alert("Session expired. Please log in again.");
        window.location.href = "login.html";
        return;
      }

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error("Failed to load reports");

      allReports = data.reports;
      renderTable(allReports);
    } catch (err) {
      console.error("Fetch Error:", err);
      tableBody.innerHTML = "<tr><td colspan='8'>Error connecting to server</td></tr>";
    }
  }

  function renderTable(reports) {
    tableBody.innerHTML = "";
    if (!reports.length) {
      tableBody.innerHTML = "<tr><td colspan='8'>No reports found</td></tr>";
      return;
    }

    reports.forEach(r => {
      const row = document.createElement("tr");
      // FIXED: Use r.swine_id.current_status to match your model
      const currentStatus = r.swine_id?.current_status || "Unknown";
      
      row.innerHTML = `
        <td>${r.swine_id?.swine_id || "Unknown"}</td>
        <td>${r.farmer_id ? `${r.farmer_id.first_name} ${r.farmer_id.last_name}` : "Unknown"}</td>
        <td>${new Date(r.createdAt).toLocaleDateString()}</td>
        <td style="font-weight:bold; color: ${r.heat_probability > 70 ? '#2ecc71' : '#e67e22'}">
          ${r.heat_probability !== null ? r.heat_probability + '%' : 'N/A'}
        </td>
        <td style="text-transform: capitalize;">
            <span class="status-badge">${r.status.replace(/_/g, ' ')}</span><br>
            <small style="color: #666;">(Swine: ${currentStatus})</small>
        </td>
        <td>${getDaysLeft(r.next_heat_check)}</td>
        <td>${getDaysLeft(r.expected_farrowing)}</td>
        <td><button class="btn-view" data-id="${r._id}">View</button></td>
      `;
      tableBody.appendChild(row);
    });

    document.querySelectorAll(".btn-view").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const reportId = e.target.getAttribute("data-id");
        viewReport(reportId);
      });
    });
  }

  // ---------------- VIEW REPORT DETAILS ----------------
  function viewReport(reportId) {
    const r = allReports.find(report => report._id === reportId);
    if (!r) {
      alert("Report details not found.");
      return;
    }

    currentReportId = reportId;
    // FIXED: Showing current_status in details for immediate verification
    reportSwine.innerHTML = `<strong>Swine:</strong> ${r.swine_id?.swine_id || "Unknown"} 
                             <span style="font-size: 0.8em; background: #eee; padding: 2px 6px; border-radius: 4px; margin-left: 10px;">
                               Status: ${r.swine_id?.current_status || "N/A"}
                             </span>`;
    reportFarmer.innerHTML = `<strong>Farmer:</strong> ${r.farmer_id?.first_name} ${r.farmer_id?.last_name}`;
    reportSigns.innerHTML = `<strong>Signs:</strong> ${r.signs?.join(", ") || "None"}`;
    reportProbability.innerHTML = `<strong>System Prediction:</strong> ${r.heat_probability !== null ? r.heat_probability + '%' : 'N/A'}`;

    mediaGallery.innerHTML = ""; 
    const evidences = Array.isArray(r.evidence_url) ? r.evidence_url : [r.evidence_url];

    if (evidences.length > 0 && evidences[0]) {
      evidences.forEach(url => {
        const isVideo = url.includes("video/") || url.match(/\.(mp4|mov|webm)$/i);
        const mediaWrapper = document.createElement("div");
        mediaWrapper.style.marginBottom = "10px";

        if (isVideo) {
          const video = document.createElement("video");
          video.src = url;
          video.controls = true;
          video.style.width = "100%";
          video.style.maxHeight = "300px";
          video.style.borderRadius = "8px";
          mediaWrapper.appendChild(video);
        } else {
          const img = document.createElement("img");
          img.src = url;
          img.style.width = "100%";
          img.style.borderRadius = "8px";
          img.style.cursor = "pointer";
          img.onclick = () => {
            const win = window.open();
            win.document.write(`<img src="${url}" style="max-width:100%;">`);
          };
          mediaWrapper.appendChild(img);
        }
        mediaGallery.appendChild(mediaWrapper);
      });
    } else {
      mediaGallery.innerHTML = "<p style='color:#888;'>No evidence provided.</p>";
    }

    reportDetails.style.display = "block";

    // Logic for button visibility based on Report Status
    approveBtn.style.display = r.status === "pending" ? "inline-block" : "none";
    confirmAIBtn.style.display = r.status === "approved" ? "inline-block" : "none";
    confirmPregnancyBtn.style.display = r.status === "waiting_heat_check" ? "inline-block" : "none";
    followUpBtn.style.display = r.status === "waiting_heat_check" ? "inline-block" : "none";
  }

  // ---------------- ACTION HANDLER ----------------
  const handleAction = async (endpoint, successMsg, extraData = {}) => {
    if (!currentReportId) return;

    try {
      const res = await fetch(`${BACKEND_URL}/api/heat/${currentReportId}/${endpoint}`, {
        method: "POST",
        headers: { 
          "Authorization": `Bearer ${token}`, 
          "Content-Type": "application/json" 
        },
        credentials: "include",
        body: JSON.stringify(extraData)
      });
      
      const data = await res.json();
      
      if (res.status === 401 || res.status === 403) {
        alert("Session expired. Please log in again.");
        window.location.href = "login.html";
        return;
      }
      
      if (!res.ok) throw new Error(data.message || "Action failed");
      
      alert(successMsg);
      
      // Close details and refresh table
      reportDetails.style.display = "none";
      await loadReports(); 
    } catch (err) { 
      console.error("Action Error:", err);
      alert("Error: " + err.message); 
    }
  };

  // ---------------- LISTENERS ----------------
  approveBtn.addEventListener("click", () => {
    handleAction("approve", "Report approved! Swine is now 'In-Heat'.");
  });

  confirmAIBtn.addEventListener("click", async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/swine/males`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include"
      });
      const data = await res.json();
      
      if (!data.success || !data.males?.length) {
        alert("No boars found. Please register a Boar first.");
        return;
      }

      boarSelect.innerHTML = data.males.map(m => 
        `<option value="${m._id}">${m.swine_id} (${m.breed})</option>`
      ).join("");

      aiConfirmModal.style.display = "block";
    } catch (err) {
      alert("Failed to fetch boar list.");
    }
  });

  submitAIBtn.addEventListener("click", () => {
    const selectedObjectId = boarSelect.value; 
    if (selectedObjectId) {
      handleAction("confirm-ai", "AI Confirmed! Swine moved to 'Awaiting Recheck'.", { maleSwineId: selectedObjectId });
      aiConfirmModal.style.display = "none";
    } else {
      alert("Please select a boar.");
    }
  });

  confirmPregnancyBtn.addEventListener("click", () => {
    handleAction("confirm-pregnancy", "Pregnancy confirmed! Swine is now 'Pregnant'.");
  });
  
  followUpBtn.addEventListener("click", () => {
    if(confirm("Is the swine showing heat signs again? This will reset the status to 'In-Heat'.")) {
      handleAction("still-heat", "Cycle reset to In-Heat.");
    }
  });

  if (addMaleForm) {
    addMaleForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = {
        swine_id: document.getElementById("mSwineId").value,
        breed: document.getElementById("mBreed").value,
        sex: "Male",
        batch: "BOAR" 
      };
      try {
        const res = await fetch(`${BACKEND_URL}/api/swine/add`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          alert("Male added.");
          maleModal.style.display = 'none';
          addMaleForm.reset();
        }
      } catch (err) {
        console.error("Add male error:", err);
      }
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const term = e.target.value.toLowerCase();  
      renderTable(allReports.filter(r => r.swine_id?.swine_id.toLowerCase().includes(term)));
    });
  }

  await loadReports();
});