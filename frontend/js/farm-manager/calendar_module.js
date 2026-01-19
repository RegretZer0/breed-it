// calendar.js

export function initFarmCalendar(BACKEND_URL, token) {
  const calendars = [];
  const calendarEl = document.getElementById("calendar");

  if (!calendarEl || !window.FullCalendar) {
    console.warn("Calendar element or FullCalendar not found");
    return calendars;
  }

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

  // =====================
  // MAIN CALENDAR
  // =====================
  const calendar = new FullCalendar.Calendar(calendarEl, calendarConfig());
  calendar.render();
  calendars.push(calendar);

  // =====================
  // MOBILE MODAL CALENDAR
  // =====================
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

  // =====================
  // HELPERS
  // =====================
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
