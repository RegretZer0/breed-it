// sidepanel.js — desktop hover-expand + mobile offcanvas (no ID changes)
document.addEventListener("DOMContentLoaded", function () {
  const sidebar = document.querySelector(".sidebar");
  const overlay = document.getElementById("overlay");
  const burgerBtn = document.querySelector(".burger-btn");
  const closeBtn = document.querySelector(".sidebar-close-btn");
  const navLinks = document.querySelectorAll(".sidebar .nav-link");

  if (!sidebar || !overlay || !burgerBtn) {
    console.warn("Sidebar script: required elements missing (sidebar, overlay, burgerBtn).");
    return;
  }

  const DESKTOP_BP = 992;

  const isDesktop = () => window.innerWidth >= DESKTOP_BP;

  function openSidebarMobile() {
    // mobile only
    if (isDesktop()) return;
    document.body.classList.add("sidebar-open");
    overlay.classList.remove("d-none");
    document.body.style.overflow = "hidden";
  }

  function closeSidebarMobile() {
    document.body.classList.remove("sidebar-open");
    overlay.classList.add("d-none");
    document.body.style.overflow = "";
  }

  // Burger button toggles sidebar ONLY on mobile
  burgerBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    openSidebarMobile();
  });

  // Overlay closes ONLY on mobile
  overlay.addEventListener("click", function () {
    closeSidebarMobile();
  });

  // Close button inside sidebar (mobile)
  if (closeBtn) {
    closeBtn.addEventListener("click", function () {
      closeSidebarMobile();
    });
  }

  // Prevent clicks inside sidebar from bubbling
  sidebar.addEventListener("click", function (e) {
    e.stopPropagation();
  });

  // Nav link active highlight
  navLinks.forEach(function (link) {
    link.addEventListener("click", function () {
      navLinks.forEach((l) => l.classList.remove("active"));
      link.classList.add("active");

      // close sidebar on mobile after navigation
      if (!isDesktop()) closeSidebarMobile();
    });
  });

  // Desktop mode: ensure no overlay open state remains
  function applyResponsiveMode() {
    if (isDesktop()) {
      // ensure we aren't stuck in mobile-open mode
      closeSidebarMobile();
      document.body.classList.add("sidebar-collapsed"); // optional hook
    } else {
      document.body.classList.remove("sidebar-collapsed");
      // overlay stays hidden until burger click
      overlay.classList.add("d-none");
    }
  }

  window.addEventListener("resize", applyResponsiveMode);
  applyResponsiveMode();

  // Optional: touch devices on large screens (no hover) — allow tap to "peek"
  // This adds a class to temporarily expand via CSS if you want (not required).
  // If you DON'T want this behavior, you can delete this block.
  let touchPeekTimer = null;
  sidebar.addEventListener("touchstart", function () {
    if (!isDesktop()) return;
    sidebar.classList.add("peek-open");
    clearTimeout(touchPeekTimer);
    touchPeekTimer = setTimeout(() => sidebar.classList.remove("peek-open"), 1500);
  });

  // ===== Keep your other optional behaviors (scrollToTop, ampm, anchors) =====
  const scrollToTopBtn = document.querySelector(".scroll-to-top");
  if (scrollToTopBtn) {
    scrollToTopBtn.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  const ampmBtns = document.querySelectorAll(".ampm-btn");
  ampmBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      ampmBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  const anchorLinks = document.querySelectorAll('a[href^="#"]');
  anchorLinks.forEach(function (link) {
    link.addEventListener("click", function (e) {
      e.preventDefault();
      const targetId = link.getAttribute("href").substring(1);
      const targetElement = document.getElementById(targetId);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: "smooth" });
      }
    });
  });
  
  // ===== Bootstrap Tooltips (Sidebar) =====
  try {
    // Dispose previous tooltips (prevents duplicates on hot reloads)
    document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((el) => {
      const existing = bootstrap.Tooltip.getInstance(el);
      if (existing) existing.dispose();
    });

    // Create new tooltips
    document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((el) => {
      new bootstrap.Tooltip(el, {
        trigger: "hover focus",
        boundary: "window",
        delay: { show: 150, hide: 0 },
      });
    });
  } catch (e) {
    console.warn("Tooltip init skipped:", e);
  }

});

function isDesktop() {
  return window.innerWidth >= 992;
}

function initSidebarTooltips() {
  if (!window.bootstrap) return;

  const tooltipEls = Array.from(document.querySelectorAll(".sidebar [data-bs-toggle='tooltip']"));

  // Dispose any existing
  tooltipEls.forEach(el => {
    const inst = bootstrap.Tooltip.getInstance(el);
    if (inst) inst.dispose();
  });

  // Only create tooltips on desktop (where sidebar collapses)
  if (!isDesktop()) return;

  tooltipEls.forEach(el => {
    new bootstrap.Tooltip(el, {
      trigger: "hover focus",
      boundary: "window",
      placement: "right",
      delay: { show: 150, hide: 0 }
    });
  });
}

initSidebarTooltips();
window.addEventListener("resize", initSidebarTooltips);

// Disable tooltips while expanded (hover/focus-within)
const sidebar = document.getElementById("sidebar");
if (sidebar) {
  sidebar.addEventListener("mouseenter", () => {
    document.querySelectorAll(".sidebar [data-bs-toggle='tooltip']").forEach(el => {
      const inst = bootstrap.Tooltip.getInstance(el);
      if (inst) inst.disable();
    });
  });

  sidebar.addEventListener("mouseleave", () => {
    document.querySelectorAll(".sidebar [data-bs-toggle='tooltip']").forEach(el => {
      const inst = bootstrap.Tooltip.getInstance(el);
      if (inst) inst.enable();
    });
  });
}