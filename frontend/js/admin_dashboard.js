import { authGuard } from "./authGuard.js";
import { initNotifications } from "./notifications.js";

document.addEventListener("DOMContentLoaded", async () => {
  const BACKEND_URL = "http://localhost:5000";
  const token = localStorage.getItem("token");

  // Check if user is authenticated and is a farm manager
  const user = await authGuard("farm_manager");
  if (!user) return; 

  // Show farm manager name
  const welcome = document.querySelector(".dashboard-container h2");
  if (welcome) welcome.textContent = `Welcome, ${user.name || "Farm Manager"}`;

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
      // Fetches events with the Authorization token
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
            // data.events contains the titles and colors defined in heatReportRoutes.js
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
        // Logic to determine the label for the tooltip based on the background color/title
        let typeLabel = 'Scheduled Event';
        const title = info.event.title.toLowerCase();

        if (title.includes('ai due')) {
          typeLabel = 'Day 3 Insemination Window';
        } else if (title.includes('heat re-check')) {
          typeLabel = '23-Day Pregnancy Re-check';
        } else if (title.includes('farrowing')) {
          typeLabel = 'Expected Farrowing Date';
        }

        // Apply native tooltip
        info.el.title = `${info.event.title} (${typeLabel})`;
        
        // Ensure the background color from the backend is applied
        if (info.event.backgroundColor) {
          info.el.style.backgroundColor = info.event.backgroundColor;
          info.el.style.borderColor = info.event.backgroundColor;
        }
      },
      eventClick: (info) => {
        const reportId = info.event.id;
        // Redirects to reports page for action (passing the ID for highlighting if needed)
        window.location.href = `admin_heat_reports.html?reportId=${reportId}`;
      }
    });

    calendar.render();
  }

  // Refetch calendar events when tab is refocused (ensures real-time updates)
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
        localStorage.clear();
        window.location.href = "login.html";
      } catch (err) {
        console.error("Logout error:", err);
        alert("Logout failed. Try again.");
      }
    });
  }
});