import { authGuard } from "./authGuard.js"; // 🔐 import authGuard

document.addEventListener("DOMContentLoaded", async () => {
  // Protect the page: only farm managers
  await authGuard("farm_manager");

  const token = localStorage.getItem("token");
  const adminId = localStorage.getItem("userId");
  const BASE_URL = "http://localhost:5000";

  const accountsList = document.getElementById("farmersList"); // reuse list
  const editModal = document.getElementById("editModal");
  const editForm = document.getElementById("editFarmerForm");
  const registerForm = document.getElementById("registerFarmerForm");
  const messageEl = document.getElementById("farmerMessage");

  const roleSelect = document.getElementById("accountRole");
  let currentRole = roleSelect.value;

  // ROLE SWITCH

  roleSelect.addEventListener("change", () => {
    currentRole = roleSelect.value;
    toggleFarmerFields();
    fetchAccounts();
  });

  function toggleFarmerFields() {
    document.querySelectorAll(".farmer-only").forEach(el => {
      el.style.display = currentRole === "farmer" ? "block" : "none";
    });
  }

  // FETCH ACCOUNTS

  async function fetchAccounts() {
    try {
      const endpoint =
        currentRole === "farmer"
          ? `/api/auth/farmers/${adminId}`
          : `/api/auth/encoders/${adminId}`;

      const res = await fetch(`${BASE_URL}${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const text = await res.text();
      console.log("Raw fetch response:", text);

      const data = JSON.parse(text);

      if (!res.ok || !data.success) {
        accountsList.innerHTML = `<li>Error loading ${currentRole}s</li>`;
        return;
      }

      renderAccounts(data[currentRole + "s"]);
    } catch (err) {
      console.error("Fetch error:", err);
      accountsList.innerHTML = "<li>Server error</li>";
    }
  }

  // RENDER

  function renderAccounts(accounts) {
    accountsList.innerHTML = "";

    if (!accounts.length) {
      accountsList.innerHTML = `<li>No ${currentRole}s registered yet.</li>`;
      return;
    }

    accounts.forEach(acc => {
      const li = document.createElement("li");

      li.innerHTML = `
       ${acc.first_name || ""} ${acc.last_name || ""}
        ${
          currentRole === "farmer"
            ? ` - Pens: ${acc.num_of_pens}, Capacity: ${acc.pen_capacity}`
            : ""
        }
        <button class="edit-btn">Edit</button>
      `;

      li.querySelector(".edit-btn")
        .addEventListener("click", () => openEditModal(acc));

      accountsList.appendChild(li);
    });
  }

  // REGISTER
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = {
      first_name: document.getElementById("first_name").value.trim(),
      last_name: document.getElementById("last_name").value.trim(),
      address: document.getElementById("address").value.trim(),
      contact_info: document.getElementById("contact_no").value.trim(),
      email: document.getElementById("email").value.trim(),
      password: document.getElementById("password").value,
      managerId: adminId
    };

    if (currentRole === "farmer") {
      payload.num_of_pens = Number(document.getElementById("num_of_pens").value);
      payload.pen_capacity = Number(document.getElementById("pen_capacity").value);
    }

    const endpoint =
      currentRole === "farmer"
        ? "/api/auth/register-farmer"
        : "/api/auth/register-encoder";

    try {
      const res = await fetch(`${BASE_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        messageEl.style.color = "green";
        messageEl.textContent = `${currentRole} registered successfully!`;
        registerForm.reset();
        fetchAccounts();
      } else {
        messageEl.style.color = "red";
        messageEl.textContent = data.message || "Registration failed";
      }
    } catch (err) {
      console.error("Register error:", err);
      messageEl.textContent = "Server error";
    }
  });

  // EDIT

  function openEditModal(acc) {
    document.getElementById("editFirstName").value = acc.first_name || "";
    document.getElementById("editLastName").value = acc.last_name || "";
    document.getElementById("editAddress").value = acc.address || "";
    document.getElementById("editContact").value = acc.contact_info || "";

    if (currentRole === "farmer") {
      document.getElementById("editPens").value = acc.num_of_pens || 0;
      document.getElementById("editCapacity").value = acc.pen_capacity || 0;
    }

    editForm.dataset.id = acc._id;
    editModal.style.display = "flex";
  }

  editForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = {
      first_name: document.getElementById("editFirstName").value.trim(),
      last_name: document.getElementById("editLastName").value.trim(),
      address: document.getElementById("editAddress").value.trim(),
      contact_info: document.getElementById("editContact").value.trim()
    };


    if (currentRole === "farmer") {
      payload.num_of_pens = Number(document.getElementById("editPens").value);
      payload.pen_capacity = Number(document.getElementById("editCapacity").value);
    }

    const endpoint =
      currentRole === "farmer"
        ? `/api/auth/update-farmer/${editForm.dataset.id}`
        : `/api/auth/update-encoder/${editForm.dataset.id}`;

    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (res.ok && data.success) {
      editModal.style.display = "none";
      fetchAccounts();
    } else {
      alert(data.message || "Update failed");
    }
  });

  // CLOSE MODAL

  document.getElementById("closeModal").addEventListener("click", () => {
    editModal.style.display = "none";
  });

  // INIT

  toggleFarmerFields();
  fetchAccounts();
});
