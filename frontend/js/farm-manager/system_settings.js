/* =========================================================
   SYSTEM SETTINGS - HEAT SIGNS
========================================================= */

/* ---------------- STATE ---------------- */
let heatSigns = [];
let currentPage = 1;
const pageSize = 6;
let editingName = null;
let currentTab = "active";

/* ---------------- FETCH DATA ---------------- */
async function fetchHeatSigns() {
  const res = await fetch("/api/system-settings/heat-signs");
  const data = await res.json();
  heatSigns = data.data || [];
}

/* ---------------- RENDERING ---------------- */
function renderTable() {
  const container = document.getElementById("heatSignsTable");
  if (!container) return;

  // ---------------- UPDATE TAB COUNTS ----------------
  const activeCount = heatSigns.filter(s => s.isActive !== false).length;
  const inactiveCount = heatSigns.filter(s => s.isActive === false).length;

  document.getElementById("activeCount").innerText = activeCount;
  document.getElementById("inactiveCount").innerText = inactiveCount;



  // ---------------- FILTER BASED ON TAB ----------------
  const filtered = heatSigns.filter(sign => {
    if (currentTab === "active") return sign.isActive !== false;
    if (currentTab === "inactive") return sign.isActive === false;
    return true;
  });

  // ---------------- PAGINATION ----------------
  const start = (currentPage - 1) * pageSize;
  const pageData = filtered.slice(start, start + pageSize);

  // ---------------- EMPTY STATE ----------------
  if (!pageData.length) {
  container.innerHTML = `
    <div class="col-12 h-100 d-flex">
      <div class="empty-state text-center w-100">
          ${
            currentTab === "inactive"
              ? "No disabled heat signs. All signs are active."
              : "No active heat signs available."
          }
        </div>
      </div>
    `;
    renderPagination(filtered.length);
    return;
  }

  // ---------------- RENDER ----------------
  container.innerHTML = pageData.map(sign => `
    <div class="col-12">

      <div class="card heat-card shadow-sm border-0">

        <div class="card-body heat-row">

          <!-- TITLE -->
          <div class="heat-title">
            ${sign.name}
          </div>

          <!-- WEIGHT -->
          <div class="heat-weight-inline">
            Weight: <strong>${sign.weight}</strong>
          </div>

          <!-- CATEGORY -->
          <div>
            <span class="badge ${sign.isCritical ? 'badge-critical' : 'badge-normal'}">
              <i class="bi ${sign.isCritical ? 'bi-exclamation-triangle' : 'bi-check-circle'}"></i>
              ${sign.isCritical ? 'Critical' : 'Normal'}
            </span>
          </div>

          <!-- STATUS -->
          <div>
            <span class="badge ${sign.isActive ? 'badge-active' : 'badge-disabled'}">
              <i class="bi ${sign.isActive ? 'bi-toggle-on' : 'bi-toggle-off'}"></i>
              ${sign.isActive ? 'Active' : 'Disabled'}
            </span>
          </div>

          <!-- ACTION -->
          <button 
            class="btn btn-sm btn-light edit-btn ms-auto d-flex align-items-center gap-1"
            data-name="${sign.name}"
            data-weight="${sign.weight}"
            data-critical="${sign.isCritical}"
            data-active="${sign.isActive}">
            <i class="bi bi-pencil"></i>
            <span>Edit</span>
          </button>

        </div>

      </div>

    </div>
  `).join("");


  // ---------------- PAGINATION ----------------
  renderPagination(filtered.length);
  }

/* ---------------- PAGINATION ---------------- */
function renderPagination(totalItems) {
  const totalPages = Math.ceil(totalItems / pageSize) || 1;

  document.getElementById("pageInfo").innerText =
    `Page ${currentPage} of ${totalPages}`;

  document.getElementById("prevPageBtn").disabled = currentPage === 1;
  document.getElementById("nextPageBtn").disabled = currentPage === totalPages;
}
/* ---------------- TAB UI HELPER ---------------- */
function setActiveTab(id) {
  document.querySelectorAll(".heat-tab").forEach(btn => {
    btn.classList.remove("active");
  });
  document.getElementById(id)?.classList.add("active");
}

