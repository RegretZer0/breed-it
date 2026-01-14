// farm-manager/reports.js
import { authGuard } from "./authGuard.js"; // 🔐 import authGuard

document.addEventListener("DOMContentLoaded", async () => {
  /* =========================
     AUTHENTICATION
  ========================= */
  const user = await authGuard(["farm_manager", "encoder"]);
  if (!user) return;

  const token = localStorage.getItem("token");
  const BACKEND_URL = "http://localhost:5000";

  /* =========================
     DOM ELEMENTS
  ========================= */
  const tableBody = document.getElementById("reportsTableBody");

  const reportDetails = document.getElementById("reportDetails");
  const reportSwine = document.getElementById("reportSwine");
  const reportFarmer = document.getElementById("reportFarmer");
  const reportSigns = document.getElementById("reportSigns");
  const reportProbability = document.getElementById("reportProbability");
  const reportCalendar = document.getElementById("reportCalendar");

  const reportVideo = document.getElementById("reportVideo");
  const reportImage = document.getElementById("reportImage");

  const approveBtn = document.getElementById("approveBtn");
  const confirmAIBtn = document.getElementById("confirmAIBtn");
  const confirmPregnancyBtn = document.getElementById("confirmPregnancyBtn");

  let currentReportId = null;

  /* =========================
     HELPERS
  ========================= */
  function getDaysLeft(targetDate) {
    if (!targetDate) return "-";
    const now = new Date();
    const target = new Date(targetDate);
    const diffMs = target - now;
    return diffMs > 0
      ? Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + " days"
      : "0 days";
  }

  const statusMap = {
    pending: "Pending Review",
    accepted: "Accepted",
    waiting_heat_check: "Waiting (23 days)",
    pregnant: "Pregnant"
  };

  /* =========================
     LOAD REPORTS TABLE
  ========================= */
  async function loadReports() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/heat/all`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include"
      });

      const data = await res.json();
      tableBody.innerHTML = "";

      if (!res.ok || !data.success || !data.reports?.length) {
        tableBody.innerHTML =
          "<tr><td colspan='8'>No reports found</td></tr>";
        return;
      }

      data.reports.forEach(r => {
        const swineId = r.swine_code || "Unknown";
        const farmerName = r.farmer_name || "Unknown";
        const dateReported = new Date(r.date_reported).toLocaleString();
        const probability =
          r.heat_probability !== null ? `${r.heat_probability}%` : "N/A";

        const status = statusMap[r.status] || r.status;

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
          <td>
            <button onclick="viewReport('${r._id}')">View</button>
          </td>
        `;

        tableBody.appendChild(row);
      });
    } catch (err) {
      console.error("Error fetching reports:", err);
      tableBody.innerHTML =
        "<tr><td colspan='8'>Failed to load reports</td></tr>";
    }
  }

  /* =========================
     VIEW REPORT DETAILS
  ========================= */
  window.viewReport = async reportId => {
    try {
      currentReportId = reportId;

      const res = await fetch(`${BACKEND_URL}/api/heat/${reportId}`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include"
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      const r = data.report;

      const swineInfo = r.swine_id
        ? `${r.swine_id.swine_id} (${r.swine_id.breed || "N/A"}, ${
            r.swine_id.sex || "N/A"
          })`
        : "Unknown";

      const farmerName = r.farmer_id
        ? `${r.farmer_id.first_name} ${r.farmer_id.last_name}`
        : "Unknown";

      const signs = r.signs?.join(", ") || "None";
      const probability =
        r.heat_probability !== null ? `${r.heat_probability}%` : "N/A";

      reportSwine.textContent = `Swine: ${swineInfo}`;
      reportFarmer.textContent = `Farmer: ${farmerName}`;
      reportSigns.textContent = `Signs: ${signs}`;
      reportProbability.textContent = `Probability: ${probability}`;

      // Calendar info
      let calendarText = "";
      if (r.next_heat_check) {
        calendarText = `Next heat check: ${new Date(
          r.next_heat_check
        ).toLocaleDateString()}`;
      }
      if (r.expected_farrowing) {
        calendarText = `Expected farrowing: ${new Date(
          r.expected_farrowing
        ).toLocaleDateString()}`;
      }
      reportCalendar.textContent = calendarText;

      // Evidence (image / video)
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

      // Action buttons
      approveBtn.style.display =
        r.status === "pending" ? "inline-block" : "none";

      confirmAIBtn.style.display =
        r.status === "accepted" ? "inline-block" : "none";

      confirmPregnancyBtn.style.display =
        r.status === "waiting_heat_check" ? "inline-block" : "none";
    } catch (err) {
      console.error("Error loading report details:", err);
      alert("Failed to load report details");
    }
  };

  /* =========================
     ACTIONS
  ========================= */
  approveBtn.addEventListener("click", async () => {
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/heat/${currentReportId}/approve`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include"
        }
      );

      if (!res.ok) throw new Error();
      alert("Report approved");
      await viewReport(currentReportId);
      await loadReports();
    } catch {
      alert("Failed to approve report");
    }
  });

  confirmAIBtn.addEventListener("click", async () => {
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/heat/${currentReportId}/confirm-ai`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include"
        }
      );

      if (!res.ok) throw new Error();
      alert("AI confirmed");
      await viewReport(currentReportId);
      await loadReports();
    } catch {
      alert("Failed to confirm AI");
    }
  });

  confirmPregnancyBtn.addEventListener("click", async () => {
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/heat/${currentReportId}/confirm-pregnancy`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include"
        }
      );

      if (!res.ok) throw new Error();
      alert("Pregnancy confirmed");
      await viewReport(currentReportId);
      await loadReports();
    } catch {
      alert("Failed to confirm pregnancy");
    }
  });

  /* =========================
     INIT
  ========================= */
  await loadReports();
});
