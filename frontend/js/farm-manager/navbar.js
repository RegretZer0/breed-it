// /js/navbar.js
document.addEventListener("DOMContentLoaded", () => {
  // =========================
  // Helpers
  // =========================
  const DEFAULT_AVATAR = "/images/default-avatar.png";

  const getAuthHeaders = () => {
    const token = localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const safeJson = async (res) => {
    try {
      return await res.json();
    } catch {
      return {};
    }
  };

  const isAuthError = (status) => status === 401 || status === 403;

  const setImageSafe = (imgEl, src) => {
    if (!imgEl) return;
    imgEl.onerror = () => {
      imgEl.onerror = null;
      imgEl.src = DEFAULT_AVATAR;
    };
    imgEl.src = src || DEFAULT_AVATAR;
  };

  // =========================
  // Feedback Modal (reusable) — FIX MODAL STACKING
  // =========================
  const feedbackModalEl = document.getElementById("accountFeedbackModal");
  const feedbackModal =
    feedbackModalEl && window.bootstrap
      ? bootstrap.Modal.getOrCreateInstance(feedbackModalEl, { backdrop: true, focus: true })
      : null;

  // Pass a "sourceModalEl" (help modal) so we can close it first
  const showFeedback = (title = "Message", message = "", sourceModalEl = null) => {
    if (!feedbackModal) {
      if (message) alert(`${title}\n\n${message}`);
      return;
    }

    const t = document.getElementById("accountFeedbackTitle");
    const m = document.getElementById("accountFeedbackMessage");
    if (t) t.textContent = title;
    if (m) m.textContent = message;

    // If another modal is open (e.g., Help), close it first then show feedback
    if (sourceModalEl && window.bootstrap) {
      const sourceInstance = bootstrap.Modal.getInstance(sourceModalEl);
      if (sourceInstance) {
        const onHidden = () => {
          sourceModalEl.removeEventListener("hidden.bs.modal", onHidden);
          feedbackModal.show();
        };
        sourceModalEl.addEventListener("hidden.bs.modal", onHidden, { once: true });
        sourceInstance.hide();
        return;
      }
    }

    // fallback (no source or not open)
    feedbackModal.show();
  };

  // =========================
  // Logout
  // =========================
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      } catch (err) {
        console.error("Logout error:", err);
      } finally {
        window.location.href = "/login";
      }
    });
  }

  // =========================
  // Notifications: Badge count + Mark all read
  // (IDs: notificationBadge, markAllNotificationsReadBtn, markAllNotificationsReadBtnModal)
  // =========================
  const notifBadgeEl = document.getElementById("notificationBadge");
  const markAllBtn = document.getElementById("markAllNotificationsReadBtn");
  const markAllBtnHistory = document.getElementById("markAllNotificationsReadBtnModal");

  function setNotificationBadgeCount(n) {
    if (!notifBadgeEl) return;

    const count = Number(n || 0);
    if (!count) {
      notifBadgeEl.style.display = "none";
      notifBadgeEl.textContent = "";
      return;
    }

    notifBadgeEl.textContent = count > 99 ? "99+" : String(count);
    notifBadgeEl.style.display = "inline-flex";
  }

  async function markAllNotificationsRead() {
    try {
      // optimistic UI
      setNotificationBadgeCount(0);
      document.querySelectorAll(".notification-item.unread").forEach((el) => el.classList.remove("unread"));

      // NOTE: if your backend route differs, change ONLY this endpoint
      const res = await fetch("/api/notifications/mark-all-read", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        credentials: "include",
        body: JSON.stringify({}),
      });

      const data = await safeJson(res);
      if (isAuthError(res.status)) throw new Error("Session expired or unauthorized. Please login again.");
      if (!res.ok || data?.success === false) throw new Error(data?.message || "Failed to mark all as read.");

      // Ask existing notifications module to refresh, if present
      window.dispatchEvent(new CustomEvent("notifications:refresh", { detail: { reason: "markAllRead" } }));

      showFeedback("Success", "All notifications marked as read.");
    } catch (err) {
      console.error(err);
      showFeedback("Error", err?.message || "Failed to mark all as read.");
    }
  }

  markAllBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    markAllNotificationsRead();
  });

  markAllBtnHistory?.addEventListener("click", (e) => {
    e.preventDefault();
    markAllNotificationsRead();
  });

  // =========================================================
  // ✅ FIX: Notifications Panel -> History Panel
  // Your panels are CUSTOM (.side-panel), not Bootstrap Offcanvas/Modal.
  // This prevents leftover backdrops / body locks that make page unclickable.
  // =========================================================
  const openNotificationsBtn = document.getElementById("openNotifications"); // bell icon
  const viewAllBtn = document.getElementById("viewAllNotificationsBtn");

  const notificationsPanel = document.getElementById("notificationsPanel");
  const historyModalEl = document.getElementById("notificationHistoryModal");

  const notifCloseBtn = document.querySelector('[data-close="notificationsPanel"]');
  const historyCloseBtn = document.querySelector('[data-close="notificationHistoryModal"]');

  function removeAnyBackdrops() {
    document.querySelectorAll(".modal-backdrop, .offcanvas-backdrop, .nav-backdrop").forEach((b) => b.remove());
  }

  function unlockBody() {
    document.body.classList.remove("modal-open");
    document.body.style.removeProperty("overflow");
    document.body.style.removeProperty("padding-right");

    document.querySelectorAll(".fixed-top, .fixed-bottom, .is-fixed, .sticky-top").forEach((el) => {
      el.style.removeProperty("padding-right");
      el.style.removeProperty("margin-right");
    });
  }

  function hardCleanup() {
    removeAnyBackdrops();
    unlockBody();
  }

  function ensureBackdrop() {
    if (document.querySelector(".modal-backdrop, .offcanvas-backdrop, .nav-backdrop")) return;

    const bd = document.createElement("div");
    bd.className = "nav-backdrop";

    Object.assign(bd.style, {
      position: "fixed",
      inset: "0",
      background: "rgba(0,0,0,0.35)",
      backdropFilter: "blur(6px)",
      WebkitBackdropFilter: "blur(6px)",
      zIndex: "99999",
    });

    bd.addEventListener("click", () => {
      historyModalEl?.classList.remove("active");
      notificationsPanel?.classList.remove("active");
      hardCleanup();
    });

    document.body.appendChild(bd);
  }

  function lockBody() {
    // Prevent scroll while any panel is open
    document.body.style.overflow = "hidden";
  }

  function anyPanelOpen() {
    return Boolean(document.querySelector(".side-panel.active, .mobile-menu.active"));
  }

  function showPanel(el) {
    if (!el) return;
    el.classList.add("active");
    ensureBackdrop();
    lockBody();
  }

  function hidePanel(el) {
    if (!el) return;
    el.classList.remove("active");
    if (!anyPanelOpen()) hardCleanup();
  }

  // Open notifications panel
  openNotificationsBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    showPanel(notificationsPanel);
  });

  // Switch Notifications -> History
  viewAllBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    hidePanel(notificationsPanel);
    showPanel(historyModalEl);
  });

  // Close buttons
  notifCloseBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    hidePanel(notificationsPanel);
    hardCleanup();
  });

  historyCloseBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    hidePanel(historyModalEl);
    hardCleanup();
  });

  // Escape closes panels and cleans up
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (historyModalEl?.classList.contains("active")) hidePanel(historyModalEl);
    if (notificationsPanel?.classList.contains("active")) hidePanel(notificationsPanel);
    hardCleanup();
  });

  // Safety: if anything else leaves bootstrap backdrops, remove them
  // (helps if other modules open modals)
  window.addEventListener("pageshow", hardCleanup);

  // =========================================================
  // Account Settings: Profile update + Photo upload
  // =========================================================
  const accountSettingsModalEl = document.getElementById("accountSettingsModal");

  // ✅ MATCH YOUR EJS IDS (with legacy fallbacks)
  const editBtn = document.getElementById("editAccountProfileBtn") || document.getElementById("editProfileBtn");

  const form = document.getElementById("accountSettingsForm") || document.getElementById("accountProfileForm");

  const saveBtn =
    document.getElementById("accountSaveBtn") ||
    document.getElementById("saveProfileBtn") ||
    document.getElementById("saveAccountProfileBtn");

  const cancelBtn =
    document.getElementById("accountCancelEditBtn") ||
    document.getElementById("cancelProfileEditBtn") ||
    document.getElementById("cancelAccountProfileBtn");

  const firstName = document.getElementById("accountFirstName");
  const lastName = document.getElementById("accountLastName");
  const address = document.getElementById("accountAddress");
  const contact = document.getElementById("accountContact");

  // Photo nodes (your EJS)
  const fileInput = document.getElementById("accountProfilePhoto") || document.getElementById("accountProfilePhotoInput");

  const uploadBtn = document.getElementById("accountPhotoUploadBtn") || document.getElementById("uploadProfilePhotoBtn");

  const resetPhotoBtn = document.getElementById("accountPhotoResetBtn") || document.getElementById("resetProfilePhotoBtn");

  // Preview images (your EJS)
  const avatarTop = document.getElementById("accountAvatarPreviewTop");
  const avatarPreview = document.getElementById("accountAvatarPreview");

  // Optional display name node (your UI shows .acct-name)
  const nameNode = document.querySelector(".acct-name");

  const initialState = {
    first: "",
    last: "",
    addr: "",
    contact: "",
    photo: DEFAULT_AVATAR,
  };

  let submittingProfile = false;
  let uploadingPhoto = false;
  let lastObjectUrl = null;

  const cacheInitialState = () => {
    initialState.first = firstName?.value ?? "";
    initialState.last = lastName?.value ?? "";
    initialState.addr = address?.value ?? "";
    initialState.contact = contact?.value ?? "";

    // use preview if exists, else top, else default
    initialState.photo = avatarPreview?.getAttribute("src") || avatarTop?.getAttribute("src") || DEFAULT_AVATAR;
  };

  const setEditMode = (on) => {
    // Your inputs are readonly in EJS, not disabled — we toggle readonly instead
    [firstName, lastName, address, contact].filter(Boolean).forEach((el) => {
      el.readOnly = !on;
    });

    // Buttons disabled state
    if (saveBtn) saveBtn.disabled = !on;
    if (cancelBtn) cancelBtn.disabled = !on;

    // Photo controls
    if (fileInput) fileInput.disabled = !on;
    if (uploadBtn) uploadBtn.disabled = !on;
    if (resetPhotoBtn) resetPhotoBtn.disabled = !on;

    if (editBtn) editBtn.disabled = on;

    if (!on) {
      // leaving edit mode: clear file selection
      if (fileInput) fileInput.value = "";
      if (lastObjectUrl) {
        URL.revokeObjectURL(lastObjectUrl);
        lastObjectUrl = null;
      }
      // restore preview to current saved photo
      setImageSafe(avatarPreview, initialState.photo);
      setImageSafe(avatarTop, initialState.photo);
    }
  };

  const restoreInitial = () => {
    if (firstName) firstName.value = initialState.first;
    if (lastName) lastName.value = initialState.last;
    if (address) address.value = initialState.addr;
    if (contact) contact.value = initialState.contact;

    setImageSafe(avatarPreview, initialState.photo);
    setImageSafe(avatarTop, initialState.photo);

    if (fileInput) fileInput.value = "";
    if (lastObjectUrl) {
      URL.revokeObjectURL(lastObjectUrl);
      lastObjectUrl = null;
    }
  };

  // Initialize state on modal open
  if (accountSettingsModalEl && window.bootstrap) {
    accountSettingsModalEl.addEventListener("show.bs.modal", () => {
      cacheInitialState();
      // start NOT editing
      setEditMode(false);

      // ensure images have fallback
      setImageSafe(avatarPreview, avatarPreview?.getAttribute("src") || initialState.photo);
      setImageSafe(avatarTop, avatarTop?.getAttribute("src") || initialState.photo);
    });

    accountSettingsModalEl.addEventListener("hidden.bs.modal", () => {
      submittingProfile = false;
      uploadingPhoto = false;
      if (fileInput) fileInput.value = "";
      if (lastObjectUrl) {
        URL.revokeObjectURL(lastObjectUrl);
        lastObjectUrl = null;
      }
      // always reset to non-edit mode for clean next open
      setEditMode(false);
    });
  }

  // ✅ THIS FIXES “EDIT PROFILE NOT CLICKABLE”
  editBtn?.addEventListener("click", () => {
    setEditMode(true);
  });

  cancelBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    restoreInitial();
    setEditMode(false);
  });

  // Live preview
  fileInput?.addEventListener("change", () => {
    const f = fileInput.files?.[0];

    if (lastObjectUrl) {
      URL.revokeObjectURL(lastObjectUrl);
      lastObjectUrl = null;
    }

    if (!f) {
      setImageSafe(avatarPreview, initialState.photo);
      return;
    }

    if (!f.type?.startsWith("image/")) {
      fileInput.value = "";
      showFeedback("Invalid File", "Please choose an image file.");
      setImageSafe(avatarPreview, initialState.photo);
      return;
    }

    if (f.size > 2 * 1024 * 1024) {
      fileInput.value = "";
      showFeedback("Too Large", "Image too large. Please use an image under 2MB.");
      setImageSafe(avatarPreview, initialState.photo);
      return;
    }

    lastObjectUrl = URL.createObjectURL(f);
    setImageSafe(avatarPreview, lastObjectUrl);
  });

  resetPhotoBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    if (fileInput) fileInput.value = "";
    if (lastObjectUrl) {
      URL.revokeObjectURL(lastObjectUrl);
      lastObjectUrl = null;
    }
    setImageSafe(avatarPreview, initialState.photo);
  });

  // SAVE PROFILE
  const submitProfile = async () => {
    if (submittingProfile) return;
    submittingProfile = true;

    try {
      const payload = {
        first_name: (firstName?.value || "").trim(),
        last_name: (lastName?.value || "").trim(),
        address: (address?.value || "").trim(),
        contact_info: (contact?.value || "").trim(),
      };

      if (!payload.first_name || !payload.last_name) {
        showFeedback("Missing Fields", "First name and last name are required.");
        return;
      }

      if (saveBtn) saveBtn.disabled = true;

      const res = await fetch("/api/auth/update-profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await safeJson(res);

      if (isAuthError(res.status)) {
        throw new Error("Session expired or unauthorized. Please login again.");
      }
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || "Failed to update profile.");
      }

      // update initial
      initialState.first = payload.first_name;
      initialState.last = payload.last_name;
      initialState.addr = payload.address;
      initialState.contact = payload.contact_info;

      // update top name
      if (nameNode) {
        nameNode.textContent = `${payload.first_name} ${payload.last_name}`.trim() || "—";
      }

      setEditMode(false);
      showFeedback("Success", "Profile updated successfully.");
    } catch (err) {
      console.error(err);
      showFeedback("Error", err?.message || "Something went wrong while saving.");
    } finally {
      if (saveBtn) saveBtn.disabled = false;
      submittingProfile = false;
    }
  };

  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      submitProfile();
    });
  } else {
    // fallback if form id missing
    saveBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      submitProfile();
    });
  }

  // UPLOAD PHOTO
  uploadBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    if (uploadingPhoto) return;
    uploadingPhoto = true;

    try {
      const f = fileInput?.files?.[0];
      if (!f) {
        showFeedback("Notice", "Please choose a photo first.");
        return;
      }

      const fd = new FormData();
      // ✅ must match backend: multer.single("profile_photo")
      fd.append("profile_photo", f);

      uploadBtn.disabled = true;

      const res = await fetch("/api/auth/update-profile-photo", {
        method: "PUT",
        headers: {
          ...getAuthHeaders(),
          // DO NOT set Content-Type for FormData
        },
        credentials: "include",
        body: fd,
      });

      const data = await safeJson(res);

      if (isAuthError(res.status)) {
        throw new Error("Session expired or unauthorized. Please login again.");
      }
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || "Failed to upload photo.");
      }

      const newSrc = data.profile_photo || DEFAULT_AVATAR;

      // update previews + persist initial
      initialState.photo = newSrc;
      setImageSafe(avatarPreview, newSrc);
      setImageSafe(avatarTop, newSrc);

      // clear file selection after upload
      if (fileInput) fileInput.value = "";
      if (lastObjectUrl) {
        URL.revokeObjectURL(lastObjectUrl);
        lastObjectUrl = null;
      }

      showFeedback("Success", "Profile photo uploaded successfully.");
    } catch (err) {
      console.error(err);
      showFeedback("Error", err?.message || "Upload failed.");
    } finally {
      if (uploadBtn) uploadBtn.disabled = false;
      uploadingPhoto = false;
    }
  });

  // =============================
  // Password Toggle (Show/Hide)
  // =============================
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".toggle-password-btn");
    if (!btn) return;

    const inputId = btn.getAttribute("data-target");
    const input = document.getElementById(inputId);
    if (!input) return;

    const icon = btn.querySelector("i");

    if (input.type === "password") {
      input.type = "text";
      if (icon) {
        icon.classList.remove("bi-eye");
        icon.classList.add("bi-eye-slash");
      }
    } else {
      input.type = "password";
      if (icon) {
        icon.classList.remove("bi-eye-slash");
        icon.classList.add("bi-eye");
      }
    }
  });

  // =========================
  // Help Ticket Submit (FIX: feedback modal behind help modal)
  // =========================
  const helpForm = document.getElementById("helpTicketForm");
  const helpModalEl = document.getElementById("helpModal");

  if (helpForm) {
    const helpModal =
      helpModalEl && window.bootstrap
        ? bootstrap.Modal.getOrCreateInstance(helpModalEl, { backdrop: true, focus: true })
        : null;

    const resetTicketFormFields = () => {
      const cat = document.getElementById("helpCategory");
      const pri = document.getElementById("helpPriority");
      const sub = document.getElementById("helpSubject");
      const msg = document.getElementById("helpMessage");

      if (cat) cat.value = "";
      if (pri) pri.value = "normal";
      applyAutoPriorityFromCategory();
      if (sub) sub.value = "";
      if (msg) msg.value = "";
    };

    helpForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const payload = {
        name: (document.getElementById("helpName")?.value || "").trim(),
        email: (document.getElementById("helpEmail")?.value || "").trim(),
        category: document.getElementById("helpCategory")?.value || "",
        priority: (() => {
          const cat = (document.getElementById("helpCategory")?.value || "").toLowerCase().trim();
          return CATEGORY_TO_PRIORITY[cat] || "normal";
        })(),
        subject: (document.getElementById("helpSubject")?.value || "").trim(),
        message: (document.getElementById("helpMessage")?.value || "").trim(),
        page: window.location.pathname,
      };

      if (!payload.name || !payload.email || !payload.category || !payload.subject || !payload.message) {
        // close help first, then show feedback on top
        showFeedback("Missing Fields", "Please complete all required fields before submitting.", helpModalEl);
        return;
      }

      const submitBtn = document.getElementById("helpSubmitTicketBtn");
      if (submitBtn) submitBtn.disabled = true;

      try {
        const res = await fetch("/api/support/ticket", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(),
          },
          credentials: "include",
          body: JSON.stringify(payload),
        });

        const data = await safeJson(res);

        if (typeof isAuthError === "function" && isAuthError(res.status)) {
          throw new Error("Session expired or unauthorized. Please login again.");
        }
        if (!res.ok || !data?.success) {
          throw new Error(data?.message || "Ticket submission failed.");
        }

        // Reset form (keep name/email)
        resetTicketFormFields();

        // hide help first (if open)
        helpModal?.hide();

        // show feedback AFTER help closes (fix stacking)
        showFeedback("Submitted", `Ticket sent successfully. Ref: ${data.ticket_id || "—"}`, helpModalEl);
      } catch (err) {
        console.error(err);

        // ensure help closes first so feedback is on top
        helpModal?.hide();
        showFeedback("Error", err?.message || "Ticket submission failed.", helpModalEl);
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // =========================
  // Auto Priority by Category
  // =========================
  const helpCategoryEl = document.getElementById("helpCategory");
  const helpPriorityEl = document.getElementById("helpPriority");

  // Decide your mapping here (edit if you want different rules)
  const CATEGORY_TO_PRIORITY = {
    bug: "high",
    account: "high",
    data: "normal",
    feature: "low",
    other: "normal",
  };

  function applyAutoPriorityFromCategory() {
    if (!helpCategoryEl || !helpPriorityEl) return;

    const cat = (helpCategoryEl.value || "").toLowerCase().trim();
    const autoPriority = CATEGORY_TO_PRIORITY[cat] || "normal";

    helpPriorityEl.value = autoPriority;

    // Make it predetermined: user cannot edit
    helpPriorityEl.disabled = true;
  }

  helpCategoryEl?.addEventListener("change", applyAutoPriorityFromCategory);

  // Apply once on modal open (so it’s consistent)
  helpModalEl?.addEventListener("shown.bs.modal", () => {
    applyAutoPriorityFromCategory();
  });

  // =========================
  // Ticket History Modal (your IDs already match)
  // =========================
  const openTicketHistoryBtn = document.getElementById("openTicketHistoryBtn");
  const ticketHistoryModalEl = document.getElementById("ticketHistoryModal");

  const ticketHistoryList = document.getElementById("ticketHistoryList");
  const ticketHistoryEmpty = document.getElementById("ticketHistoryEmpty");
  const ticketHistoryMeta = document.getElementById("ticketHistoryMeta");

  const ticketPrevBtn = document.getElementById("ticketPrevBtn");
  const ticketNextBtn = document.getElementById("ticketNextBtn");
  const ticketPageLabel = document.getElementById("ticketPageLabel");

  const ticketFilterStatus = document.getElementById("ticketFilterStatus");
  const ticketFilterCategory = document.getElementById("ticketFilterCategory");
  const ticketFilterPriority = document.getElementById("ticketFilterPriority");
  const ticketSearch = document.getElementById("ticketSearch");
  const ticketDateFrom = document.getElementById("ticketDateFrom");
  const ticketDateTo = document.getElementById("ticketDateTo");

  const ticketFilterResetBtn = document.getElementById("ticketFilterResetBtn");
  const ticketFilterApplyBtn = document.getElementById("ticketFilterApplyBtn");

  const TICKET_LIST_ENDPOINT = "/api/support/tickets";
  const TICKET_PAGE_SIZE = 6;

  let ticketPage = 1;
  let ticketTotal = 0;
  let ticketTotalPages = 1;

  const safeText = (v) => (v == null ? "" : String(v));
  const fmtDateTime = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString();
  };

  function renderTicketRow(t) {
    const ref = safeText(t.ticket_id || t.ref || t._id || "—");
    const subject = safeText(t.subject || "—");
    const message = safeText(t.message || "");
    const status = (t.status || "open").toLowerCase();
    const category = (t.category || "other").toLowerCase();
    const priority = (t.priority || "normal").toLowerCase();
    const created = fmtDateTime(t.createdAt || t.created_at || t.timestamp);

    const statusClass = status.replace(/\s+/g, "_");
    const priorityClass = priority.replace(/\s+/g, "_");

    return `
      <div class="ticket-card">
        <div class="ticket-top">
          <div class="min-w-0">
            <div class="ticket-ref">${ref}</div>
            <div class="ticket-subject text-truncate">${subject}</div>
          </div>
          <div class="d-flex flex-column align-items-end gap-1">
            <span class="ticket-pill ${statusClass}">${status.replace(/_/g, " ")}</span>
            <span class="ticket-pill ${priorityClass}">${priority}</span>
          </div>
        </div>

        <div class="ticket-meta">
          <span class="ticket-pill">${category}</span>
          ${created ? `<span class="ticket-pill">${created}</span>` : ""}
        </div>

        ${message ? `<div class="ticket-msg">${message}</div>` : ""}
      </div>
    `;
  }

  function setTicketPagerState() {
    ticketTotalPages = Math.max(1, Math.ceil(ticketTotal / TICKET_PAGE_SIZE));
    ticketPage = Math.min(ticketPage, ticketTotalPages);

    if (ticketPageLabel) ticketPageLabel.textContent = `Page ${ticketPage} / ${ticketTotalPages}`;
    if (ticketPrevBtn) ticketPrevBtn.disabled = ticketPage <= 1;
    if (ticketNextBtn) ticketNextBtn.disabled = ticketPage >= ticketTotalPages;

    if (ticketHistoryMeta) {
      ticketHistoryMeta.textContent = ticketTotal
        ? `${ticketTotal} ticket${ticketTotal > 1 ? "s" : ""} found`
        : "—";
    }
  }

  async function fetchTickets() {
    if (!ticketHistoryList) return;

    const params = new URLSearchParams();
    params.set("page", String(ticketPage));
    params.set("limit", String(TICKET_PAGE_SIZE));

    if (ticketFilterStatus?.value) params.set("status", ticketFilterStatus.value);
    if (ticketFilterCategory?.value) params.set("category", ticketFilterCategory.value);
    if (ticketFilterPriority?.value) params.set("priority", ticketFilterPriority.value);

    const q = (ticketSearch?.value || "").trim();
    if (q) params.set("q", q);

    if (ticketDateFrom?.value) params.set("from", ticketDateFrom.value);
    if (ticketDateTo?.value) params.set("to", ticketDateTo.value);

    ticketHistoryList.innerHTML = `<div class="text-muted small">Loading...</div>`;
    ticketHistoryEmpty?.classList.add("d-none");

    try {
      const res = await fetch(`${TICKET_LIST_ENDPOINT}?${params.toString()}`, {
        method: "GET",
        headers: { ...getAuthHeaders() },
        credentials: "include",
      });

      const data = await safeJson(res);

      if (isAuthError(res.status)) throw new Error("Session expired or unauthorized. Please login again.");
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to load tickets.");

      const items = Array.isArray(data.tickets) ? data.tickets : [];
      ticketTotal = Number(data.total || items.length || 0);

      setTicketPagerState();

      if (!items.length) {
        ticketHistoryList.innerHTML = "";
        ticketHistoryEmpty?.classList.remove("d-none");
        return;
      }

      ticketHistoryList.innerHTML = items.map(renderTicketRow).join("");
    } catch (err) {
      console.error(err);
      ticketHistoryList.innerHTML = `<div class="text-danger small fw-semibold">${safeText(
        err.message || "Error loading tickets."
      )}</div>`;
    }
  }

  function resetTicketFilters() {
    if (ticketFilterStatus) ticketFilterStatus.value = "";
    if (ticketFilterCategory) ticketFilterCategory.value = "";
    if (ticketFilterPriority) ticketFilterPriority.value = "";
    if (ticketSearch) ticketSearch.value = "";
    if (ticketDateFrom) ticketDateFrom.value = "";
    if (ticketDateTo) ticketDateTo.value = "";
    ticketPage = 1;
  }

  if (openTicketHistoryBtn && ticketHistoryModalEl && window.bootstrap) {
    const ticketModal = bootstrap.Modal.getOrCreateInstance(ticketHistoryModalEl, {
      backdrop: true,
      focus: true,
    });

    openTicketHistoryBtn.addEventListener("click", () => {
      ticketPage = 1;
      ticketModal.show();
    });

    ticketHistoryModalEl.addEventListener("shown.bs.modal", () => {
      fetchTickets();
    });
  }

  ticketPrevBtn?.addEventListener("click", () => {
    ticketPage = Math.max(1, ticketPage - 1);
    fetchTickets();
  });

  ticketNextBtn?.addEventListener("click", () => {
    ticketPage = ticketPage + 1;
    fetchTickets();
  });

  ticketFilterResetBtn?.addEventListener("click", () => {
    resetTicketFilters();
    fetchTickets();
  });

  ticketFilterApplyBtn?.addEventListener("click", () => {
    ticketPage = 1;
    fetchTickets();
  });

  let ticketSearchTimer = null;
  ticketSearch?.addEventListener("input", () => {
    clearTimeout(ticketSearchTimer);
    ticketSearchTimer = setTimeout(() => {
      ticketPage = 1;
      fetchTickets();
    }, 350);
  });
});