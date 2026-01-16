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
  initNotifications(farmerId); 

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
      // Fetching events filtered for THIS specific farmer
      events: async function(info, successCallback, failureCallback) {
        try {
          // We pass the farmerId as a query parameter so the backend can filter
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
        const type = info.event.extendedProps.type;
        const typeLabel = type === 'farrowing' ? 'Farrowing Due' : 'Heat Re-check';
        info.el.title = `${info.event.title} - ${typeLabel}`;
      },
      eventClick: (info) => {
        // Farmers can click to go straight to the reporting page for that swine
        const swineId = info.event.title.split(':')[1]?.trim().split(' ')[0];
        window.location.href = `report_heat.html?swineId=${swineId}`;
      }
    });

    calendar.render();
  }

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

  // Reproduction & Growth (NEW)
  const reproManageBtn = document.getElementById("reproManageBtn");
  if (reproManageBtn) {
    reproManageBtn.addEventListener("click", () => {
      window.location.href = "reproduction_manage.html";
    });
  }

  // Breeding Analytics (NEW)
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