/* ---------------- MODAL CONTROL ---------------- */
let bsModal;

function openModal(isEdit = false, data = null) {
  const modalEl = document.getElementById("heatSignModal");
  bsModal = new bootstrap.Modal(modalEl);

  if (isEdit && data) {
    editingName = data.name;
    document.getElementById("modalTitle").innerText = "Edit Heat Sign";

    document.getElementById("signName").value = data.name;
    document.getElementById("signWeight").value = data.weight;
    document.getElementById("signType").value =
      data.isCritical ? "critical" : "normal";
    document.getElementById("signActive").checked = data.isActive;
  } else {
    editingName = null;
    document.getElementById("modalTitle").innerText = "Add Heat Sign";

    document.getElementById("signName").value = "";
    document.getElementById("signWeight").value = "";
    document.getElementById("signType").value = "normal";
    document.getElementById("signActive").checked = true;
  }

  bsModal.show();
}

function closeModal() {
  if (bsModal) bsModal.hide();
}

/* ---------------- SAVE (CONNECTED TO BACKEND) ---------------- */
async function saveHeatSign() {
  const name = document.getElementById("signName").value.trim();
  const weight = parseInt(document.getElementById("signWeight").value);
  const isCritical = document.getElementById("signType").value === "critical";
  const isActive = document.getElementById("signActive").checked;

  if (!name) return alert("Sign name required");

  // ---------------- UPDATE LOCAL STATE ----------------
  if (editingName) {
    const index = heatSigns.findIndex(s => s.name === editingName);
    if (index !== -1) {
      heatSigns[index] = { name, weight, isCritical, isActive };
    }
  } else {
    heatSigns.push({ name, weight, isCritical, isActive });
  }

  // ---------------- SAVE TO BACKEND ----------------
  try {
    await fetch("/api/system-settings/heat-signs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ signs: heatSigns })
    });

    // IMPORTANT: reload from DB so UI is always correct
    await fetchHeatSigns();

  } catch (err) {
    console.error("Save failed:", err);
    alert("Failed to save changes");
    return;
  }

  closeModal();
  renderTable();
}

/* ---------------- EVENT BINDINGS ---------------- */
function bindEvents() {

  document.getElementById("addHeatSignBtn")
    .addEventListener("click", () => openModal());

  // ---------------- TAB SWITCHING ----------------
  document.getElementById("tabActive")?.addEventListener("click", () => {
    currentTab = "active";
    currentPage = 1;
    setActiveTab("tabActive");
    renderTable();
  });

  document.getElementById("tabInactive")?.addEventListener("click", () => {
    currentTab = "inactive";
    currentPage = 1;
    setActiveTab("tabInactive");
    renderTable();
  });

  document.getElementById("closeModalX")
    .addEventListener("click", closeModal);

  document.getElementById("saveHeatSignBtn")
    .addEventListener("click", saveHeatSign);

  document.getElementById("prevPageBtn")
    .addEventListener("click", () => {
      currentPage--;
      renderTable();
    });

  document.getElementById("nextPageBtn")
    .addEventListener("click", () => {
      currentPage++;
      renderTable();
    });

  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".edit-btn");
    if (!btn) return;

    openModal(true, {
      name: btn.dataset.name,
      weight: btn.dataset.weight,
      isCritical: btn.dataset.critical === "true",
      isActive: btn.dataset.active === "true"
    });
  });
}

/* ---------------- INIT ---------------- */
async function initSystemSettings() {
  await fetchHeatSigns();

  // set default tab UI
  setActiveTab("tabActive");

  renderTable();
  bindEvents();
}

document.addEventListener("DOMContentLoaded", initSystemSettings);