// heat-report/main.js

import { authGuard } from "/js/authGuard.js";
import { initHeatReportFilters } from "./filters.js";
import { initHeatReportUI } from "./ui-actions.js";

document.addEventListener("DOMContentLoaded", async () => {
  // ---------------- AUTH ----------------
  const user = await authGuard(["farm_manager", "encoder"]);
  if (!user) return;

  const token = localStorage.getItem("token");
  const BACKEND_URL = "http://localhost:5000";

  // Init UI module (reports rendering, modals, actions)
  const ui = initHeatReportUI({ user, token, BACKEND_URL });

  // Init filters module (tabs, farmer dropdown, report status dropdown)
  initHeatReportFilters({
    user,
    token,
    BACKEND_URL,
    onApply: ui.applyFilters,
    onSetFilterState: ui.setFilterState,
    getFilterState: ui.getFilterState,
    onResetToAll: ui.resetToAllAndRender
  });

  // Initial load
  ui.loadReports();
});