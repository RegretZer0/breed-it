import { authGuard } from "/js/authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  // ---------------- AUTHENTICATION ----------------
  const user = await authGuard("farmer");
  if (!user) return;

  const token = localStorage.getItem("token");
  
  /**
   * ✅ UPDATE: Robust ID Selection
   * Matches the backend route: router.get("/farmer/:userId", ...) 
   * which expects the User Model ID.
   */
  const userId = user.id || user._id; 
  const BACKEND_URL = "http://localhost:5000";

  const swineSelect = document.getElementById("swineSelect");
  const reportForm = document.getElementById("heatReportForm");
  const reportMessage = document.getElementById("reportMessage");
  const reportsTableBody = document.getElementById("reportsTableBody");
  const submitBtn = reportForm?.querySelector(".btn-submit");

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

  uploadBtn?.addEventListener("click", () => evidenceInput.click());

  evidenceInput?.addEventListener("change", () => {
    const newFiles = Array.from(evidenceInput.files);
    if (selectedFiles.length + newFiles.length > MAX_FILES) {
      alert(`You can upload a maximum of ${MAX_FILES} files.`);
      evidenceInput.value = "";
      return;
    }
    selectedFiles = [...selectedFiles, ...newFiles];
    renderMediaPreview();
  });

  function renderMediaPreview() {
    if (!mediaPreview) return;
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

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "remove-preview-media";
      removeBtn.innerHTML = "×";
      removeBtn.onclick = () => {
        selectedFiles.splice(index, 1);
        syncFileInput();
        renderMediaPreview();
      };

      const mediaUrl = URL.createObjectURL(file);
      const mediaEl = file.type.startsWith("image") ? document.createElement("img") : document.createElement("video");
      mediaEl.src = mediaUrl;
      if (file.type.startsWith("video")) mediaEl.controls = true;
      mediaEl.onload = () => URL.revokeObjectURL(mediaUrl);
      
      wrapper.append(removeBtn, mediaEl);
      mediaPreview.appendChild(wrapper);
    });
    syncFileInput();
  }

  function syncFileInput() {
    const dataTransfer = new DataTransfer();
    selectedFiles.forEach(file => dataTransfer.items.add(file));
    if (evidenceInput) evidenceInput.files = dataTransfer.files;
  }

  // ---------------- FETCH HELPER ----------------
  async function fetchWithAuth(url, options = {}) {
    options.headers = { ...options.headers, Authorization: `Bearer ${token}` };
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

  const sendAdminNotification = async (title, message, type = "info") => {
    try {
      await fetch(`${BACKEND_URL}/api/notifications/admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title, message, type })
      });
    } catch (err) { console.error("Failed to notify admin:", err); }
  };

  // ---------------- UPDATE STATS & DROPDOWN ----------------
  async function refreshSwineData() {
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/swine/farmer`);
      if (!res) return;
      const data = await res.json();
      const swineList = data.swine || [];
      
      const stats = { open: 0, pregnant: 0, farrowing: 0 };
      const today = new Date();
      const thirtyDaysAgo = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000));

      const eligibleSows = swineList.filter(sw => {
        let status = (sw.current_status || "Open").toLowerCase();
        
        if (status === "pregnant" && sw.expected_farrowing && today >= new Date(sw.expected_farrowing)) status = "farrowing";
        if (status === "lactating") {
          const lastCycle = sw.breeding_cycles?.[sw.breeding_cycles.length - 1];
          if (lastCycle?.actual_farrowing_date && new Date(lastCycle.actual_farrowing_date) <= thirtyDaysAgo) status = "open"; 
        }
        
        if (status === "open") stats.open++;
        else if (status === "pregnant") stats.pregnant++;
        else stats.farrowing++;

        const isFemale = sw.sex?.toLowerCase() === "female" || sw.swine_sex?.toLowerCase() === "female";
        if (isFemale && (status === "open" || status === "lactating")) return true;
        return false;
      });

      if (document.getElementById("countOpen")) document.getElementById("countOpen").textContent = stats.open;
      if (document.getElementById("countPregnant")) document.getElementById("countPregnant").textContent = stats.pregnant;
      if (document.getElementById("countFarrowing")) document.getElementById("countFarrowing").textContent = stats.farrowing;

      /**
       * ✅ UPDATE: We use sw.swine_id for the value because your backend 
       * uses Swine.findOne({ swine_id: swineId }) in /add
       */
      swineSelect.innerHTML = eligibleSows.length 
        ? '<option value="">-- Select Swine --</option>' + eligibleSows.map(sw => `<option value="${sw.swine_id}">${sw.swine_id} - ${sw.breed} (${sw.current_status})</option>`).join("")
        : '<option value="">No eligible sows available</option>';
    } catch (err) { console.error(err); }
  }

  // ---------------- LOAD REPORTS ----------------
  async function loadReports() {
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/heat/farmer`);
      if (!res) return;
      const data = await res.json();

      if (!data.success || !data.reports?.length) {
        reportsTableBody.innerHTML = "<tr><td colspan='6' style='text-align:center;'>No reports found</td></tr>";
        return;
      }

      const now = new Date();
      const pigSet = new Set();

      reportsTableBody.innerHTML = data.reports.map(r => {
        const swineDisplay = r.swine_id?.swine_id || "Unknown";
        pigSet.add(swineDisplay);

        const rawStatus = (r.status || "pending").toLowerCase().trim().replace(/\s+/g, "_");
        const displayStatus = (r.status || "pending").replace(/_/g, " ");
        const isRejected = rawStatus === "rejected";
        const isProcessed = rawStatus !== "pending" && !isRejected;
        const heatCheckDate = r.next_heat_check ? new Date(r.next_heat_check) : null;
        const farrowingDate = r.expected_farrowing ? new Date(r.expected_farrowing) : null;
        const isReadyForPregnancy = rawStatus === "under_observation" && heatCheckDate && now >= heatCheckDate;

        return `
          <tr data-status="${rawStatus}" data-swine="${swineDisplay}" data-date="${r.createdAt.split('T')[0]}">
            <td>${swineDisplay}</td>
            <td>${new Date(r.createdAt).toLocaleDateString()}</td>
            <td>
              <div style="text-transform: capitalize; font-weight: bold; color: ${isRejected ? "#e74c3c" : isProcessed ? "#27ae60" : "#2c3e50"};">
                ${displayStatus === "approved" ? "AI Scheduled" : displayStatus}
              </div>
              <button class="btn-view-evidence" onclick="viewEvidence('${r._id}')" style="margin-top:5px; padding:2px 8px; font-size:0.7em; cursor:pointer;">View Evidence</button>
              ${isProcessed ? `<div style="margin-top:4px;font-size:0.75em;color:#27ae60;opacity:0.8;">Update: ${new Date(r.updatedAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</div>` : ""}
              ${isRejected && r.rejection_message ? `<div class="rejection-note" style="margin-top:8px;padding:8px;background:#fff5f5;border:1px solid #feb2b2;border-radius:4px;font-size:0.8em;color:#c53030;"><strong>Reason:</strong><br>"${r.rejection_message}"</div>` : ""}
            </td>
            <td>
              ${heatCheckDate ? `<b>${rawStatus === "approved" ? "AI Date" : "Check Date"}:</b> ${heatCheckDate.toLocaleDateString()} <span class="next-heat" data-date="${r.next_heat_check}">-</span>` : "-"}
            </td>
            <td>
              ${farrowingDate ? `<b>Target:</b> ${farrowingDate.toLocaleDateString()} <span class="farrowing" data-date="${r.expected_farrowing}">-</span>` : "-"}
            </td>
            <td>
              ${["waiting_heat_check", "under_observation", "approved"].includes(rawStatus) ? `
                <div style="display:flex;flex-direction:column;gap:8px;">
                  ${rawStatus !== "approved" ? `<button class="btn-followup" onclick="submitFollowUp('${r._id}','${swineDisplay}')">Back in Heat</button>` : `<span style="font-size:0.8em;color:#3498db;">Waiting for Admin</span>`}
                  ${rawStatus === "under_observation" ? `<button class="btn-pregnant" ${!isReadyForPregnancy ? "disabled" : ""} onclick="confirmPregnancy('${r._id}','${swineDisplay}')">Confirm Pregnant</button>` : ""}
                </div>` : isRejected ? `<span style="color:#e74c3c;font-weight:bold;">Report Denied</span>` : `<span style="color:#888;">No Action Needed</span>`}
            </td>
          </tr>`;
      }).join("");

      const currentVal = pigFilter.value;
      pigFilter.innerHTML = '<option value="">All pigs</option>' + [...pigSet].sort().map(p => `<option value="${p}">${p}</option>`).join("");
      pigFilter.value = currentVal;

      updateCountdowns();
    } catch (err) { console.error("Load Reports Error:", err); }
  }

  // ---------------- VIEW EVIDENCE MODAL ----------------
  window.viewEvidence = async (reportId) => {
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/heat/${reportId}/detail`);
      const data = await res.json();
      if (!data.success) return alert("Could not load details");

      const report = data.report;
      const evidenceHtml = report.evidence_url.map(url => {
        const src = (url.startsWith('data:') || url.startsWith('http')) ? url : `${BACKEND_URL}${url}`;
        // Support for both video and image playback
        return url.match(/\.(mp4|mov|webm)$/i)
          ? `<video src="${src}" controls style="width:100%; max-width:250px; border-radius:8px; margin:5px;"></video>`
          : `<img src="${src}" style="width:100%; max-width:200px; border-radius:8px; margin:5px;" />`;
      }).join('');

      const modal = document.createElement('div');
      modal.style = "position:fixed; inset:0; background:rgba(0,0,0,0.8); display:flex; align-items:center; justify-content:center; z-index:9999; padding:20px;";
      modal.innerHTML = `
        <div style="background:white; padding:20px; border-radius:12px; max-width:90%; max-height:90%; overflow-y:auto; position:relative;">
          <button style="position:absolute; top:10px; right:10px; border:none; background:none; font-size:24px; cursor:pointer;" onclick="this.parentElement.parentElement.remove()">×</button>
          <h3>Evidence for ${report.swine_id?.swine_id || "Swine"}</h3>
          <div style="display:flex; flex-wrap:wrap; gap:10px; justify-content:center;">${evidenceHtml}</div>
          <p style="margin-top:15px;"><strong>Signs:</strong> ${report.signs.join(', ')}</p>
        </div>
      `;
      document.body.appendChild(modal);
    } catch (err) { console.error(err); }
  };

  // ---------------- HELPERS ----------------
  function formatCountdown(targetDate) {
    if (!targetDate) return "N/A";
    const diffMs = new Date(targetDate) - new Date();
    if (diffMs <= 0) return "Ready/Due";
    const days = Math.floor(diffMs / 86400000);
    return days === 0 ? "Due Tomorrow" : `${days} day${days > 1 ? 's' : ''} left`;
  }

  function updateCountdowns() {
    document.querySelectorAll(".next-heat, .farrowing").forEach(el => {
      if (el.dataset.date) el.textContent = formatCountdown(el.dataset.date);
    });
  }

  // ---------------- ACTIONS ----------------
  window.submitFollowUp = async (id, swineId) => {
    if (!confirm(`Is ${swineId} in heat again?`)) return;
    const res = await fetchWithAuth(`${BACKEND_URL}/api/heat/${id}/still-heat`, { method: "POST" });
    if (res?.ok) {
      alert("Cycle reset for re-insemination.");
      await sendAdminNotification("Sow Back in Heat", `Farmer ${user.first_name} reported ${swineId} back in heat.`, "warning");
      await loadReports();
    }
  };

  window.confirmPregnancy = async (id, swineId) => {
    if (!confirm(`Confirm pregnancy for ${swineId}?`)) return;
    const res = await fetchWithAuth(`${BACKEND_URL}/api/heat/${id}/confirm-pregnancy`, { 
      method: "POST", headers: { "Content-Type": "application/json" }
    });
    if (res?.ok) {
      alert("Pregnancy confirmed!");
      await sendAdminNotification("Pregnancy Confirmed", `${swineId} confirmed pregnant by ${user.first_name}.`, "success");
      await Promise.all([loadReports(), refreshSwineData()]);
    } else {
      const errData = await res.json();
      alert("Failed to confirm: " + (errData.message || "Unknown error"));
    }
  };

  // ---------------- FORM SUBMIT ----------------
  reportForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const selectedSigns = Array.from(document.querySelectorAll('input[name="signs"]:checked')).map(cb => cb.value);
    if (!selectedSigns.length || !swineSelect.value) return alert("Please select swine and signs of heat.");

    const formData = new FormData();
    formData.append("swineId", swineSelect.value);
    formData.append("farmerId", userId); 
    formData.append("signs", JSON.stringify(selectedSigns));
    selectedFiles.forEach(f => formData.append("evidence", f));

    submitBtn.disabled = true;
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/heat/add`, { method: "POST", body: formData });
      if (res?.ok) {
        reportMessage.style.color = "green";
        reportMessage.textContent = "Heat report submitted!";
        await sendAdminNotification("New Heat Report", `Farmer ${user.first_name} submitted a new report for ${swineSelect.value}.`, "info");
        reportForm.reset();
        selectedFiles = [];
        renderMediaPreview();
        await Promise.all([loadReports(), refreshSwineData()]);
      } else {
          const err = await res.json();
          alert(err.message || "Error submitting report");
      }
    } catch (err) { console.error(err); }
    submitBtn.disabled = false;
  });

  // ---------------- FILTER LOGIC ----------------
  searchBtn?.addEventListener("click", () => {
    const s = statusFilter.value, d = dateFilter.value, p = pigFilter.value;
    reportsTableBody.querySelectorAll("tr").forEach(row => {
      const match = (!s || row.dataset.status === s) && (!d || row.dataset.date === d) && (!p || row.dataset.swine === p);
      row.style.display = match ? "" : "none";
    });
  });

  clearFilterBtn?.addEventListener("click", () => {
    [statusFilter, dateFilter, pigFilter].forEach(f => f.value = "");
    reportsTableBody.querySelectorAll("tr").forEach(row => row.style.display = "");
  });

  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    localStorage.clear();
    window.location.href = "login.html";
  });

  // Initial Data Load
  await Promise.all([refreshSwineData(), loadReports()]);
  setInterval(updateCountdowns, 3600000);
  setInterval(loadReports, 60000);
});