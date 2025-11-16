document.addEventListener("DOMContentLoaded", async () => {
  const tableBody = document.getElementById("reportsTableBody");
  const reportDetails = document.getElementById("reportDetails");
  const reportSwine = document.getElementById("reportSwine");
  const reportFarmer = document.getElementById("reportFarmer");
  const reportSigns = document.getElementById("reportSigns");
  const reportProbability = document.getElementById("reportProbability");
  const reportVideo = document.getElementById("reportVideo");
  const reportImage = document.getElementById("reportImage");

  const BACKEND_URL = "http://localhost:5000";
  try {
    const res = await fetch(`${BACKEND_URL}/api/heat/all`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    // Display populated swine and farmer info
    data.reports.forEach(r => {
      const swineId = r.swine_id?.swine_id || "Unknown";
      const farmerName = r.farmer_id?.name || "Unknown";
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

  window.viewReport = async (reportId) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/heat/${reportId}`);
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
});
