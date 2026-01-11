// admin_heat_reports.js
import { authGuard } from "./authGuard.js"; // 🔐 import authGuard

document.addEventListener("DOMContentLoaded", async () => {
  // ---------------- AUTHENTICATION ----------------
  // Allow both farm_manager and encoder
  const user = await authGuard(["farm_manager", "encoder"]);
  if (!user) return;

  const role = user.role;
  const token = localStorage.getItem("token");
  const BACKEND_URL = "http://localhost:5000";

  // ---------------- DETERMINE ADMIN/FARM MANAGER ID ----------------
  // Encoders will use their managerId to fetch reports
  let adminId = null;
  if (role === "farm_manager") {
    adminId = user.id;
  } else if (role === "encoder") {
    adminId = user.managerId; // managerId must exist from updated authMiddleware
    if (!adminId) {
      console.error("Encoder does not have a linked managerId");
      return;
    }
  }

  // ---------------- DOM ELEMENTS ----------------
  const tableBody = document.getElementById("reportsTableBody");
  const reportDetails = document.getElementById("reportDetails");
  const reportSwine = document.getElementById("reportSwine");
  const reportFarmer = document.getElementById("reportFarmer");
  const reportSigns = document.getElementById("reportSigns");
  const reportProbability = document.getElementById("reportProbability");
  const reportVideo = document.getElementById("reportVideo");
  const reportImage = document.getElementById("reportImage");

  // ---------------- FETCH HEAT REPORTS ----------------
  async function loadReports() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/heat/all?adminId=${encodeURIComponent(adminId)}`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });

      const data = await res.json();
      console.log("Heat reports received:", data);

      tableBody.innerHTML = ""; // clear table before populating

      if (!res.ok || !data.success || !data.reports?.length) {
        tableBody.innerHTML = "<tr><td colspan='5'>No reports found</td></tr>";
        return;
      }

      data.reports.forEach(r => {
        const swineId = r.swine_code || "Unknown";
        const farmerName = r.farmer_name || "Unknown";
        const dateReported = new Date(r.date_reported).toLocaleString();
        const probability = r.heat_probability !== null ? `${r.heat_probability}%` : "N/A";

        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${swineId}</td>
          <td>${farmerName}</td>
          <td>${dateReported}</td>
          <td>${probability}</td>
          <td><button onclick="viewReport('${r._id}')">View</button></td>
        `;
        tableBody.appendChild(row);
      });
    } catch (err) {
      console.error("Error fetching heat reports:", err);
      tableBody.innerHTML = "<tr><td colspan='5'>Failed to load reports</td></tr>";
    }
  }

  // ---------------- VIEW REPORT DETAILS ----------------
  window.viewReport = async (reportId) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/heat/${reportId}?adminId=${encodeURIComponent(adminId)}`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      const r = data.report;
      const swineInfo = r.swine_id
        ? `${r.swine_id.swine_id} (${r.swine_id.breed || "N/A"}, ${r.swine_id.sex || "N/A"})`
        : "Unknown";
      const farmerName = r.farmer_id?.name || "Unknown";
      const signs = r.signs?.join(", ") || "None";
      const probability = r.heat_probability !== null ? `${r.heat_probability}%` : "N/A";

      reportSwine.textContent = `Swine: ${swineInfo}`;
      reportFarmer.textContent = `Farmer: ${farmerName}`;
      reportSigns.textContent = `Signs: ${signs}`;
      reportProbability.textContent = `Probability: ${probability}`;

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
    } catch (err) {
      console.error("Error loading report details:", err);
      alert("Failed to load report details");
    }
  };

  // ---------------- INITIAL LOAD ----------------
  await loadReports();
});
