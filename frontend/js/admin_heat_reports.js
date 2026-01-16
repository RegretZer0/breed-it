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

  let currentReportId = null;
  let allReports = [];

  // ---------------- HELPER: CALCULATE DAYS LEFT ----------------
  function getDaysLeft(targetDate) {
    if (!targetDate) return "-";
    const now = new Date();
    now.setHours(0, 0, 0, 0); 
    const target = new Date(targetDate);
    target.setHours(0, 0, 0, 0);

    const diffMs = target - now;
    if (diffMs < 0) return "Overdue";
    if (diffMs === 0) return "TODAY";
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
      const currentStatus = r.swine_id?.current_status || "Unknown";
      
      const rawStatus = (r.status || "pending").toLowerCase();
      const isApproved = rawStatus === "approved" || rawStatus === "under_observation" || rawStatus === "pregnant" || rawStatus === "completed" || rawStatus === "ai_service";
      const isCompleted = rawStatus === "completed" || rawStatus === "farrowed";
      const isPregnant = rawStatus === "pregnant";
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
            <span class="status-badge" style="${isCompleted ? 'background: #bdc3c7;' : isRejected ? 'background: #e74c3c; color: white;' : ''}">${r.status.replace(/_/g, ' ')}</span><br>
            <small style="color: #666;">(Swine: ${currentStatus})</small>
            
            ${isApproved ? `
              <div style="margin-top: 5px; font-size: 0.7em; color: #27ae60;">
                <b>Approved:</b> ${updateDate}
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
          ${(!isCompleted && !isPregnant && !isRejected && r.next_heat_check) ? `
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
          ` : (isCompleted ? '<span style="color: #27ae60; font-weight: bold;">✅ Completed</span>' : '-')}
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
        // --- 3-DAY RULE CALCULATION DISPLAY ---
        const approvalDate = new Date(r.approved_at || r.updatedAt);
        const day3 = new Date(approvalDate);
        day3.setDate(approvalDate.getDate() + 2); // 3rd Day is +2 from start

        statusLogHtml = `
          <div style="color: #27ae60; background: #f0fff4; border: 1px solid #c6f6d5; padding: 10px; border-radius: 6px; margin-top: 10px;">
            <strong>Status Update:</strong> Approved/Processed<br>
            <small>Confirmed on: ${updateDate}</small>
            <hr style="border: 0; border-top: 1px solid #c6f6d5; margin: 8px 0;">
            <div style="font-size: 0.9em;">
              <strong>Insemination Schedule (3-Day Rule):</strong><br>
              Start: ${approvalDate.toLocaleDateString()}<br>
              <b style="color: #2c3e50;">Target (Day 3): ${day3.toLocaleDateString()}</b>
            </div>
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

    // --- BUTTON VISIBILITY LOGIC ---
    approveBtn.style.display = (r.status === "pending") ? "inline-block" : "none";
    if (rejectBtn) rejectBtn.style.display = (r.status === "pending") ? "inline-block" : "none"; 

    confirmAIBtn.style.display = (r.status === "approved") ? "inline-block" : "none";

    if (r.expected_farrowing && r.status === "pregnant") {
        const today = new Date();
        today.setHours(0,0,0,0);
        const farrowDate = new Date(r.expected_farrowing);
        farrowDate.setHours(0,0,0,0);
        confirmFarrowingBtn.style.display = (today >= farrowDate) ? "inline-block" : "none";
    } else {
        confirmFarrowingBtn.style.display = "none";
    }

    if (confirmPregnancyBtn) confirmPregnancyBtn.style.display = "none";
    if (followUpBtn) followUpBtn.style.display = "none";
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
      if (!res.ok) throw new Error(data.message || "Action failed");
      
      alert(successMsg);
      reportDetails.style.display = "none";
      await loadReports(); 
    } catch (err) { 
      alert("Error: " + err.message); 
    }
  };

  // ---------------- LISTENERS ----------------
  approveBtn.addEventListener("click", () => {
    if (confirm("Approve this heat report? System will automatically schedule insemination on the 3rd day from today.")) {
      // Logic for 3-day rule: Today is Day 1, Target is Day 3
      const inseminationDate = new Date();
      inseminationDate.setDate(inseminationDate.getDate() + 2); 
      
      handleAction("approve", "Report approved! Insemination scheduled for " + inseminationDate.toLocaleDateString(), {
        scheduledInsemination: inseminationDate
      });
    }
  });

  if (rejectBtn) {
    rejectBtn.addEventListener("click", () => {
        const reason = prompt("Please enter the reason for rejection (this will be seen by the farmer):");
        if (reason === null) return; 
        if (!reason.trim()) return alert("A rejection reason is required to help the farmer improve.");
        
        handleAction("reject", "Report rejected and message sent.", { reason });
    });
  }

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
    } catch (err) { alert("Failed to fetch boar list."); }
  });

  submitAIBtn.addEventListener("click", () => {
    const selectedObjectId = boarSelect.value; 
    if (selectedObjectId) {
      handleAction("confirm-ai", "AI Confirmed! Swine moved to 'Under Observation'.", { maleSwineId: selectedObjectId });
      aiConfirmModal.style.display = "none";
    }
  });

  confirmFarrowingBtn.addEventListener("click", () => {
    if (confirm("Confirm farrowing? This will finalize the pregnancy cycle and return the swine status to 'Lactating'.")) {
        handleAction("confirm-farrowing", "Farrowing Confirmed! Pregnancy cycle completed.");
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