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

  // ---------------- FETCH HELPER WITH SESSION CHECK ----------------
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

      const contentType = res.headers.get("content-type");
      if (!res.ok || !contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error("Server returned non-JSON response:", text);
        throw new Error(`Server Error: ${res.status} ${res.statusText}`);
      }

      return res;
    } catch (err) {
      console.error("Fetch helper error:", err);
      throw err;
    }
  }

  // ---------------- UPDATE STATS ----------------
  async function updateStats(swineList) {
    const stats = {
      open: 0,
      pregnant: 0,
      farrowing: 0
    };

    const today = new Date();

    swineList.forEach(sw => {
      let status = (sw.current_status || "Open").toLowerCase();
      
      if (status === "pregnant" && sw.expected_farrowing) {
        if (today >= new Date(sw.expected_farrowing)) {
          status = "farrowing";
        }
      }

      if (status === "open") stats.open++;
      if (status === "pregnant") stats.pregnant++;
      if (status === "farrowing" || status === "lactating") stats.farrowing++;
    });

    const openEl = document.getElementById("countOpen");
    const pregEl = document.getElementById("countPregnant");
    const farrEl = document.getElementById("countFarrowing");

    if (openEl) openEl.textContent = stats.open;
    if (pregEl) pregEl.textContent = stats.pregnant;
    if (farrEl) farrEl.textContent = stats.farrowing;
  }

  // ---------------- LOAD DATA INITIALLY ----------------
  async function refreshSwineData() {
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/swine/farmer`);
      if (res) {
        const data = await res.json();
        if (!data.success) throw new Error(data.message || "Failed to fetch swine");

        updateStats(data.swine);

        swineSelect.innerHTML = '<option value="">-- Select Swine --</option>';

        const eligibleSows = data.swine.filter(sw => 
          sw.age_stage?.toLowerCase() === "adult" && 
          sw.sex?.toLowerCase() === "female" && 
          (sw.current_status?.toLowerCase() === "open" || !sw.current_status)
        );

        if (eligibleSows.length === 0) {
          const opt = document.createElement("option");
          opt.textContent = "No eligible sows (Open/Adult) available";
          opt.disabled = true;
          swineSelect.appendChild(opt);
        } else {
          eligibleSows.forEach(sw => {
            const option = document.createElement("option");
            option.value = sw.swine_id;
            option.textContent = `${sw.swine_id} - ${sw.breed} (${sw.current_status})`;
            swineSelect.appendChild(option);
          });
        }
      }
    } catch (err) {
      console.error("Error loading swine:", err);
      if (swineSelect) swineSelect.innerHTML = "<option value=''>Error loading swine</option>";
    }
  }

  // ---------------- HANDLE FORM SUBMISSION ----------------
  reportForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const selectedSwine = swineSelect.value;
    const signs = Array.from(document.querySelectorAll('input[name="signs"]:checked')).map(cb => cb.value);
    
    const evidenceInput = document.getElementById("evidence");
    const files = evidenceInput.files;

    if (!selectedSwine || signs.length === 0 || files.length === 0) {
      reportMessage.style.color = "red";
      reportMessage.textContent = "Please select swine, at least one sign, and upload at least one evidence file.";
      return;
    }

    // Prepare Multipart Form Data
    const formData = new FormData();
    formData.append("swineId", selectedSwine);
    formData.append("signs", JSON.stringify(signs));
    formData.append("farmerId", userId);

    for (let i = 0; i < files.length; i++) {
      formData.append("evidence", files[i]);
    }

    try {
      // Disable UI during upload
      submitBtn.disabled = true;
      submitBtn.textContent = "Uploading...";
      reportMessage.style.color = "blue";
      reportMessage.textContent = `Uploading ${files.length} file(s). Please wait...`;
      
      const res = await fetchWithAuth(`${BACKEND_URL}/api/heat/add`, {
        method: "POST",
        body: formData 
      });
      
      if (!res) return;
      const data = await res.json();

      if (res.ok && data.success) {
        reportMessage.style.color = "green";
        reportMessage.textContent = "Heat report submitted successfully!";
        reportForm.reset();
        
        // Clear media previews and badge
        document.getElementById('mediaPreview').innerHTML = '';
        const badge = document.getElementById('fileCountBadge');
        if (badge) badge.style.display = 'none';

        // Refresh table and stats
        await loadReports(); 
        await refreshSwineData();
      } else {
        reportMessage.style.color = "red";
        reportMessage.textContent = data.message || "Failed to submit report";
      }
    } catch (err) {
      console.error("Error submitting report:", err);
      reportMessage.style.color = "red";
      reportMessage.textContent = "Server error occurred during upload.";
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Report to Manager";
    }
  });

  // ---------------- HELPER: FORMAT COUNTDOWN ----------------
  function formatCountdown(targetDate) {
    if (!targetDate) return "-";
    const now = new Date();
    const diffMs = new Date(targetDate) - now;
    if (diffMs <= 0) return "Check Due";

    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    return `${days}d ${hours}h ${minutes}m`;
  }

  // ---------------- LOAD FARMER'S HEAT REPORTS ----------------
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

      data.reports.forEach(r => {
        const swineCode = r.swine_id?.swine_id || "Unknown";
        const dateReported = new Date(r.createdAt).toLocaleDateString(); 
        const status = r.status || "pending";

        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${swineCode}</td>
          <td>${dateReported}</td>
          <td style="text-transform: capitalize; font-weight: bold;">${status.replace(/_/g, ' ')}</td>
          <td>
            <small>Next Check:</small> <br>
            <span class="next-heat" data-date="${r.next_heat_check || ''}">${r.next_heat_check ? '-' : 'N/A'}</span>
          </td>
          <td>
            <small>Farrowing:</small> <br>
            <span class="farrowing" data-date="${r.expected_farrowing || ''}">${r.expected_farrowing ? '-' : 'N/A'}</span>
          </td>
          <td>
            ${status === "waiting_heat_check" ? 
              `<button class="btn-followup" onclick="submitFollowUp('${r._id}')">Still in Heat?</button>` : 
              `<span style="color: #888; font-size: 0.8em;">No Action Needed</span>`}
          </td>
        `;
        reportsTableBody.appendChild(row);
      });

      updateCountdowns();
      clearInterval(window.heatCountdownInterval);
      window.heatCountdownInterval = setInterval(updateCountdowns, 10000); // 10s refresh is enough for minutes

    } catch (err) {
      console.error("Error fetching heat reports:", err);
      reportsTableBody.innerHTML = `<tr><td colspan='6' style="color:red; text-align:center;">Error: ${err.message}</td></tr>`;
    }
  }

  // ---------------- UPDATE COUNTDOWNS ----------------
  function updateCountdowns() {
    document.querySelectorAll(".next-heat").forEach(el => {
      const date = el.dataset.date;
      if (date) el.textContent = formatCountdown(date);
    });

    document.querySelectorAll(".farrowing").forEach(el => {
      const date = el.dataset.date;
      if (date) el.textContent = formatCountdown(date);
    });
  }

  // ---------------- FOLLOW-UP: "STILL IN HEAT" ----------------
  window.submitFollowUp = async (reportId) => {
    if (!confirm("Are you sure this sow is still showing signs of heat? This will reset the AI cycle.")) return;

    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/heat/${reportId}/still-heat`, {
        method: "POST"
      });
      if (!res) return;
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      alert("Heat re-emergence reported. The cycle has been reset.");
      await loadReports();
      await refreshSwineData();
    } catch (err) {
      alert("Failed to submit follow-up: " + err.message);
      console.error(err);
    }
  };

  // ---------------- LOGOUT ----------------
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await fetchWithAuth(`${BACKEND_URL}/api/auth/logout`, { method: "POST" });
      } catch (err) {
        console.error("Logout error:", err);
      } finally {
        localStorage.clear();
        window.location.href = "login.html";
      }
    });
  }

  // Initial Load
  await refreshSwineData();
  await loadReports();
});