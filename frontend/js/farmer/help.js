// /public/js/help/help.js
// Help & Support module JS (farmer side)
// - Prefill Name/Email from farmer profile
// - Ticket submission (auto-priority by category)
// - Ticket history (filters + pagination)
// Uses Bootstrap Modal + existing IDs (do not rename IDs)

document.addEventListener("DOMContentLoaded", () => {
  /* =========================
     Helpers
  ========================= */
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

  const safeText = (v) => (v == null ? "" : String(v));

  const fmtDateTime = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString();
  };

  /* =========================
     Feedback
  ========================= */
  function showMessage(title, message, sourceModalEl = null) {
    if (typeof window.showFeedback === "function") {
      window.showFeedback(title, message, sourceModalEl);
      return;
    }
    alert(`${title}\n\n${message}`);
  }

  /* =========================
     Farmer Profile Prefill
     ROUTE (most likely): GET /api/farmer/profile
     - Uses requireApiLogin so include credentials + token header
  ========================= */
  const FARMER_PROFILE_ENDPOINT = "/api/farmer/profile";

  async function prefillTicketIdentity() {
    const helpNameEl = document.getElementById("helpName");
    const helpEmailEl = document.getElementById("helpEmail");

    if (!helpNameEl && !helpEmailEl) return;

    // Don’t refetch if both fields already have values
    const hasName = Boolean((helpNameEl?.value || "").trim());
    const hasEmail = Boolean((helpEmailEl?.value || "").trim());
    if (hasName && hasEmail) return;

    try {
      const res = await fetch(FARMER_PROFILE_ENDPOINT, {
        method: "GET",
        headers: { ...getAuthHeaders() },
        credentials: "include",
      });

      const data = await safeJson(res);

      if (isAuthError(res.status)) {
        // Don’t hard fail UI; just skip prefill
        return;
      }
      if (!res.ok || data?.success === false) return;

      const farmer = data?.farmer || {};
      const name = safeText(farmer?.name).trim();
      const email = safeText(farmer?.email).trim();

      // Only fill if empty (don’t override user input)
      if (helpNameEl && !hasName && name) helpNameEl.value = name;
      if (helpEmailEl && !hasEmail && email) helpEmailEl.value = email;
    } catch (err) {
      console.error("Prefill farmer profile error:", err);
      // silently ignore
    }
  }

  /* =========================
     Ticket Submit (Help Modal)
  ========================= */
  const helpModalEl = document.getElementById("helpModal");
  const helpForm = document.getElementById("helpTicketForm");

  const helpNameEl = document.getElementById("helpName");
  const helpEmailEl = document.getElementById("helpEmail");
  const helpCategoryEl = document.getElementById("helpCategory");
  const helpPriorityEl = document.getElementById("helpPriority");
  const helpSubjectEl = document.getElementById("helpSubject");
  const helpMessageEl = document.getElementById("helpMessage");
  const helpSubmitBtn = document.getElementById("helpSubmitTicketBtn");

  const helpModal =
    helpModalEl && window.bootstrap
      ? bootstrap.Modal.getOrCreateInstance(helpModalEl, { backdrop: true, focus: true })
      : null;

  // Category values must match your Ticket schema enum:
  // technical | billing | account | other
  const CATEGORY_TO_PRIORITY = {
    technical: "high",
    account: "high",
    billing: "normal",
    other: "normal",
  };

  function applyAutoPriorityFromCategory() {
    if (!helpCategoryEl || !helpPriorityEl) return;

    const cat = (helpCategoryEl.value || "").toLowerCase().trim();
    const autoPriority = CATEGORY_TO_PRIORITY[cat] || "normal";

    helpPriorityEl.value = autoPriority;
    helpPriorityEl.disabled = true; // predetermined
  }

  function resetTicketFormFields() {
    if (helpCategoryEl) helpCategoryEl.value = "";
    if (helpPriorityEl) helpPriorityEl.value = "normal";
    applyAutoPriorityFromCategory();
    if (helpSubjectEl) helpSubjectEl.value = "";
    if (helpMessageEl) helpMessageEl.value = "";
  }

  helpCategoryEl?.addEventListener("change", applyAutoPriorityFromCategory);

  // When help modal opens: apply priority + prefill identity
  helpModalEl?.addEventListener("shown.bs.modal", () => {
    applyAutoPriorityFromCategory();
    prefillTicketIdentity();
  });

  if (helpForm) {
    helpForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const payload = {
        name: (helpNameEl?.value || "").trim(),
        email: (helpEmailEl?.value || "").trim(),
        category: helpCategoryEl?.value || "",
        priority: (() => {
          const cat = (helpCategoryEl?.value || "").toLowerCase().trim();
          return CATEGORY_TO_PRIORITY[cat] || "normal";
        })(),
        subject: (helpSubjectEl?.value || "").trim(),
        message: (helpMessageEl?.value || "").trim(),
        page: window.location.pathname,
      };

      if (!payload.name || !payload.email || !payload.category || !payload.subject || !payload.message) {
        showMessage("Missing Fields", "Please complete all required fields before submitting.", helpModalEl);
        return;
      }

      if (helpSubmitBtn) helpSubmitBtn.disabled = true;

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

        if (isAuthError(res.status)) throw new Error("Session expired or unauthorized. Please login again.");
        if (!res.ok || data?.success === false) throw new Error(data?.message || "Ticket submission failed.");

        // Reset form (keep name/email)
        resetTicketFormFields();

        helpModal?.hide();
        showMessage("Submitted", `Ticket sent successfully. Ref: ${data.ticket_id || "—"}`, helpModalEl);
      } catch (err) {
        console.error("Ticket submit error:", err);
        helpModal?.hide();
        showMessage("Error", err?.message || "Ticket submission failed.", helpModalEl);
      } finally {
        if (helpSubmitBtn) helpSubmitBtn.disabled = false;
      }
    });
  }

  /* =========================
     Ticket History (Modal)
  ========================= */
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

  const ticketModal =
    ticketHistoryModalEl && window.bootstrap
      ? bootstrap.Modal.getOrCreateInstance(ticketHistoryModalEl, { backdrop: true, focus: true })
      : null;

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

    // Backend doesn’t filter by date yet; safe to send anyway
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
      if (!res.ok || data?.success === false) throw new Error(data?.message || "Failed to load tickets.");

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
      console.error("Fetch tickets error:", err);
      ticketHistoryList.innerHTML = `<div class="text-danger small fw-semibold">${safeText(
        err?.message || "Error loading tickets."
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

  openTicketHistoryBtn?.addEventListener("click", () => {
    ticketPage = 1;
    ticketModal?.show();
  });

  ticketHistoryModalEl?.addEventListener("shown.bs.modal", () => {
    fetchTickets();
  });

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