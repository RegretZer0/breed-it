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
  const rejectBtn = document.getElementById("rejectBtn"); 
  const confirmAIBtn = document.getElementById("confirmAIBtn");
  const confirmFarrowingBtn = document.getElementById("confirmFarrowingBtn"); 
  
  const confirmPregnancyBtn = document.getElementById("confirmPregnancyBtn");
  const followUpBtn = document.getElementById("followUpBtn");

  const addMaleForm = document.getElementById("addMaleForm");
  const maleModal = document.getElementById("addMaleModal");

  const aiConfirmModal = document.getElementById("aiConfirmModal");
  const boarSelect = document.getElementById("boarSelect");
  const submitAIBtn = document.getElementById("submitAI");

  // NEW: Farrowing Modal Elements
  const farrowingModal = document.getElementById("farrowingModal");
  const farrowingForm = document.getElementById("farrowingForm");

  let currentReportId = null;
  let allReports = [];

  // ---------------- HELPER: SEND NOTIFICATIONS ----------------
  const sendNotification = async (farmerId, title, message, type = "info") => {
    try {
      await fetch(`${BACKEND_URL}/api/notifications`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({
          user_id: farmerId,
          title: title,
          message: message,
          type: type
        })
      });
    } catch (err) {
      console.error("Failed to send notification:", err);
    }
  };

  // ---------------- HELPER: CALCULATE DAYS LEFT (Days Only) ----------------
  function getDaysLeft(targetDate) {
    if (!targetDate) return "-";
    const now = new Date();
    now.setHours(0, 0, 0, 0); 
    const target = new Date(targetDate);
    target.setHours(0, 0, 0, 0);

    const diffMs = target - now;
    if (diffMs < 0) return "Overdue";
    if (diffMs === 0) return "TODAY";
    
    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return `${days} day${days > 1 ? 's' : ''}`;
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
      const currentStatus = r.swine_id?.current_status || "Unknown";
      
      const rawStatus = (r.status || "pending").toLowerCase().trim();
      const isApproved = ["approved", "under_observation", "pregnant", "completed", "lactating", "farrowing_ready", "ai_service"].includes(rawStatus);
      const isLactating = rawStatus === "lactating" || rawStatus === "completed";
      const isPregnant = rawStatus === "pregnant" || rawStatus === "farrowing_ready";
      const isRejected = rawStatus === "rejected";

      const rejectionNote = r.rejection_message || r.reason || "";
      const updateDate = new Date(r.updatedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
      
      row.innerHTML = `
        <td>${r.swine_id?.swine_id || "Unknown"}</td>
        <td>${r.farmer_id ? `${r.farmer_id.first_name} ${r.farmer_id.last_name}` : "Unknown"}</td>
        <td>${new Date(r.createdAt).toLocaleDateString()}</td>
        <td style="font-weight:bold; color: ${r.heat_probability > 70 ? '#2ecc71' : '#e67e22'}">
          ${r.heat_probability !== null ? r.heat_probability + '%' : 'N/A'}
        </td>
        <td style="text-transform: capitalize;">
            <span class="status-badge" style="${isLactating ? 'background: #9b59b6; color: white;' : isRejected ? 'background: #e74c3c; color: white;' : ''}">
              ${r.status.replace(/_/g, ' ')}
            </span><br>
            <small style="color: #666;">(Swine: ${currentStatus})</small>
            
            ${isApproved ? `
              <div style="margin-top: 5px; font-size: 0.7em; color: #27ae60;">
                <b>Updated:</b> ${updateDate}
              </div>
            ` : ''}

            ${isRejected && rejectionNote ? `
              <div style="margin-top: 5px; font-size: 0.75em; color: #c53030; background: #fff5f5; padding: 4px; border-radius: 4px; border: 1px solid #feb2b2; line-height: 1.2;">
                <strong>Reason:</strong> ${rejectionNote}<br>
                <small style="font-size: 0.9em; opacity: 0.8;">Rejected: ${updateDate}</small>
              </div>
            ` : ''}
        </td>
        <td>
          ${(!isLactating && !isPregnant && !isRejected && r.next_heat_check) ? `
            <div style="font-size: 0.85em; color: #555; margin-bottom: 4px;">
              <b>Target:</b> ${new Date(r.next_heat_check).toLocaleDateString()}
            </div>
            <strong>${getDaysLeft(r.next_heat_check)}</strong>
          ` : '-'}
        </td>
        <td>
          ${(isPregnant && r.expected_farrowing) ? `
            <div style="font-size: 0.85em; color: #555; margin-bottom: 4px;">
              <b>Target:</b> ${new Date(r.expected_farrowing).toLocaleDateString()}
            </div>
            <strong>${getDaysLeft(r.expected_farrowing)}</strong>
          ` : (isLactating ? '<span style="color: #9b59b6; font-weight: bold;">🤱 Lactating</span>' : '-')}
        </td>
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
    if (!r) return;

    currentReportId = reportId;
    const updateDate = new Date(r.updatedAt).toLocaleString();

    reportSwine.innerHTML = `<strong>Swine:</strong> ${r.swine_id?.swine_id || "Unknown"} 
                             <span style="font-size: 0.8em; background: #eee; padding: 2px 6px; border-radius: 4px; margin-left: 10px;">
                               Status: ${r.swine_id?.current_status || "N/A"}
                             </span>`;
    reportFarmer.innerHTML = `<strong>Farmer:</strong> ${r.farmer_id?.first_name} ${r.farmer_id?.last_name}`;
    reportSigns.innerHTML = `<strong>Signs:</strong> ${r.signs?.join(", ") || "None"}`;
    
    const rejectionText = r.rejection_message || r.reason || "";
    let statusLogHtml = '';

    if (r.status === 'rejected') {
        statusLogHtml = `
          <div style="color: #c53030; background: #fff5f5; border: 1px solid #feb2b2; padding: 10px; border-radius: 6px; margin-top: 10px;">
            <strong>Rejection Note:</strong> "${rejectionText}"<br>
            <small>Processed on: ${updateDate}</small>
          </div>`;
    } else if (r.status !== 'pending') {
        const approvalDate = new Date(r.approved_at || r.updatedAt);
        const day3 = new Date(approvalDate);
        day3.setDate(approvalDate.getDate() + 2); 

        statusLogHtml = `
          <div style="color: #27ae60; background: #f0fff4; border: 1px solid #c6f6d5; padding: 10px; border-radius: 6px; margin-top: 10px;">
            <strong>Current Status:</strong> ${r.status.replace(/_/g, ' ').toUpperCase()}<br>
            <small>Last Update: ${updateDate}</small>
          </div>`;
    }
    
    reportProbability.innerHTML = `
      <div style="margin-bottom: 10px;">
        <strong>System Prediction:</strong> ${r.heat_probability !== null ? r.heat_probability + '%' : 'N/A'}
      </div>
      ${statusLogHtml}
    `;

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
          video.style.borderRadius = "8px";
          mediaWrapper.appendChild(video);
        } else {
          const img = document.createElement("img");
          img.src = url;
          img.style.width = "100%";
          img.style.borderRadius = "8px";
          mediaWrapper.appendChild(img);
        }
        mediaGallery.appendChild(mediaWrapper);
      });
    }

    reportDetails.style.display = "block";

    // --- BUTTON VISIBILITY ---
    approveBtn.style.display = (r.status === "pending") ? "inline-block" : "none";
    if (rejectBtn) rejectBtn.style.display = (r.status === "pending") ? "inline-block" : "none"; 

    confirmAIBtn.style.display = (r.status === "approved") ? "inline-block" : "none";

    if (r.status === "farrowing_ready" || (r.status === "pregnant" && r.expected_farrowing)) {
        const today = new Date();
        today.setHours(0,0,0,0);
        const farrowDate = r.expected_farrowing ? new Date(r.expected_farrowing) : today;
        farrowDate.setHours(0,0,0,0);
        
        confirmFarrowingBtn.style.display = (r.status === "farrowing_ready" || today >= farrowDate) ? "inline-block" : "none";
    } else {
        confirmFarrowingBtn.style.display = "none";
    }

    if (confirmPregnancyBtn) confirmPregnancyBtn.style.display = "none";
    if (followUpBtn) followUpBtn.style.display = "none";
  }

  // ---------------- ACTION HANDLER (WITH NOTIFICATIONS) ----------------
  const handleAction = async (endpoint, successMsg, extraData = {}) => {
    if (!currentReportId) return;

    // Get current report to identify the farmer
    const report = allReports.find(r => r._id === currentReportId);
    const farmerId = report?.farmer_id?._id || report?.farmer_id;
    const swineIdStr = report?.swine_id?.swine_id || "Swine";

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
      if (!res.ok) throw new Error(data.message || "Action failed");
      
      alert(successMsg);

      // --- NEW NOTIFICATION LOGIC ---
      if (farmerId) {
        let nTitle = "Heat Report Update";
        let nMsg = "";
        let nType = "info";

        switch (endpoint) {
          case "approve":
            nTitle = "Heat Report Approved";
            nMsg = `The report for ${swineIdStr} was approved. Scheduled AI Insemination has been logged.`;
            nType = "success";
            break;
          case "reject":
            nTitle = "Heat Report Rejected";
            nMsg = `The report for ${swineIdStr} was rejected. Reason: ${extraData.reason || "Not specified"}`;
            nType = "error";
            break;
          case "confirm-ai":
            nTitle = "AI Service Completed";
            nMsg = `Insemination for ${swineIdStr} is confirmed. The sow is now under 21-day observation.`;
            nType = "success";
            break;
          case "confirm-farrowing":
            nTitle = "Farrowing Registered";
            nMsg = `Farrowing data for ${swineIdStr} has been successfully registered. The sow is now Lactating.`;
            nType = "success";
            break;
        }
        
        if (nMsg) await sendNotification(farmerId, nTitle, nMsg, nType);
      }

      reportDetails.style.display = "none";
      await loadReports(); 
    } catch (err) { 
      alert("Error: " + err.message); 
    }
  };

  // ---------------- LISTENERS ----------------
  approveBtn.addEventListener("click", () => {
    if (confirm("Approve this heat report? System will schedule insemination on the 3rd day.")) {
      const inseminationDate = new Date();
      inseminationDate.setDate(inseminationDate.getDate() + 2); 
      
      handleAction("approve", "Report approved! Insemination targeted for " + inseminationDate.toLocaleDateString(), {
        scheduledInsemination: inseminationDate
      });
    }
  });

  if (rejectBtn) {
    rejectBtn.addEventListener("click", () => {
        const reason = prompt("Enter rejection reason for the farmer:");
        if (reason === null) return; 
        if (!reason.trim()) return alert("Rejection reason is required.");
        
        handleAction("reject", "Report rejected.", { reason });
    });
  }

  confirmAIBtn.addEventListener("click", async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/swine/all?sex=Male&age_stage=adult`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include"
      });
      const data = await res.json();
      
      if (!data.success || !data.swine?.length) {
        alert("No adult boars found.");
        return;
      }

      const masterBoars = data.swine.filter(m => 
        m.swine_id.startsWith("BOAR-") || m.farmer_id === null
      );

      if (masterBoars.length === 0) {
        alert("No Master Boars registered. Please add a Boar in Maintenance.");
        return;
      }

      boarSelect.innerHTML = masterBoars.map(m => 
        `<option value="${m._id}">${m.swine_id} (${m.breed})</option>`
      ).join("");
      
      aiConfirmModal.style.display = "block";
    } catch (err) { 
        console.error(err);
        alert("Failed to fetch Boar list."); 
    }
  });

  submitAIBtn.addEventListener("click", () => {
    const selectedObjectId = boarSelect.value; 
    if (selectedObjectId) {
      handleAction("confirm-ai", "AI Confirmed! Sow is now under 21-day observation.", { maleSwineId: selectedObjectId });
      aiConfirmModal.style.display = "none";
    }
  });

  confirmFarrowingBtn.addEventListener("click", () => {
    const r = allReports.find(report => report._id === currentReportId);
    if (!r || !r.swine_id) return;

    if (farrowingModal) {
        farrowingModal.style.display = "block";
        document.getElementById("farrowingDateInput").valueAsDate = new Date();
    } else {
        if (confirm("Confirm farrowing for " + r.swine_id.swine_id + "?")) {
            handleAction("confirm-farrowing", "Farrowing Confirmed!");
        }
    }
  });

  if (farrowingForm) {
      farrowingForm.addEventListener("submit", (e) => {
          e.preventDefault();
          const total_live = document.getElementById("liveCount").value;
          const mummified = document.getElementById("mummyCount").value;
          const stillborn = document.getElementById("stillCount").value;
          const farrowing_date = document.getElementById("farrowingDateInput").value;

          handleAction("confirm-farrowing", "Farrowing Registered! Sow is now Lactating.", {
              total_live: Number(total_live),
              mummified: Number(mummified),
              stillborn: Number(stillborn),
              farrowing_date: farrowing_date
          });

          farrowingModal.style.display = "none";
          farrowingForm.reset();
      });
  }

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
          alert("Boar added successfully.");
          maleModal.style.display = 'none';
          addMaleForm.reset();
        }
      } catch (err) { console.error(err); }
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const term = e.target.value.toLowerCase();  
      renderTable(allReports.filter(r => (r.swine_id?.swine_id || "").toLowerCase().includes(term)));
    });
  }

  await loadReports();
});