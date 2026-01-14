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
  if (calendarEl) {
    const calendar = new FullCalendar.Calendar(calendarEl, {
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
            // data.events now contains titles like "🔍 Heat Check: A-0001 (Farmer Name)"
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
        // Updated tooltip logic to show the specific event type on hover
        const type = info.event.extendedProps.type;
        const typeLabel = type === 'farrowing' ? 'Scheduled Farrowing' : '23-Day Recheck';
        info.el.title = `${info.event.title} - ${typeLabel}`;
      },
      eventClick: (info) => {
        const reportId = info.event.id;
        // Redirects to reports page for action
        window.location.href = `admin_heat_reports.html?reportId=${reportId}`;
      }
    });

    calendar.render();
  }

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