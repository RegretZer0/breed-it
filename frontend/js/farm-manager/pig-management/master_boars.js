import { authGuard } from "/js/authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  // 🔐 Protect page
  const user = await authGuard(["farm_manager", "encoder"]);
  if (!user) return;

  const BACKEND_URL = "http://localhost:5000";
  const token = localStorage.getItem("token");
  const tableBody = document.getElementById("masterBoarTableBody");

  const fetchMasterBoars = async () => {
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/swine/all?sex=Male&age_stage=adult`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const data = await res.json();
      tableBody.innerHTML = "";

      if (!data.success) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="5" class="text-center text-danger">
              Failed to load master boars.
            </td>
          </tr>`;
        return;
      }

      // ✅ Master Boar filter
      const masterBoars = data.swine.filter(boar =>
        boar.swine_id?.startsWith("BOAR-") || boar.farmer_id === null
      );

      if (masterBoars.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="5" class="text-center text-muted">
              No Master Boars registered.
            </td>
          </tr>`;
        return;
      }

      masterBoars.forEach(boar => {
        const latestPerf =
          (boar.performance_records || []).slice(-1)[0] || {};

        tableBody.innerHTML += `
          <tr>
            <td><strong>${boar.swine_id}</strong></td>
            <td>${boar.breed}</td>
            <td>${boar.color || "N/A"}</td>
            <td>
              <b>Wt:</b> ${latestPerf.weight ?? "--"} kg<br>
              <small>
                <b>Dim:</b>
                ${latestPerf.body_length ?? "--"}L ×
                ${latestPerf.heart_girth ?? "--"}G
              </small>
            </td>
            <td>
              <span class="badge ${
                boar.health_status === "Healthy"
                  ? "bg-success"
                  : "bg-danger"
              }">
                ${boar.health_status}
              </span><br>
              <small class="text-muted">${boar.current_status}</small>
            </td>
          </tr>
        `;
      });

    } catch (err) {
      console.error("Master boar load error:", err);
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center text-danger">
            Server error loading master boars.
          </td>
        </tr>`;
    }
  };

  // 🚀 Init
  fetchMasterBoars();
});
