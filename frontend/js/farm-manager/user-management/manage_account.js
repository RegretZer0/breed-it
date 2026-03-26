document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");

  /* =========================
     LEGACY IDs (kept - hidden)
  ========================= */
  const tbody = document.getElementById("farmersTbody");      // legacy (hidden)
  const recentTbody = document.getElementById("recentTbody"); // legacy (hidden)

  /* =========================
     NEW LIST + TABS
  ========================= */
  const accountCards = document.getElementById("accountCards");
  const accountTotalLabel = document.getElementById("accountTotalLabel");
  const accountPrevBtn = document.getElementById("accountPrevBtn");
  const accountNextBtn = document.getElementById("accountNextBtn");
  const accountPageLabel = document.getElementById("accountPageLabel");

  // Tabs (new)
  const tabAll = document.getElementById("tabAll");
  const tabRecent = document.getElementById("tabRecent");
  const tabFarmers = document.getElementById("tabFarmers");
  const tabEncoders = document.getElementById("tabEncoders");

  /* =========================
     FILTER DOM REFERENCES
  ========================= */
  const filtersForm = document.getElementById("accountFiltersForm");
  const filterLocation = document.getElementById("filterLocation");
  const filterStatus = document.getElementById("filterStatus");
  const resetFiltersBtn = document.getElementById("resetFiltersBtn");

  const filterFarmerBtn = document.getElementById("filterFarmerBtn");
  const filterFarmerSearch = document.getElementById("filterFarmerSearch");
  const filterFarmerOptions = document.getElementById("filterFarmerOptions");
  const filterFarmerId = document.getElementById("filterFarmerId");

  /* =========================
     STATS
  ========================= */
  const farmerStats = {
    total: document.getElementById("totalFarmers"),
    active: document.getElementById("activeFarmers"),
    inactive: document.getElementById("inactiveFarmers"),
  };

  const encoderStats = {
    total: document.getElementById("totalEncoders"),
    active: document.getElementById("activeEncoders"),
    inactive: document.getElementById("inactiveEncoders"),
  };

  /* =========================
     EDIT MODAL (Update Profile)
  ========================= */
  const editModal = document.getElementById("editModal");
  const editForm = document.getElementById("editFarmerForm");
  const roleLabel = document.getElementById("editRoleLabel");
  const farmerOnlyFields = document.getElementById("farmerOnlyFields");
  const closeModalBtn = document.getElementById("closeModal");
  const closeModalX = document.getElementById("closeModalX");

  /* =========================
     VIEW PANEL (NEW)
     - You must add this markup in EJS with these IDs:
       viewPanelOverlay, viewPanel, closeViewPanelBtn,
       viewAvatar, viewName, viewRole, viewStatus, viewId,
       viewEmail, viewContact, viewAddress, viewPens, viewCapacity,
       viewCreatedAt, viewUpdatedAt, viewUpdateProfileBtn
  ========================= */
  const viewPanelOverlay = document.getElementById("viewPanelOverlay");
  const viewPanel = document.getElementById("viewPanel");
  const closeViewPanelBtn = document.getElementById("closeViewPanelBtn");

  const viewAvatar = document.getElementById("viewAvatar");
  const viewName = document.getElementById("viewName");
  const viewRole = document.getElementById("viewRole");
  const viewStatus = document.getElementById("viewStatus");
  const viewId = document.getElementById("viewId");

  const viewEmail = document.getElementById("viewEmail");
  const viewContact = document.getElementById("viewContact");
  const viewAddress = document.getElementById("viewAddress");
  const viewPens = document.getElementById("viewPens");
  const viewCapacity = document.getElementById("viewCapacity");

  const viewCreatedAt = document.getElementById("viewCreatedAt");
  const viewUpdatedAt = document.getElementById("viewUpdatedAt");

  const viewUpdateProfileBtn = document.getElementById("viewUpdateProfileBtn");

  /* =========================
     DATA STATE
  ========================= */
  let farmers = [];
  let encoders = [];
  let currentAccount = null;
  let managerId = null;

  /* =========================
     LIST/TAB STATE
  ========================= */
  const TAB = { ALL: "all", RECENT: "recent", FARMERS: "farmers", ENCODERS: "encoders" };
  let activeTab = TAB.ALL;

  /* =========================
     RECENCY LOGIC
  ========================= */
  const RECENT_WINDOW_HOURS = 12;

  function isRecentByCreatedAt(acc, hours = RECENT_WINDOW_HOURS) {
    const createdAt = acc?.createdAt;
    if (!createdAt) return false;

    const created = new Date(createdAt);
    if (Number.isNaN(created.getTime())) return false;

    const ageMs = Date.now() - created.getTime();
    const windowMs = hours * 60 * 60 * 1000;

    return ageMs >= 0 && ageMs <= windowMs;
  }

  /* =========================
     PAGINATION STATE
  ========================= */
  let accountPage = 1;

  const DEFAULT_PER_PAGE = 6;
  function perPage() {
    if (window.innerWidth < 576) return 4;
    if (window.innerWidth < 992) return 5;
    return DEFAULT_PER_PAGE;
  }

  function paginate(data, page, size) {
    const total = data.length;
    const totalPages = Math.max(1, Math.ceil(total / size));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const start = (safePage - 1) * size;
    const items = data.slice(start, start + size);
    return { items, page: safePage, totalPages, total };
  }

  /* =========================
     IMAGE HELPERS (schema-aware)
  ========================= */
  function resolveImageUrl(path) {
    if (!path) return "/images/default-avatar.png";

    if (typeof path !== "string") return "/images/default-avatar.png";

    // Supabase signed URL
    if (path.startsWith("http")) return path;

    return "/images/default-avatar.png";
  }

  function pickProfilePicture(acc) {
    return (
      acc?.profile_picture ||
      acc?.profile_photo ||  
      acc?.profileImage ||
      acc?.avatar ||
      acc?.photo ||
      ""
    );
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizePHNumber(num) {
    if (!num) return "";

    num = String(num).replace(/\D/g, ""); // remove non-digits

    if (num.startsWith("639")) {
      return "0" + num.slice(2);
    }

    if (num.startsWith("9") && num.length === 10) {
      return "0" + num;
    }

    if (num.startsWith("09") && num.length === 11) {
      return num;
    }

    return ""; // fallback (still editable)
  }

  function toRole(acc) {
    return acc?.farmer_id ? "Farmer" : "Encoder";
  }

  function toId(acc) {
    return acc?.farmer_id || acc?.encoder_id || "";
  }
  
  function toStatus(acc) {
    const raw = String(acc?.status || "active").trim().toLowerCase();
    return raw === "inactive" || raw === "disabled" ? "inactive" : "active";
  }

  function formatDateTime(val) {
    if (!val) return "—";
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-PH", { timeZone: "Asia/Manila" });
  }

  function setText(el, value) {
    if (!el) return;
    el.textContent = value || "—";
  }

  function setImage(el, src) {
    if (!el) return;
    el.src = resolveImageUrl(src);
    el.onerror = () => {
      el.onerror = null;
      el.src = "/images/default-avatar.png";
    };
  }

  /* =========================
     AUTH / MANAGER
  ========================= */
  async function resolveManagerId() {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    const data = await res.json();

    if (!data.success) throw new Error("Not authenticated");

    managerId = data.user.role === "farm_manager" ? data.user.id : data.user.managerId;
  }

  /* =========================
     FETCH DATA
  ========================= */
  async function fetchAllAccounts() {
    try {
      if (!token) {
        console.error("No token found");
        return;
      }

      if (!managerId) await resolveManagerId();

      const [fRes, eRes] = await Promise.all([
        fetch(`/api/auth/farmers`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        }),
        fetch(`/api/auth/encoders`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        }),
      ]);

      const fType = fRes.headers.get("content-type");
      const eType = eRes.headers.get("content-type");
      if (!fType?.includes("application/json")) throw new Error("Invalid farmers response from server.");
      if (!eType?.includes("application/json")) throw new Error("Invalid encoders response from server.");

      const fData = await fRes.json();
      const eData = await eRes.json();
      if (!fData.success) throw new Error("Failed to fetch farmers");
      if (!eData.success) throw new Error("Failed to fetch encoders");

      farmers = fData.farmers || [];
      encoders = eData.encoders || [];

      updateStats();
      renderAccountDropdownOptions();
      renderActiveList();

      renderLegacyTbody([...farmers, ...encoders]);
      renderLegacyRecentTbody(getRecentBaseList().slice(0, 5));
    } catch (err) {
      console.error("FETCH ACCOUNTS ERROR:", err);
      if (accountCards) {
        accountCards.innerHTML = `<div class="text-muted">Server error. Please refresh.</div>`;
      }
      if (tbody) tbody.innerHTML = `<tr><td colspan="9">Server error</td></tr>`;
    }
  }

  /* =========================
     STATS
  ========================= */
  function updateStats() {
    if (!farmerStats.total) return;

    farmerStats.total.textContent = String(farmers.length);
    farmerStats.active.textContent = String(farmers.filter(f => toStatus(f) !== "inactive").length);
    farmerStats.inactive.textContent = String(farmers.length - Number(farmerStats.active.textContent || 0));

    encoderStats.total.textContent = String(encoders.length);
    encoderStats.active.textContent = String(encoders.filter(e => toStatus(e) !== "inactive").length);
    encoderStats.inactive.textContent = String(encoders.length - Number(encoderStats.active.textContent || 0));
  }

  /* =========================
     TAB DATA SOURCE
  ========================= */
  function getRecentBaseList() {
    return [...farmers, ...encoders]
      .filter(acc => isRecentByCreatedAt(acc, RECENT_WINDOW_HOURS))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  function getTabBaseList() {
    if (activeTab === TAB.FARMERS) return [...farmers];
    if (activeTab === TAB.ENCODERS) return [...encoders];
    if (activeTab === TAB.RECENT) return getRecentBaseList();
    return [...farmers, ...encoders];
  }

  /* =========================
     FILTERS (apply to current tab)
  ========================= */
  function applyFiltersTo(list) {
    let data = [...list];

    const selectedId = (filterFarmerId?.value || "").trim();
    const location = (filterLocation?.value || "").toLowerCase().trim();
    const status = filterStatus?.value;

    if (selectedId) data = data.filter(acc => toId(acc) === selectedId);
    if (location) data = data.filter(acc => (acc.address || "").toLowerCase().includes(location));
    if (status && status !== "all") {
      const want = String(status).toLowerCase();
      data = data.filter(acc => toStatus(acc) === want);
    }

    return data;
  }

  /* =========================
     CARD TEMPLATE (1 row) + View button
     - Edit removed from card
  ========================= */
  function accountRowHTML(acc) {
    const isFarmer = !!acc.farmer_id;
    const role = isFarmer ? "Farmer" : "Encoder";
    const id = toId(acc) || "—";
    const status = toStatus(acc);
    const fullName = `${acc.first_name || ""} ${acc.last_name || ""}`.trim() || "—";

    const address = acc.address || "—";
    const contact = acc.contact_no || acc.contact_info || "—";
    const pens = acc.num_of_pens ?? "—";
    const cap = acc.pen_capacity ?? "—";

    const imgSrc = resolveImageUrl(pickProfilePicture(acc));
    const isNew = isRecentByCreatedAt(acc, RECENT_WINDOW_HOURS);

    return `
      <div class="account-row" data-row-id="${escapeHtml(id)}">
        <div class="account-avatar">
          <img src="${escapeHtml(imgSrc)}" alt="Profile" loading="lazy"
               onerror="this.onerror=null;this.src='/images/default-avatar.png';" />
        </div>

        <div class="account-main">
          <p class="account-name">${escapeHtml(fullName)}</p>

          <div class="account-sub">
            <span><i class="bi bi-hash"></i> <b>${escapeHtml(id)}</b></span>
            <span><i class="bi bi-geo-alt"></i> ${escapeHtml(address)}</span>
            <span><i class="bi bi-telephone"></i> ${escapeHtml(contact)}</span>
            ${isFarmer ? `<span><i class="bi bi-house"></i> Pens: <b>${escapeHtml(pens)}</b></span>` : ``}
            ${isFarmer ? `<span><i class="bi bi-people"></i> Capacity: <b>${escapeHtml(cap)}</b></span>` : ``}
          </div>
        </div>

        <div class="account-meta">
          <div class="d-flex flex-column align-items-end gap-2">
            <span class="badge-role">
              <i class="bi ${isFarmer ? "bi-person-badge" : "bi-person-gear"}"></i>
              ${role}
            </span>

            <span class="badge-status ${status}">
              <i class="bi ${status === "inactive" ? "bi-x-circle" : "bi-check-circle"}"></i>
              ${status === "inactive" ? "Inactive" : "Active"}
            </span>

            ${
              isNew
                ? `<span class="badge-role" style="border-color: rgba(25,135,84,0.25); background: rgba(25,135,84,0.10); color: var(--green-2);">
                     <i class="bi bi-stars"></i> New
                   </span>`
                : ""
            }
          </div>

          <div class="row-actions">
            <button type="button" class="btn-soft view" data-view-id="${escapeHtml(id)}">
              <i class="bi bi-eye me-1"></i> View
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function wireRowButtons(container, data) {
    if (!container) return;

    container.querySelectorAll("[data-view-id]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-view-id");
        const found = data.find(acc => toId(acc) === id);
        if (found) openViewPanel(found);
      });
    });
  }

  /* =========================
     VIEW PANEL LOGIC (NEW)
  ========================= */
  function openViewPanel(acc) {
    if (!viewPanelOverlay || !viewPanel) {
      console.warn("View panel markup missing. Add required IDs in EJS.");
      return;
    }

    const isFarmer = !!acc.farmer_id;
    const role = toRole(acc);
    const status = toStatus(acc);
    const id = toId(acc) || "—";
    const fullName = `${acc.first_name || ""} ${acc.last_name || ""}`.trim() || "—";

    // Fill UI
    setImage(viewAvatar, pickProfilePicture(acc));
    setText(viewName, fullName);
    setText(viewRole, role);
    setText(viewId, id);
    setText(viewStatus, status === "inactive" ? "Inactive" : "Active");

    // details
    setText(viewEmail, acc.email || "—");
    setText(viewContact, acc.contact_no || acc.contact_info || "—");
    setText(viewAddress, acc.address || "—");
    setText(viewPens, isFarmer ? String(acc.num_of_pens ?? "—") : "");
    setText(viewCapacity, isFarmer ? String(acc.pen_capacity ?? "—") : "");
    setText(viewCreatedAt, formatDateTime(acc.createdAt));
    setText(viewUpdatedAt, formatDateTime(acc.updatedAt));

    // Wire "Update Profile" button inside view panel
    if (viewUpdateProfileBtn) {
      viewUpdateProfileBtn.onclick = () => {
        closeViewPanel();
        openEditModal(acc); // reuse your existing edit modal
      };
    }

    // show panel
    viewPanelOverlay.classList.remove("d-none");
    document.body.style.overflow = "hidden";
  }

  function closeViewPanel() {
    if (!viewPanelOverlay) return;
    viewPanelOverlay.classList.add("d-none");
    document.body.style.overflow = "";
  }

  closeViewPanelBtn?.addEventListener("click", closeViewPanel);
  viewPanelOverlay?.addEventListener("click", (e) => {
    // click outside panel closes
    if (e.target === viewPanelOverlay) closeViewPanel();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (viewPanelOverlay && !viewPanelOverlay.classList.contains("d-none")) closeViewPanel();
      if (editModal && !editModal.classList.contains("d-none")) closeModal();
    }
  });

  /* =========================
     RENDER LIST
  ========================= */
  function renderActiveList() {
    if (!accountCards) return;

    const base = getTabBaseList();
    const filtered = applyFiltersTo(base);

    accountTotalLabel.textContent = String(filtered.length);

    const size = perPage();
    const pg = paginate(filtered, accountPage, size);

    accountPage = pg.page;
    accountPageLabel.textContent = `Page ${pg.page} of ${pg.totalPages}`;

    accountPrevBtn.disabled = pg.page <= 1;
    accountNextBtn.disabled = pg.page >= pg.totalPages;

    if (!pg.items.length) {
      accountCards.innerHTML =
        activeTab === TAB.RECENT
          ? `<div class="text-muted">No recent accounts found in the last ${RECENT_WINDOW_HOURS} hours.</div>`
          : `<div class="text-muted">No accounts found.</div>`;
      return;
    }

    accountCards.innerHTML = pg.items.map(accountRowHTML).join("");
    wireRowButtons(accountCards, filtered);
  }

  accountPrevBtn?.addEventListener("click", () => {
    accountPage = Math.max(1, accountPage - 1);
    renderActiveList();
  });

  accountNextBtn?.addEventListener("click", () => {
    accountPage = accountPage + 1;
    renderActiveList();
  });

  window.addEventListener("resize", () => renderActiveList());

  /* =========================
     TABS
  ========================= */
  function setActiveTab(tabKey) {
    activeTab = tabKey;
    accountPage = 1;

    [tabAll, tabRecent, tabFarmers, tabEncoders].forEach(b => b?.classList.remove("active"));
    if (tabKey === TAB.ALL) tabAll?.classList.add("active");
    if (tabKey === TAB.RECENT) tabRecent?.classList.add("active");
    if (tabKey === TAB.FARMERS) tabFarmers?.classList.add("active");
    if (tabKey === TAB.ENCODERS) tabEncoders?.classList.add("active");

    clearAccountDropdownSelection();
    renderAccountDropdownOptions();
    renderActiveList();
  }

  tabAll?.addEventListener("click", () => setActiveTab(TAB.ALL));
  tabRecent?.addEventListener("click", () => setActiveTab(TAB.RECENT));
  tabFarmers?.addEventListener("click", () => setActiveTab(TAB.FARMERS));
  tabEncoders?.addEventListener("click", () => setActiveTab(TAB.ENCODERS));

  /* =========================
     FILTER FORM
  ========================= */
  filtersForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    accountPage = 1;
    renderActiveList();
  });

  function clearAccountDropdownSelection() {
    if (filterFarmerId) filterFarmerId.value = "";
    if (filterFarmerSearch) filterFarmerSearch.value = "";
    if (filterFarmerBtn) filterFarmerBtn.textContent = "Select Account";
  }

  resetFiltersBtn?.addEventListener("click", () => {
    clearAccountDropdownSelection();
    if (filterLocation) filterLocation.value = "";
    if (filterStatus) filterStatus.value = "";
    accountPage = 1;
    renderAccountDropdownOptions();
    renderActiveList();
  });

  /* =========================
     SEARCHABLE ACCOUNT DROPDOWN (tab-aware)
  ========================= */
  function renderAccountDropdownOptions() {
    if (!filterFarmerOptions) return;

    const base = getTabBaseList();
    const list = base.map(acc => ({
      id: toId(acc),
      name: `${acc.first_name || ""} ${acc.last_name || ""}`.trim() || "—",
      role: toRole(acc),
      createdAt: acc?.createdAt || null,
    }));

    renderFilterOptionsFromList(list);
  }

  function renderFilterOptionsFromList(list) {
    if (!filterFarmerOptions) return;

    filterFarmerOptions.innerHTML = "";

    if (!list.length) {
      filterFarmerOptions.innerHTML = `<div class="text-muted small">No results found</div>`;
      return;
    }

    list.forEach(item => {
      const isNew = item.createdAt
        ? isRecentByCreatedAt({ createdAt: item.createdAt }, RECENT_WINDOW_HOURS)
        : false;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dropdown-item d-flex justify-content-between align-items-center";

      btn.innerHTML = `
        <span>${escapeHtml(item.name)}</span>
        <span class="d-flex align-items-center gap-2">
          ${isNew ? `<span class="badge text-bg-success" style="font-size:10px;">NEW</span>` : ``}
          <span class="small text-muted">${escapeHtml(item.role)}</span>
        </span>
      `;

      btn.onclick = () => {
        if (filterFarmerBtn) filterFarmerBtn.textContent = item.name;
        if (filterFarmerId) filterFarmerId.value = item.id;
      };

      filterFarmerOptions.appendChild(btn);
    });
  }

  filterFarmerSearch?.addEventListener("input", (e) => {
    const q = (e.target.value || "").toLowerCase();

    const base = getTabBaseList();
    const list = base
      .filter(acc => `${acc.first_name || ""} ${acc.last_name || ""}`.toLowerCase().includes(q))
      .map(acc => ({
        id: toId(acc),
        name: `${acc.first_name || ""} ${acc.last_name || ""}`.trim() || "—",
        role: toRole(acc),
        createdAt: acc?.createdAt || null,
      }));

    renderFilterOptionsFromList(list);
  });

  /* =========================
     LEGACY TABLE RENDERERS (hidden)
  ========================= */
  function renderLegacyTbody(data) {
    if (!tbody) return;
    tbody.innerHTML = "";

    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="9">No results found</td></tr>`;
      return;
    }

    data.forEach(acc => {
      const isFarmer = !!acc.farmer_id;
      const role = isFarmer ? "Farmer" : "Encoder";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(toId(acc) || "—")}</td>
        <td>${escapeHtml(`${acc.first_name || ""} ${acc.last_name || ""}`.trim())}</td>
        <td>${escapeHtml(role)}</td>
        <td>${escapeHtml(acc.address || "-")}</td>
        <td>${escapeHtml(acc.contact_no || acc.contact_info || "-")}</td>
        <td>${escapeHtml(isFarmer ? (acc.num_of_pens ?? "-") : "-")}</td>
        <td>${escapeHtml(isFarmer ? (acc.pen_capacity ?? "-") : "-")}</td>
        <td>${escapeHtml(acc.status || "Active")}</td>
        <td><button class="btn btn-sm btn-outline-primary">Edit</button></td>
      `;
      tr.querySelector("button").addEventListener("click", () => openEditModal(acc));
      tbody.appendChild(tr);
    });
  }

  function renderLegacyRecentTbody(list) {
    if (!recentTbody) return;
    recentTbody.innerHTML = "";
    list.forEach(acc => {
      recentTbody.innerHTML += `
        <tr>
          <td>${escapeHtml(toId(acc) || "—")}</td>
          <td>${escapeHtml(`${acc.first_name || ""} ${acc.last_name || ""}`.trim())}</td>
          <td>${escapeHtml(acc.farmer_id ? "Farmer" : "Encoder")}</td>
          <td>${escapeHtml(acc.address || "-")}</td>
          <td>${escapeHtml(acc.status || "Active")}</td>
        </tr>
      `;
    });
  }

  /* =========================
     EDIT MODAL LOGIC (Update Profile)
  ========================= */
  function openEditModal(acc) {
    currentAccount = acc;
    const isFarmer = !!acc.farmer_id;

    roleLabel.textContent = isFarmer ? "Farmer" : "Encoder";
    farmerOnlyFields.style.display = isFarmer ? "block" : "none";

    editForm.editFirstName.value = acc.first_name || "";
    editForm.editLastName.value = acc.last_name || "";
    editForm.editAddress.value = acc.address || "";

    editForm.editContact.value = normalizePHNumber(
      acc.contact_no || acc.contact_info || ""
    );
    editForm.editStatus.value = toStatus(acc);

    if (isFarmer) {
      editForm.editPens.value = acc.num_of_pens ?? "";
      editForm.editCapacity.value = acc.pen_capacity ?? "";
    }

    editModal.classList.remove("d-none");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    editModal.classList.add("d-none");
    document.body.style.overflow = "";
  }

  closeModalBtn?.addEventListener("click", closeModal);
  closeModalX?.addEventListener("click", closeModal);

  editForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentAccount) return;

    const isFarmer = !!currentAccount.farmer_id;

    const payload = {
      first_name: editForm.editFirstName.value.trim(),
      last_name: editForm.editLastName.value.trim(),
      address: editForm.editAddress.value.trim(),
      status: editForm.editStatus.value === "active" ? "Active" : "Inactive",
    };

    if (isFarmer) {
      payload.contact_no = normalizePHNumber(editForm.editContact.value.trim());
    } else {
      payload.contact_info = normalizePHNumber(editForm.editContact.value.trim());
    }

    if (isFarmer) {
      payload.num_of_pens = Number(editForm.editPens.value) || 0;
      payload.pen_capacity = Number(editForm.editCapacity.value) || 0;
    }

    const endpoint = isFarmer
      ? `/api/auth/update-farmer/${currentAccount.farmer_id}`
      : `/api/auth/update-encoder/${currentAccount._id}`;

    try {
      const res = await fetch(endpoint, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error("Update non-JSON response:", text);
        throw new Error("Server error during update.");
      }

      const data = await res.json();

      if (res.ok && data.success) {
        closeModal();
        await fetchAllAccounts();
      } else {
        alert(data.message || "Update failed");
      }
    } catch (err) {
      console.error("UPDATE ERROR:", err);
      alert(err.message || "Server error");
    }
  });

  /* =========================
     INIT
  ========================= */
  // Default tab
  setActiveTab(TAB.ALL);

  // Load data
  fetchAllAccounts();
});