import { authGuard } from "/js/authGuard.js";
import { initNotifications } from "/js/notifications.js";

document.addEventListener("DOMContentLoaded", async () => {
  // ============================
  // Auth check (farm manager)
  // ============================
  const user = await authGuard("farm_manager");
  if (!user) return;

  const BACKEND_URL = "http://localhost:5000";
  const token = localStorage.getItem("token");

  if (!token) {
    alert("Session expired. Please log in again.");
    return;
  }

  // ============================
  // Welcome message
  // ============================
  const welcome = document.querySelector(".dashboard-container h4");
  if (welcome) {
    welcome.textContent = `Welcome, ${user.name || "Farm Manager"}`;
  }

  // ============================
  // Notifications
  // ============================
  initNotifications(user.id);

  // ============================
  // Load dashboard data
  // ============================
  loadLoginLogs();
  await loadDashboardStats(token);

  const calendars = initCalendar(BACKEND_URL, token);
  renderCalendarLegend();

  // Refetch calendar when tab regains focus
  window.addEventListener("focus", () => {
    calendars.forEach(c => c?.refetchEvents());
  });
});

// ============================
// Dashboard stats loader
// ============================
async function loadDashboardStats(token) {
  try {
    const res = await fetch("/api/dashboard/farm-manager/stats", {
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    Object.entries(data.stats).forEach(([key, value]) => {
      const el = document.querySelector(`[data-stat="${key}"]`);
      if (el) el.textContent = value;
    });
  } catch (err) {
    console.error("Dashboard stats error:", err);
  }
}

// ============================
// Calendar initialization
// ============================
function initCalendar(BACKEND_URL, token) {
  const calendars = [];
  const calendarEl = document.getElementById("calendar");
  if (!calendarEl || !window.FullCalendar) return calendars;

  const isMobile = window.innerWidth < 992;

  function calendarConfig(extra = {}) {
    return {
      initialView: isMobile ? "listWeek" : "dayGridMonth",
      height: "auto",
      expandRows: true,
      headerToolbar: isMobile
        ? { left: "prev,next", center: "title", right: "" }
        : { left: "prev,next today", center: "title", right: "dayGridMonth,listWeek" },
      events: fetchCalendarEvents,
      eventDidMount: enhanceEventUI,
      eventClick: handleEventClick,
      ...extra
    };
  }

  const calendar = new FullCalendar.Calendar(calendarEl, calendarConfig());
  calendar.render();
  calendars.push(calendar);

  //CALENDAR LEGEND
  function renderCalendarLegend() {
  const legend = document.getElementById("calendarLegend");
  if (!legend) return;

  const types = [
    { label: "AI Due (Insemination Window)", color: "#ff9800" },
    { label: "Heat Re-check (21–23 Days)", color: "#03a9f4" },
    { label: "Expected Farrowing", color: "#e91e63" },
    { label: "Weaning Threshold", color: "#4caf50" }
  ];

  legend.innerHTML = types.map(t => `
    <div class="legend-item">
      <span class="legend-color" style="background:${t.color}"></span>
      <span>${t.label}</span>
    </div>
  `).join("");
}

renderCalendarLegend();


  // ============================
  // Mobile modal calendar
  // ============================
  let modalCalendar = null;
  const modalEl = document.getElementById("calendarModal");
  const modalBody = document.getElementById("calendarModalBody");
  const openBtn = document.getElementById("openCalendarModal");

  if (openBtn && modalEl) {
    openBtn.addEventListener("click", () => {
      const modal = new bootstrap.Modal(modalEl);
      modal.show();

      setTimeout(() => {
        if (!modalCalendar) {
          modalBody.innerHTML = `<div id="calendarModalInner"></div>`;
          modalCalendar = new FullCalendar.Calendar(
            document.getElementById("calendarModalInner"),
            calendarConfig({ initialView: "dayGridMonth" })
          );
          modalCalendar.render();
          calendars.push(modalCalendar);
        } else {
          modalCalendar.updateSize();
        }
      }, 200);
    });
  }

  // ============================
  // Helpers
  // ============================
  async function fetchCalendarEvents(info, success, failure) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/heat/calendar-events`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });
      const data = await res.json();
      data.success ? success(data.events) : failure(data.message);
    } catch (err) {
      console.error("Calendar fetch error:", err);
      failure(err);
    }
  }

  function enhanceEventUI(info) {
    const title = info.event.title.toLowerCase();
    let typeLabel = "Scheduled Event";

    if (title.includes("ai due")) typeLabel = "Day 3 Insemination Window";
    else if (title.includes("heat re-check")) typeLabel = "21–23 Day Pregnancy Re-check";
    else if (title.includes("farrowing")) typeLabel = "Expected Farrowing Date";
    else if (title.includes("weaning")) typeLabel = "30-Day Weaning Threshold";

    info.el.title = `${info.event.title} (${typeLabel})`;

    if (info.event.backgroundColor) {
      info.el.style.backgroundColor = info.event.backgroundColor;
      info.el.style.borderColor = info.event.backgroundColor;
    }

    if (title.includes("ai") || title.includes("farrowing")) {
      info.el.style.fontWeight = "bold";
      info.el.style.borderLeft = "4px solid rgba(0,0,0,0.3)";
    }
  }

  function handleEventClick(info) {
    window.location.href = `/admin_heat_reports?reportId=${info.event.id}`;
  }

  return calendars;
}

// ============================
// Load recent login logs
// ============================
async function loadLoginLogs() {
  const list = document.getElementById("loginLogs");
  if (!list) return;

  try {
    const res = await fetch("/api/auth/logs", { credentials: "include" });
    const data = await res.json();

    if (!data.success || !data.logs?.length) {
      list.innerHTML = "<li class='log-loading'>No recent logins.</li>";
      return;
    }

    list.innerHTML = "";
    data.logs.forEach(log => {
      const li = document.createElement("li");
      li.innerHTML = `
        <div>
          <span class="log-user">${log.name}</span>
          <span class="log-role ${log.role}">${log.role}</span>
        </div>
        <div class="log-time">${new Date(log.createdAt).toLocaleString()}</div>
      `;
      list.appendChild(li);
    });
  } catch (err) {
    console.error("Failed to load logs:", err);
    list.innerHTML = "<li class='log-loading'>Error loading activity.</li>";
  }
}
