// admin_dashboard.js — improved sidebar + overlay behavior
document.addEventListener('DOMContentLoaded', function () {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('overlay'); // we use id
  const burgerBtn = document.querySelector('.burger-btn');
  const closeBtn = document.querySelector('.sidebar-close-btn');
  const navLinks = document.querySelectorAll('.sidebar .nav-link');

  // Safety: if required elements are missing, bail gracefully
  if (!sidebar || !overlay || !burgerBtn) {
    console.warn('Sidebar script: required elements missing (sidebar, overlay, burgerBtn).');
    return;
  }

  // Helper to open/close using the CSS expectations:
  // CSS expects `body.sidebar-open .sidebar { transform: translateX(0); }`
  function openSidebar() {
    document.body.classList.add('sidebar-open');    
    overlay.classList.remove('d-none');               
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    document.body.classList.remove('sidebar-open');
    overlay.classList.add('d-none');
    document.body.style.overflow = '';
  }

  // Toggle via burger button (mobile)
  burgerBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    openSidebar();
  });

  // Close when clicking overlay
  overlay.addEventListener('click', function () {
    closeSidebar();
  });

  // Close button inside sidebar
  if (closeBtn) {
    closeBtn.addEventListener('click', function () {
      closeSidebar();
    });
  }

  // Prevent sidebar click from bubbling to overlay
  sidebar.addEventListener('click', function (e) {
    e.stopPropagation();
  });

  // Nav link active highlight
  navLinks.forEach(function (link) {
    link.addEventListener('click', function () {
      navLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      // close sidebar on mobile after navigation
      if (window.innerWidth < 992) closeSidebar();
    });
  });

  // Use the same breakpoint your CSS uses (992px)
  function onResize() {
    if (window.innerWidth >= 992) {
      // ensure sidebar visible in desktop (remove overlay and body flag)
      document.body.classList.remove('sidebar-open');
      overlay.classList.add('d-none');
      document.body.style.overflow = '';
    }
  }
  window.addEventListener('resize', onResize);

  // initial responsive class (optional)
  function updateResponsiveUI() {
    if (window.innerWidth <= 767) {
      document.body.classList.add('mobile-view');
    } else {
      document.body.classList.remove('mobile-view');
    }
  }
  updateResponsiveUI();
  window.addEventListener('resize', updateResponsiveUI);

  // Optional: smooth scroll, ampm buttons etc (keep as before)
  const scrollToTopBtn = document.querySelector('.scroll-to-top');
  if (scrollToTopBtn) {
    scrollToTopBtn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  const ampmBtns = document.querySelectorAll('.ampm-btn');
  ampmBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      ampmBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // anchor smooth scroll
  const anchorLinks = document.querySelectorAll('a[href^="#"]');
  anchorLinks.forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      const targetId = link.getAttribute('href').substring(1);
      const targetElement = document.getElementById(targetId);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });
});
