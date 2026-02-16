import { authGuard } from "/js/authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  // ---------------- AUTHENTICATION ----------------
  const user = await authGuard("farmer");
  if (!user) return;

  const token = localStorage.getItem("token");
  const userId = user.id || user._id; 
  const BACKEND_URL = "http://localhost:5000";

  const swineSelect = document.getElementById("swineSelect");
  const reportForm = document.getElementById("heatReportForm");
  const reportMessage = document.getElementById("reportMessage");
  const reportsTableBody = document.getElementById("reportsTableBody");
  const submitBtn = reportForm?.querySelector(".btn-submit");

  /* ---------------- FILTER ELEMENT REFERENCES ----------------*/
  const statusFilter = document.getElementById("statusFilter");
  const searchBtn = document.getElementById("searchBtn");
  const clearFilterBtn = document.getElementById("clearFilterBtn");

  const tagSearchInput = document.getElementById("tagSearchInput");
  const dateFromFilter = document.getElementById("dateFromFilter");
  const dateToFilter = document.getElementById("dateToFilter");

  const statusTabs = document.querySelectorAll(".status-tab");

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
      if (file.type.startsWith("video")) {
        mediaEl.controls = true;
        mediaEl.style.maxHeight = "100px"; 
      }
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
    options.headers = { 
        ...options.headers, 
        Authorization: `Bearer ${localStorage.getItem("token")}` 
    };
    options.credentials = "include";

    try {
      const res = await fetch(url, options);
      if (res.status === 401) {
        alert("Authorization Error: Session expired or system clock changed. Please log in again.");
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
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
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
      today.setHours(0, 0, 0, 0);

      const eligibleSows = swineList.filter(sw => {
        let status = (sw.current_status || "Open").toLowerCase();
        const farrowDate = sw.expected_farrowing_date || sw.expected_farrowing;
        
        if (status === "pregnant" && farrowDate) {
            const target = new Date(farrowDate);
            target.setHours(0,0,0,0);
            const diffTime = target.getTime() - today.getTime();
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays <= 7) status = "farrowing";
        }
        
        if (status === "open") stats.open++;
        else if (status === "pregnant") stats.pregnant++;
        else if (status === "farrowing" || status === "farrowing ready") stats.farrowing++;

        const isFemale = (sw.sex || sw.swine_sex || "").toLowerCase() === "female";
        return isFemale && (status === "open");
      });

      if (document.getElementById("countOpen")) document.getElementById("countOpen").textContent = stats.open;
      if (document.getElementById("countPregnant")) document.getElementById("countPregnant").textContent = stats.pregnant;
      if (document.getElementById("countFarrowing")) document.getElementById("countFarrowing").textContent = stats.farrowing;

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

      /* ---------------- STATUS TAB FILTER ----------------*/
      statusTabs.forEach(tab => {
        tab.addEventListener("click", () => {
          statusTabs.forEach(t => t.classList.remove("active"));
          tab.classList.add("active");

          const selectedStatus = tab.dataset.status;

          document.querySelectorAll(".report-item").forEach(card => {
            if (!selectedStatus || card.dataset.status === selectedStatus) {
              card.style.display = "";
            } else {
              card.style.display = "none";
            }
          });
        });
      });

      /* ---------------- EMPTY STATE RENDER ----------------*/
      if (!data.success || !data.reports?.length) {
        reportsTableBody.innerHTML = `
          <div class="empty-state">
            No reports found
          </div>
        `;
        return;
      }

      const now = new Date();
      now.setHours(0,0,0,0);

      reportsTableBody.innerHTML = data.reports.map(r => {
        const swineDisplay = r.swine_id?.swine_id || "Unknown";

        const rawStatus = (r.status || "pending")
          .toLowerCase()
          .trim()
          .replace(/\s+/g, "_");

        const displayStatus = (r.status || "pending").replace(/_/g, " ");

        const heatCheckDate = r.next_heat_check
          ? new Date(r.next_heat_check)
          : null;

        const farrowingDate = r.expected_farrowing
          ? new Date(r.expected_farrowing)
          : null;

        return `
          <div class="report-item"
              data-status="${rawStatus}"
              data-swine="${swineDisplay}"
              data-date="${r.createdAt.split("T")[0]}">

            <div class="report-card">

              <!-- TOP RIGHT STATUS -->
              <div class="report-status-pill ${rawStatus}">
                ${displayStatus}
              </div>

              <div class="report-main">

                <!-- PROFILE SLOT -->
                <div class="report-avatar">
                  <div class="avatar-placeholder">
                    <i class="fa-solid fa-piggy-bank"></i>
                  </div>
                </div>

                <!-- MAIN INFO -->
                <div class="report-info">
                  <div class="report-header-line">
                    <h3>${swineDisplay}</h3>
                    <span class="report-date">
                      ${new Date(r.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <div class="report-sub-info">
                    <span class="dynamic-status">
                      ${displayStatus}
                    </span>
                    <span class="days-remaining">
                      ${formatCountdown(r.next_heat_check || r.expected_farrowing)}
                    </span>
                  </div>

                  <!-- ACTIONS -->
                  <div class="report-actions">
                    <button class="btn-view-evidence"
                            onclick="viewEvidence('${r._id}')">
                      View Detail
                    </button>

                    <button class="btn-track-progress"
                            onclick="submitFollowUp('${r._id}', '${swineDisplay}')">
                      Track Progress
                    </button>
                  </div>

                </div>
              </div>
            </div>
          </div>
        `;

      }).join("");

      updateCountdowns();
    } catch (err) { console.error("Load Reports Error:", err); }
  }

  // ---------------- VIEW EVIDENCE MODAL ----------------
  window.viewEvidence = async (reportId) => {
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/heat/${reportId}/detail`);
      if (!res) return;
      const data = await res.json();
      if (!data.success) return alert("Could not load details");

      const report = data.report;
      const evidenceHtml = report.evidence_url.map(url => {
        const src = (url.startsWith('data:') || url.startsWith('http')) ? url : `${BACKEND_URL}${url}`;
        return url.match(/\.(mp4|mov|webm)$/i)
          ? `<video src="${src}" controls style="width:100%; max-width:250px; border-radius:8px; margin:5px;"></video>`
          : `<img src="${src}" style="width:100%; max-width:200px; border-radius:8px; margin:5px;" />`;
      }).join('');

      const modal = document.createElement('div');
      modal.className = "evidence-overlay";
      modal.innerHTML = `
        <div class="evidence-modal">
          <button class="evidence-close" onclick="this.closest('.evidence-overlay').remove()">×</button>
          <h3>Evidence for ${report.swine_id?.swine_id || "Swine"}</h3>

          <div class="evidence-gallery">
            ${evidenceHtml}
          </div>

          <div class="evidence-signs">
            <strong>Observed Signs:</strong><br>
            ${report.signs.join(', ')}
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    } catch (err) { console.error(err); }
  };

  // ---------------- HELPERS ----------------
  function formatCountdown(targetDate) {
    if (!targetDate) return "";
    const today = new Date();
    today.setHours(0,0,0,0);
    const target = new Date(targetDate);
    target.setHours(0,0,0,0);
    
    const diffTime = target.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return "Overdue";
    if (diffDays === 0) return "TODAY";
    if (diffDays === 1) return "Tomorrow";
    return `${diffDays} days left`;
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
    if (!confirm(`Confirm pregnancy for ${swineId}? Farrowing date will be set to 115 days from today.`)) return;
    const res = await fetchWithAuth(`${BACKEND_URL}/api/heat/${id}/confirm-pregnancy`, { 
      method: "POST", 
      headers: { "Content-Type": "application/json" }
    });
    
    if (res && res.ok) {
      alert("Pregnancy confirmed! Gestation started (115 days).");
      await sendAdminNotification("Pregnancy Confirmed", `${swineId} confirmed pregnant by ${user.first_name}.`, "success");
      await Promise.all([loadReports(), refreshSwineData()]);
    } else if (res) {
      const errData = await res.json();
      alert("Failed to confirm: " + (errData.message || "Unknown error"));
    }
  };

  // NEW FEATURE: CONFIRM WEANING
  window.confirmWeaning = async (id, swineId) => {
    if (!confirm(`Confirm weaning for ${swineId}? This will move the sow back to "Open" status.`)) return;
    const res = await fetchWithAuth(`${BACKEND_URL}/api/heat/${id}/confirm-weaning`, { 
      method: "POST", 
      headers: { "Content-Type": "application/json" }
    });
    
    if (res && res.ok) {
      alert("Weaning confirmed! The sow is now back to Open status.");
      await sendAdminNotification("Sow Weaned", `${swineId} has been weaned by ${user.first_name}.`, "info");
      await Promise.all([loadReports(), refreshSwineData()]);
    } else if (res) {
      const errData = await res.json();
      alert("Failed to wean: " + (errData.message || "Unknown error"));
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
    reportMessage.textContent = "Uploading report and media...";
    reportMessage.style.color = "blue";

    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/heat/add`, { 
        method: "POST", 
        body: formData 
      });

      if (!res) throw new Error("No response from server");

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const textError = await res.text();
        console.error("Server returned non-JSON:", textError);
        throw new Error("Server error (Check file size or backend logs)");
      }

      const data = await res.json();
      if (res.ok) {
          reportMessage.textContent = "Heat report submitted!";
        await sendAdminNotification("New Heat Report", `Farmer ${user.first_name} submitted a new report for ${swineSelect.value}.`, "info");
        reportForm.reset();
        selectedFiles = [];
        renderMediaPreview();
        await Promise.all([loadReports(), refreshSwineData()]);
      } else {
        alert(data.message || "Error submitting report");
      }
    } catch (err) { 
      console.error("Submission Error:", err);
      alert(err.message || "Failed to submit report. Video might be too large.");
    } finally {
      submitBtn.disabled = false;
    }
  });

  /* ---------------- ADVANCED FILTER APPLY ----------------
   Purpose: Apply combined filters (status dropdown, tag search, date range)
*/
searchBtn?.addEventListener("click", () => {

  const statusVal = statusFilter.value;
  const tagVal = tagSearchInput.value.trim().toLowerCase();
  const fromDate = dateFromFilter.value;
  const toDate = dateToFilter.value;

  reportsTableBody.querySelectorAll(".report-item").forEach(card => {

    const cardStatus = card.dataset.status;
    const cardDate = card.dataset.date;
    const cardSwine = card.dataset.swine.toLowerCase();

    const matchStatus = !statusVal || cardStatus === statusVal;
    const matchTag = !tagVal || cardSwine.includes(tagVal);
    const matchFrom = !fromDate || cardDate >= fromDate;
    const matchTo = !toDate || cardDate <= toDate;

    const shouldShow = matchStatus && matchTag && matchFrom && matchTo;

    card.style.display = shouldShow ? "" : "none";
  });
});


  /* -------------- FILTER RESET ----------------*/
  clearFilterBtn?.addEventListener("click", () => {

    tagSearchInput.value = "";
    dateFromFilter.value = "";
    dateToFilter.value = "";
    statusFilter.value = "";

    reportsTableBody.querySelectorAll(".report-item").forEach(card => {
      card.style.display = "";
    });

    statusTabs.forEach(t => t.classList.remove("active"));
    if (statusTabs.length > 0) statusTabs[0].classList.add("active");
  });

  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    localStorage.clear();
    window.location.href = "login.html";
  });

  await Promise.all([refreshSwineData(), loadReports()]);
  setInterval(updateCountdowns, 30000); 
  setInterval(loadReports, 60000);
});