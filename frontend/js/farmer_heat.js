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

  // ---------------- LOAD FARMER'S SWINE ----------------
  try {
    const res = await fetchWithAuth(`${BACKEND_URL}/api/swine/farmer`);
    if (res) {
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Failed to fetch swine");

      swineSelect.innerHTML = '<option value="">-- Select Swine --</option>';
      data.swine.forEach(sw => {
        const option = document.createElement("option");
        option.value = sw.swine_id;
        option.textContent = `${sw.swine_id} - ${sw.breed}`;
        swineSelect.appendChild(option);
      });
    }
  } catch (err) {
    console.error("Error loading swine:", err);
    if (swineSelect) swineSelect.innerHTML = "<option value=''>Error loading swine</option>";
  }

  // ---------------- HANDLE FORM SUBMISSION ----------------
  reportForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const selectedSwine = swineSelect.value;
    const signs = Array.from(document.querySelectorAll('input[name="signs"]:checked')).map(cb => cb.value);
    
    // UPDATED: Get multiple files from the input
    const evidenceInput = document.getElementById("evidence");
    const files = evidenceInput.files;

    if (!selectedSwine || signs.length === 0 || files.length === 0) {
      reportMessage.style.color = "red";
      reportMessage.textContent = "Please select swine, at least one sign, and upload at least one evidence file.";
      return;
    }

    const formData = new FormData();
    formData.append("swineId", selectedSwine);
    formData.append("signs", JSON.stringify(signs));
    formData.append("farmerId", userId);

    // UPDATED: Append each file to the "evidence" field (must match upload.array("evidence"))
    for (let i = 0; i < files.length; i++) {
      formData.append("evidence", files[i]);
    }

    try {
      reportMessage.style.color = "blue";
      reportMessage.textContent = "Submitting report and uploading media...";
      
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
        await loadReports(); 
      } else {
        reportMessage.style.color = "red";
        reportMessage.textContent = data.message || "Failed to submit report";
      }
    } catch (err) {
      console.error("Error submitting report:", err);
      reportMessage.style.color = "red";
      reportMessage.textContent = "Server error occurred.";
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
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  }

  // ---------------- LOAD FARMER'S HEAT REPORTS ----------------
  async function loadReports() {
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/heat/farmer/${userId}`);
      if (!res) return;

      const data = await res.json();
      reportsTableBody.innerHTML = "";

      if (!data.success || !data.reports?.length) {
        reportsTableBody.innerHTML = "<tr><td colspan='6'>No reports found</td></tr>";
        return;
      }

      data.reports.forEach(r => {
        const swineCode = r.swine_id?.swine_id || "Unknown";
        const dateReported = new Date(r.createdAt).toLocaleDateString(); // Use createdAt for more accuracy
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
      window.heatCountdownInterval = setInterval(updateCountdowns, 1000);

    } catch (err) {
      console.error("Error fetching heat reports:", err);
      reportsTableBody.innerHTML = `<tr><td colspan='6' style="color:red;">Error: ${err.message}</td></tr>`;
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

      alert("Heat re-emergence reported. The cycle has been reset to 'Approved' for new AI service.");
      await loadReports();
    } catch (err) {
      alert("Failed to submit follow-up: " + err.message);
      console.error(err);
    }
  };

  // ---------------- LOGOUT BUTTON ----------------
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

  await loadReports();
});