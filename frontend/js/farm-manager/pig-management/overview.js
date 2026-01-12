import { authGuard } from "./authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  // Protect page: farm managers OR encoders
  const user = await authGuard(["farm_manager", "encoder"]);
  if (!user) return;

  const token = localStorage.getItem("token");
  const role = user.role;

  // ---------------- DETERMINE MANAGER ID ----------------
  let managerId = null;

  try {
    if (role === "farm_manager") {
      managerId = user.id;
    }

    if (role === "encoder") {
      if (user.managerId) {
        managerId = user.managerId;
      } else {
        const res = await fetch(
          `http://localhost:5000/api/auth/encoders/single/${user.id}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            credentials: "include",
          }
        );

        const data = await res.json();
        if (!res.ok || !data.success || !data.encoder) {
          throw new Error("Encoder profile not found");
        }

        managerId = data.encoder.managerId;
      }
    }
  } catch (err) {
    console.error("Failed to determine managerId:", err);
    return;
  }

  if (!managerId) {
    console.error("Manager ID is missing — cannot load swine");
    return;
  }

  // ---------------- DOM ELEMENTS ----------------
  const swineTableBody = document.getElementById("swineTableBody");
  const farmerSelect = document.getElementById("farmerSelect");
  const sexSelect = document.getElementById("sex");
  const batchInput = document.getElementById("batch");

  /* =========================
     AGE CALCULATION HELPER
  ========================= */
  function calculateAge(birthDate) {
    if (!birthDate) return "—";

    const birth = new Date(birthDate);
    const today = new Date();

    let years = today.getFullYear() - birth.getFullYear();
    let months = today.getMonth() - birth.getMonth();
    let days = today.getDate() - birth.getDate();

    if (days < 0) {
      months--;
      days += 30;
    }
    if (months < 0) {
      years--;
      months += 12;
    }

    return `${years}Y ${months}M ${days}D`;
  }

  // ---------------- FETCH FARMERS ----------------
  async function loadFarmers() {
    if (!farmerSelect) return;

    try {
      const res = await fetch(
        `http://localhost:5000/api/auth/farmers/${managerId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        }
      );

      const data = await res.json();

      farmerSelect.innerHTML = `<option value="">Select Farmer</option>`;

      if (!data.success || !data.farmers?.length) {
        farmerSelect.innerHTML += `<option>No farmers available</option>`;
        return;
      }

      data.farmers.forEach((farmer) => {
        const option = document.createElement("option");
        option.value = farmer._id;
        option.textContent =
          `${farmer.first_name || ""} ${farmer.last_name || ""}`.trim() ||
          "Unnamed Farmer";
        farmerSelect.appendChild(option);
      });
    } catch (err) {
      console.error("Error loading farmers:", err);
      farmerSelect.innerHTML = `<option>Error loading farmers</option>`;
    }
  }

  // ---------------- FETCH SWINE (TABLE RENDER) ----------------
  async function fetchSwine() {
    try {
      swineTableBody.innerHTML = `
        <tr>
          <td colspan="10" class="text-center text-muted">
            Loading swine...
          </td>
        </tr>
      `;

      const res = await fetch("http://localhost:5000/api/swine/all", {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok || !data.success || !data.swine?.length) {
        swineTableBody.innerHTML = `
          <tr>
            <td colspan="10" class="text-center text-muted">
              No swine records found
            </td>
          </tr>
        `;
        return;
      }

      swineTableBody.innerHTML = "";

      data.swine.forEach((sw) => {
        const birthYear = sw.birth_date
          ? new Date(sw.birth_date).getFullYear()
          : "—";

        const age = calculateAge(sw.birth_date);

        const row = document.createElement("tr");

        row.innerHTML = `
          <td>${birthYear}</td>
          <td>${sw.swine_id}</td>
          <td>${sw.sex || "—"}</td>
          <td>${sw.color || "—"}</td>
          <td>${sw.breed || "—"}</td>
          <td>${sw.birth_date ? new Date(sw.birth_date).toLocaleDateString() : "—"}</td>
          <td>${age}</td>
          <td>${sw.status || "—"}</td>
          <td>${sw.batch || "—"}</td>
          <td>
            <button class="btn btn-outline-primary btn-sm">
              View
            </button>
          </td>
        `;

        swineTableBody.appendChild(row);
      });
    } catch (err) {
      console.error("Error loading swine:", err);
      swineTableBody.innerHTML = `
        <tr>
          <td colspan="10" class="text-center text-danger">
            Failed to load swine data
          </td>
        </tr>
      `;
    }
  }

  // ---------------- INITIAL LOAD ----------------
  await loadFarmers(); // OK even if overview-only
  await fetchSwine();
});
