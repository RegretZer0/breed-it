import { authGuard } from "/js/authGuard.js";

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
  // Load dashboard data
  // ============================
  loadLoginLogs();
  await loadDashboardStats(token);
  initCalendar(BACKEND_URL, token);

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
          credentials: "include"
        });
        localStorage.clear();
        window.location.href = "/Login";
      } catch (err) {
        console.error("Logout error:", err);
        alert("Logout failed. Try again.");
      }
    });
  }
});

// ============================
// Dashboard stats loader
// ============================
async function loadDashboardStats(token) {
  try {
    const res = await fetch("/api/dashboard/farm-manager/stats", {
      headers: {
        Authorization: `Bearer ${token}`
      }
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
  const calendarEl = document.getElementById("calendar");
  if (!calendarEl || !window.FullCalendar) return;

  const isMobile = window.innerWidth < 992;

  /* =========================
     INLINE CALENDAR
  ========================= */
  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: isMobile ? "listWeek" : "dayGridMonth",
    height: "auto",
    expandRows: true,

    headerToolbar: isMobile
      ? {
          left: "prev,next",
          center: "title",
          right: ""
        }
      : {
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,listWeek"
        },

    views: {
      listWeek: {
        listDayFormat: { weekday: "short", month: "short", day: "numeric" },
        listDaySideFormat: false
      }
    },

    events: fetchCalendarEvents,
    eventDidMount: tagEventType,
    eventClick: handleEventClick
  });

  calendar.render();

  /* =========================
     MOBILE MONTH MODAL CALENDAR
  ========================= */
  let modalCalendar = null;
  const modalEl = document.getElementById("calendarModal");
  const modalBody = document.getElementById("calendarModalBody");
  const openBtn = document.getElementById("openCalendarModal");

  if (openBtn && modalEl) {
    openBtn.addEventListener("click", () => {
      const modal = new bootstrap.Modal(modalEl);
      modal.show();

      // IMPORTANT: render AFTER modal is visible
      setTimeout(() => {
        if (!modalCalendar) {
          modalBody.innerHTML = `<div id="calendarModalInner"></div>`;

          modalCalendar = new FullCalendar.Calendar(
            document.getElementById("calendarModalInner"),
            {
              initialView: "dayGridMonth",
              height: "auto",
              headerToolbar: {
                left: "prev,next today",
                center: "title",
                right: ""
              },
              events: fetchCalendarEvents,
              eventDidMount: tagEventType,
              eventClick: handleEventClick
            }
          );

          modalCalendar.render();
        } else {
          modalCalendar.updateSize();
        }
      }, 200);
    });
  }

  /* =========================
     HELPERS
  ========================= */
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

  function tagEventType(info) {
    const type = info.event.extendedProps.type;
    if (type) info.el.setAttribute("data-type", type);
  }

  function handleEventClick(info) {
    window.location.href = `/admin_heat_reports?reportId=${info.event.id}`;
  }
}

// ============================
// Load recent login logs
// ============================
async function loadLoginLogs() {
  const list = document.getElementById("loginLogs");
  if (!list) return;

  try {
    const res = await fetch("/api/auth/logs", {
      credentials: "include"
    });

    const data = await res.json();

    if (!data.success || !data.logs?.length) {
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
