export function initAuditLogs(BACKEND_URL, token) {
  const dashboardBody = document.getElementById("dashboardAuditBody");
  const modalBody = document.getElementById("auditModalTableBody");
  const filteredBody = document.getElementById("auditFilteredTableBody");

  const applyBtn = document.getElementById("auditApplyBtn");
  const resetBtn = document.getElementById("auditResetBtn");
  const prevBtn = document.getElementById("auditPrevBtn");
  const nextBtn = document.getElementById("auditNextBtn");

  document.addEventListener("hidden.bs.modal", () => {
  document.body.classList.remove("modal-open");
  document.querySelectorAll(".modal-backdrop").forEach(b => b.remove());
});


  if (!dashboardBody && !modalBody) return;

  let allLogs = [];
  let currentPage = 0;
  const PAGE_SIZE = 10;

/* ================= OPEN MODAL (FIXED) ================= */
const openBtn = document.getElementById("openAuditLogs");
const modalEl = document.getElementById("auditLogsModal");

let auditModal = null;

if (openBtn && modalEl) {
  auditModal = new bootstrap.Modal(modalEl, {
    backdrop: true,
    keyboard: true,
    focus: true
  });

  openBtn.addEventListener("click", () => {
    auditModal.show();
  });

  // CLEANUP when modal closes
  modalEl.addEventListener("hidden.bs.modal", () => {
    document.body.classList.remove("modal-open");
    document.querySelectorAll(".modal-backdrop").forEach(b => b.remove());
  });
}


  /* ================= GLOBAL FAILSAFE (OPTIONAL) ================= */
  document.addEventListener("hidden.bs.modal", () => {
    document.body.classList.remove("modal-open");
    document.querySelectorAll(".modal-backdrop").forEach(b => b.remove());
  });

  
  /* ================= FETCH ================= */
  fetchAuditLogs();

  async function fetchAuditLogs() {
    renderLoading(dashboardBody);
    renderLoading(modalBody);

    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/audit-logs`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      allLogs = data.logs || [];

      renderLogs(dashboardBody, allLogs.slice(0, 5));
      renderModalPage();
    } catch (err) {
      renderError(dashboardBody, "Failed to load activity logs.");
      renderError(modalBody, "Failed to load audit logs.");
    }
  }

  /* ================= PAGINATION ================= */
  function renderModalPage() {
    const start = currentPage * PAGE_SIZE;
    renderLogs(modalBody, allLogs.slice(start, start + PAGE_SIZE));
  }

  prevBtn?.addEventListener("click", () => {
    if (currentPage > 0) {
      currentPage--;
      renderModalPage();
    }
  });

  nextBtn?.addEventListener("click", () => {
    if ((currentPage + 1) * PAGE_SIZE < allLogs.length) {
      currentPage++;
      renderModalPage();
    }
  });

  /* ================= FILTER ================= */
  applyBtn?.addEventListener("click", () => {
    const q = document.getElementById("auditSearch").value.toLowerCase();
    const from = document.getElementById("auditDateFrom").value;
    const to = document.getElementById("auditDateTo").value;

    const results = allLogs.filter(l => {
      const u = l.user_id || {};
      const name = `${u.first_name || ""} ${u.last_name || ""}`.toLowerCase();
      const email = (u.email || "").toLowerCase();
      const date = new Date(l.timestamp);

      if (q && !name.includes(q) && !email.includes(q)) return false;
      if (from && date < new Date(from)) return false;
      if (to && date > new Date(to)) return false;
      return true;
    });

    renderLogs(filteredBody, results.slice(0, 5));
  });

  resetBtn?.addEventListener("click", () => {
    document.getElementById("auditSearch").value = "";
    document.getElementById("auditDateFrom").value = "";
    document.getElementById("auditDateTo").value = "";

    filteredBody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-muted">
          No filters applied.
        </td>
      </tr>
    `;
  });

  /* ================= RENDER HELPERS ================= */
  function renderLoading(target) {
    if (!target) return;
    target.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Loading…</td></tr>`;
  }

  function renderError(target, msg) {
    if (!target) return;
    target.innerHTML = `<tr><td colspan="6" class="text-center text-danger">${msg}</td></tr>`;
  }

  function renderLogs(target, logs) {
    if (!target) return;
    if (!logs.length) {
      target.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No records found.</td></tr>`;
      return;
    }

    target.innerHTML = logs.map(l => {
      const u = l.user_id || {};
      return `
        <tr>
          <td>${new Date(l.timestamp).toLocaleString()}</td>
          <td>${u.first_name || "Unknown"} ${u.last_name || ""}</td>
          <td>${u.role || "-"}</td>
          <td>${l.action}</td>
          <td>${l.module}</td>
          <td>${l.details || "-"}</td>
        </tr>
      `;
    }).join("");
  }
}
