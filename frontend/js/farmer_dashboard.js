import { authGuard } from "./authGuard.js"; // 🔐 import authGuard
import { initNotifications } from "./notifications.js";

document.addEventListener("DOMContentLoaded", async () => {
  const BACKEND_URL = "http://localhost:5000";
  
  // 🔐 Protect the page
  const user = await authGuard("farmer"); // only farmers
  if (!user) return; // authGuard will redirect if not authenticated

  const farmerId = user.id; 
  const token = localStorage.getItem("token");

  // ----- Notifications Setup -----
  // The farmer will receive concise alerts like "Swine TAG-01 is now Open"
  initNotifications(farmerId); 

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
      // Fetching events filtered for THIS specific farmer
      events: async function(info, successCallback, failureCallback) {
        try {
          const response = await fetch(`${BACKEND_URL}/api/heat/calendar-events?farmerId=${farmerId}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          const data = await response.json();
          if (data.success) {
            successCallback(data.events);
          } else {
            console.error("Calendar fetch error:", data.message);
            failureCallback(data.message);
          }
        } catch (error) {
          console.error("Fetch error for calendar:", error);
          failureCallback(error);
        }
      },
      eventDidMount: (info) => {
        // Updated logic to show correct labels for farmers including Weaning
        let typeLabel = 'Event';
        const title = info.event.title.toLowerCase();

        if (title.includes('ai due')) {
          typeLabel = 'Insemination Day';
        } else if (title.includes('heat re-check')) {
          typeLabel = 'Check for Heat Signs';
        } else if (title.includes('farrowing')) {
          typeLabel = 'Expected Farrowing';
        } else if (title.includes('weaning') || title.includes('open')) {
          typeLabel = 'Ready for New Heat Report';
        }

        info.el.title = `${info.event.title} - ${typeLabel}`;

        // Ensure background colors (Blue, Orange, Green) are applied
        if (info.event.backgroundColor) {
          info.el.style.backgroundColor = info.event.backgroundColor;
          info.el.style.borderColor = info.event.backgroundColor;
        }

        // Farmer UI Enhancement: Highlight Insemination/Farrowing
        if (title.includes('ai') || title.includes('farrowing')) {
            info.el.style.fontWeight = 'bold';
        }
      },
      eventClick: (info) => {
        // Farmers can click to go straight to the reporting page for that swine
        const titleParts = info.event.title.split(':');
        if (titleParts.length > 1) {
          const swineId = titleParts[1].trim().split(' ')[0];
          window.location.href = `report_heat.html?swineId=${swineId}`;
        } else {
          window.location.href = `report_heat.html`;
        }
      }
    });

    calendar.render();
  }

  // Auto-refresh calendar when the farmer switches back to this tab
  window.addEventListener('focus', () => {
    if (calendar) calendar.refetchEvents();
  });

  // --- BUTTON NAVIGATION LOGIC ---

  // View Swine
  const viewSwineBtn = document.getElementById("viewSwineBtn");
  if (viewSwineBtn) {
    viewSwineBtn.addEventListener("click", () => {
      window.location.href = "farmer_swine.html";
    });
  }

  // Heat Report
  const heatReportBtn = document.getElementById("heatReportBtn");
  if (heatReportBtn) {
    heatReportBtn.addEventListener("click", () => {
      window.location.href = "report_heat.html";
    });
  }

  // Reproduction & Growth
  const reproManageBtn = document.getElementById("reproManageBtn");
  if (reproManageBtn) {
    reproManageBtn.addEventListener("click", () => {
      window.location.href = "reproduction_manage.html";
    });
  }

  // Breeding Analytics
  const analyticsBtn = document.getElementById("analyticsBtn");
  if (analyticsBtn) {
    analyticsBtn.addEventListener("click", () => {
      window.location.href = "breed_analytics.html";
    });
  }

  // View Profile
  const profileBtn = document.getElementById("profileBtn");
  if (profileBtn) {
    profileBtn.addEventListener("click", () => {
      window.location.href = "farmer_profile.html";
    });
  }

  // Logout
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await fetch(`${BACKEND_URL}/api/auth/logout`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}` },
          credentials: "include",
        });
      } catch (err) {
        console.error("Logout error:", err);
      } finally {
        localStorage.clear(); 
        window.location.href = "login.html";
      }
    });
  }
});