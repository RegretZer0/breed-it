export function initFarmCalendar(BACKEND_URL, token) {
  const calendarEl = document.getElementById("calendar");
  const taskPanel = document.getElementById("taskPanel");
  const selectedDateLabel = document.getElementById("selectedDateLabel");
  const addTaskBtn = document.getElementById("addTaskBtn");

  if (!calendarEl || !window.FullCalendar) {
    console.warn("Calendar element or FullCalendar not found");
    return null;
  }

  const todayStr = new Date().toISOString().split("T")[0];

  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: "dayGridMonth",
    height: "auto",
    expandRows: true,
    fixedWeekCount: false,

    // ✅ LIMIT DISPLAY ONLY (not system data)
    dayMaxEvents: 2,            // show max 2 in grid
    moreLinkClick: "day",       // clicking +X goes to day view

    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: ""
    },

    events: fetchCalendarEvents,
    eventContent: renderCustomEvent,
    eventClick: handleEventClick,
    dateClick: handleDateClick
  });

  calendar.render();

  // Load today's events initially
  highlightDate(todayStr);
  renderEventsForDate(todayStr);

  // ================================
  // FETCH EVENTS
  // ================================

  async function fetchCalendarEvents(info, success, failure) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/heat/calendar-events`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

      const data = await res.json();
      if (data.success) success(data.events);
      else failure(data.message);

    } catch (err) {
      failure(err);
    }
  }

  // ================================
  // CUSTOM EVENT RENDER
  // ================================

  function renderCustomEvent(arg) {
    const status = (arg.event.extendedProps.status || "").toLowerCase();

    const statusMap = {
      "in-heat": { color: "#ff9a1f", icon: "bi-fire" },
      "under observation": { color: "#1ea7ff", icon: "bi-eye" },
      "pregnant": { color: "#43c572", icon: "bi-heart-fill" },
      "farrowing": { color: "#cf2631", icon: "bi-exclamation-triangle-fill" },
      "lactating": { color: "#eb79ae", icon: "bi-droplet-fill" },
      "completed": { color: "#6c757d", icon: "bi-check-circle-fill" }
    };

    const config = statusMap[status] || {
      color: "#adb5bd",
      icon: "bi-calendar-event"
    };

    return {
      html: `
        <div class="fc-custom-event"
            style="border-left:4px solid ${config.color};
                    color:${config.color}">
          <i class="bi ${config.icon}"></i>
          <span class="fc-event-title">
            ${arg.event.title}
          </span>
        </div>
      `
    };
  }




  // ================================
  // DATE CLICK → PANEL VIEW
  // ================================

  function handleDateClick(info) {
    const selectedDate = info.dateStr;
    highlightDate(selectedDate);
    renderEventsForDate(selectedDate);
  }

  function renderEventsForDate(dateStr) {
    if (!taskPanel) return;

    const events = calendar.getEvents().filter(e =>
      e.startStr === dateStr
    );

    selectedDateLabel.textContent = `Events on ${dateStr}`;

    if (!events.length) {
      taskPanel.innerHTML = `
        <div class="text-muted small">
          No breeding events scheduled.
        </div>
      `;
      return;
    }

    taskPanel.innerHTML = events.map(event => `
      <div class="task-card mb-3">
        <div class="fw-semibold">${event.title}</div>
        <div class="small text-muted mb-2">
          Status: ${event.extendedProps.status || "N/A"}
        </div>
        <button class="btn btn-sm btn-outline-primary"
          data-report="${event.extendedProps.reportId}">
          View Report
        </button>
      </div>
    `).join("");

    // Attach report buttons
    taskPanel.querySelectorAll("[data-report]").forEach(btn => {
      btn.addEventListener("click", () => {
        const reportId = btn.dataset.report;
        if (!reportId) return;

        // 🔥 Correct route
        window.location.href =
          `/farm-manager/heat-reports/index?reportId=${reportId}`;
      });
    });
  }

  // ================================
  // HIGHLIGHT SELECTED DAY
  // ================================

  function highlightDate(dateStr) {
    document.querySelectorAll(".fc-daygrid-day")
      .forEach(day => day.classList.remove("selected-day"));

    const target = document.querySelector(
      `.fc-daygrid-day[data-date="${dateStr}"]`
    );

    if (target) target.classList.add("selected-day");
  }

  // ================================
  // EVENT CLICK → REDIRECT
  // ================================

  function handleEventClick(info) {
    const reportId = info.event.extendedProps.reportId;
    if (!reportId) return;

    window.location.href =
      `/farm-manager/heat-reports/index?reportId=${reportId}`;
  }

  // ================================
  // AUTO REFRESH
  // ================================

  window.addEventListener("focus", () => {
    calendar.refetchEvents();
  });

  return calendar;
}
