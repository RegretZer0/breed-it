import { authGuard } from "/js/authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  const BACKEND_URL = "http://localhost:5000";

  // 🔐 SAME AUTH LOGIC AS PROTOTYPE
  const user = await authGuard("farmer");
  if (!user) return;

  const farmerId = user.id;
  const token = localStorage.getItem("token");

  const calendarEl = document.getElementById("calendar");
  if (!calendarEl) return;

  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: window.innerWidth < 600 ? "listWeek" : "dayGridMonth",
    height: "auto",

    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "dayGridMonth,listWeek"
    },

    events: async (info, successCallback, failureCallback) => {
      try {
        const response = await fetch(
          `${BACKEND_URL}/api/heat/calendar-events?farmerId=${farmerId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json"
            }
          }
        );

        const data = await response.json();
        if (data.success) successCallback(data.events);
        else failureCallback(data.message);
      } catch (err) {
        console.error("Calendar fetch error:", err);
        failureCallback(err);
      }
    },

    eventDidMount: (info) => {
      const title = info.event.title.toLowerCase();
      let label = "Event";

      if (title.includes("ai due")) label = "Insemination Day";
      else if (title.includes("heat re-check")) label = "Check for Heat Signs";
      else if (title.includes("farrowing")) label = "Expected Farrowing";
      else if (title.includes("weaning") || title.includes("open"))
        label = "Ready for New Heat Report";

      info.el.title = `${info.event.title} - ${label}`;

      if (info.event.backgroundColor) {
        info.el.style.backgroundColor = info.event.backgroundColor;
        info.el.style.borderColor = info.event.backgroundColor;
      }

      if (title.includes("ai") || title.includes("farrowing")) {
        info.el.style.fontWeight = "bold";
      }
    },

    eventClick: (info) => {
      const parts = info.event.title.split(":");
      const swineId =
        parts.length > 1 ? parts[1].trim().split(" ")[0] : null;

      window.location.href = swineId
        ? `/farmer/report?swineId=${swineId}`
        : `/farmer/report`;
    }
  });

  calendar.render();

  window.addEventListener("focus", () => {
    calendar.refetchEvents();
  });
});
