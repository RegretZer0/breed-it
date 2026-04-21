// /js/reports/report.js
import { authGuard } from "/js/authGuard.js";
import { createApi } from "./report.api.js";
import { createReportUI } from "./report.ui.js";
import { updateCountdowns } from "./report.utils.js";

document.addEventListener("DOMContentLoaded", async () => {
  const user = await authGuard("farmer");
  if (!user) return;

  const BACKEND_URL = "http://localhost:5000";

  const api = createApi({
    BACKEND_URL,
    getToken: () => localStorage.getItem("token"),
    onUnauthorized: () => {
      alert("Authorization Error: Session expired or system clock changed. Please log in again.");
      localStorage.clear();
      window.location.href = "/login";
    }
  });

  const ui = createReportUI({ BACKEND_URL, user, api });

  // initial
  await ui.reloadAll();
  await ui.loadHeatSigns?.();

  // keep your timers
  setInterval(() => updateCountdowns(), 30000);
  setInterval(() => ui.tickReportsReload(), 60000);
});