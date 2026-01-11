import { authGuard } from "../auth/authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  // ============================
  // Auth check (ADMIN only)
  // ============================
  const user = await authGuard("admin");
  if (!user) return; // authGuard handles redirect

  // ============================
  // Load login activity logs
  // ============================
  loadLoginLogs();

  // ============================
  // Logout handler
  // ============================
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async (e) => {
      e.preventDefault();

      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "include",
        });

        // Clear frontend auth
        localStorage.clear();

        // Redirect to EJS login route
        window.location.href = "/Login";
      } catch (err) {
        console.error("Logout error:", err);
        alert("Logout failed. Try again.");
      }
    });
  }
});

// ============================
// Load recent login logs
// ============================
async function loadLoginLogs() {
  const list = document.getElementById("loginLogs");
  if (!list) return;

  try {
    const res = await fetch("/api/auth/logs", {
      credentials: "include",
    });

    const data = await res.json();

    if (!data.success || !data.logs || !data.logs.length) {
      list.innerHTML = "<li class='log-loading'>No recent logins.</li>";
      return;
    }

    list.innerHTML = "";

    data.logs.forEach((log) => {
      const li = document.createElement("li");
      const time = new Date(log.createdAt).toLocaleString();

      li.innerHTML = `
        <div>
          <span class="log-user">${log.name}</span>
          <span class="log-role ${log.role}">${log.role}</span>
        </div>
        <div class="log-time">${time}</div>
      `;

      list.appendChild(li);
    });

  } catch (err) {
    console.error("Failed to load logs:", err);
    list.innerHTML =
      "<li class='log-loading'>Error loading activity.</li>";
  }
}
