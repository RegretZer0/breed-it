// farmer_heat.js
import { authGuard } from "./authGuard.js";

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
      reportsTableBody.innerHTML = "";

      if (!data.success || !data.reports?.length) {
        reportsTableBody.innerHTML = "<tr><td colspan='6' style='text-align:center;'>No reports found</td></tr>";
        return;
      }

      const now = new Date();

      data.reports.forEach(r => {
        const swineDisplay = r.swine_id?.swine_id || r.swine_id || "Unknown";
        const dateReported = new Date(r.createdAt).toLocaleDateString(); 
        
        const rawStatus = (r.status || "pending").toLowerCase().trim().replace(/\s+/g, '_');
        const displayStatus = (r.status || "pending").replace(/_/g, ' ');

        const allowedStatuses = ["waiting_heat_check", "under_observation", "approved"];
        
        const isCompleted = rawStatus === "completed" || rawStatus === "pregnant" || rawStatus === "farrowing_ready";
        const isRejected = rawStatus === "rejected"; 
        const isProcessed = rawStatus !== "pending" && !isRejected;
        
        const updateDateFormatted = new Date(r.updatedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
        const rejectionText = r.rejection_message || r.reason || "";

        const heatCheckDate = r.next_heat_check ? new Date(r.next_heat_check) : null;
        const farrowingDate = r.expected_farrowing ? new Date(r.expected_farrowing) : null;
        
        const isReadyForPregnancy = (rawStatus === "under_observation") && heatCheckDate && (now >= heatCheckDate);

        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${swineDisplay}</td>
          <td>${dateReported}</td>
          <td>
            <div style="text-transform: capitalize; font-weight: bold; color: ${isRejected ? '#e74c3c' : isProcessed ? '#27ae60' : '#2c3e50'};">
              ${displayStatus === 'approved' ? 'AI Scheduled' : displayStatus}
            </div>
            
            ${isProcessed ? `
              <div style="margin-top: 4px; font-size: 0.75em; color: #27ae60; opacity: 0.8;">
                Update: ${updateDateFormatted}
              </div>
            ` : ''}

            ${isRejected && rejectionText ? `
              <div class="rejection-note" style="margin-top: 8px; padding: 8px; background: #fff5f5; border: 1px solid #feb2b2; border-radius: 4px; font-size: 0.8em; color: #c53030; line-height: 1.4;">
                <strong>Reason:</strong><br>
                "${rejectionText}"
              </div>
            ` : ''}
          </td>
          <td>
            ${(!isCompleted && !isRejected && heatCheckDate) ? `
              <div style="font-size: 0.85em; color: #555; margin-bottom: 4px;">
                  <b>${rawStatus === 'approved' ? 'AI Date' : 'Check Date'}:</b> ${heatCheckDate.toLocaleDateString()}
              </div>
              <span class="next-heat" data-date="${r.next_heat_check || ''}">-</span>
            ` : '-'}
          </td>
          <td>
            ${(isCompleted && farrowingDate) ? `
              <div style="font-size: 0.85em; color: #555; margin-bottom: 4px;">
                  <b>Target:</b> ${farrowingDate.toLocaleDateString()}
              </div>
              <span class="farrowing" data-date="${r.expected_farrowing || ''}">-</span>
            ` : '-'}
          </td>
          <td>
            ${allowedStatuses.includes(rawStatus) ? 
              `<div style="display:flex; flex-direction:column; gap:8px; width: 100%;">
                
                ${rawStatus !== 'approved' ? `
                <button class="btn-followup" 
                   style="background-color: #f39c12 !important; color: white !important; border: none; padding: 8px; border-radius: 4px; cursor: pointer; width: 100%; display: block;"
                   onclick="submitFollowUp('${r._id}', '${swineDisplay}')">Back in Heat</button>
                ` : '<span style="color:#3498db; font-size:0.8em;">Waiting for Admin to Confirm AI</span>'}
                
                ${rawStatus === "under_observation" ? `
                <button class="btn-pregnant" 
                  ${!isReadyForPregnancy ? 'disabled' : ''} 
                  style="${!isReadyForPregnancy 
                    ? 'background-color:#ccc !important; color:#777 !important; cursor:not-allowed; opacity:0.8; border: 1px solid #999; padding: 8px; border-radius: 4px; width: 100%; display: block !important;' 
                    : 'background-color:#28a745 !important; color:white !important; cursor:pointer; border: none; padding: 8px; border-radius: 4px; width: 100%; display: block !important;'}"
                  title="${!isReadyForPregnancy ? 'Wait for 21-day heat re-check' : 'Confirm Pregnancy'}"
                  onclick="confirmPregnancy('${r._id}', '${swineDisplay}')">
                  Confirm Pregnant
                </button>` : ''}
              </div>` : 
              (isRejected ? `<span style="color: #e74c3c; font-size: 0.8em; font-weight:bold;">Report Denied</span>` : `<span style="color: #888; font-size: 0.8em;">No Action Needed</span>`)}
          </td>
        `;
        reportsTableBody.appendChild(row);
      });

      updateCountdowns();
    } catch (err) { console.error("Load Reports Error:", err); }
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
        document.getElementById("mediaPreview").innerHTML = "";
        if(document.getElementById("fileCountBadge")) document.getElementById("fileCountBadge").style.display = "none";
        
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