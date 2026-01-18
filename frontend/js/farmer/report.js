// farmer_heat.js
import { authGuard } from "/js/authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  // ---------------- AUTHENTICATION ----------------
  const user = await authGuard("farmer");
  if (!user) return;

  const token = localStorage.getItem("token");
  const userId = user.id; // farmer ID
  const BACKEND_URL = "http://localhost:5000";

  const swineSelect = document.getElementById("swineSelect");
  const reportForm = document.getElementById("heatReportForm");
  const reportMessage = document.getElementById("reportMessage");
  const reportsTableBody = document.getElementById("reportsTableBody");
  const submitBtn = reportForm.querySelector(".btn-submit");

  const statusFilter = document.getElementById("statusFilter");
  const dateFilter = document.getElementById("dateFilter");
  const pigFilter = document.getElementById("pigFilter");
  const searchBtn = document.getElementById("searchBtn");
  const clearFilterBtn = document.getElementById("clearFilterBtn");

  let selectedFiles = [];

  // ---------------- UPLOAD MEDIA ----------------
  const uploadBtn = document.getElementById("uploadBtn");
  const evidenceInput = document.getElementById("evidence");
  const mediaPreview = document.getElementById("mediaPreview");
  const fileCountBadge = document.getElementById("fileCountBadge");

  const MAX_FILES = 5;

  uploadBtn.addEventListener("click", () => {
    evidenceInput.click();
  });

  evidenceInput.addEventListener("change", () => {
    const newFiles = Array.from(evidenceInput.files);

    if (selectedFiles.length + newFiles.length > MAX_FILES) {
      alert(`You can upload a maximum of ${MAX_FILES} files.`);
      evidenceInput.value = "";
      return;
    }

    selectedFiles = selectedFiles.concat(newFiles);
    renderMediaPreview();
  });

  function renderMediaPreview() {
    mediaPreview.innerHTML = "";

    if (selectedFiles.length === 0) {
      fileCountBadge.style.display = "none";
      return;
    }

    fileCountBadge.textContent = selectedFiles.length;
    fileCountBadge.style.display = "inline-flex";

    selectedFiles.forEach((file, index) => {
      const wrapper = document.createElement("div");
      wrapper.className = "preview-item";

      // ❌ REMOVE BUTTON (matches your CSS)
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "remove-preview-media";
      removeBtn.innerHTML = "×";

      removeBtn.addEventListener("click", () => {
        selectedFiles.splice(index, 1);
        syncFileInput();
        renderMediaPreview();
      });

      wrapper.appendChild(removeBtn);

      if (file.type.startsWith("image")) {
        const img = document.createElement("img");
        img.src = URL.createObjectURL(file);
        img.onload = () => URL.revokeObjectURL(img.src);
        wrapper.appendChild(img);
      }

      if (file.type.startsWith("video")) {
        const video = document.createElement("video");
        video.src = URL.createObjectURL(file);
        video.controls = true;
        video.onloadeddata = () => URL.revokeObjectURL(video.src);
        wrapper.appendChild(video);
      }

      mediaPreview.appendChild(wrapper);
    });

    syncFileInput();
  }

  function syncFileInput() {
    const dataTransfer = new DataTransfer();
    selectedFiles.forEach(file => dataTransfer.items.add(file));
    evidenceInput.files = dataTransfer.files;
  }

  // ---------------- FETCH HELPER ----------------
  async function fetchWithAuth(url, options = {}) {
    options.headers = options.headers || {};
    options.headers.Authorization = `Bearer ${token}`;
    options.credentials = "include";

    try {
      const res = await fetch(url, options);
      if (res.status === 401) {
        alert("Session expired. Please log in again.");
        localStorage.clear();
        window.location.href = "login.html";
        return null;
      }
      return res;
    } catch (err) {
      console.error("Fetch error:", err);
      throw err;
    }
  }

  // ---------------- NOTIFICATION HELPER ----------------
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

  // ---------------- UPDATE STATS ----------------
  async function updateStats(swineList) {
    const stats = { open: 0, pregnant: 0, farrowing: 0 };
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);

    swineList.forEach(sw => {
      let status = (sw.current_status || "Open").toLowerCase();
      
      if (status === "pregnant" && sw.expected_farrowing) {
        if (today >= new Date(sw.expected_farrowing)) status = "farrowing";
      }

      if (status === "lactating") {
        const lastCycle = sw.breeding_cycles?.[sw.breeding_cycles.length - 1];
        if (lastCycle?.actual_farrowing_date) {
          const farrowDate = new Date(lastCycle.actual_farrowing_date);
          if (farrowDate <= thirtyDaysAgo) status = "open"; 
        }
      }
      
      if (status === "open") stats.open++;
      else if (status === "pregnant") stats.pregnant++;
      else if (status === "farrowing" || status === "lactating" || status === "monitoring (day 1-30)") stats.farrowing++;
    });

    if (document.getElementById("countOpen")) document.getElementById("countOpen").textContent = stats.open;
    if (document.getElementById("countPregnant")) document.getElementById("countPregnant").textContent = stats.pregnant;
    if (document.getElementById("countFarrowing")) document.getElementById("countFarrowing").textContent = stats.farrowing;
  }

  // ---------------- REFRESH SWINE DROPDOWN ----------------
  async function refreshSwineData() {
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/swine/farmer`);
      if (res) {
        const data = await res.json();
        const swineList = data.swine || [];
        updateStats(swineList);
        
        swineSelect.innerHTML = '<option value="">-- Select Swine --</option>';

        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(today.getDate() - 30);

        const eligibleSows = swineList.filter(sw => {
          const isFemale = sw.sex?.toLowerCase() === "female";
          const status = (sw.current_status || "Open").toLowerCase();

          if (isFemale && status === "open") return true;

          if (isFemale && status === "lactating") {
            const lastCycle = sw.breeding_cycles?.[sw.breeding_cycles.length - 1];
            if (lastCycle?.actual_farrowing_date) {
              const farrowDate = new Date(lastCycle.actual_farrowing_date);
              return farrowDate <= thirtyDaysAgo;
            }
          }
          return false;
        });

        if (eligibleSows.length === 0) {
          swineSelect.innerHTML = '<option value="">No eligible sows available</option>';
        } else {
          eligibleSows.forEach(sw => {
            const opt = document.createElement("option");
            opt.value = sw.swine_id;
            opt.textContent = `${sw.swine_id} - ${sw.breed} (${sw.current_status})`;
            swineSelect.appendChild(opt);
          });
        }
      }
    } catch (err) { console.error(err); }
  }

 // ---------------- LOAD REPORTS ----------------
async function loadReports() {
  try {
    const res = await fetchWithAuth(`${BACKEND_URL}/api/heat/farmer/${userId}`);
    if (!res) return;
    const data = await res.json();

    // RESET TABLE & FILTER
    reportsTableBody.innerHTML = "";
    pigFilter.innerHTML = '<option value="">All pigs</option>';
    const pigSet = new Set();

    if (!data.success || !data.reports?.length) {
      reportsTableBody.innerHTML =
        "<tr><td colspan='6' style='text-align:center;'>No reports found</td></tr>";
      return;
    }

    const now = new Date();

    data.reports.forEach(r => {
      const swineDisplay = r.swine_id?.swine_id || r.swine_id || "Unknown";
      const dateReported = new Date(r.createdAt).toLocaleDateString();

      // COLLECT UNIQUE PIGS
      pigSet.add(swineDisplay);

      const rawStatus = (r.status || "pending")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "_");
      const displayStatus = (r.status || "pending").replace(/_/g, " ");

      const allowedStatuses = ["waiting_heat_check", "under_observation", "approved"];

      const isCompleted =
        rawStatus === "completed" ||
        rawStatus === "pregnant" ||
        rawStatus === "farrowing_ready";
      const isRejected = rawStatus === "rejected";
      const isProcessed = rawStatus !== "pending" && !isRejected;

      const updateDateFormatted = new Date(r.updatedAt).toLocaleString([], {
        dateStyle: "short",
        timeStyle: "short",
      });

      const rejectionText = r.rejection_message || r.reason || "";

      const heatCheckDate = r.next_heat_check ? new Date(r.next_heat_check) : null;
      const farrowingDate = r.expected_farrowing ? new Date(r.expected_farrowing) : null;

      const isReadyForPregnancy =
        rawStatus === "under_observation" &&
        heatCheckDate &&
        now >= heatCheckDate;

      const row = document.createElement("tr");

      // REQUIRED FOR FILTERING
      row.dataset.report = JSON.stringify({
        status: rawStatus,
        createdAt: r.createdAt,
        swine: swineDisplay,
      });

      row.innerHTML = `
        <td>${swineDisplay}</td>
        <td>${dateReported}</td>
        <td>
          <div style="text-transform: capitalize; font-weight: bold; color: ${
            isRejected ? "#e74c3c" : isProcessed ? "#27ae60" : "#2c3e50"
          };">
            ${displayStatus === "approved" ? "AI Scheduled" : displayStatus}
          </div>

          ${
            isProcessed
              ? `<div style="margin-top:4px;font-size:0.75em;color:#27ae60;opacity:0.8;">
                   Update: ${updateDateFormatted}
                 </div>`
              : ""
          }

          ${
            isRejected && rejectionText
              ? `<div class="rejection-note" style="margin-top:8px;padding:8px;background:#fff5f5;border:1px solid #feb2b2;border-radius:4px;font-size:0.8em;color:#c53030;">
                   <strong>Reason:</strong><br>"${rejectionText}"
                 </div>`
              : ""
          }
        </td>
        <td>
          ${
            !isCompleted && !isRejected && heatCheckDate
              ? `<b>${rawStatus === "approved" ? "AI Date" : "Check Date"}:</b>
                 ${heatCheckDate.toLocaleDateString()}
                 <span class="next-heat" data-date="${r.next_heat_check || ""}">-</span>`
              : "-"
          }
        </td>
        <td>
          ${
            isCompleted && farrowingDate
              ? `<b>Target:</b> ${farrowingDate.toLocaleDateString()}
                 <span class="farrowing" data-date="${r.expected_farrowing || ""}">-</span>`
              : "-"
          }
        </td>
        <td>
          ${
            allowedStatuses.includes(rawStatus)
              ? `<div style="display:flex;flex-direction:column;gap:8px;">
                   ${
                     rawStatus !== "approved"
                       ? `<button class="btn-followup"
                            onclick="submitFollowUp('${r._id}','${swineDisplay}')">
                            Back in Heat
                          </button>`
                       : `<span style="font-size:0.8em;color:#3498db;">Waiting for Admin</span>`
                   }

                   ${
                     rawStatus === "under_observation"
                       ? `<button class="btn-pregnant"
                            ${!isReadyForPregnancy ? "disabled" : ""}
                            onclick="confirmPregnancy('${r._id}','${swineDisplay}')">
                            Confirm Pregnant
                          </button>`
                       : ""
                   }
                 </div>`
              : isRejected
              ? `<span style="color:#e74c3c;font-weight:bold;">Report Denied</span>`
              : `<span style="color:#888;">No Action Needed</span>`
          }
        </td>
      `;

      reportsTableBody.appendChild(row);
    });

    // ✅ POPULATE PIG FILTER ONCE
    pigSet.forEach(pig => {
      const opt = document.createElement("option");
      opt.value = pig;
      opt.textContent = pig;
      pigFilter.appendChild(opt);
    });

    updateCountdowns();
  } catch (err) {
    console.error("Load Reports Error:", err);
  }
}


  // ---------------- HELPERS ----------------
  function formatCountdown(targetDate) {
    if (!targetDate) return "N/A";
    const diffMs = new Date(targetDate) - new Date();
    if (diffMs <= 0) return "Ready/Due";

    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (days === 0) return "Due Tomorrow";
    return `${days} day${days > 1 ? 's' : ''} left`;
  }

  function updateCountdowns() {
    document.querySelectorAll(".next-heat, .farrowing").forEach(el => {
      if (el.dataset.date) el.textContent = formatCountdown(el.dataset.date);
    });
  }

  // ---------------- ACTIONS ----------------
  window.submitFollowUp = async (id, swineId) => {
    if (!confirm(`Is ${swineId} in heat again? This will reset the cycle for re-insemination.`)) return;
    const res = await fetchWithAuth(`${BACKEND_URL}/api/heat/${id}/still-heat`, { method: "POST" });
    if (res && res.ok) {
      alert("Cycle reset for re-insemination.");
      await sendAdminNotification("Sow Back in Heat", `Farmer ${user.first_name} reported ${swineId} is back in heat after service.`, "warning");
      await loadReports();
    }
  };

  window.confirmPregnancy = async (id, swineId) => {
    if (!confirm(`Confirm pregnancy for ${swineId}? This starts the 114-day gestation countdown.`)) return;
    const res = await fetchWithAuth(`${BACKEND_URL}/api/heat/${id}/confirm-pregnancy`, { 
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
    
    if (res && res.ok) {
      alert("Pregnancy confirmed!");
      await sendAdminNotification("Pregnancy Confirmed", `${swineId} has been confirmed pregnant by Farmer ${user.first_name}.`, "success");
      await loadReports();
      await refreshSwineData();
    } else {
      const errData = await res.json();
      alert("Failed to confirm: " + (errData.message || "Unknown error"));
    }
  };

  // ---------------- FORM SUBMIT ----------------
  reportForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const selectedSigns = Array.from(document.querySelectorAll('input[name="signs"]:checked')).map(cb => cb.value);
    
    if (selectedSigns.length === 0) {
      alert("Please select at least one sign of heat.");
      return;
    }

    if (!swineSelect.value) {
        alert("Please select a Swine ID.");
        return;
    }

    const formData = new FormData();
    formData.append("swineId", swineSelect.value);
    formData.append("farmerId", userId);
    formData.append("signs", JSON.stringify(selectedSigns));
    
    Array.from(document.getElementById("evidence").files).forEach(f => formData.append("evidence", f));

    submitBtn.disabled = true;
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/heat/add`, { method: "POST", body: formData });
      if (res && res.ok) {
        reportMessage.style.color = "green";
        reportMessage.textContent = "Heat report submitted!";
        
        await sendAdminNotification("New Heat Report", `Farmer ${user.first_name} submitted a new heat report for ${swineSelect.value}.`, "info");
        
        reportForm.reset();
        selectedFiles = [];
        mediaPreview.innerHTML = "";
        fileCountBadge.style.display = "none";

        
        await loadReports();
        await refreshSwineData();
      } else {
          const data = await res.json();
          alert("Error: " + (data.message || "Submission failed"));
      }
    } catch (err) { console.error(err); }
    submitBtn.disabled = false;
  });

  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    localStorage.clear();
    window.location.href = "login.html";
  });

  // ---------------- FILTER LOGIC ----------------
  function applyFilters() {
    const status = statusFilter.value;
    const date = dateFilter.value;
    const pig = pigFilter.value;

    const rows = Array.from(reportsTableBody.querySelectorAll("tr"));

    rows.forEach(row => {
      if (!row.dataset.report) return;

      const report = JSON.parse(row.dataset.report);
      let visible = true;

      if (status && report.status !== status) visible = false;

      if (date) {
        const reportDate = new Date(report.createdAt).toISOString().split("T")[0];
        if (reportDate !== date) visible = false;
      }

      if (pig && report.swine !== pig) visible = false;

      row.style.display = visible ? "" : "none";
    });
  }

  searchBtn.addEventListener("click", applyFilters);

  clearFilterBtn.addEventListener("click", () => {
    statusFilter.value = "";
    dateFilter.value = "";
    pigFilter.value = "";

    reportsTableBody.querySelectorAll("tr").forEach(row => {
      row.style.display = "";
    });
  });


  // Initialization
  refreshSwineData();
  loadReports();
  
  setInterval(() => {
    updateCountdowns();
  }, 3600000);

  setInterval(() => {
    loadReports(); 
  }, 60000);
});