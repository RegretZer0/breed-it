// admin_heat_charts.js
import { authGuard } from "./authGuard.js"; // 🔐 import authGuard

document.addEventListener("DOMContentLoaded", async () => {
  // First, protect the page
  await authGuard("farm_manager"); // only allow farm managers

  const adminId = localStorage.getItem("userId"); // logged-in farm manager
  const BACKEND_URL = "http://localhost:5000";

  if (!adminId) {
    console.error("No farm manager logged in.");
    return;
  }

  // Chart canvas elements
  const monthlyCtx = document.getElementById("monthlyReportsChart").getContext("2d");
  const statusCtx = document.getElementById("statusReportsChart").getContext("2d");

  let monthlyChart;
  let statusChart;

  // ---------------- FETCH REPORTS ----------------
  async function loadReports() {
    try {
      const token = localStorage.getItem("token"); // 🔐 include token
      const res = await fetch(`${BACKEND_URL}/api/heat/all?adminId=${encodeURIComponent(adminId)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: "include", // include session cookie
      });

      const data = await res.json();

      if (!data.success) throw new Error(data.message || "Failed to load reports");

      return data.reports;

    } catch (err) {
      console.error("Error loading heat reports:", err);
      return [];
    }
  }

  // ---------------- COMPUTE MONTHLY STATS ----------------
  function computeMonthlyStats(reports, year) {
    const months = Array(12).fill(0);

    reports.forEach(r => {
      const d = new Date(r.date_reported);
      if (d.getFullYear() === year) {
        months[d.getMonth()]++;
      }
    });

    return months;
  }

  // ---------------- COMPUTE STATUS STATS ----------------
  function computeStatusStats(reports) {
    let accepted = 0;
    let rejected = 0;

    reports.forEach(r => {
      if (r.status === "accepted") accepted++;
      else if (r.status === "rejected") rejected++;
    });

    return { accepted, rejected };
  }

  // ---------------- RENDER MONTHLY CHART ----------------
  function renderMonthlyChart(data) {
    if (monthlyChart) monthlyChart.destroy();

    monthlyChart = new Chart(monthlyCtx, {
      type: "bar",
      data: {
        labels: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],
        datasets: [{
          label: "Heat Reports per Month",
          data: data,
          backgroundColor: "rgba(54, 162, 235, 0.6)",
          borderColor: "rgba(54, 162, 235, 1)",
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: true }
        },
        scales: {
          y: { beginAtZero: true, precision: 0 }
        }
      }
    });
  }

  // ---------------- RENDER STATUS CHART ----------------
  function renderStatusChart(stats) {
    if (statusChart) statusChart.destroy();

    statusChart = new Chart(statusCtx, {
      type: "pie",
      data: {
        labels: ["Accepted", "Rejected"],
        datasets: [{
          data: [stats.accepted, stats.rejected],
          backgroundColor: ["rgba(75, 192, 192, 0.7)", "rgba(255, 99, 132, 0.7)"],
          borderColor: ["rgba(75, 192, 192, 1)", "rgba(255, 99, 132, 1)"],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: "bottom" },
          tooltip: { enabled: true }
        }
      }
    });
  }

  // LOAD & RENDER
  const reports = await loadReports();
  const currentYear = new Date().getFullYear();

  const monthlyData = computeMonthlyStats(reports, currentYear);
  const statusData = computeStatusStats(reports);

  renderMonthlyChart(monthlyData);
  renderStatusChart(statusData);
});
