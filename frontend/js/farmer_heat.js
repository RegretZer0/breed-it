// farmer_heat.js
import { authGuard } from "./authGuard.js"; // 🔐 import authGuard

document.addEventListener("DOMContentLoaded", async () => {
  const user = await authGuard("farmer");
  if (!user) return;

  const token = localStorage.getItem("token");
  const userId = user.id; // farmer ID

  const swineSelect = document.getElementById("swineSelect");
  const reportForm = document.getElementById("heatReportForm");
  const reportMessage = document.getElementById("reportMessage");
  const reportsTableBody = document.getElementById("reportsTableBody");

  // ---------------- FETCH HELPER WITH SESSION CHECK ----------------
  async function fetchWithAuth(url, options = {}) {
    options.headers = options.headers || {};
    options.headers.Authorization = `Bearer ${token}`;
    options.credentials = "include";

    const res = await fetch(url, options);

    if (res.status === 401) {
      alert("Session expired. Please log in again.");
      localStorage.clear();
      window.location.href = "login.html";
      return null;
    }

    return res;
  }

  // ---------------- LOAD FARMER'S SWINE ----------------
  try {
    const res = await fetchWithAuth(`http://localhost:5000/api/swine/farmer`);
    if (!res) return; // session expired
    const data = await res.json();
    if (!data.success) throw new Error(data.message || "Failed to fetch swine");

    data.swine.forEach(sw => {
      const option = document.createElement("option");
      option.value = sw.swine_id;
      option.textContent = `${sw.swine_id} - ${sw.breed}`;
      swineSelect.appendChild(option);
    });
  } catch (err) {
    console.error("Error loading swine:", err);
    swineSelect.innerHTML = "<option value=''>Error loading swine</option>";
  }

  // ---------------- HANDLE FORM SUBMISSION ----------------
  reportForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const selectedSwine = swineSelect.value;
    const signs = Array.from(document.querySelectorAll('input[name="signs"]:checked')).map(cb => cb.value);
    const evidence = document.getElementById("evidence").files[0];

    if (!selectedSwine || signs.length === 0 || !evidence) {
      reportMessage.style.color = "red";
      reportMessage.textContent = "Please select swine, at least one sign, and upload evidence.";
      return;
    }

    const formData = new FormData();
    formData.append("swineId", selectedSwine);
    formData.append("signs", JSON.stringify(signs));
    formData.append("evidence", evidence);
    formData.append("farmerId", userId);

    try {
      const res = await fetchWithAuth("http://localhost:5000/api/heat/add", {
        method: "POST",
        body: formData
      });
      if (!res) return; // session expired
      const data = await res.json();

      if (res.ok && data.success) {
        reportMessage.style.color = "green";
        reportMessage.textContent = "Heat report submitted successfully!";
        reportForm.reset();
        await loadReports(); // refresh reports after submission  
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
    if (diffMs <= 0) return "0d 0h 0m 0s";

    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  }

  // ---------------- LOAD FARMER'S HEAT REPORTS ----------------
  async function loadReports() {
    try {
      const res = await fetchWithAuth(`http://localhost:5000/api/heat/farmer/${userId}`);
      if (!res) return; // session expired
      const data = await res.json();
      reportsTableBody.innerHTML = "";

      if (!res.ok || !data.success || !data.reports?.length) {
        reportsTableBody.innerHTML = "<tr><td colspan='7'>No reports found</td></tr>";
        return;
      }

      data.reports.forEach(r => {
        const swineId = r.swine_code || "Unknown";
        const dateReported = new Date(r.date_reported).toLocaleString();
        const status = r.status || "pending";

        // Farmer display: first_name + last_name
        const farmerName = r.farmer_id ? `${r.farmer_id.first_name} ${r.farmer_id.last_name}` : "Unknown";
        const farmerCode = r.farmer_id?.farmer_id || "Unknown";

        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${swineId}</td>
          <td>${farmerName} (${farmerCode})</td>
          <td>${dateReported}</td>
          <td>${status}</td>
          <td>
            Next Heat: ${r.next_heat_check ? `<span class="next-heat" data-date="${r.next_heat_check}">-</span>` : "-"}<br>
            Expected Farrowing: ${r.expected_farrowing ? `<span class="farrowing" data-date="${r.expected_farrowing}">-</span>` : "-"}
          </td>
          <td>
            ${status === "follow_up_required" ? `<button onclick="submitFollowUp('${r._id}')">Follow-up</button>` : ""}
          </td>
        `;
        reportsTableBody.appendChild(row);
      });

      updateCountdowns();
      clearInterval(window.heatCountdownInterval);
      window.heatCountdownInterval = setInterval(updateCountdowns, 1000);

    } catch (err) {
      console.error("Error fetching heat reports:", err);
      reportsTableBody.innerHTML = "<tr><td colspan='7'>Failed to load reports</td></tr>";
    }
  }

  // ---------------- UPDATE COUNTDOWNS ----------------
  function updateCountdowns() {
    document.querySelectorAll(".next-heat").forEach(el => {
      const date = el.dataset.date;
      el.textContent = formatCountdown(date);
    });

    document.querySelectorAll(".farrowing").forEach(el => {
      const date = el.dataset.date;
      el.textContent = formatCountdown(date);
    });
  }

  // ---------------- FOLLOW-UP SUBMISSION ----------------
  window.submitFollowUp = async (reportId) => {
    try {
      const res = await fetchWithAuth(`http://localhost:5000/api/heat/${reportId}/still-heat`, {
        method: "POST"
      });
      if (!res) return; // session expired
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      alert("Follow-up submitted. Countdown restarted.");
      await loadReports();
    } catch (err) {
      alert("Failed to submit follow-up");
      console.error(err);
    }
  };

  // ---------------- LOGOUT BUTTON ----------------
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await fetchWithAuth("http://localhost:5000/api/auth/logout", { method: "POST" });
      } catch (err) {
        console.error("Logout error:", err);
      } finally {
        localStorage.clear();
        window.location.href = "login.html";
      }
    });
  }

  // ---------------- INITIAL LOAD ----------------
  await loadReports();
});
