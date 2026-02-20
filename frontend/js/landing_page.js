document.addEventListener("DOMContentLoaded", () => {
  // MVP navigation routing
  document.body.addEventListener("click", (e) => {
    const el = e.target.closest("[data-route]");
    if (!el) return;

    e.preventDefault();
    const route = el.getAttribute("data-route");
    if (route) window.location.href = route;
  });

  // PWA install (works if you have a manifest + service worker set up)
  let deferredPrompt = null;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;

    // Optional: you can reveal install buttons only when available
    // document.getElementById("installBtn")?.classList.remove("hidden");
    // document.getElementById("installBtnMini")?.classList.remove("hidden");
  });

  async function triggerInstall() {
    if (!deferredPrompt) {
      // fallback for MVP if PWA isn't ready yet
      alert("Install is not available yet. Add this site to your Home Screen from your browser menu.");
      return;
    }
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  }

  document.getElementById("installBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    triggerInstall();
  });

  document.getElementById("installBtnMini")?.addEventListener("click", (e) => {
    e.preventDefault();
    triggerInstall();
  });
});


document.addEventListener("DOMContentLoaded", () => {
  // MVP navigation routing
  document.body.addEventListener("click", (e) => {
    const el = e.target.closest("[data-route]");
    if (!el) return;

    e.preventDefault();
    const route = el.getAttribute("data-route");
    if (route) window.location.href = route;
  });

  // PWA install
  let deferredPrompt = null;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
  });

  async function triggerInstall() {
    if (!deferredPrompt) {
      alert("Install is not available yet. Add this site to your Home Screen from your browser menu.");
      return;
    }
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  }

  document.getElementById("installBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    triggerInstall();
  });

  document.getElementById("installBtnMini")?.addEventListener("click", (e) => {
    e.preventDefault();
    triggerInstall();
  });

  // =========================
  // PHONE SLIDESHOW (fade)
  // =========================
  const slideImg = document.getElementById("lpPhoneSlide");
  if (slideImg) {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const raw = slideImg.getAttribute("data-slides") || "";
    const slides = raw
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

    if (slides.length > 1) {
      let index = 0;
      const INTERVAL_MS = 2800;

      // Ensure initial class state
      slideImg.classList.add("lp-slide-fade-in");

      const nextSlide = () => {
        index = (index + 1) % slides.length;

        if (prefersReducedMotion) {
          slideImg.src = slides[index];
          return;
        }

        slideImg.classList.remove("lp-slide-fade-in");
        slideImg.classList.add("lp-slide-fade-out");

        // swap after fade-out starts
        window.setTimeout(() => {
          slideImg.src = slides[index];

          // fade back in
          slideImg.classList.remove("lp-slide-fade-out");
          slideImg.classList.add("lp-slide-fade-in");
        }, 220);
      };

      window.setInterval(nextSlide, INTERVAL_MS);
    }
  }
});
