import { authGuard } from "/js/authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  // ---------------- AUTH ----------------
  const user = await authGuard(["farm_manager", "encoder"]);
  if (!user) return;

  const token = localStorage.getItem("token");
  const BACKEND_URL = "http://localhost:5000";

  // ---------------- DOM ----------------
  const tableBody = document.getElementById("reportsTableBody");

  const countInHeat = document.getElementById("countInHeat");
  const countAwaitingRecheck = document.getElementById("countAwaitingRecheck");
  const countPregnant = document.getElementById("countPregnant");
  const countFarrowingReady = document.getElementById("countFarrowingReady");

  const reportDetailsModal = document.getElementById("reportDetailsModal");
  const closeReportModal = document.getElementById("closeReportModal");
  const closeReportModalBtn = document.getElementById("closeReportModalBtn");

  const reportSwine = document.getElementById("reportSwine");
  const reportFarmer = document.getElementById("reportFarmer");
  const reportSigns = document.getElementById("reportSigns");
  const reportProbability = document.getElementById("reportProbability");

  const confirmPregnancyBtn = document.getElementById("confirmPregnancyBtn");
  const followUpBtn = document.getElementById("followUpBtn");
  const confirmWeaningBtn = document.getElementById("confirmWeaningBtn");

  // Farrowing modal
  const farrowingModal = document.getElementById("farrowingModal");
  const farrowingForm = document.getElementById("farrowingForm");

  // Media Elements
  const evidenceGallery = document.getElementById("evidenceGallery");

  const approveBtn = document.getElementById("approveBtn");
  const rejectBtn = document.getElementById("rejectBtn");
  const confirmAIBtn = document.getElementById("confirmAIBtn");
  const confirmFarrowingBtn = document.getElementById("confirmFarrowingBtn"); 

  const aiConfirmModal = document.getElementById("aiConfirmModal");
  const boarSelect = document.getElementById("boarSelect");
  const submitAIBtn = document.getElementById("submitAI");

  // ---------------- MODAL HELPERS ----------------
  function closeReportDetails() {
    reportDetailsModal.style.display = "none";
    document.body.style.overflow = "";

    const videos = reportDetailsModal.querySelectorAll("video");
    videos.forEach(v => {
      v.pause();
      v.currentTime = 0;
    });

    evidenceGallery.innerHTML = "";
  }

  if (closeReportModal) closeReportModal.onclick = closeReportDetails;
  if (closeReportModalBtn) closeReportModalBtn.onclick = closeReportDetails;

  reportDetailsModal.addEventListener("click", e => {
    if (e.target === reportDetailsModal) closeReportDetails();
  });

  let allReports = [];
  let currentReportData = null; 

  // ---------------- HELPERS ----------------
  function getDaysLeft(targetDate) {
    if (!targetDate) return "-";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(targetDate);
    target.setHours(0, 0, 0, 0);
    
    const diff = target - today;
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    
    if (days < 0) return "Overdue";
    if (days === 0) return "TODAY";
    return `${days} days`;
  }

  // ---------------- FETCH REPORTS ----------------
  async function loadReports() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/heat/all`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include"
      });

      if (res.status === 401 || res.status === 403) {
        alert("Session expired. Please log in again.");
        window.location.href = "login.html";
        return;
      }

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error("Failed to load reports");

      allReports = data.reports || [];
      renderStats(allReports);
      renderTable(allReports);
    } catch (err) {
      console.error("Reports load error:", err);
      if (tableBody) tableBody.innerHTML = `<tr><td colspan="8">Failed to load reports</td></tr>`;
    }
  }

  // ---------------- STATS ----------------
  function renderStats(reports) {
    if (countInHeat) countInHeat.textContent = reports.filter(r => ["pending", "approved"].includes(r.status)).length;
    if (countAwaitingRecheck) countAwaitingRecheck.textContent = reports.filter(r => r.status === "under_observation").length;
    if (countPregnant) countPregnant.textContent = reports.filter(r => r.status === "pregnant").length;
    
    if (countFarrowingReady) {
      countFarrowingReady.textContent = reports.filter(r => {
        if (!["pregnant", "farrowing_ready"].includes(r.status) || !r.expected_farrowing) return false;
        const daysStr = getDaysLeft(r.expected_farrowing);
        if (daysStr === "Overdue" || daysStr === "TODAY") return true;
        const daysNum = parseInt(daysStr);
        return !isNaN(daysNum) && daysNum <= 7;
      }).length;
    }
  }

  // ---------------- TABLE ----------------
  function renderTable(reports) {
    if (!tableBody) return;
    tableBody.innerHTML = "";
    if (!reports.length) {
      tableBody.innerHTML = `<tr><td colspan="8">No reports found</td></tr>`;
      return;
    }

    reports.forEach(r => {
      const swineStatus = r.swine_id?.current_status || "Unknown";
      const statusLabel = (r.status || "pending").replace(/_/g, " ");

      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${r.swine_id?.swine_id || "-"}</td>
        <td>${r.farmer_id ? `${r.farmer_id.first_name} ${r.farmer_id.last_name}` : "-"}</td>
        <td>${new Date(r.createdAt).toLocaleDateString()}</td>
        <td style="font-weight:bold;">${r.heat_probability != null ? r.heat_probability + "%" : "N/A"}</td>
        <td>
          <span style="text-transform:capitalize; font-weight:600;">${statusLabel}</span><br>
          <small class="text-muted">(Swine: ${swineStatus})</small>
        </td>
        <td>${r.status === "under_observation" && r.next_heat_check ? `<strong>${getDaysLeft(r.next_heat_check)}</strong>` : "-"}</td>
        <td>${["pregnant", "farrowing_ready"].includes(r.status) && r.expected_farrowing ? `<strong style="color: #27ae60;">${getDaysLeft(r.expected_farrowing)}</strong>` : "-"}</td>
        <td><button class="btn-view" data-id="${r._id}">View</button></td>
      `;
      tableBody.appendChild(row);
    });

    document.querySelectorAll(".btn-view").forEach(btn => {
      btn.addEventListener("click", () => viewReport(btn.dataset.id));
    });
  }

  // ---------------- VIEW DETAILS ----------------
  async function viewReport(id) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/heat/${id}/detail`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include"
      });
      const data = await res.json();
      if (!data.success) throw new Error("Could not load report details");

      const r = data.report;
      currentReportData = r; 

      reportSwine.innerHTML = `<strong>Swine:</strong> ${r.swine_id?.swine_id || "Unknown"} 
                               <span style="margin-left:8px;font-size:0.8em; color:#666;">Status: ${r.swine_id?.current_status || "N/A"}</span>`;
      reportFarmer.innerHTML = `<strong>Farmer:</strong> ${r.farmer_id?.first_name} ${r.farmer_id?.last_name}`;
      reportSigns.innerHTML = `<strong>Signs:</strong> ${(r.signs || []).join(", ") || "None"}`;
      reportProbability.innerHTML = `<strong>Probability:</strong> ${r.heat_probability != null ? r.heat_probability + "%" : "N/A"}`;

      evidenceGallery.innerHTML = "";
      const evidences = Array.isArray(r.evidence_url) ? r.evidence_url : r.evidence_url ? [r.evidence_url] : [];

      if (!evidences.length) {
        evidenceGallery.innerHTML = "<p class='text-muted'><em>No media evidence provided.</em></p>";
      } else {
        evidences.forEach(path => {
          if (!path) return;
          const cleanPath = path.replace(/\\/g, "/");
          const fullUrl = cleanPath.startsWith("http") ? cleanPath : `${BACKEND_URL}/${cleanPath.replace(/^\/+/, "")}`;
          const isVideo = /\.(mp4|mov|webm)$/i.test(fullUrl);
          const wrapper = document.createElement("div");
          wrapper.className = "dynamic-media";
          if (isVideo) {
            wrapper.innerHTML = `<video controls preload="metadata"><source src="${fullUrl}">Your browser does not support video.</video>`;
          } else {
            wrapper.innerHTML = `<img src="${fullUrl}" alt="Evidence" onclick="window.open('${fullUrl}', '_blank')">`;
          }
          evidenceGallery.appendChild(wrapper);
        });
      }

      // Hide all buttons first
      approveBtn.style.display = "none";
      if (rejectBtn) rejectBtn.style.display = "none";
      confirmAIBtn.style.display = "none";
      if (confirmPregnancyBtn) confirmPregnancyBtn.style.display = "none";
      if (confirmFarrowingBtn) confirmFarrowingBtn.style.display = "none";
      if (followUpBtn) followUpBtn.style.display = "none";
      if (confirmWeaningBtn) confirmWeaningBtn.style.display = "none";

      // Workflow Logic
      switch (r.status) {
        case "pending":
          approveBtn.style.display = "inline-block";
          if (rejectBtn) rejectBtn.style.display = "inline-block";
          break;
        case "approved":
          confirmAIBtn.style.display = "inline-block";
          break;
        case "under_observation":
          if (confirmPregnancyBtn) confirmPregnancyBtn.style.display = "inline-block";
          if (followUpBtn) followUpBtn.style.display = "inline-block";
          break;
        case "pregnant":
        case "farrowing_ready":
          if (confirmFarrowingBtn) confirmFarrowingBtn.style.display = "inline-block";
          break;
        case "farrowed":
        case "lactating":
          if (confirmWeaningBtn) confirmWeaningBtn.style.display = "inline-block";
          break;
      }

      reportDetailsModal.style.display = "flex";
      document.body.style.overflow = "hidden";
    } catch (err) {
      console.error(err);
      alert("Error loading report details.");
    }
  }

  // ---------------- ACTION HANDLER ----------------
  async function action(endpoint, message, extraBody = {}) {
    if (!currentReportData?._id) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/heat/${currentReportData._id}/${endpoint}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify(extraBody)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Action failed");

      alert(message);
      closeReportDetails();
      loadReports();
    } catch (err) {
      alert(err.message || "Action failed");
    }
  }

  approveBtn.onclick = () => action("approve", "Report approved. AI is now scheduled.");

  if (rejectBtn) {
    rejectBtn.onclick = () => {
      const reason = prompt("Enter reason for rejection:");
      if (reason === null) return;
      if (!reason.trim()) return alert("Rejection reason is required.");
      action("reject", "Report rejected successfully.", { reason: reason });
    };
  }

  confirmAIBtn.onclick = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/swine/all?sex=Male&age_stage=adult`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include"
      });
      const data = await res.json();
      if (!data.success || !data.swine?.length) return alert("No adult boars found.");
      const masterBoars = data.swine.filter(b => b.swine_id?.startsWith("BOAR-") || !b.farmer_id);
      if (!masterBoars.length) return alert("No Master Boars available.");
      boarSelect.innerHTML = masterBoars.map(b => `<option value="${b.swine_id}">${b.swine_id}</option>`).join("");
      aiConfirmModal.style.display = "flex";
    } catch (err) {
      alert("Failed to load boars.");
    }
  };

  submitAIBtn.onclick = async () => {
    const maleSwineId = boarSelect.value;
    if (!maleSwineId) return alert("Please select a boar.");
    action("confirm-ai", "AI Confirmed! Swine moved to Under Observation.", { maleSwineId });
    aiConfirmModal.style.display = "none";
  };

  if (confirmPregnancyBtn) {
    confirmPregnancyBtn.onclick = () => {
      if (!confirm("Confirm pregnancy for this sow?")) return;
      action("confirm-pregnancy", "Pregnancy confirmed. Expected farrowing date calculated.");
    };
  }

  if (followUpBtn) {
    followUpBtn.onclick = () => {
      if (!confirm("Mark AI as failed? Swine will return to Heat status.")) return;
      action("still-heat", "AI failed. Sow returned to In-Heat status.");
    };
  }

  if (confirmFarrowingBtn) {
    confirmFarrowingBtn.onclick = () => {
      if (!farrowingModal) return;
      farrowingModal.style.display = "flex";
      document.getElementById("farrowingDateInput").valueAsDate = new Date();
    };
  }

  // UPDATED: Added 'naming_style' to force the backend to use simple incrementing without timestamps
  if (farrowingForm) {
    farrowingForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      const numMales = Number(document.getElementById("liveMaleCount").value);
      const numFemales = Number(document.getElementById("liveFemaleCount").value);
      
      const payload = {
        dam_id: currentReportData.swine_id?.swine_id,
        sire_id: currentReportData.sire_id || "Unknown",
        farmer_id: currentReportData.farmer_id?._id,
        farrowing_date: document.getElementById("farrowingDateInput").value,
        num_males: numMales,
        num_females: numFemales,
        total_live: numMales + numFemales,
        mummified: Number(document.getElementById("mummyCount").value),
        stillborn: Number(document.getElementById("stillCount").value),
        breed: currentReportData.swine_id?.breed || "Native",
        naming_style: "simple_increment" // FORCE BACKEND TO INCREMENT THE MOTHER ID ONLY
      };

      try {
          const res = await fetch(`${BACKEND_URL}/api/swine/batch-register-litter`, {
              method: "POST",
              headers: { 
                  Authorization: `Bearer ${token}`, 
                  "Content-Type": "application/json" 
              },
              body: JSON.stringify(payload)
          });
          const data = await res.json();
          if(!data.success) throw new Error(data.message);

          await action("confirm-farrowing", "Litter registered! IDs incremented from Mother's ID.", payload);
          
          farrowingModal.style.display = "none";
          farrowingForm.reset();
      } catch (err) {
          alert("Litter Registration Error: " + err.message);
      }
    });
  }

  if (confirmWeaningBtn) {
    confirmWeaningBtn.onclick = () => {
      if (!confirm("Are the piglets weaned? This will complete the breeding cycle.")) return;
      action("confirm-weaning", "Weaning confirmed! Sow is now Open for the next cycle.");
    };
  }

  // ---------------- FILTERING ----------------
  const filterSwine = document.getElementById("filterSwine");
  const filterStatus = document.getElementById("filterStatus");
  const applyFilterBtn = document.getElementById("applyFilter");
  const clearFilterBtn = document.getElementById("clearFilter");
  const filteredCard = document.getElementById("filteredResultsCard");
  const filteredBody = document.getElementById("filteredTableBody");

  applyFilterBtn?.addEventListener("click", () => {
    const swineTerm = filterSwine.value.trim().toLowerCase();
    const statusTerm = filterStatus.value;
    const filtered = allReports.filter(r => {
      const swineMatch = !swineTerm || (r.swine_id?.swine_id || "").toLowerCase().includes(swineTerm);
      const statusMatch = !statusTerm || r.status === statusTerm;
      return swineMatch && statusMatch;
    });
    renderFilteredTable(filtered);
  });

  clearFilterBtn?.addEventListener("click", () => {
    filterSwine.value = "";
    filterStatus.value = "";
    if (filteredCard) filteredCard.style.display = "none";
  });

  function renderFilteredTable(reports) {
    if (!filteredBody) return;
    filteredBody.innerHTML = "";
    if (!reports.length) {
      filteredBody.innerHTML = `<tr><td colspan="5">No matching reports</td></tr>`;
      if (filteredCard) filteredCard.style.display = "block";
      return;
    }
    reports.forEach(r => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${r.swine_id?.swine_id || "-"}</td>
        <td>${r.farmer_id ? `${r.farmer_id.first_name} ${r.farmer_id.last_name}` : "-"}</td>
        <td>${new Date(r.createdAt).toLocaleDateString()}</td>
        <td>${r.status.replace(/_/g, " ")}</td>
        <td><button class="btn-view" data-id="${r._id}">View</button></td>
      `;
      filteredBody.appendChild(row);
    });
    if (filteredCard) filteredCard.style.display = "block";
    filteredBody.querySelectorAll(".btn-view").forEach(btn => {
      btn.addEventListener("click", () => viewReport(btn.dataset.id));
    });
  }

  loadReports();
});