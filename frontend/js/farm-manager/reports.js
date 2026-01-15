import { authGuard } from "/js/authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  // ---------------- AUTH ----------------
  const user = await authGuard(["farm_manager"]);
  if (!user) return;

  const token = localStorage.getItem("token");
  const BACKEND_URL = "http://localhost:5000";

  // ---------------- DOM ----------------
  const tableBody = document.getElementById("reportsTableBody");

  const countInHeat = document.getElementById("countInHeat");
  const countAwaitingRecheck = document.getElementById("countAwaitingRecheck");
  const countPregnant = document.getElementById("countPregnant");
  const countFarrowingReady = document.getElementById("countFarrowingReady");

  const reportDetails = document.getElementById("reportDetails");
  const reportSwine = document.getElementById("reportSwine");
  const reportFarmer = document.getElementById("reportFarmer");
  const reportSigns = document.getElementById("reportSigns");
  const reportProbability = document.getElementById("reportProbability");

  const reportVideo = document.getElementById("reportVideo");
  const reportImage = document.getElementById("reportImage");

  const approveBtn = document.getElementById("approveBtn");
  const confirmAIBtn = document.getElementById("confirmAIBtn");
  const confirmPregnancyBtn = document.getElementById("confirmPregnancyBtn");

  let allReports = [];
  let currentReportId = null;

  // ---------------- HELPERS ----------------
  function getDaysLeft(targetDate) {
    if (!targetDate) return "-";
    const diff = new Date(targetDate) - new Date();
    if (diff <= 0) return "Due";
    return Math.ceil(diff / (1000 * 60 * 60 * 24)) + " days";
  }

  // ---------------- FETCH REPORTS ----------------
  async function loadReports() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/heat/all`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include"
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error("Failed to load reports");

      // ✅ SAME AS PROTOTYPE
      allReports = data.reports || [];

      renderStats(allReports);
      renderTable(allReports);

    } catch (err) {
      console.error("Reports load error:", err);
      tableBody.innerHTML =
        `<tr><td colspan="8">Failed to load reports</td></tr>`;
    }
  }

  // ---------------- STATS ----------------
  function renderStats(reports) {
    countInHeat.textContent =
      reports.filter(r =>
        r.status === "pending" || r.status === "approved"
      ).length;

    countAwaitingRecheck.textContent =
      reports.filter(r => r.status === "waiting_heat_check").length;

    countPregnant.textContent =
      reports.filter(r => r.status === "pregnant").length;

    countFarrowingReady.textContent =
      reports.filter(r =>
        r.expected_farrowing &&
        getDaysLeft(r.expected_farrowing) !== "Due" &&
        parseInt(getDaysLeft(r.expected_farrowing)) <= 7
      ).length;
  }

  // ---------------- TABLE ----------------
  function renderTable(reports) {
    tableBody.innerHTML = "";

    if (!reports.length) {
      tableBody.innerHTML =
        `<tr><td colspan="8">No reports found</td></tr>`;
      return;
    }

    reports.forEach(r => {
      const swineStatus = r.swine_id?.current_status || "Unknown";

      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${r.swine_id?.swine_id || "-"}</td>
        <td>${r.farmer_id
          ? `${r.farmer_id.first_name} ${r.farmer_id.last_name}`
          : "-"}</td>
        <td>${new Date(r.createdAt).toLocaleDateString()}</td>
        <td>${r.heat_probability != null ? r.heat_probability + "%" : "N/A"}</td>
        <td>
          ${r.status.replace(/_/g, " ")}<br>
          <small class="text-muted">(Swine: ${swineStatus})</small>
        </td>
        <td>${getDaysLeft(r.next_heat_check)}</td>
        <td>${getDaysLeft(r.expected_farrowing)}</td>
        <td>
          <button class="btn-view" data-id="${r._id}">
            View
          </button>
        </td>
      `;
      tableBody.appendChild(row);
    });

    document.querySelectorAll(".btn-view").forEach(btn => {
      btn.addEventListener("click", () => viewReport(btn.dataset.id));
    });
  }

  // ---------------- VIEW DETAILS ----------------
  function viewReport(id) {
    const r = allReports.find(x => x._id === id);
    if (!r) return;

    currentReportId = id;

    reportSwine.innerHTML =
      `<strong>Swine:</strong> ${r.swine_id?.swine_id || "Unknown"}
       <span style="margin-left:8px;font-size:0.8em;">
         Status: ${r.swine_id?.current_status || "N/A"}
       </span>`;

    reportFarmer.innerHTML =
      `<strong>Farmer:</strong> ${r.farmer_id?.first_name} ${r.farmer_id?.last_name}`;

    reportSigns.innerHTML =
      `<strong>Signs:</strong> ${(r.signs || []).join(", ") || "None"}`;

    reportProbability.innerHTML =
      `<strong>Probability:</strong> ${r.heat_probability != null ? r.heat_probability + "%" : "N/A"}`;

    // Reset media
    reportVideo.style.display = "none";
    reportImage.style.display = "none";

    const evidences = Array.isArray(r.evidence_url)
      ? r.evidence_url
      : r.evidence_url ? [r.evidence_url] : [];

    if (evidences.length) {
      const url = evidences[0];
      if (url.match(/\.(mp4|webm)$/i)) {
        reportVideo.src = url;
        reportVideo.style.display = "block";
      } else {
        reportImage.src = url;
        reportImage.style.display = "block";
      }
    }

    approveBtn.style.display =
      r.status === "pending" ? "inline-block" : "none";

    confirmAIBtn.style.display =
      r.status === "approved" ? "inline-block" : "none";

    confirmPregnancyBtn.style.display =
      r.status === "waiting_heat_check" ? "inline-block" : "none";

    reportDetails.style.display = "block";
  }

  // ---------------- ACTION HANDLER ----------------
  async function action(endpoint, message) {
    if (!currentReportId) return;

    try {
      const res = await fetch(
        `${BACKEND_URL}/api/heat/${currentReportId}/${endpoint}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          credentials: "include"
        }
      );

      if (!res.ok) throw new Error();

      alert(message);
      reportDetails.style.display = "none";
      loadReports();

    } catch (err) {
      alert("Action failed");
    }
  }

  approveBtn.onclick = () =>
    action("approve", "Report approved");

  confirmAIBtn.onclick = () =>
    action("confirm-ai", "AI confirmed");

  confirmPregnancyBtn.onclick = () =>
    action("confirm-pregnancy", "Pregnancy confirmed");

  // ---------------- INIT ----------------
  loadReports();
});
