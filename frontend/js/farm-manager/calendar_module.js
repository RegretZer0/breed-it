export function initFarmCalendar(BACKEND_URL, token) {
  const calendarEl = document.getElementById("calendar");
  const taskPanel = document.getElementById("taskPanel");
  const selectedDateLabel = document.getElementById("selectedDateLabel");
  const addTaskBtn = document.getElementById("addTaskBtn"); // optional (safe)

  if (!calendarEl || !window.FullCalendar) {
    console.warn("Calendar element or FullCalendar not found");
    return null;
  }

  const todayStr = new Date().toISOString().split("T")[0];

  // ================================
  // Helpers
  // ================================
  const pad2 = (n) => String(n).padStart(2, "0");

  function toYMD(dateObj) {
    if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return null;
    return `${dateObj.getFullYear()}-${pad2(dateObj.getMonth() + 1)}-${pad2(dateObj.getDate())}`;
  }

  function ymdToDate(ymd) {
    const [y, m, d] = (ymd || "").split("-").map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function isDateWithinAllDayRange(targetYMD, startDate, endDateExclusive) {
    const t = ymdToDate(targetYMD);
    if (!t) return false;

    const s = startDate instanceof Date ? startDate : null;
    if (!s) return false;

    if (!endDateExclusive) {
      return toYMD(s) === targetYMD;
    }

    const e = endDateExclusive instanceof Date ? endDateExclusive : null;
    if (!e) return toYMD(s) === targetYMD;

    // inclusive start, exclusive end
    return (
      t >= new Date(s.getFullYear(), s.getMonth(), s.getDate()) &&
      t < new Date(e.getFullYear(), e.getMonth(), e.getDate())
    );
  }

  function isBackgroundLike(event) {
    return event.display === "background" || event.extendedProps?.type === "heat_window_range";
  }

  function getEventKindMeta(event) {
    const type = (event.extendedProps?.type || "").toLowerCase();
    const status = (event.extendedProps?.status || "").toLowerCase();

    const meta = {
      icon: "bi-calendar-event",
      badgeClass: "text-bg-light border",
      label: "Scheduled",
    };

    if (type === "ai_due") {
      meta.icon = "bi-droplet-half";
      meta.badgeClass = "text-bg-warning";
      meta.label = "AI Due";
      return meta;
    }
    if (type === "pregnancy_check") {
      meta.icon = "bi-eye";
      meta.badgeClass = "text-bg-info";
      meta.label = "Pregnancy Check";
      return meta;
    }
    if (type === "expected_farrowing") {
      meta.icon = "bi-calendar-heart";
      meta.badgeClass = "text-bg-success";
      meta.label = "Expected Farrowing";
      return meta;
    }
    if (type === "actual_farrowing") {
      meta.icon = "bi-exclamation-triangle-fill";
      meta.badgeClass = "text-bg-danger";
      meta.label = "Farrowed";
      return meta;
    }
    if (type === "weaning_due") {
      meta.icon = "bi-hourglass-split";
      meta.badgeClass = "text-bg-primary";
      meta.label = "Weaning Due";
      return meta;
    }
    if (type === "weaning_completed") {
      meta.icon = "bi-check-circle-fill";
      meta.badgeClass = "text-bg-secondary";
      meta.label = "Weaned";
      return meta;
    }
    if (type === "cull_deadline") {
      meta.icon = "bi-exclamation-octagon-fill";
      meta.badgeClass = "text-bg-danger";
      meta.label = "Critical Deadline";
      return meta;
    }
    if (type === "heat_window_range") {
      meta.icon = "bi-clock-history";
      meta.badgeClass = "text-bg-warning";
      meta.label = "Heat Window";
      return meta;
    }

    // Fallback by status
    if (status.includes("preg")) {
      meta.icon = "bi-heart-fill";
      meta.badgeClass = "text-bg-success";
      meta.label = "Pregnant";
    } else if (status.includes("observation")) {
      meta.icon = "bi-eye";
      meta.badgeClass = "text-bg-info";
      meta.label = "Observation";
    } else if (status.includes("lact")) {
      meta.icon = "bi-droplet-fill";
      meta.badgeClass = "text-bg-primary";
      meta.label = "Lactating";
    } else if (status.includes("farrow")) {
      meta.icon = "bi-exclamation-triangle-fill";
      meta.badgeClass = "text-bg-danger";
      meta.label = "Farrowing";
    } else if (status.includes("in-heat") || status.includes("heat")) {
      meta.icon = "bi-fire";
      meta.badgeClass = "text-bg-warning";
      meta.label = "In-Heat";
    }

    return meta;
  }

  function getEventsForDate(dateStr) {
    const all = calendar.getEvents();

    return all.filter((ev) => {
      if (ev.allDay && ev.start instanceof Date) {
        if (ev.end instanceof Date) {
          return isDateWithinAllDayRange(dateStr, ev.start, ev.end);
        }
        return toYMD(ev.start) === dateStr;
      }

      if (ev.start instanceof Date) {
        return toYMD(ev.start) === dateStr;
      }

      return ev.startStr === dateStr;
    });
  }

  // ================================
  // Week helpers (Mon–Sun)
  // ================================
  function startOfWeek(dateObj) {
    const d = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
    const day = d.getDay(); // 0=Sun ... 6=Sat
    const diffToMon = (day === 0 ? -6 : 1) - day; // move to Monday
    d.setDate(d.getDate() + diffToMon);
    return d;
  }

  function endOfWeekExclusive(dateObj) {
    const s = startOfWeek(dateObj);
    const e = new Date(s);
    e.setDate(e.getDate() + 7); // exclusive
    return e;
  }

  function isDateInRange(d, start, endExclusive) {
    return d >= start && d < endExclusive;
  }

  function extractSwineCodeFromTitle(title) {
    // Handles: "AI Due – SWINE001" or "Expected Farrowing – SWINE001" or "CRITICAL: Heat Report Due – SWINE001"
    // Uses dash/en-dash separation; if none, returns null
    const t = String(title || "");
    const parts = t.split("–"); // en-dash
    if (parts.length >= 2) return parts[parts.length - 1].trim();

    const parts2 = t.split("-"); // hyphen fallback
    if (parts2.length >= 2) return parts2[parts2.length - 1].trim();

    return null;
  }

  function getEventsInWeek(refDateObj) {
    const start = startOfWeek(refDateObj);
    const endEx = endOfWeekExclusive(refDateObj);

    return calendar.getEvents().filter((ev) => {
      // all-day range
      if (ev.allDay && ev.start instanceof Date) {
        const evStart = new Date(ev.start.getFullYear(), ev.start.getMonth(), ev.start.getDate());
        const evEndEx =
          ev.end instanceof Date
            ? new Date(ev.end.getFullYear(), ev.end.getMonth(), ev.end.getDate())
            : new Date(evStart.getFullYear(), evStart.getMonth(), evStart.getDate() + 1);

        // overlap check: [evStart, evEndEx) overlaps [start, endEx)
        return evStart < endEx && evEndEx > start;
      }

      // timed or single-date
      if (ev.start instanceof Date) {
        const s = new Date(ev.start.getFullYear(), ev.start.getMonth(), ev.start.getDate());
        return isDateInRange(s, start, endEx);
      }

      // fallback via startStr
      const ymd = ev.startStr;
      const d = ymdToDate(ymd);
      if (!d) return false;
      return isDateInRange(d, start, endEx);
    });
  }

  function getUniqueWeekPigs(refDateObj) {
    const weekEvents = getEventsInWeek(refDateObj);

    const set = new Set();
    weekEvents.forEach((ev) => {
      // prefer swineId if exists (open window/deadline)
      const swineId = ev.extendedProps?.swineId;
      if (swineId) {
        set.add(String(swineId));
        return;
      }

      // else try to parse from title
      const code = extractSwineCodeFromTitle(ev.title);
      if (code) set.add(code);
    });

    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }

  function renderWeekPigList(refDateObj) {
    if (!taskPanel) return;

    const start = startOfWeek(refDateObj);
    const endEx = endOfWeekExclusive(refDateObj);
    const startYMD = toYMD(start);
    const endYMD = toYMD(new Date(endEx.getFullYear(), endEx.getMonth(), endEx.getDate() - 1)); // inclusive last day

    const pigs = getUniqueWeekPigs(refDateObj);

    selectedDateLabel.textContent = `Pigs with events this week (${startYMD} to ${endYMD})`;

    if (!pigs.length) {
      taskPanel.innerHTML = `
        <div class="text-muted small">
          No pigs have scheduled breeding events this week.
        </div>
      `;
      return;
    }

    taskPanel.innerHTML = `
      <div class="d-flex align-items-center justify-content-between mb-2">
        <div class="small text-muted">
          <i class="bi bi-calendar-week me-1"></i>
          Found <b>${pigs.length}</b> pig(s) with events this week.
        </div>
      </div>

      <div class="d-flex flex-column gap-2">
        ${pigs
          .map((pig) => {
            return `
              <button type="button"
                class="btn btn-sm btn-outline-secondary d-flex align-items-center justify-content-between"
                data-week-pig="${escapeHtml(pig)}">
                <span class="d-flex align-items-center gap-2">
                  <i class="bi bi-piggy-bank"></i>
                  <span class="fw-semibold">${escapeHtml(pig)}</span>
                </span>
                <span class="text-muted small">View events</span>
              </button>
            `;
          })
          .join("")}
      </div>
    `;

    taskPanel.querySelectorAll("[data-week-pig]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const pig = btn.dataset.weekPig;
        if (!pig) return;
        renderWeekEventsForPig(refDateObj, pig);
      });
    });
  }

  function renderWeekEventsForPig(refDateObj, pigKey) {
    if (!taskPanel) return;

    const start = startOfWeek(refDateObj);
    const endEx = endOfWeekExclusive(refDateObj);
    const startYMD = toYMD(start);
    const endYMD = toYMD(new Date(endEx.getFullYear(), endEx.getMonth(), endEx.getDate() - 1));

    const weekEvents = getEventsInWeek(refDateObj).filter((ev) => {
      const swineId = ev.extendedProps?.swineId ? String(ev.extendedProps.swineId) : "";
      const code = extractSwineCodeFromTitle(ev.title) || "";
      return swineId === String(pigKey) || code === String(pigKey);
    });

    selectedDateLabel.textContent = `Weekly events for ${pigKey} (${startYMD} to ${endYMD})`;

    if (!weekEvents.length) {
      taskPanel.innerHTML = `
        <div class="text-muted small">
          No events found this week for <b>${escapeHtml(pigKey)}</b>.
        </div>
      `;
      return;
    }

    // Sort by start date
    weekEvents.sort((a, b) => {
      const as = a.start ? a.start.getTime() : 0;
      const bs = b.start ? b.start.getTime() : 0;
      return as - bs;
    });

    taskPanel.innerHTML = `
      <div class="d-flex align-items-center justify-content-between mb-2">
        <button type="button" class="btn btn-sm btn-outline-secondary" id="backToWeekBtn">
          <i class="bi bi-arrow-left me-1"></i> Back to week list
        </button>
        <div class="small text-muted">
          <i class="bi bi-list-check me-1"></i>
          ${weekEvents.length} event(s)
        </div>
      </div>

      <div class="d-flex flex-column gap-2">
        ${weekEvents
          .map((event) => {
            const meta = getEventKindMeta(event);
            const reportId = event.extendedProps?.reportId || "";
            const type = (event.extendedProps?.type || "").toLowerCase();
            const status = event.extendedProps?.status || "N/A";
            const startYmd = event.start ? toYMD(event.start) : "";

            const rangeNote =
              type === "heat_window_range" && event.end
                ? `<div class="small text-muted">Window active until <b>${escapeHtml(toYMD(event.end) || "")}</b> (end exclusive)</div>`
                : "";

            const isActionable = Boolean(reportId);

            return `
              <div class="task-card">
                <div class="d-flex align-items-start justify-content-between gap-2">
                  <div class="min-w-0">
                    <div class="d-flex align-items-center gap-2">
                      <span class="badge ${meta.badgeClass}">
                        <i class="bi ${meta.icon} me-1"></i>${escapeHtml(meta.label)}
                      </span>
                      <div class="fw-semibold text-truncate">${escapeHtml(event.title)}</div>
                    </div>

                    <div class="small text-muted mt-1">
                      Date: <b>${escapeHtml(startYmd || "—")}</b> · Status: ${escapeHtml(status)}
                    </div>

                    ${rangeNote}
                  </div>

                  ${
                    isActionable
                      ? `
                    <button class="btn btn-sm btn-outline-primary flex-shrink-0"
                      data-report="${escapeHtml(reportId)}">
                      View Report
                    </button>
                  `
                      : `
                    <span class="text-muted small flex-shrink-0">
                      ${isBackgroundLike(event) ? "Info" : "—"}
                    </span>
                  `
                  }
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    `;

    // Back button
    taskPanel.querySelector("#backToWeekBtn")?.addEventListener("click", () => {
      renderWeekPigList(refDateObj);
    });

    // Attach report buttons
    taskPanel.querySelectorAll("[data-report]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const reportId = btn.dataset.report;
        if (!reportId) return;
        window.location.href = `/farm-manager/heat-reports/index?reportId=${reportId}`;
      });
    });
  }

  // ================================
  // Calendar Setup
  // ================================
  const calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: "dayGridMonth",
    height: "auto",
    expandRows: true,
    fixedWeekCount: false,

    dayMaxEvents: 2,
    moreLinkClick: "day",

    customButtons: {
      weekPigs: {
        text: "This Week",
        click: () => {
          const ref = calendar.getDate(); // current calendar focus date
          renderWeekPigList(ref);
        }
      }
    },

    headerToolbar: {
      left: "prev,next today",
      center: "title",
      right: "weekPigs"
    },

    events: fetchCalendarEvents,
    eventContent: renderCustomEvent,
    eventClick: handleEventClick,
    dateClick: handleDateClick
  });

  calendar.render();

  // Add Bootstrap icon to custom button after render (FullCalendar uses plain text by default)
  const weekBtn = calendarEl.querySelector(".fc-weekPigs-button");
  if (weekBtn) {
    weekBtn.innerHTML = `<i class="bi bi-calendar-week me-1"></i><span>This Week</span>`;
  }

  // Initial load (today)
  highlightDate(todayStr);
  renderEventsForDate(todayStr);

  addTaskBtn?.addEventListener("click", () => {
    console.log("Add task clicked (not implemented).");
  });

  // ================================
  // FETCH EVENTS
  // ================================
  async function fetchCalendarEvents(info, success, failure) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/heat/calendar-events`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

      const data = await res.json();
      if (data.success) success(data.events);
      else failure(data.message);
    } catch (err) {
      failure(err);
    }
  }

  // ================================
  // CUSTOM EVENT RENDER
  // ================================
  function renderCustomEvent(arg) {
    const type = (arg.event.extendedProps.type || "").toLowerCase();
    const status = (arg.event.extendedProps.status || "").toLowerCase();

    // Background range highlight should not render a pill
    if (type === "heat_window_range") {
      return { html: "" };
    }

    const statusMap = {
      "in-heat": { color: "#ff9a1f", icon: "bi-fire" },
      "under observation": { color: "#1ea7ff", icon: "bi-eye" },
      "pregnant": { color: "#43c572", icon: "bi-heart-fill" },
      "farrowing": { color: "#cf2631", icon: "bi-exclamation-triangle-fill" },
      "lactating": { color: "#1543ff", icon: "bi-droplet-fill" },
      "completed": { color: "#6c757d", icon: "bi-check-circle-fill" }
    };

    if (type === "cull_deadline") {
      return {
        html: `
          <div class="fc-custom-event"
              style="border-left:4px solid #dc3545; color:#dc3545">
            <i class="bi bi-exclamation-octagon-fill"></i>
            <span class="fc-event-title">${escapeHtml(arg.event.title)}</span>
          </div>
        `
      };
    }

    const config = statusMap[status] || {
      color: "#adb5bd",
      icon: "bi-calendar-event"
    };

    return {
      html: `
        <div class="fc-custom-event"
            style="border-left:4px solid ${config.color};
                    color:${config.color}">
          <i class="bi ${config.icon}"></i>
          <span class="fc-event-title">
            ${escapeHtml(arg.event.title)}
          </span>
        </div>
      `
    };
  }

  // ================================
  // DATE CLICK → PANEL VIEW
  // ================================
  function handleDateClick(info) {
    const selectedDate = info.dateStr;
    highlightDate(selectedDate);
    renderEventsForDate(selectedDate);
  }

  function renderEventsForDate(dateStr) {
    if (!taskPanel) return;

    const events = getEventsForDate(dateStr);

    selectedDateLabel.textContent = `Events on ${dateStr}`;

    if (!events.length) {
      taskPanel.innerHTML = `
        <div class="text-muted small">
          No breeding events scheduled.
        </div>
      `;
      return;
    }

    // actionable first
    const sorted = [...events].sort((a, b) => {
      const abg = isBackgroundLike(a) ? 1 : 0;
      const bbg = isBackgroundLike(b) ? 1 : 0;
      return abg - bbg;
    });

    taskPanel.innerHTML = `
      <div class="d-flex flex-column gap-2">
        ${sorted
          .map((event) => {
            const meta = getEventKindMeta(event);
            const reportId = event.extendedProps?.reportId || "";
            const swineId = event.extendedProps?.swineId || "";
            const type = (event.extendedProps?.type || "").toLowerCase();
            const status = event.extendedProps?.status || "N/A";

            const rangeNote =
              type === "heat_window_range" && event.end
                ? `<div class="small text-muted">Window active until <b>${escapeHtml(toYMD(event.end) || "")}</b> (end exclusive)</div>`
                : "";

            const isActionable = Boolean(reportId);

            return `
              <div class="task-card">
                <div class="d-flex align-items-start justify-content-between gap-2">
                  <div class="min-w-0">
                    <div class="d-flex align-items-center gap-2">
                      <span class="badge ${meta.badgeClass}">
                        <i class="bi ${meta.icon} me-1"></i>${escapeHtml(meta.label)}
                      </span>
                      <div class="fw-semibold text-truncate">${escapeHtml(event.title)}</div>
                    </div>

                    <div class="small text-muted mt-1">
                      Status: ${escapeHtml(status)}
                      ${swineId ? ` · Swine: <span class="fw-semibold">${escapeHtml(swineId)}</span>` : ""}
                    </div>

                    ${rangeNote}
                  </div>

                  ${
                    isActionable
                      ? `
                    <button class="btn btn-sm btn-outline-primary flex-shrink-0"
                      data-report="${escapeHtml(reportId)}">
                      View Report
                    </button>
                  `
                      : `
                    <span class="text-muted small flex-shrink-0">
                      ${isBackgroundLike(event) ? "Info" : "—"}
                    </span>
                  `
                  }
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    `;

    taskPanel.querySelectorAll("[data-report]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const reportId = btn.dataset.report;
        if (!reportId) return;
        window.location.href = `/farm-manager/heat-reports/index?reportId=${reportId}`;
      });
    });
  }

  // ================================
  // HIGHLIGHT SELECTED DAY
  // ================================
  function highlightDate(dateStr) {
    document.querySelectorAll(".fc-daygrid-day").forEach((day) => {
      day.classList.remove("selected-day");
    });

    const target = document.querySelector(`.fc-daygrid-day[data-date="${dateStr}"]`);
    if (target) target.classList.add("selected-day");
  }

  // ================================
  // EVENT CLICK
  // ================================
  function handleEventClick(info) {
    const ev = info.event;

    if (isBackgroundLike(ev)) {
      const ymd = toYMD(ev.start) || todayStr;
      highlightDate(ymd);
      renderEventsForDate(ymd);
      return;
    }

    const reportId = ev.extendedProps?.reportId;
    if (reportId) {
      window.location.href = `/farm-manager/heat-reports/index?reportId=${reportId}`;
      return;
    }

    const ymd = toYMD(ev.start) || todayStr;
    highlightDate(ymd);
    renderEventsForDate(ymd);
  }

  // ================================
  // AUTO REFRESH
  // ================================
  window.addEventListener("focus", () => {
    calendar.refetchEvents();
  });

  return calendar;
}