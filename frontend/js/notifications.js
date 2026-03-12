// /js/notifications.js
export async function initNotifications(userId, backendUrl = "http://localhost:5000") {
  const token = localStorage.getItem("token");
  if (!token) return;

  const recentList = document.getElementById("notificationsList");
  const historyList = document.getElementById("notificationHistoryList");

  const typeFilter = document.getElementById("notifFilterType");
  const timeFilter = document.getElementById("notifFilterTime");

  const notifBadge = document.getElementById("notificationBadge");

  // Buttons
  const viewAllBtn = document.getElementById("viewAllNotificationsBtn");
  const markAllBtn = document.getElementById("markAllNotificationsReadBtn");
  const markAllBtnModal = document.getElementById("markAllNotificationsReadBtnModal");

  // Pagination UI
  const prevBtn = document.getElementById("notifPrevPageBtn");
  const nextBtn = document.getElementById("notifNextPageBtn");
  const pageLabel = document.getElementById("notifPageLabel");

  if (!recentList) return;

  let allNotifications = [];

  const PAGE_SIZE = 10;
  let historyPage = 1;

  /* =========================================================
    MODULE: Notification Sound State
  ========================================================= */
  let notificationAudio = null;
  let hasInitializedNotificationSnapshot = false;
  let previousUnreadIds = new Set();
  let audioUnlocked = false;
  let lastSoundAt = 0;

  function setupNotificationAudio() {
    if (notificationAudio) return notificationAudio;

    notificationAudio = new Audio("/sounds/notification.mp3");
    notificationAudio.preload = "auto";
    notificationAudio.volume = 1;

    try {
      notificationAudio.load();
    } catch {}

    return notificationAudio;
  }

  function armNotificationAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;

    const audio = setupNotificationAudio();
    if (!audio) return;

    try {
      audio.volume = 0;
      audio.currentTime = 0;

      const maybePromise = audio.play();
      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise
          .then(() => {
            audio.pause();
            audio.currentTime = 0;
            audio.volume = 1;
          })
          .catch(() => {
            audio.volume = 1;
          });
      } else {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = 1;
      }
    } catch {
      audio.volume = 1;
    }
  }

  function bindAudioUnlock() {
    const unlockOnce = () => armNotificationAudio();

    ["click", "pointerdown", "keydown", "touchstart"].forEach((evt) => {
      document.addEventListener(evt, unlockOnce, { passive: true, once: true });
    });
  }

  async function playNotificationSound() {
    const now = Date.now();
    if (now - lastSoundAt < 1200) return;
    lastSoundAt = now;

    const audio = setupNotificationAudio();
    if (!audio) return;

    try {
      audio.pause();
      audio.currentTime = 0;

      const maybePromise = audio.play();
      if (maybePromise && typeof maybePromise.catch === "function") {
        await maybePromise.catch((err) => {
          console.warn("Audio play failed:", err);
        });
      }
    } catch (err) {
      console.warn("Notification sound failed:", err);
    }
  }

  /* =========================
      FETCH
  ========================= */
  async function fetchNotifications() {
    try {
      const res = await fetch(`${backendUrl}/api/notifications/user/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      const data = await res.json();
      return data.success ? (data.notifications || []) : [];
    } catch (err) {
      console.error("Fetch Notifications Error:", err);
      return [];
    }
  }

 //Fetch Notification Helper
  function normalizeType(t) {
    return (t || "info").toString().trim().toLowerCase();
  }

  function isVisibleInPanels(notification) {
    return normalizeType(notification?.type) !== "maintenance";
  }

  function parseDate(d) {
    const dt = new Date(d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  function isUnread(n) {
    if (!n) return false;

    if (typeof n.is_read === "boolean") return n.is_read === false;
    if (typeof n.read === "boolean") return n.read === false;
    if (typeof n.isRead === "boolean") return n.isRead === false;

    if (n.read_at || n.readAt) return false;

    if (typeof n.status === "string") {
      const s = n.status.trim().toLowerCase();
      if (s === "unread") return true;
      if (s === "read") return false;
    }

    return false;
  }

  function getNotificationKey(n) {
    return String(n?._id || "").trim();
  }

  function getUnreadVisibleIds(list = []) {
    return new Set(
      list
        .filter(isVisibleInPanels)
        .filter(isUnread)
        .map(getNotificationKey)
        .filter(Boolean)
    );
  }

  async function handleIncomingNotificationSound(nextNotifications) {
    const nextUnreadIds = getUnreadVisibleIds(nextNotifications);

    if (!hasInitializedNotificationSnapshot) {
      previousUnreadIds = nextUnreadIds;
      hasInitializedNotificationSnapshot = true;
      return;
    }

    let hasNewUnread = false;

    for (const id of nextUnreadIds) {
      if (!previousUnreadIds.has(id)) {
        hasNewUnread = true;
        break;
      }
    }

    previousUnreadIds = nextUnreadIds;

    if (hasNewUnread) {
      await playNotificationSound();
    }
  }

  /* =========================
      HELPERS
  ========================= */
  function withinTimeWindow(createdAt, windowValue) {
    if (!windowValue) return true;

    const dt = parseDate(createdAt);
    if (!dt) return false;

    const now = new Date();
    const diffMs = now - dt;

    const hour = 60 * 60 * 1000;
    const day = 24 * hour;

    if (windowValue === "24h") return diffMs <= 24 * hour;
    if (windowValue === "7d") return diffMs <= 7 * day;
    if (windowValue === "30d") return diffMs <= 30 * day;
    if (windowValue === "today") {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      return dt >= todayStart;
    }

    return true;
  }

  function applyHistoryFilters(list) {
    let filtered = [...list];

    const typeVal = (typeFilter?.value || "").trim().toLowerCase();
    const timeVal = (timeFilter?.value || "").trim().toLowerCase();

    if (typeVal) filtered = filtered.filter((n) => normalizeType(n.type) === typeVal);
    if (timeVal) filtered = filtered.filter((n) => withinTimeWindow(n.created_at, timeVal));

    return filtered;
  }

  function setBadgeCount() {
    if (!notifBadge) return;

    const unreadCount = allNotifications
      .filter(isVisibleInPanels)
      .filter(isUnread)
      .length;

    if (unreadCount <= 0) {
      notifBadge.style.display = "none";
      notifBadge.textContent = "";
      return;
    }

    notifBadge.style.display = "inline-flex";
    notifBadge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
  }

  function setMarkAllButtonsDisabled(disabled) {
    if (markAllBtn) markAllBtn.disabled = disabled;
    if (markAllBtnModal) markAllBtnModal.disabled = disabled;
  }

  function isBootstrapModalEl(el) {
    return Boolean(el && el.classList && el.classList.contains("modal") && window.bootstrap?.Modal);
  }

  function isBootstrapOffcanvasEl(el) {
    return Boolean(el && el.classList && el.classList.contains("offcanvas") && window.bootstrap?.Offcanvas);
  }

  function openHistoryUI() {
    const historyEl = document.getElementById("notificationHistoryModal");
    if (!historyEl) return;

    historyPage = 1;

    if (isBootstrapModalEl(historyEl)) {
      const inst = window.bootstrap.Modal.getOrCreateInstance(historyEl);
      inst.show();
      return;
    }

    historyEl.classList.add("active");
    document.body.style.overflow = "hidden";
    renderHistory();
  }

  function closeRecentUIIfNeeded() {
    const recentPanel = document.getElementById("notificationsPanel");
    if (!recentPanel) return;

    if (isBootstrapOffcanvasEl(recentPanel)) {
      const inst = window.bootstrap.Offcanvas.getInstance(recentPanel) || window.bootstrap.Offcanvas.getOrCreateInstance(recentPanel);
      inst.hide();
      return;
    }

    recentPanel.classList.remove("active");
  }

  /* =========================
      RENDER RECENT
  ========================= */
  function renderRecent() {
    recentList.innerHTML = "";

    const recent = allNotifications
      .filter(isVisibleInPanels)
      .slice(0, 8);

    if (!recent.length) {
      recentList.innerHTML = `
        <div class="notification-item">
          <div class="notification-message text-muted">No notifications yet</div>
        </div>`;
      return;
    }

    recent.forEach((n) => {
      const unread = isUnread(n);

      const div = document.createElement("div");
      div.className = `notification-item ${unread ? "unread" : ""}`;

      div.innerHTML = `
        <div class="notification-title">${n.title || "Notification"}</div>
        <div class="notification-message">${n.message || ""}</div>
        <div class="notification-time">
          ${n.created_at ? new Date(n.created_at).toLocaleString() : ""}
        </div>
      `;

      div.addEventListener("click", () => markAsRead(n._id, { rerenderHistory: false }));
      recentList.appendChild(div);
    });
  }

  /* =========================
      HISTORY + PAGINATION
  ========================= */
  function getPaged(list) {
    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    if (historyPage > totalPages) historyPage = totalPages;
    if (historyPage < 1) historyPage = 1;

    const start = (historyPage - 1) * PAGE_SIZE;
    const pageItems = list.slice(start, start + PAGE_SIZE);

    return { pageItems, totalPages, total };
  }

  function updatePagerUI(totalPages) {
    if (pageLabel) pageLabel.textContent = `Page ${historyPage} / ${totalPages}`;
    if (prevBtn) prevBtn.disabled = historyPage <= 1;
    if (nextBtn) nextBtn.disabled = historyPage >= totalPages;
  }

  function renderHistory() {
    if (!historyList) return;

    const filtered = applyHistoryFilters(allNotifications.filter(isVisibleInPanels));
    const { pageItems, totalPages } = getPaged(filtered);

    historyList.innerHTML = "";

    if (!filtered.length) {
      updatePagerUI(1);
      historyList.innerHTML = `
        <div class="notification-item history">
          <div class="notification-message text-muted">No notifications found</div>
        </div>`;
      return;
    }

    updatePagerUI(totalPages);

    pageItems.forEach((n) => {
      const unread = isUnread(n);
      const typeClass = normalizeType(n.type);

      const div = document.createElement("div");
      div.className = `notification-item history ${unread ? "unread" : ""}`;

      div.innerHTML = `
        <div class="notification-header">
          <strong>${n.title || "Notification"}</strong>
          <span class="notification-type ${typeClass}">${(n.type || "INFO").toString()}</span>
        </div>
        <div class="notification-message">${n.message || ""}</div>
        <div class="notification-time">
          ${n.created_at ? new Date(n.created_at).toLocaleString() : ""}
        </div>
      `;

      if (unread && n._id) {
        div.style.cursor = "pointer";
        div.addEventListener("click", () => markAsRead(n._id, { rerenderHistory: true }));
      }

      historyList.appendChild(div);
    });
  }

  /* =========================
      MARK SINGLE READ
  ========================= */
  async function markAsRead(id, opts = {}) {
    if (!id) return;

    try {
      const res = await fetch(`${backendUrl}/api/notifications/${id}/read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });

      if (res.ok) {
        allNotifications = allNotifications.map((n) =>
          n._id === id
            ? {
                ...n,
                is_read: true,
                read: true,
                isRead: true,
                read_at: n.read_at || new Date().toISOString(),
              }
            : n
        );

        previousUnreadIds = getUnreadVisibleIds(allNotifications);

        setBadgeCount();
        renderRecent();
        if (opts.rerenderHistory) renderHistory();
      }
    } catch (err) {
      console.error("Mark as Read Error:", err);
    }
  }

  /* =========================
      MARK ALL READ
  ========================= */
  async function markAllRead() {
    try {
      setMarkAllButtonsDisabled(true);

      let bulkWorked = false;
      try {
        const bulkRes = await fetch(`${backendUrl}/api/notifications/user/${userId}/read-all`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        });
        if (bulkRes.ok) bulkWorked = true;
      } catch (_) {}

      if (!bulkWorked) {
        const unread = allNotifications.filter((n) => isUnread(n) && n._id);
        for (const n of unread) {
          await fetch(`${backendUrl}/api/notifications/${n._id}/read`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            credentials: "include",
          });
        }
      }

      const nowIso = new Date().toISOString();
      allNotifications = allNotifications.map((n) =>
        isUnread(n)
          ? { ...n, is_read: true, read: true, isRead: true, read_at: n.read_at || nowIso }
          : n
      );

      previousUnreadIds = getUnreadVisibleIds(allNotifications);

      setBadgeCount();
      renderRecent();
      renderHistory();
    } catch (err) {
      console.error("Mark All Read Error:", err);
    } finally {
      setMarkAllButtonsDisabled(false);
    }
  }

  /* =========================
     PUBLIC HOOK
  ========================= */
  window.__notificationsApi = window.__notificationsApi || {};
  window.__notificationsApi.markAllRead = markAllRead;

  /* =========================
      LOAD
  ========================= */
  async function load() {
    const fetched = await fetchNotifications();
    await handleIncomingNotificationSound(fetched);

    allNotifications = fetched;
    setBadgeCount();
    renderRecent();
    renderHistory();
  }

  /* =========================
      EVENTS
  ========================= */
  typeFilter?.addEventListener("change", () => {
    historyPage = 1;
    renderHistory();
  });

  timeFilter?.addEventListener("change", () => {
    historyPage = 1;
    renderHistory();
  });

  prevBtn?.addEventListener("click", () => {
    historyPage = Math.max(1, historyPage - 1);
    renderHistory();
  });

  nextBtn?.addEventListener("click", () => {
    historyPage += 1;
    renderHistory();
  });

  viewAllBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    closeRecentUIIfNeeded();
    openHistoryUI();
  });

  markAllBtn?.addEventListener("click", markAllRead);
  markAllBtnModal?.addEventListener("click", markAllRead);

  const historyEl = document.getElementById("notificationHistoryModal");
  if (historyEl && isBootstrapModalEl(historyEl)) {
    historyEl.addEventListener("shown.bs.modal", () => {
      historyPage = 1;
      renderHistory();
    });
  }

  window.addEventListener("notifications:refresh", () => {
    load();
  });

  /* =========================
      INIT
  ========================= */
  bindAudioUnlock();
  setupNotificationAudio();
  await load();
  setInterval(load, 30000);
}