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

  console.log("Current user role:", role);
  console.log("Manager ID determined:", managerId);

  if (!managerId) {
    console.error("Manager ID is missing — cannot load farmers or swine");
    return;
  }

  // ---------------- DOM ELEMENTS ----------------
  const swineList = document.getElementById("swineList");
  const registerForm = document.getElementById("registerSwineForm");
  const swineMessage = document.getElementById("swineMessage");
  const farmerSelect = document.getElementById("farmerSelect");
  const sexSelect = document.getElementById("sex");
  const batchInput = document.getElementById("batch");

  // ---------------- FETCH FARMERS ----------------
  async function loadFarmers() {
    try {
      console.log("Loading farmers for managerId:", managerId);

      const res = await fetch(
        `http://localhost:5000/api/auth/farmers/${managerId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        }
      );

      const data = await res.json();
      console.log("Farmers received:", data);

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

  // ---------------- FETCH SWINE (MANAGER/ENCODER SCOPED) ----------------
  async function fetchSwine() {
    try {
      console.log("Loading swine (session scoped)");

      const res = await fetch(`http://localhost:5000/api/swine/all`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });

      const data = await res.json();
      console.log("Swine data received:", data);

      swineList.innerHTML = `<li>Loading...</li>`;

      if (!res.ok || !data.success || !data.swine?.length) {
        swineList.innerHTML = "<li>No swine registered yet</li>";
        return;
      }

      swineList.innerHTML = "";
      data.swine.forEach((sw) => {
        const li = document.createElement("li");
        li.textContent = `SwineID: ${sw.swine_id}, Batch: ${sw.batch}, Farmer: ${
          sw.farmer_name || "N/A"
        }, Sex: ${sw.sex}, Breed: ${sw.breed}, Status: ${sw.status || "N/A"}`;
        swineList.appendChild(li);
      });
    } catch (err) {
      console.error("Error loading swine:", err);
      swineList.innerHTML = "<li>Error loading swine</li>";
    }
  }

  // ---------------- REGISTER NEW SWINE ----------------
  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (!farmerSelect.value || !sexSelect.value || !batchInput.value.trim()) {
        swineMessage.style.color = "red";
        swineMessage.textContent = "All required fields must be filled";
        return;
      }

      const payload = {
        farmer_id: farmerSelect.value,
        sex: sexSelect.value,
        color: document.getElementById("color").value.trim(),
        breed: document.getElementById("breed").value.trim(),
        birthDate: document.getElementById("birth_date").value,
        status: document.getElementById("status").value.trim(),
        sireId: document.getElementById("sire_id").value.trim(),
        damId: document.getElementById("dam_id").value.trim(),
        inventoryStatus: document.getElementById("inventory_status").value.trim(),
        dateTransfer: document.getElementById("date_transfer").value,
        batch: batchInput.value.trim(),
        managerId,
      };

      try {
        const res = await fetch("http://localhost:5000/api/swine/add", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
          body: JSON.stringify(payload),
        });

        const data = await res.json();

        if (res.ok && data.success) {
          swineMessage.style.color = "green";
          swineMessage.textContent = "Swine added successfully!";
          registerForm.reset();
          fetchSwine(); // refresh list
        } else {
          swineMessage.style.color = "red";
          swineMessage.textContent = data.message || "Failed to add swine";
        }
      } catch (err) {
        console.error("Error adding swine:", err);
        swineMessage.style.color = "red";
        swineMessage.textContent = "Server error";
      }
    });
  }

  // ---------------- BACK TO DASHBOARD ----------------
  const backBtn = document.getElementById("backDashboardBtn");
  if (backBtn) {
    backBtn.addEventListener("click", async () => {
      const token = localStorage.getItem("token");
      if (!token) return (window.location.href = "login.html");

      try {
        const res = await fetch("http://localhost:5000/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        });

        const data = await res.json();
        console.log("Back button /me response:", data);

        if (!res.ok || !data.success || !data.user) {
          localStorage.clear();
          return (window.location.href = "login.html");
        }

        const userRole = data.user.role;

        if (userRole === "system_admin" || userRole === "farm_manager") {
          window.location.href = "admin_dashboard.html";
        } else if (userRole === "encoder") {
          window.location.href = "encoder_dashboard.html";
        } else {
          window.location.href = "login.html";
        }
      } catch (err) {
        console.error("Back to dashboard redirect failed:", err);
        window.location.href = "login.html";
      }
    });
  }

  // ---------------- INITIAL LOAD ----------------
  await loadFarmers();
  await fetchSwine();
});
