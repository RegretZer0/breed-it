import { authGuard } from "./authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  const user = await authGuard(["farm_manager", "encoder"]);
  if (!user) return;

  const token = localStorage.getItem("token");
  const managerId =
    user.role === "farm_manager" ? user.id : user.managerId;

  const farmerSelect = document.getElementById("farmerSelect");
  const form = document.getElementById("registerSwineForm");
  const messageEl = document.getElementById("swineMessage");

  async function loadFarmers() {
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

      if (!res.ok || !data.success || !data.farmers?.length) {
        farmerSelect.innerHTML +=
          `<option disabled>No farmers found</option>`;
        return;
      }

      data.farmers.forEach(f => {
        const opt = document.createElement("option");
        opt.value = f._id;
        opt.textContent = `${f.first_name} ${f.last_name}`.trim();
        farmerSelect.appendChild(opt);
      });
    } catch (err) {
      console.error(err);
      farmerSelect.innerHTML =
        `<option disabled>Error loading farmers</option>`;
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = {
      farmer_id: farmerSelect.value,
      batch: document.getElementById("batch").value.trim(),
      sex: document.getElementById("sex").value,
      breed: document.getElementById("breed").value,
      color: document.getElementById("color").value,
      birthDate: document.getElementById("birth_date").value,
      status: document.getElementById("status").value,
      sireId: document.getElementById("sire_id").value,
      damId: document.getElementById("dam_id").value,
      inventoryStatus: document.getElementById("inventory_status").value,
      dateTransfer: document.getElementById("date_transfer").value,
    };

    if (!payload.farmer_id || !payload.batch || !payload.sex) {
      messageEl.textContent = "Farmer, Batch, and Sex are required";
      messageEl.style.color = "red";
      return;
    }

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
      if (!res.ok || !data.success)
        throw new Error(data.message);

      messageEl.textContent =
        `Pig registered successfully (${data.swine.swine_id})`;
      messageEl.style.color = "green";
      form.reset();
    } catch (err) {
      messageEl.textContent = err.message;
      messageEl.style.color = "red";
    }
  });

  await loadFarmers();
});
