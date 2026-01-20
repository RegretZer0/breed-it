import { authGuard } from "/js/authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  // 🔐 Protect page
  const user = await authGuard(["farm_manager", "encoder"]);
  if (!user) return;

  const BACKEND_URL = "http://localhost:5000";
  const token = localStorage.getItem("token");
  const tableBody = document.getElementById("masterBoarTableBody");

  // ================= RESOLVE MANAGER ID =================
  // Necessary to ensure we only see boars registered by this manager
  let managerId = null;
  const role = user.role;

  try {
    if (role === "farm_manager") {
      managerId = user.id;
    } else {
      // If encoder, get the manager they work for
      if (user.managerId) {
        managerId = user.managerId;
      } else {
        const res = await fetch(
          `${BACKEND_URL}/api/auth/encoders/single/${user.id}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();
        managerId = data.encoder?.managerId;
      }
    }
  } catch (err) {
    console.error("Failed to resolve managerId", err);
  }

  const fetchMasterBoars = async () => {
    try {
      // Note: We fetch all adult males, then filter client-side for privacy
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

      // ✅ Updated Master Boar filter:
      // 1. Must be a boar (starts with BOAR- or has no farmer_id)
      // 2. MUST be registered by the current manager (managerId)
      const masterBoars = data.swine.filter(boar => {
        const isBoarType = boar.swine_id.startsWith("BOAR-") || !boar.farmer_id;
        
        // Ownership Check: resolve the ID from the registered_by object or string
        const creatorId = typeof boar.registered_by === "object" 
          ? boar.registered_by._id 
          : boar.registered_by;

        return isBoarType && creatorId?.toString() === managerId?.toString();
      });

      if (masterBoars.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="5" class="text-center text-muted">
              No Master Boars registered under your management.
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