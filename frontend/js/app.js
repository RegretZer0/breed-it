// /js/app.js
import { initNotifications } from "/js/notifications.js";
import { authGuard } from "/js/authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  // Auth check (any logged-in role)
  const user = await authGuard();
  if (!user) return;

  // Initialize notifications globally
  await initNotifications(user.id);
});

/**
 * IMPORTANT:
 * Close sidebar when any Bootstrap offcanvas opens
 * (prevents the "sidebar highlighted" bug you saw)
 */
document.addEventListener("show.bs.offcanvas", () => {
  document.body.classList.remove("sidebar-open");
});
