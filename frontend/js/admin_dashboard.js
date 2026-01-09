document.addEventListener("DOMContentLoaded", () => {
  loadLoginLogs();
});

async function loadLoginLogs() {
  const list = document.getElementById("loginLogs");
  if (!list) return;

  try {
    const res = await fetch("/api/auth/logs", {
      credentials: "include",
    });

    const data = await res.json();

    if (!data.success || !data.logs.length) {
      list.innerHTML = "<li class='log-loading'>No recent logins.</li>";
      return;
    }

    list.innerHTML = "";

    data.logs.forEach(log => {
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
