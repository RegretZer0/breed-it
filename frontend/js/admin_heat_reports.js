// admin_heat_reports.js
import { authGuard } from "./authGuard.js"; // 🔐 import authGuard

document.addEventListener("DOMContentLoaded", async () => {
  // ---------------- AUTHENTICATION ----------------
  const user = await authGuard(["farm_manager", "encoder"]);
  if (!user) return;

  const role = user.role;
  const token = localStorage.getItem("token");
  const BACKEND_URL = "http://localhost:5000";

  // ---------------- DOM ELEMENTS ----------------
  const tableBody = document.getElementById("reportsTableBody");
  const reportDetails = document.getElementById("reportDetails");
  const reportSwine = document.getElementById("reportSwine");
  const reportFarmer = document.getElementById("reportFarmer");
  const reportSigns = document.getElementById("reportSigns");
  const reportProbability = document.getElementById("reportProbability");
  const reportVideo = document.getElementById("reportVideo");
  const reportImage = document.getElementById("reportImage");
  const reportCalendar = document.getElementById("reportCalendar");

  const approveBtn = document.getElementById("approveBtn");
  const confirmAIBtn = document.getElementById("confirmAIBtn");
  const confirmPregnancyBtn = document.getElementById("confirmPregnancyBtn");
  const followUpBtn = document.getElementById("followUpBtn");

  let currentReportId = null;

  // ---------------- HELPER: CALCULATE DAYS LEFT ----------------
  function getDaysLeft(targetDate) {
    if (!targetDate) return "-";
    const now = new Date();
    const target = new Date(targetDate);
    const diffMs = target - now;
    return diffMs > 0 ? Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + " days" : "0 days";
  }

  // ---------------- FETCH HEAT REPORTS ----------------
  async function loadReports() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/heat/all`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });

      const data = await res.json();
      tableBody.innerHTML = "";

      if (!res.ok || !data.success || !data.reports?.length) {
        tableBody.innerHTML = "<tr><td colspan='8'>No reports found</td></tr>";
        return;
      }

      data.reports.forEach(r => {
        const swineId = r.swine_code || "Unknown";
        const farmerName = r.farmer_name || "Unknown";
        const dateReported = new Date(r.date_reported).toLocaleString();
        const probability = r.heat_probability !== null ? `${r.heat_probability}%` : "N/A";
        const status = r.status || "pending";

        const nextHeatLeft = getDaysLeft(r.next_heat_check);
        const farrowingLeft = getDaysLeft(r.expected_farrowing);

        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${swineId}</td>
          <td>${farmerName}</td>
          <td>${dateReported}</td>
          <td>${probability}</td>
          <td>${status}</td>
          <td>${nextHeatLeft}</td>
          <td>${farrowingLeft}</td>
          <td><button onclick="viewReport('${r._id}')">View</button></td>
        `;
        tableBody.appendChild(row);
      });
    } catch (err) {
      console.error("Error fetching heat reports:", err);
      tableBody.innerHTML = "<tr><td colspan='8'>Failed to load reports</td></tr>";
    }
  }

  // ---------------- VIEW REPORT DETAILS ----------------
  window.viewReport = async (reportId) => {
    try {
      currentReportId = reportId;

      const res = await fetch(`${BACKEND_URL}/api/heat/${reportId}`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      const r = data.report;
      const swineInfo = r.swine_id
        ? `${r.swine_id.swine_id} (${r.swine_id.breed || "N/A"}, ${r.swine_id.sex || "N/A"})`
        : "Unknown";
      const farmerName = r.farmer_id?.name || `${r.farmer_id?.first_name || ""} ${r.farmer_id?.last_name || ""}`.trim() || "Unknown";
      const signs = r.signs?.join(", ") || "None";
      const probability = r.heat_probability !== null ? `${r.heat_probability}%` : "N/A";

      reportSwine.textContent = `Swine: ${swineInfo}`;
      reportFarmer.textContent = `Farmer: ${farmerName}`;
      reportSigns.textContent = `Signs: ${signs}`;
      reportProbability.textContent = `Probability: ${probability}`;

      // Evidence display
      if (r.evidence_url) {
        const fullUrl = `${BACKEND_URL}${r.evidence_url}`;
        if (fullUrl.endsWith(".mp4") || fullUrl.endsWith(".mov")) {
          reportVideo.src = fullUrl;
          reportVideo.style.display = "block";
          reportImage.style.display = "none";
        } else {
          reportImage.src = fullUrl;
          reportImage.style.display = "block";
          reportVideo.style.display = "none";
        }
      } else {
        reportVideo.style.display = "none";
        reportImage.style.display = "none";
      }

      reportDetails.style.display = "block";

      // ---------------- Show/hide action buttons ----------------
      approveBtn.style.display = r.status === "pending" ? "inline-block" : "none";
      confirmAIBtn.style.display = r.status === "accepted" || r.status === "pending" ? "inline-block" : "none";
      followUpBtn.style.display = r.status === "follow_up_required" ? "inline-block" : "none";
      confirmPregnancyBtn.style.display = r.status === "ai_confirmed" ? "inline-block" : "none";

    } catch (err) {
      console.error("Error loading report details:", err);
      alert("Failed to load report details");
    }
  };

  // ---------------- APPROVE HEAT REPORT ----------------
  approveBtn.addEventListener("click", async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/heat/${currentReportId}/approve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include"
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      alert("Report approved. Status updated to 'accepted'. You can now confirm AI.");
      await viewReport(currentReportId);
      await loadReports();
    } catch (err) {
      alert("Failed to approve report");
      console.error(err);
    }
  });

  // ---------------- CONFIRM AI ----------------
  confirmAIBtn.addEventListener("click", async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/heat/${currentReportId}/confirm-ai`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include"
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      alert("AI confirmed. 23-day countdown started.");
      await viewReport(currentReportId);
      await loadReports();
    } catch (err) {
      alert("Failed to confirm AI");
      console.error(err);
    }
  });

  // ---------------- FOLLOW-UP ----------------
  followUpBtn.addEventListener("click", async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/heat/${currentReportId}/still-heat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include"
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      alert("Follow-up submitted. Countdown restarted.");
      await viewReport(currentReportId);
      await loadReports();
    } catch (err) {
      alert("Failed to submit follow-up");
      console.error(err);
    }
  });

  // ---------------- CONFIRM PREGNANCY ----------------
  confirmPregnancyBtn.addEventListener("click", async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/heat/${currentReportId}/confirm-pregnancy`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include"
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      alert("Pregnancy confirmed. Farrowing countdown started (114-115 days).");
      await viewReport(currentReportId);
      await loadReports();
    } catch (err) {
      alert("Failed to confirm pregnancy");
      console.error(err);
    }
  });

  // ---------------- INITIAL LOAD ----------------
  await loadReports();
});
