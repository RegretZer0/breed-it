import { authGuard } from "/js/authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  const BACKEND_URL = "http://localhost:5000";

  // 🔐 Authenticate user as 'farmer'
  const user = await authGuard("farmer");
  if (!user) return;

  const token = localStorage.getItem("token");

  const calendarEl = document.getElementById("calendar");
  if (!calendarEl) return;

  const calendar = new FullCalendar.Calendar(calendarEl, {
    // Responsive view: List on mobile, Grid on desktop
    initialView: window.innerWidth < 600 ? "listWeek" : "dayGridMonth",
    height: "auto",
    expandRows: true,

    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,listWeek"
    },

    // =====================
    // DATA FETCHING
    // =====================
    events: async (info, successCallback, failureCallback) => {
      try {
        // We fetch events - the backend will automatically filter by the logged-in user's profile
        const response = await fetch(`${BACKEND_URL}/api/heat/calendar-events`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          }
        });

        const data = await response.json();
        if (data.success) {
          successCallback(data.events);
        } else {
          console.error("Backend error:", data.message);
          failureCallback(data.message);
        }
      } catch (err) {
        console.error("Calendar fetch error:", err);
        failureCallback(err);
      }
    },

    // =====================
    // EVENT STYLING & UI
    // =====================
    eventDidMount: (info) => {
      const title = info.event.title.toLowerCase();
      let label = "Event";

      // Enhanced tooltips for Farmer clarity
      if (title.includes("ai due")) {
        label = "Insemination Day (Prepare for AI)";
      } else if (title.includes("heat re-check")) {
        label = "Critical: Check for Heat Signs (21-23 Days)";
      } else if (title.includes("farrowing")) {
        label = "Expected Farrowing (Prepare Nesting)";
      } else if (title.includes("weaning") || title.includes("ready for weaning")) {
        label = "Ready for New Heat Report / Weaning";
      }

      // Native tooltip content
      info.el.title = `${info.event.title} - ${label}`;

      // Apply dynamic colors from backend (HeatReportRoutes.js)
      if (info.event.backgroundColor) {
        info.el.style.backgroundColor = info.event.backgroundColor;
        info.el.style.borderColor = info.event.backgroundColor;
      }

      // Visual priority for high-importance tasks
      if (title.includes("ai") || title.includes("farrowing")) {
        info.el.style.fontWeight = "bold";
        info.el.style.borderLeft = "4px solid rgba(0,0,0,0.3)";
      }
    },

    // =====================
    // NAVIGATION
    // =====================
    eventClick: (info) => {
      // Extract Swine ID from title (e.g., "AI Due: A-0001")
      const parts = info.event.title.split(":");
      const swineId = parts.length > 1 ? parts[1].trim().split(" ")[0] : null;

      // Redirect farmer to the reporting page to act on the event
      window.location.href = swineId
        ? `/farmer/report?swineId=${swineId}`
        : `/farmer/report`;
    }
  });

  calendar.render();

  // =====================
  // REAL-TIME UPDATES
  // =====================
  // Automatically refresh when the farmer switches back to this tab
  window.addEventListener("focus", () => {
    if (calendar) calendar.refetchEvents();
  });
  
  // Handle window resizing
  window.addEventListener("resize", () => {
    const newView = window.innerWidth < 600 ? "listWeek" : "dayGridMonth";
    if (calendar.view.type !== newView) {
      calendar.changeView(newView);
    }
  });
});