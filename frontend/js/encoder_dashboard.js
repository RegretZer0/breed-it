import { authGuard } from "./authGuard.js";
import { initNotifications } from "./notifications.js";

document.addEventListener("DOMContentLoaded", async () => {
  const BACKEND_URL = "http://localhost:5000";
  const token = localStorage.getItem("token");

  // Check if user is authenticated and is an encoder
  const user = await authGuard("encoder");
  if (!user) return; // authGuard will redirect if not authenticated

  // Show encoder name
  const welcome = document.querySelector(".dashboard-container h2");
  if (welcome) welcome.textContent = `Welcome, ${user.name || "Encoder"}`;

  // ----- Notifications Setup -----
  initNotifications(user.id);

  // ----- CALENDAR INITIALIZATION -----
  const calendarEl = document.getElementById('calendar');
  let calendar;

  if (calendarEl) {
    calendar = new FullCalendar.Calendar(calendarEl, {
      initialView: 'dayGridMonth',
      height: 'auto',
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,listWeek'
      },
      // Fetching events from the backend
      events: async function(info, successCallback, failureCallback) {
        try {
          const response = await fetch(`${BACKEND_URL}/api/heat/calendar-events`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          const data = await response.json();
          if (data.success) {
            // These events now include the farmer name in the title from the backend
            successCallback(data.events);
          } else {
            console.error("Backend returned error for calendar:", data.message);
            failureCallback(data.message);
          }
        } catch (error) {
          console.error("Fetch error for calendar:", error);
          failureCallback(error);
        }
      },
      eventDidMount: (info) => {
        // Updated tooltip logic to detect event type based on title strings
        let typeLabel = 'Scheduled Task';
        const title = info.event.title.toLowerCase();

        if (title.includes('ai due')) {
          typeLabel = 'Day 3 Insemination Window';
        } else if (title.includes('heat re-check')) {
          typeLabel = '23-Day Pregnancy Re-check';
        } else if (title.includes('farrowing')) {
          typeLabel = 'Expected Farrowing Date';
        }

        // Apply tooltip
        info.el.title = `${info.event.title} (${typeLabel})`;

        // Visual Enforcement: Apply background colors from backend
        if (info.event.backgroundColor) {
          info.el.style.backgroundColor = info.event.backgroundColor;
          info.el.style.borderColor = info.event.backgroundColor;
        }
      },
      eventClick: (info) => {
        const reportId = info.event.id;
        // Redirect encoder to the heat reports management page
        window.location.href = `encoder_heat_reports.html?reportId=${reportId}`;
      }
    });

    calendar.render();
  }

  // Refetch events when window is focused to keep data fresh
  window.addEventListener('focus', () => {
    if (calendar) calendar.refetchEvents();
  });

  // ----- Logout handler -----
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async (e) => {
      e.preventDefault();

      try {
        await fetch(`${BACKEND_URL}/api/auth/logout`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}` },
          credentials: "include",
        });

        // Clear frontend auth
        localStorage.clear();
        window.location.href = "login.html";
      } catch (err) {
        console.error("Logout error:", err);
        alert("Logout failed. Try again.");
      }
    });
  }
});