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
  const daysLeft = (date) => {
    if (!date) return "-";
    const diff = new Date(date) - new Date();
    if (diff <= 0) return "Due";
    return Math.ceil(diff / (1000 * 60 * 60 * 24)) + " days";
  };

  // ---------------- FETCH REPORTS ----------------
  async function loadReports() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/heat/all`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include"
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      allReports = data.reports;
      renderStats(allReports);
      renderTable(allReports);

    } catch (err) {
      tableBody.innerHTML =
        `<tr><td colspan="8">Failed to load reports</td></tr>`;
      console.error(err);
    }
  }

  // ---------------- STATS ----------------
  function renderStats(reports) {
    countInHeat.textContent =
      reports.filter(r => r.status === "approved").length;

    countAwaitingRecheck.textContent =
      reports.filter(r => r.status === "waiting_heat_check").length;

    countPregnant.textContent =
      reports.filter(r => r.status === "pregnant").length;

    countFarrowingReady.textContent =
      reports.filter(r => r.expected_farrowing &&
        daysLeft(r.expected_farrowing) <= 7).length;
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
      const row = document.createElement("tr");

      row.innerHTML = `
        <td>${r.swine_id?.swine_id || "-"}</td>
        <td>${r.farmer_id
          ? r.farmer_id.first_name + " " + r.farmer_id.last_name
          : "-"}</td>
        <td>${new Date(r.createdAt).toLocaleDateString()}</td>
        <td>${r.heat_probability ?? "N/A"}%</td>
        <td>${r.status.replace(/_/g, " ")}</td>
        <td>${daysLeft(r.next_heat_check)}</td>
        <td>${daysLeft(r.expected_farrowing)}</td>
        <td>
          <button class="btn-view" data-id="${r._id}">
            View
          </button>
        </td>
      `;

      tableBody.appendChild(row);
    });

    document.querySelectorAll(".btn-view").forEach(btn => {
      btn.onclick = () => viewReport(btn.dataset.id);
    });
  }

  // ---------------- VIEW DETAILS ----------------
  function viewReport(id) {
    const r = allReports.find(x => x._id === id);
    if (!r) return;

    currentReportId = id;

    reportSwine.innerHTML =
      `<strong>Swine:</strong> ${r.swine_id?.swine_id}`;
    reportFarmer.innerHTML =
      `<strong>Farmer:</strong> ${r.farmer_id?.first_name} ${r.farmer_id?.last_name}`;
    reportSigns.innerHTML =
      `<strong>Signs:</strong> ${r.signs?.join(", ")}`;
    reportProbability.innerHTML =
      `<strong>Probability:</strong> ${r.heat_probability}%`;

    // Evidence
    reportVideo.style.display = "none";
    reportImage.style.display = "none";

    if (r.evidence_url) {
      if (r.evidence_url.match(/\.(mp4|webm)$/)) {
        reportVideo.src = r.evidence_url;
        reportVideo.style.display = "block";
      } else {
        reportImage.src = r.evidence_url;
        reportImage.style.display = "block";
      }
    }

    approveBtn.style.display = r.status === "pending" ? "inline-block" : "none";
    confirmAIBtn.style.display = r.status === "approved" ? "inline-block" : "none";
    confirmPregnancyBtn.style.display =
      r.status === "waiting_heat_check" ? "inline-block" : "none";

    reportDetails.style.display = "block";
  }

  // ---------------- ACTIONS ----------------
  async function action(endpoint, message) {
    if (!currentReportId) return;

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

    if (!res.ok) {
      alert("Action failed");
      return;
    }

    alert(message);
    reportDetails.style.display = "none";
    loadReports();
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
