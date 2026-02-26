import { authGuard } from "/js/authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  // 🔐 Protect page
  const user = await authGuard(["farm_manager", "encoder"]);
  if (!user) return;

  const BACKEND_URL = "http://localhost:5000";
  const token = localStorage.getItem("token");
  const tableBody = document.getElementById("masterBoarTableBody");
  const registerForm = document.getElementById("registerBoarForm");

  // ================= RESOLVE MANAGER ID =================
  let managerId = null;
  const role = user.role;

  try {
    if (role === "farm_manager") {
      managerId = user.id;
    } else {
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

  // ================= FETCH BOARS LIST =================
  const fetchMasterBoars = async () => {
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/swine/all?sex=Male&age_stage=adult`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const data = await res.json();
      if (!tableBody) return; // Guard for pages without the table
      tableBody.innerHTML = "";

      if (!data.success) {
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Failed to load master boars.</td></tr>`;
        return;
      }

      const masterBoars = data.swine.filter(boar => {
        const isBoarType = boar.swine_id.includes("-BOAR-") || !boar.farmer_id;
        const creatorId = typeof boar.registered_by === "object" 
          ? boar.registered_by._id 
          : boar.registered_by;
        return isBoarType && creatorId?.toString() === managerId?.toString();
      });

      if (masterBoars.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">No Master Boars registered.</td></tr>`;
        return;
      }

      masterBoars.forEach(boar => {
        const latestPerf = (boar.performance_records || []).slice(-1)[0] || {};
        tableBody.innerHTML += `
          <tr>
            <td><strong>${boar.swine_id}</strong></td>
            <td>${boar.breed}</td>
            <td>${boar.color || "N/A"}</td>
            <td>
              <b>Wt:</b> ${latestPerf.weight ?? "--"} kg<br>
              <small><b>Dim:</b> ${latestPerf.body_length ?? "--"}L × ${latestPerf.heart_girth ?? "--"}G</small>
            </td>
            <td>
              <span class="badge ${boar.health_status === "Healthy" ? "bg-success" : "bg-danger"}">${boar.health_status}</span><br>
              <small class="text-muted">${boar.current_status}</small>
            </td>
          </tr>`;
      });
    } catch (err) {
      console.error("Master boar load error:", err);
    }
  };

  // ================= REGISTER BOAR FORM HANDLING =================
  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      // Handling "Other" color specification
      const colorSelect = document.getElementById("colorSelect");
      const otherColorInput = document.getElementById("otherColorInput");
      const finalColor = (colorSelect.value === "Other") ? otherColorInput.value.trim() : colorSelect.value;

      const payload = {
        manager_id: managerId,
        breed: document.getElementById("breed").value,
        color: finalColor,
        
        // 🛠️ KEY FIXES: Mapping frontend IDs to backend snake_case keys
        birth_date: document.getElementById("birthDate").value, // Matches EJS id="birthDate"
        date_transfer: document.getElementById("dateTransfer").value, // Matches EJS id="dateTransfer"
        
        health_status: document.getElementById("healthStatus").value,
        weight: document.getElementById("weight").value,
        bodyLength: document.getElementById("bodyLength").value,
        heartGirth: document.getElementById("heartGirth").value,
        teethCount: document.getElementById("teethCount").value,
        current_status: "Active"
      };

      try {
        const res = await fetch(`${BACKEND_URL}/api/swine/add-master-boar`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (data.success) {
          // Trigger the Success Modal (assuming Bootstrap is available)
          const successModal = new bootstrap.Modal(document.getElementById('successBoarModal'));
          document.getElementById('successBoarId').textContent = `Boar ID: ${data.swine.swine_id}`;
          successModal.show();
          
          registerForm.reset();
          fetchMasterBoars(); // Refresh the list
        } else {
          alert("Error: " + data.message);
        }
      } catch (err) {
        console.error("Registration Error:", err);
        alert("Server error during registration.");
      }
    });

    // Toggle "Other Color" input visibility
    const colorSelect = document.getElementById("colorSelect");
    const otherColorGroup = document.getElementById("otherColorGroup");
    colorSelect.addEventListener("change", () => {
      if (colorSelect.value === "Other") {
        otherColorGroup.classList.remove("d-none");
      } else {
        otherColorGroup.classList.add("d-none");
      }
    });
  }

  // 🚀 Init
  fetchMasterBoars();
});