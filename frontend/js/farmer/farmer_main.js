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
     BACK BUTTON
  ========================= */
  document.querySelector(".back-btn")?.addEventListener("click", () => {
    if (window.location.pathname !== "/farmer_dashboard") {
      window.location.href = "/farmer_dashboard";
    }
  });

  /* =========================
     PH DATE & TIME
  ========================= */
  const phDateTime = document.getElementById("phDateTime");
  if (phDateTime) {
    const updatePHTime = () => {
      phDateTime.textContent = new Intl.DateTimeFormat("en-PH", {
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
    };
    updatePHTime();
    setInterval(updatePHTime, 1000);
  }

  /* =========================
     SIDE PANELS
  ========================= */
  function openPanel(id) {
    document.getElementById(id)?.classList.add("active");
    document.body.style.overflow = "hidden";
  }

  function closePanel(id) {
    document.getElementById(id)?.classList.remove("active");
    document.body.style.overflow = "";
  }

  document.querySelectorAll(".close-panel").forEach(btn => {
    btn.addEventListener("click", () => closePanel(btn.dataset.close));
  });

  document.querySelector(".menu-list")?.addEventListener("click", (e) => {
    const item = e.target.closest("li");
    if (!item) return;

    mobileMenu.classList.remove("active");
    document.body.style.overflow = "";

    if (item.dataset.action === "notifications") openPanel("notificationsPanel");
    if (item.dataset.action === "settings") openPanel("settingsPanel");
    if (item.dataset.action === "logout" && confirm("Logout?")) {
      window.location.href = "/login";
    }
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
          alert("Video must be 350MB or less");
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

/* PROFILE IMAGE UPLOAD */
const avatarInput = document.getElementById("avatarInput");
const changeAvatarBtn = document.getElementById("changeAvatarBtn");
const avatarEditPreview = document.getElementById("avatarEditPreview");

if (changeAvatarBtn && avatarInput) {
  changeAvatarBtn.addEventListener("click", () => avatarInput.click());

  avatarInput.addEventListener("change", () => {
    const file = avatarInput.files[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    avatarEditPreview.innerHTML = `<img src="${url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
  });
}


  /* =========================
     TRANSLATIONS
  ========================= */
  const translations = {
    en: {
      dashboard: "DASHBOARD",
      my_pigs: "MY PIGS",
      report: "REPORT",
      profile: "PROFILE",
      help: "HELP",
      notifications: "Notifications",
      settings: "Settings",
      appearance: "Appearance",
      language: "Language",
      theme: "Theme",
      save: "Save",
      reset: "Reset"
    },
    tl: {
      dashboard: "DASHBOARD",
      my_pigs: "MGA BABOY KO",
      report: "ULAT",
      profile: "PROFILE",
      help: "TULONG",
      notifications: "Abiso",
      settings: "Mga Setting",
      appearance: "Itsura",
      language: "Wika",
      theme: "Tema",
      save: "I-save",
      reset: "I-reset"
    }
  };

  function applyLanguage(lang) {
    document.querySelectorAll("[data-i18n]").forEach(el => {
      const key = el.dataset.i18n;
      el.textContent = translations[lang][key] || el.textContent;
    });
    localStorage.setItem("lang", lang);
  }

  /* =========================
     SETTINGS (THEME + LANGUAGE)
  ========================= */
  const themeToggle = document.getElementById("themeToggle");
  const themeLabel = document.getElementById("themeLabel");
  const languageSelect = document.getElementById("languageSelect");
  const saveSettings = document.getElementById("saveSettings");
  const resetSettings = document.getElementById("resetSettings");

  function applyTheme(theme) {
    document.body.classList.toggle("dark", theme === "dark");
    themeToggle.checked = theme === "dark";
    themeLabel.textContent = theme === "dark" ? "Dark" : "Light";
    localStorage.setItem("theme", theme);
  }

  function loadSettings() {
    const theme = localStorage.getItem("theme") || "light";
    const lang = localStorage.getItem("lang") || "en";
    applyTheme(theme);
    applyLanguage(lang);
    languageSelect.value = lang;
  }

  saveSettings?.addEventListener("click", () => {
    applyTheme(themeToggle.checked ? "dark" : "light");
    applyLanguage(languageSelect.value);
    alert("Settings saved");
  });

  resetSettings?.addEventListener("click", () => {
    localStorage.clear();
    applyTheme("light");
    applyLanguage("en");
    languageSelect.value = "en";
    alert("Settings reset");
  });

  themeToggle?.addEventListener("change", () => {
    themeLabel.textContent = themeToggle.checked ? "Dark" : "Light";
  });

  loadSettings();
});
