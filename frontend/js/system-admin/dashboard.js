document.addEventListener("DOMContentLoaded", () => {
  loadAdminStats();
  loadUsers();
  loadDataOversight();

  document.getElementById("logoutBtn").addEventListener("click", logout);
  document.getElementById("searchUser").addEventListener("input", filterUsers);
});

/**
 * HELPER: Consistently extract a display name from user objects
 */
function getDisplayName(user) {
  if (!user) return "-";
  if (user.fullName) return user.fullName;
  if (user.first_name || user.last_name) {
    return `${user.first_name || ""} ${user.last_name || ""}`.trim();
  }
  return user.name || "-";
}

// SYSTEM & INFRASTRUCTURE OVERVIEW
function loadAdminStats() {
  fetch("http://localhost:5000/api/admin/stats", { credentials: "include" })
    .then(res => res.json())
    .then(data => {
      if (!data.success) {
        alert("Access denied.");
        window.location.href = "login.html";
        return;
      }

      const stats = data.stats || {};
      
      // Update Server Health Cards
      const statusEl = document.getElementById("serverStatus");
      statusEl.textContent = stats.serverStatus ?? "--";
      statusEl.className = stats.serverStatus === "Stable" ? "status-stable" : "status-strained";

      document.getElementById("cpuLoad").textContent = stats.cpuLoad ? `${stats.cpuLoad} avg` : "--";
      document.getElementById("memoryUsage").textContent = stats.memoryUsage ?? "--";
      document.getElementById("totalUsers").textContent = stats.totalUsers ?? 0;
      document.getElementById("concurrentUsers").textContent = stats.concurrentUsers ?? 0;

    })
    .catch(err => console.error("Stats Error:", err));
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
      <td>${getDisplayName(user)}</td>
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
      getDisplayName(u).toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    )
  );
}

// INFRASTRUCTURE OVERSIGHT
function loadDataOversight() {
  fetch("http://localhost:5000/api/admin/data", { credentials: "include" })
    .then(res => res.json())
    .then(parsed => {
      const data = parsed.data || parsed;

      // Render the new Infrastructure Metrics
      if (data.systemInfo) {
        document.getElementById("osPlatform").textContent = data.systemInfo.platform;
        document.getElementById("systemUptime").textContent = data.systemInfo.uptime;
        document.getElementById("cpuModel").textContent = data.systemInfo.cpuModel;
        document.getElementById("totalMemory").textContent = data.systemInfo.totalMemory;
      }

      renderFarmManagersTable(data.farmManagers);
      renderFarmersTable(data.farmers);
    })
    .catch(err => console.error("Data oversight Error:", err));
}

function renderFarmManagersTable(rows = []) {
  const tbody = document.querySelector("#farmManagersTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  rows.forEach(fm => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${fm._id}</td>
      <td>${getDisplayName(fm)}</td>
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
    const registeredBy = getDisplayName(f.managerId);
    
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${f.farmer_id || "-"}</td>
      <td>${getDisplayName(f)}</td>
      <td>${f.email || "-"}</td>
      <td>${f.contact_no || "-"}</td>
      <td>${f.num_of_pens ?? 0}</td>
      <td>${registeredBy}</td>
    `;
    tbody.appendChild(tr);
  });
}