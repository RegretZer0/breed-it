// manage_swine.js
import { authGuard } from "./authGuard.js"; // 🔐 import authGuard

document.addEventListener("DOMContentLoaded", async () => {
  // 🔐 Protect page: only admins
  await authGuard("admin");

  const token = localStorage.getItem("token");
  const adminId = localStorage.getItem("userId");
  const role = localStorage.getItem("role");

  const swineList = document.getElementById("swineList");
  const registerForm = document.getElementById("registerSwineForm");
  const swineMessage = document.getElementById("swineMessage");
  const farmerSelect = document.getElementById("farmerSelect"); // dropdown for farmers
  const sexSelect = document.getElementById("sex"); // dropdown for sex
  const batchInput = document.getElementById("batch"); // batch input (text)

  // Fetch and display farmers (Dropdown)
  async function loadFarmers() {
    try {
      const res = await fetch(`http://localhost:5000/api/auth/farmers/${adminId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to load farmers");

      farmerSelect.innerHTML = '<option value="">Select Farmer</option>';

      if (!data.farmers || data.farmers.length === 0) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "No farmers registered";
        farmerSelect.appendChild(option);
        return;
      }

      data.farmers.forEach(farmer => {
        const option = document.createElement("option");
        option.value = farmer._id;
        option.textContent = farmer.name;
        farmerSelect.appendChild(option);
      });
    } catch (err) {
      console.error("Error loading farmers:", err);
      farmerSelect.innerHTML = '<option value="">Error loading farmers</option>';
    }
  }

  // Fetch and display swine
  async function fetchSwine() {
    try {
      const res = await fetch(`http://localhost:5000/api/swine?userId=${adminId}&role=${role}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        swineList.innerHTML = `<li>Error: ${data.message || "Failed to fetch swine"}</li>`;
        return;
      }

      swineList.innerHTML = "";
      if (!data.swine || data.swine.length === 0) {
        swineList.innerHTML = "<li>No swine registered yet</li>";
        return;
      }

      data.swine.forEach(sw => {
        const li = document.createElement("li");
        li.textContent = `SwineID: ${sw.swine_id}, Batch: ${sw.batch}, Farmer: ${sw.farmer_name || "N/A"}, Sex: ${sw.sex}, Breed: ${sw.breed}, Status: ${sw.status || "N/A"}`;
        swineList.appendChild(li);
      });

    } catch (err) {
      console.error("Error fetching swine:", err);
      swineList.innerHTML = "<li>Server error</li>";
    }
  }

  // Register new swine
  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const selectedFarmerId = farmerSelect.value;
      const selectedSex = sexSelect.value;
      const batchValue = batchInput.value.trim();

      if (!selectedFarmerId) {
        swineMessage.style.color = "red";
        swineMessage.textContent = "Please select a farmer";
        return;
      }

      if (!selectedSex) {
        swineMessage.style.color = "red";
        swineMessage.textContent = "Please select sex";
        return;
      }

      if (!batchValue) {
        swineMessage.style.color = "red";
        swineMessage.textContent = "Please enter batch";
        return;
      }

      const payload = {
        farmer_id: selectedFarmerId,
        sex: selectedSex,
        color: document.getElementById("color").value.trim(),
        breed: document.getElementById("breed").value.trim(),
        birthDate: document.getElementById("birth_date").value,
        status: document.getElementById("status").value.trim(),
        sireId: document.getElementById("sire_id").value.trim(),
        damId: document.getElementById("dam_id").value.trim(),
        inventoryStatus: document.getElementById("inventory_status").value.trim(),
        dateTransfer: document.getElementById("date_transfer").value,
        batch: batchValue,
        adminId: adminId,
      };

      try {
        const res = await fetch("http://localhost:5000/api/swine/add", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(payload),
        });

        const data = await res.json();

        if (res.ok && data.success) {
          swineMessage.style.color = "green";
          swineMessage.textContent = "Swine added successfully!";
          registerForm.reset();
          fetchSwine();
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

  // Initial load
  loadFarmers();
  fetchSwine();
});
