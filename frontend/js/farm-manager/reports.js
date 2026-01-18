import { authGuard } from "/js/authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  // ---------------- AUTH ----------------
  const user = await authGuard(["farm_manager", "encoder"]);
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
  const rejectBtn = document.getElementById("rejectBtn");
  const confirmAIBtn = document.getElementById("confirmAIBtn");
  const confirmPregnancyBtn = document.getElementById("confirmPregnancyBtn");

const aiConfirmModal = document.getElementById("aiConfirmModal");
const boarSelect = document.getElementById("boarSelect");
const submitAIBtn = document.getElementById("submitAI");


  let allReports = [];
  let currentReportId = null;

  // ---------------- HELPERS ----------------
  function getDaysLeft(targetDate) {
    if (!targetDate) return "-";

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const target = new Date(targetDate);
    target.setHours(0, 0, 0, 0);

    const diff = target - today;

    if (diff < 0) return "Overdue";
    if (diff === 0) return "TODAY";

    return `${Math.ceil(diff / (1000 * 60 * 60 * 24))} days`;
  }

  // ---------------- FETCH REPORTS ----------------
  async function loadReports() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/heat/all`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include"
      });

      if (res.status === 401 || res.status === 403) {
        alert("Session expired. Please log in again.");
        window.location.href = "login.html";
        return;
      }

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error("Failed to load reports");

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
        ["pending", "approved"].includes(r.status)
      ).length;

    countAwaitingRecheck.textContent =
      reports.filter(r =>
        ["under_observation", "waiting_heat_check"].includes(r.status)
      ).length;

    countPregnant.textContent =
      reports.filter(r => r.status === "pregnant").length;

    countFarrowingReady.textContent =
      reports.filter(r =>
        r.status === "pregnant" &&
        r.expected_farrowing &&
        (() => {
          const days = getDaysLeft(r.expected_farrowing);
          return days !== "-" && days !== "Overdue" && parseInt(days) <= 7;
        })()
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
      const statusLabel = (r.status || "pending").replace(/_/g, " ");

      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${r.swine_id?.swine_id || "-"}</td>
        <td>${r.farmer_id
          ? `${r.farmer_id.first_name} ${r.farmer_id.last_name}`
          : "-"}</td>
        <td>${new Date(r.createdAt).toLocaleDateString()}</td>
        <td style="font-weight:bold;">
          ${r.heat_probability != null ? r.heat_probability + "%" : "N/A"}
        </td>
        <td>
          <span style="text-transform:capitalize;">${statusLabel}</span><br>
          <small class="text-muted">(Swine: ${swineStatus})</small>
        </td>
        <td>
          ${["under_observation", "waiting_heat_check"].includes(r.status) && r.next_heat_check
            ? `<strong>${getDaysLeft(r.next_heat_check)}</strong>`
            : "-"}
        </td>
        <td>
          ${r.status === "pregnant" && r.expected_farrowing
            ? `<strong>${getDaysLeft(r.expected_farrowing)}</strong>`
            : "-"}
        </td>
        <td>
          <button class="btn-view" data-id="${r._id}">View</button>
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

    if (evidences.length && evidences[0]) {
      const url = evidences[0];
      const isVideo = url.match(/\.(mp4|mov|webm)$/i);

      if (isVideo) {
        reportVideo.src = url;
        reportVideo.style.display = "block";
      } else {
        reportImage.src = url;
        reportImage.style.display = "block";
      }
    }

    approveBtn.style.display =
      r.status === "pending" ? "inline-block" : "none";

    if (rejectBtn) {
      rejectBtn.style.display =
        r.status === "pending" ? "inline-block" : "none";
    }

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

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Action failed");

      alert(message);
      reportDetails.style.display = "none";
      loadReports();
    } catch (err) {
      alert("Action failed");
    }
  }

  approveBtn.onclick = () =>
    action("approve", "Report approved");

  if (rejectBtn) {
    rejectBtn.onclick = () => {
      const reason = prompt(
        "Please enter the reason for rejection (this will be shown to the farmer):"
      );

      if (reason === null) return;
      if (!reason.trim()) {
        alert("Rejection reason is required.");
        return;
      }

      action("reject", "Report rejected successfully.", { reason });
    };
  }

  confirmAIBtn.onclick = async () => {
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/swine/all?sex=Male&age_stage=adult`,
        {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include"
        }
      );

      const data = await res.json();
      if (!data.success || !data.swine?.length) {
        alert("No adult boars found.");
        return;
      }

      const masterBoars = data.swine.filter(b =>
        b.swine_id?.startsWith("BOAR-") || b.farmer_id === null
      );

      if (!masterBoars.length) {
        alert("No Master Boars available.");
        return;
      }

      boarSelect.innerHTML = masterBoars
        .map(b => `<option value="${b._id}">${b.swine_id}</option>`)
        .join("");

      aiConfirmModal.style.display = "flex";
    } catch (err) {
      console.error(err);
      alert("Failed to load boars.");
    }
  };


  submitAIBtn.onclick = async () => {
    const maleSwineId = boarSelect.value;
    if (!maleSwineId) return alert("Please select a boar.");

    try {
      const res = await fetch(
        `${BACKEND_URL}/api/heat/${currentReportId}/confirm-ai`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          credentials: "include",
          body: JSON.stringify({ maleSwineId }) // ✅ REQUIRED
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Confirm AI failed");

      alert("AI Confirmed! Swine moved to Under Observation.");
      aiConfirmModal.style.display = "none";
      reportDetails.style.display = "none";
      loadReports();
    } catch (err) {
      alert(err.message);
    }
  };


  confirmPregnancyBtn.onclick = () =>
    action("confirm-pregnancy", "Pregnancy confirmed");


  // ---------------- FILTERING ----------------
  const filterSwine = document.getElementById("filterSwine");
  const filterStatus = document.getElementById("filterStatus");
  const applyFilterBtn = document.getElementById("applyFilter");
  const clearFilterBtn = document.getElementById("clearFilter");

  const filteredCard = document.getElementById("filteredResultsCard");
  const filteredBody = document.getElementById("filteredTableBody");

  applyFilterBtn?.addEventListener("click", () => {
    const swineTerm = filterSwine.value.trim().toLowerCase();
    const statusTerm = filterStatus.value;

    const filtered = allReports.filter(r => {
      const swineMatch = !swineTerm || (r.swine_id?.swine_id || "").toLowerCase().includes(swineTerm);
      const statusMatch = !statusTerm || r.status === statusTerm;
      return swineMatch && statusMatch;
    });

    renderFilteredTable(filtered);
  });

  clearFilterBtn?.addEventListener("click", () => {
    filterSwine.value = "";
    filterStatus.value = "";
    filteredCard.style.display = "none";
  });

  function renderFilteredTable(reports) {
    filteredBody.innerHTML = "";

    if (!reports.length) {
      filteredBody.innerHTML =
        `<tr><td colspan="5">No matching reports</td></tr>`;
      filteredCard.style.display = "block";
      return;
    }

    reports.forEach(r => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${r.swine_id?.swine_id || "-"}</td>
        <td>${r.farmer_id ? `${r.farmer_id.first_name} ${r.farmer_id.last_name}` : "-"}</td>
        <td>${new Date(r.createdAt).toLocaleDateString()}</td>
        <td>${r.status.replace(/_/g, " ")}</td>
        <td>
          <button class="btn-view" data-id="${r._id}">View</button>
        </td>
      `;
      filteredBody.appendChild(row);
    });

    filteredCard.style.display = "block";

    filteredBody.querySelectorAll(".btn-view").forEach(btn => {
      btn.addEventListener("click", () => viewReport(btn.dataset.id));
    });
  }


  // ---------------- INIT ----------------
  loadReports();
});
