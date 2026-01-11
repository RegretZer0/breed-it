document.addEventListener("DOMContentLoaded", () => {
  loadAdminStats();
  loadUsers();
  loadDataOversight();

  document.getElementById("logoutBtn").addEventListener("click", logout);
  document.getElementById("searchUser").addEventListener("input", filterUsers);
});

// SYSTEM OVERVIEW
function loadAdminStats() {
  fetch("http://localhost:5000/api/admin/stats", { credentials: "include" })
    .then(res => res.text())
    .then(text => {
      try {
        const data = JSON.parse(text);
        if (!data.success) {
          alert("Access denied.");
          window.location.href = "login.html";
          return;
        }

        const stats = data.stats || {};
        document.getElementById("farmManagers").textContent = stats.farmManagers ?? 0;
        document.getElementById("farmers").textContent = stats.farmers ?? 0;
        document.getElementById("swine").textContent = stats.swine ?? 0;
        document.getElementById("heatReports").textContent = stats.heatReports ?? 0;
        document.getElementById("breeding").textContent = stats.breedingRecords ?? 0;

      } catch (err) {
        console.error("Stats response not JSON:", text);
      }
    })
    .catch(err => console.error(err));
}

// LOGOUT
function logout() {
  fetch("http://localhost:5000/api/auth/logout", {
    method: "POST",
    credentials: "include"
  }).then(() => window.location.href = "login.html");
}

// USER & ACCESS CONTROL
let allUsers = [];

function loadUsers() {
  fetch("http://localhost:5000/api/admin/users", { credentials: "include" })
    .then(res => res.json())
    .then(data => {
      if (!data.success) return;
      allUsers = Array.isArray(data.users) ? data.users : [];
      renderUsersTable(allUsers);
    })
    .catch(err => console.error(err));
}

function renderUsersTable(users) {
  const tbody = document.querySelector("#usersTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  users.forEach(user => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${user.name || "-"}</td>
      <td>${user.email}</td>
      <td>
        <select class="roleSelect" data-id="${user._id}">
          <option value="system_admin" ${user.role === "system_admin" ? "selected" : ""}>System Admin</option>
          <option value="farm_manager" ${user.role === "farm_manager" ? "selected" : ""}>Farm Manager</option>
          <option value="farmer" ${user.role === "farmer" ? "selected" : ""}>Farmer</option>
        </select>
      </td>
      <td>
        <select class="statusSelect" data-id="${user._id}">
          <option value="active" ${user.status === "active" ? "selected" : ""}>Active</option>
          <option value="disabled" ${user.status === "disabled" ? "selected" : ""}>Disabled</option>
        </select>
      </td>
      <td>
        <button class="updateBtn" data-id="${user._id}">Update</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  document.querySelectorAll(".updateBtn").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const role = document.querySelector(`.roleSelect[data-id="${id}"]`).value;
      const status = document.querySelector(`.statusSelect[data-id="${id}"]`).value;
      updateUser(id, { role, status });
    });
  });
}

function updateUser(id, payload) {
  fetch(`http://localhost:5000/api/admin/user/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload)
  })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        alert("User updated");
        loadUsers();
      } else {
        alert("Update failed");
      }
    })
    .catch(err => console.error(err));
}

function filterUsers(e) {
  const q = e.target.value.toLowerCase();
  renderUsersTable(
    allUsers.filter(u =>
      (u.fullName || u.name || "").toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    )
  );
}

// DATA OVERSIGHT

function loadDataOversight() {
  fetch("http://localhost:5000/api/admin/data", { credentials: "include" })
    .then(res => res.text())
    .then(text => {
      try {
        const parsed = JSON.parse(text);
        const data = parsed.data || parsed;

        renderFarmManagersTable(data.farmManagers);
        renderFarmersTable(data.farmers);
        renderSwineTable(data.swine);
        renderHeatReportsTable(data.heatReports);
        renderBreedingTable(data.breedingRecords);

      } catch (err) {
        console.error("Data oversight response not JSON:", text);
      }
    })
    .catch(err => console.error(err));
}

/* -------- Render Tables Individually -------- */
function renderFarmManagersTable(rows = []) {
  const tbody = document.querySelector("#farmManagersTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  rows.forEach(fm => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${fm._id}</td>
      <td>${fm.fullName || "-"}</td>
      <td>${fm.email || "-"}</td>
      <td>${fm.status || "-"}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderFarmersTable(rows = []) {
  const tbody = document.querySelector("#farmersTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  rows.forEach(f => {
    const registeredBy = f.registered_by?.fullName || "-";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${f.farmer_id || "-"}</td>
      <td>${f.name || "-"}</td>
      <td>${f.email || "-"}</td>
      <td>${f.contact_no || "-"}</td>
      <td>${f.num_of_pens ?? 0}</td>
      <td>${f.pen_capacity ?? 0}</td>
      <td>${registeredBy}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderSwineTable(rows = []) {
  const tbody = document.querySelector("#swineTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  rows.forEach(s => {
    const age = s.birth_date ? Math.floor((new Date() - new Date(s.birth_date)) / (1000*60*60*24)) + " days" : "-";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${s.swine_id || "-"}</td>
      <td>${s.color || "-"}</td>
      <td>${s.breed || "-"}</td>
      <td>${age}</td>
      <td>${s.batch || "-"}</td>
      <td>${s.status || "-"}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderHeatReportsTable(rows = []) {
  const tbody = document.querySelector("#heatReportsTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  rows.forEach(hr => {
    const date = hr.date_reported ? new Date(hr.date_reported).toLocaleDateString() : "-";
    const signs = Array.isArray(hr.signs) ? hr.signs.join(", ") : "-";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${hr._id}</td>
      <td>${hr.swine_id || "-"}</td>
      <td>${date}</td>
      <td>${signs}</td>
      <td>${hr.heat_probability ?? "-"}</td>
      <td>${hr.status || "-"}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderBreedingTable(rows = []) {
  const tbody = document.querySelector("#breedingRecordsTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  rows.forEach(b => {
    const date = b.recordDate ? new Date(b.recordDate).toLocaleDateString() : "-";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${b.reproductionId || "-"}</td>
      <td>${b.swine_id || "-"}</td>
      <td>${date}</td>
      <td>${b.parentType || "-"}</td>
      <td>${b.noOfPiglets ?? "-"}</td>
      <td>${b.admin_notes || "-"}</td>
    `;
    tbody.appendChild(tr);
  });
}
