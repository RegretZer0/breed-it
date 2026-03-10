import { authGuard } from "/js/authGuard.js";
import { initNotifications } from "/js/notifications.js";
import { initFarmerLanguage, t, getCurrentLanguage } from "/js/farmer_i18n.js";

document.addEventListener("DOMContentLoaded", () => {

  /* =========================
     MENU OPEN / CLOSE
  ========================= */
  const openMenu = document.getElementById("openMenu");
  const closeMenu = document.getElementById("closeMenu");
  const mobileMenu = document.getElementById("mobileMenu");

  openMenu?.addEventListener("click", () => {
    mobileMenu.classList.add("active");
    document.body.style.overflow = "hidden";
  });

  closeMenu?.addEventListener("click", () => {
    mobileMenu.classList.remove("active");
    document.body.style.overflow = "";
  });


  /* =========================
     RESET PANELS ON LOAD
  ========================= */
  document.querySelectorAll(".side-panel").forEach(panel => {
    panel.classList.remove("active");
  });
  document.body.style.overflow = "";


  /* =========================
     BACK BUTTON
  ========================= */
  document.querySelector(".back-btn")?.addEventListener("click", () => {
    if (window.location.pathname !== "/farmer/dashboard") {
      window.location.href = "/farmer/dashboard";
    }
  });

  /* =========================
     PH DATE & TIME
  ========================= */
  const phDateTime = document.getElementById("phDateTime");

  function getLocaleFromLanguage(lang) {
    return lang === "tl" ? "fil-PH" : "en-PH";
  }

  function updatePHTimeDisplay() {
    if (!phDateTime) return;

    const currentLang = getCurrentLanguage();
    const locale = getLocaleFromLanguage(currentLang);

    phDateTime.textContent = new Intl.DateTimeFormat(locale, {
      timeZone: "Asia/Manila",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    }).format(new Date());
  }

  if (phDateTime) {
    updatePHTimeDisplay();
    setInterval(updatePHTimeDisplay, 1000);
  }

  /* =========================
     SIDE PANELS (FIXED)
     - cleans leftover bootstrap backdrops
     - restores body scroll only if no overlays remain
  ========================= */
  function hasAnyOpenOverlay() {
    return (
      document.querySelector(".side-panel.active") ||
      document.querySelector(".mobile-menu.active")
    );
  }

  function cleanupBootstrapBackdrops() {
    // remove any leftover Bootstrap backdrops (from old code/tests)
    document.querySelectorAll(".modal-backdrop, .offcanvas-backdrop").forEach(el => el.remove());

    // remove bootstrap body lock flags
    document.body.classList.remove("modal-open", "offcanvas-backdrop");
    document.body.style.removeProperty("padding-right");
  }

  function openPanel(id) {
    document.getElementById(id)?.classList.add("active");
    document.body.style.overflow = "hidden";
  }

  function closePanel(id) {
    document.getElementById(id)?.classList.remove("active");

    cleanupBootstrapBackdrops();

    // only unlock scroll if nothing else is open
    if (!hasAnyOpenOverlay()) {
      document.body.style.overflow = "";
    }
  }

  document.querySelectorAll(".close-panel").forEach(btn => {
    btn.addEventListener("click", () => closePanel(btn.dataset.close));
  });

  document.querySelector(".menu-list")?.addEventListener("click", (e) => {
    const item = e.target.closest("li");
    if (!item) return;

    mobileMenu.classList.remove("active");
    cleanupBootstrapBackdrops();

    if (!hasAnyOpenOverlay()) document.body.style.overflow = "";

    if (item.dataset.action === "notifications") openPanel("notificationsPanel");
    if (item.dataset.action === "settings") openPanel("settingsPanel");
    if (item.dataset.action === "logout" && confirm(t("logout_confirm"))) {
      window.location.href = "/login";
    }
  });

  /* =========================
     OPEN NOTIFICATIONS (HEADER BELL)
  ========================= */
  const openNotificationsBtn = document.getElementById("openNotifications");

  openNotificationsBtn?.addEventListener("click", () => {
    openPanel("notificationsPanel");
  });

  /* =========================
     VIEW ALL NOTIFICATIONS (FARMER) - FIXED
     - closes notifications panel first
     - opens history panel as side-panel (NOT bootstrap modal)
  ========================= */
  const viewAllBtn = document.getElementById("viewAllNotificationsBtn");

  viewAllBtn?.addEventListener("click", () => {
    // close recent notifications panel (avoid stacking)
    document.getElementById("notificationsPanel")?.classList.remove("active");

    // open history panel
    openPanel("notificationHistoryModal");
  });


  /* =========================
     REPORT TABS
  ========================= */
  const logsTab = document.getElementById("logsTab");
  const createTab = document.getElementById("createTab");
  const logsSection = document.getElementById("logsSection");
  const createSection = document.getElementById("createSection");
  const cancelCreate = document.getElementById("cancelCreate");

  if (logsTab && createTab && logsSection && createSection) {
    createTab.addEventListener("click", () => {
      logsTab.classList.remove("active");
      createTab.classList.add("active");
      logsSection.classList.add("hidden");
      createSection.classList.remove("hidden");
    });

    logsTab.addEventListener("click", () => {
      createTab.classList.remove("active");
      logsTab.classList.add("active");
      createSection.classList.add("hidden");
      logsSection.classList.remove("hidden");
    });
  }

  if (cancelCreate && logsTab) {
    cancelCreate.addEventListener("click", () => {
      logsTab.click();
    });
  }

  /* =========================
     MEDIA UPLOAD (IMAGE / VIDEO)
     - Video limit: 350MB
  ========================= */
  const uploadBtn = document.getElementById("uploadBtn");
  const mediaUpload = document.getElementById("mediaUpload");
  const previewContainer = document.getElementById("previewContainer");

  if (uploadBtn && mediaUpload && previewContainer) {
    uploadBtn.addEventListener("click", () => mediaUpload.click());

    mediaUpload.addEventListener("change", () => {
      previewContainer.innerHTML = "";

      Array.from(mediaUpload.files).forEach(file => {

        // Video size validation
        if (file.type.startsWith("video") && file.size > 350 * 1024 * 1024) {
          alert(t("video_limit_error"));
          return;
        }

        const url = URL.createObjectURL(file);

        // Image preview
        if (file.type.startsWith("image")) {
          const img = document.createElement("img");
          img.src = url;
          previewContainer.appendChild(img);
        }

        // Video preview
        if (file.type.startsWith("video")) {
          const video = document.createElement("video");
          video.src = url;
          video.muted = true;
          video.playsInline = true;
          previewContainer.appendChild(video);
        }
      });
    });
  }

  /* PROFILE EDIT */
  const editBtn = document.getElementById("editProfileBtn");
  const cancelEdit = document.getElementById("cancelEdit");
  const viewProfile = document.getElementById("viewProfile");
  const editProfile = document.getElementById("editProfile");

  if (editBtn && cancelEdit) {
    editBtn.addEventListener("click", () => {
      viewProfile.classList.add("hidden");
      editProfile.classList.remove("hidden");
    });

    cancelEdit.addEventListener("click", () => {
      editProfile.classList.add("hidden");
      viewProfile.classList.remove("hidden");
    });
  }
  
  /* =========================
     LANGUAGE SETTINGS
  ========================= */
  initFarmerLanguage({
    languageSelectId: "languageSelect",
    saveButtonId: "saveSettings",
    resetButtonId: "resetSettings",
    onLanguageChange: () => {
      updatePHTimeDisplay();
    }
  });

  /* =========================
     NOTIFICATIONS (GLOBAL)
  ========================= */
  (async () => {
    if (!document.getElementById("notificationsPanel")) return;

    const user = await authGuard("farmer");
    if (!user) return;

    initNotifications(user.id);
  })();

});