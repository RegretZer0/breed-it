/**
 * calendar_module.js
 * Handles FullCalendar initialization for Farm Managers.
 * Features: Auto-refresh, Responsive Views, and Breeding Event Styling.
 */

export function initFarmCalendar(BACKEND_URL, token) {
  const calendars = [];
  const calendarEl = document.getElementById("calendar");

  if (!calendarEl || !window.FullCalendar) {
    console.warn("Calendar element or FullCalendar not found");
    return calendars;
  }

  const isMobile = window.innerWidth < 992;

  /**
   * Central configuration to ensure both main and modal 
   * calendars behave the same way.
   */
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
            calendarConfig({ initialView: "dayGridMonth" }) // Always use Grid in modal for better overview
          );
          modalCalendar.render();
          calendars.push(modalCalendar);
        } else {
          modalCalendar.updateSize();
          modalCalendar.refetchEvents(); // Ensure fresh data when modal opens
        }
      }, 200);
    });
  }

  // =====================
  // HELPERS
  // =====================

  /**
   * Fetches events with Authorization token.
   * Pulls from the heat report calendar endpoint.
   */
  async function fetchCalendarEvents(info, success, failure) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/heat/calendar-events`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });
      const data = await res.json();
      if (data.success) {
        success(data.events);
      } else {
        console.error("Backend error:", data.message);
        failure(data.message);
      }
    } catch (err) {
      console.error("Calendar fetch error:", err);
      failure(err);
    }
  }

  /**
   * Enhances event appearance based on title.
   * Adds custom tooltips and visual borders for priority events.
   */
  function enhanceEventUI(info) {
    const title = info.event.title.toLowerCase();
    let typeLabel = "Scheduled Event";

    // Logic to determine tooltips (Matches admin_dashboard.js logic)
    if (title.includes("ai due")) {
      typeLabel = "Day 3 Insemination Window";
    } else if (title.includes("heat re-check")) {
      typeLabel = "21–23 Day Pregnancy Re-check";
    } else if (title.includes("farrowing")) {
      typeLabel = "Expected Farrowing Date";
    } else if (title.includes("weaning") || title.includes("ready for weaning")) {
      typeLabel = "30-Day Weaning Threshold";
    }

    // Set native tooltip
    info.el.title = `${info.event.title} (${typeLabel})`;

    // Apply background and border colors from backend
    if (info.event.backgroundColor) {
      info.el.style.backgroundColor = info.event.backgroundColor;
      info.el.style.borderColor = info.event.backgroundColor;
    }

    // Visual indicator for high-priority breeding events
    if (title.includes("ai") || title.includes("farrowing")) {
      info.el.style.fontWeight = "bold";
      info.el.style.borderLeft = "4px solid rgba(0,0,0,0.3)";
    }
  }

  /**
   * Handles clicking an event.
   * Redirects to the heat reports management page with the specific ID.
   */
  function handleEventClick(info) {
  window.location.href = `/farm-manager/reports?reportId=${info.event.id}`;
}

  // =====================
  // REAL-TIME UPDATE LOGIC
  // =====================
  
  // Refetch events whenever the user switches back to this tab
  window.addEventListener('focus', () => {
    calendars.forEach(c => {
      if (c) c.refetchEvents();
    });
  });

  return calendars;
}