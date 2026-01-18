// admin_heat_charts.js
import { authGuard } from "/js/authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  // 🔐 Protect the page
  await authGuard(["farm_manager", "encoder"]);

  const token = localStorage.getItem("token");
  const BACKEND_URL = "http://localhost:5000";

  // Chart canvas elements
  const monthlyCtx = document.getElementById("monthlyReportsChart").getContext("2d");
  const statusCtx = document.getElementById("statusReportsChart").getContext("2d");
  const farmerCtx = document.getElementById("farmerActivityChart").getContext("2d");
  const probabilityCtx = document.getElementById("probabilityChart").getContext("2d");
  const insightSummaryBody = document.getElementById("insightSummaryBody");

  let monthlyChart, statusChart, farmerChart, probabilityChart;

  // ---------------- FETCH REPORTS ----------------
  async function loadReports() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/heat/all`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Failed to load reports");
      return data.reports;
    } catch (err) {
      console.error("Error loading heat reports:", err);
      return [];
    }
  }

  // ---------------- DATA PROCESSING ----------------
  function processAnalytics(reports) {
    const currentYear = new Date().getFullYear();
    const stats = {
      monthly: Array(12).fill(0),
      status: { pending: 0, approved: 0, waiting: 0, pregnant: 0, reset: 0 },
      farmers: {},
      probabilities: { low: 0, medium: 0, high: 0 }
    };

    reports.forEach(r => {
      // Monthly Stats
      const d = new Date(r.createdAt || r.date_reported);
      if (d.getFullYear() === currentYear) {
        stats.monthly[d.getMonth()]++;
      }

      // Status Stats
      if (r.status === "pending") stats.status.pending++;
      else if (r.status === "approved" || r.status === "ai_service") stats.status.approved++;
      else if (r.status === "waiting_heat_check") stats.status.waiting++;
      else if (r.status === "pregnant") stats.status.pregnant++;
      else if (r.status === "follow_up_required" || r.status === "still_heat") stats.status.reset++;

      // Farmer Stats
      const farmerName = r.farmer_id ? `${r.farmer_id.first_name} ${r.farmer_id.last_name}` : "Unknown";
      stats.farmers[farmerName] = (stats.farmers[farmerName] || 0) + 1;

      // Probability Stats
      const prob = r.heat_probability || 0;
      if (prob < 50) stats.probabilities.low++;
      else if (prob < 80) stats.probabilities.medium++;
      else stats.probabilities.high++;
    });

    return stats;
  }

  // ---------------- RENDER CHARTS ----------------
  function renderAllCharts(stats) {
    // 1. Monthly Bar Chart
    monthlyChart = new Chart(monthlyCtx, {
      type: "bar",
      data: {
        labels: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],
        datasets: [{
          label: "Submissions",
          data: stats.monthly,
          backgroundColor: "#3498db",
          borderRadius: 4
        }]
      },
      options: { responsive: true, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    });

    // 2. Status Doughnut Chart
    statusChart = new Chart(statusCtx, {
      type: "doughnut",
      data: {
        labels: ["Pending", "Active AI", "Wait Recheck", "Pregnant", "Returned to Heat"],
        datasets: [{
          data: Object.values(stats.status),
          backgroundColor: ["#95a5a6", "#3498db", "#f1c40f", "#2ecc71", "#e74c3c"]
        }]
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });

    // 3. Farmer Activity Chart
    farmerChart = new Chart(farmerCtx, {
      type: "bar",
      data: {
        labels: Object.keys(stats.farmers),
        datasets: [{
          label: "Reports Submitted",
          data: Object.values(stats.farmers),
          backgroundColor: "#9b59b6"
        }]
      },
      options: { indexAxis: 'y', responsive: true }
    });

    // 4. Probability Accuracy (Radar or Pie)
    probabilityChart = new Chart(probabilityCtx, {
      type: "pie",
      data: {
        labels: ["Low (<50%)", "Medium (50-80%)", "High (>80%)"],
        datasets: [{
          data: [stats.probabilities.low, stats.probabilities.medium, stats.probabilities.high],
          backgroundColor: ["#e67e22", "#f1c40f", "#27ae60"]
        }]
      }
    });
  }

  // ---------------- RENDER INSIGHTS TABLE ----------------
  function renderSummaryTable(stats) {
    const total = Object.values(stats.status).reduce((a, b) => a + b, 0);
    const successRate = total > 0 ? ((stats.status.pregnant / total) * 100).toFixed(1) : 0;
    
    insightSummaryBody.innerHTML = `
      <tr>
        <td><strong>AI Success Rate</strong></td>
        <td>${successRate}%</td>
        <td><span class="indicator" style="background:${successRate > 70 ? '#2ecc71' : '#f39c12'}"></span> ${successRate > 70 ? 'Healthy' : 'Needs Review'}</td>
      </tr>
      <tr>
        <td><strong>Pending Review</strong></td>
        <td>${stats.status.pending} reports</td>
        <td><span class="indicator" style="background:${stats.status.pending > 5 ? '#e74c3c' : '#2ecc71'}"></span> ${stats.status.pending > 5 ? 'Overloaded' : 'Managed'}</td>
      </tr>
      <tr>
        <td><strong>Active Breeding Cycles</strong></td>
        <td>${stats.status.approved + stats.status.waiting} active</td>
        <td><span class="indicator" style="background:#3498db"></span> Operational</td>
      </tr>
    `;
  }

  // ---------------- INITIALIZE ----------------
  const reports = await loadReports();
  const processedStats = processAnalytics(reports);
  
  renderAllCharts(processedStats);
  renderSummaryTable(processedStats);
});