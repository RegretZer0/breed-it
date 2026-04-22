let heatSigns = [];
let currentPage = 1;
const pageSize = 5;
let currentTab = "active";
let editingName = null; // track edit mode

/* ================= FETCH ================= */
async function fetchHeatSigns() {
  const res = await fetch("/api/system-settings/heat-signs");
  const data = await res.json();
  heatSigns = data.data || [];
}

/* ================= RENDER ================= */
function renderTable() {
  const el = document.getElementById("heatSignsTable");

  const filtered = heatSigns.filter(s =>
    currentTab === "active" ? s.isActive !== false : s.isActive === false
  );

  const start = (currentPage - 1) * pageSize;
  const page = filtered.slice(start, start + pageSize);

  // COUNTS
  document.getElementById("activeCount").innerText =
    heatSigns.filter(s => s.isActive !== false).length;

  document.getElementById("inactiveCount").innerText =
    heatSigns.filter(s => s.isActive === false).length;

  // EMPTY STATE
  if (!page.length) {
    el.innerHTML = `
      <div class="empty-state">
        ${
          currentTab === "inactive"
            ? "No disabled heat signs"
            : "No active heat signs"
        }
      </div>
    `;
    renderPagination(filtered.length);
    return;
  }

  el.innerHTML = page.map(s => `
    <div class="heat-item">

      <div class="heat-left">
        <div class="heat-name">${s.name}</div>
        <div class="heat-sub">
          Weight: <strong>${s.weight}</strong>
        </div>
      </div>

      <div class="heat-right">

        <div class="heat-badges">
          <span class="badge ${s.isCritical ? 'badge-critical' : 'badge-normal'}">
            ${s.isCritical ? 'Critical' : 'Normal'}
          </span>

          <span class="badge ${s.isActive ? 'badge-active' : 'badge-disabled'}">
            ${s.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>

        <button class="edit-btn" data-name="${s.name}">
          <i class="bi bi-pencil"></i>
        </button>

      </div>

    </div>
  `).join("");

  renderPagination(filtered.length);
}

/* ================= PAGINATION ================= */
function renderPagination(total) {
  const pages = Math.ceil(total / pageSize) || 1;

  document.getElementById("pageInfo").innerText =
    `Page ${currentPage} of ${pages}`;

  const prevBtn = document.getElementById("prevPageBtn");
  const nextBtn = document.getElementById("nextPageBtn");

  // Disable buttons properly
  prevBtn.disabled = currentPage === 1;
  nextBtn.disabled = currentPage === pages;

  prevBtn.style.opacity = currentPage === 1 ? "0.4" : "1";
  nextBtn.style.opacity = currentPage === pages ? "0.4" : "1";
}

/* ================= MODAL ================= */
function openModal() {
  const modal = document.getElementById("heatSignModal");
  modal.classList.add("show");
  modal.style.display = "block";
}

function closeModal() {
  const modal = document.getElementById("heatSignModal");
  modal.classList.remove("show");
  modal.style.display = "none";

  // reset form
  document.getElementById("signName").value = "";
  document.getElementById("signWeight").value = "";
  document.getElementById("signType").value = "normal";
  document.getElementById("signActive").checked = true;

  editingName = null;
}

async function saveHeatSign() {
  const name = document.getElementById("signName").value.trim();
  const weight = parseInt(document.getElementById("signWeight").value);
  const isCritical = document.getElementById("signType").value === "critical";
  const isActive = document.getElementById("signActive").checked;

  if (!name) {
    alert("Sign name required");
    return;
  }

  // ✅ UPDATE LOCAL STATE (IMPORTANT)
  if (editingName) {
    const index = heatSigns.findIndex(s => s.name === editingName);
    if (index !== -1) {
      heatSigns[index] = { name, weight, isCritical, isActive };
    }
  } else {
    heatSigns.push({ name, weight, isCritical, isActive });
  }

  // ✅ SEND CORRECT FORMAT TO BACKEND
  try {
    await fetch("/api/system-settings/heat-signs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        signs: heatSigns   // 🔥 CRITICAL FIX
      })
    });

    // reload fresh data
    await fetchHeatSigns();

  } catch (err) {
    console.error("Save failed:", err);
    alert("Failed to save changes");
    return;
  }

  closeModal();
  renderTable();
}

/* ================= EVENTS ================= */
function bindEvents() {
  // Tabs
  document.getElementById("tabActive").onclick = () => {
    currentTab = "active";
    currentPage = 1;
    renderTable();
  };

  document.getElementById("tabInactive").onclick = () => {
    currentTab = "inactive";
    currentPage = 1;
    renderTable();
  };

  // Add button
  document.getElementById("addHeatSignBtn").onclick = () => {
    editingName = null;
    openModal();
  };

  // Close modal
  document.getElementById("closeModalBtn").onclick = closeModal;
  document.getElementById("closeModalX").onclick = closeModal;

  //Save button
  document.getElementById("saveHeatSignBtn")
  .addEventListener("click", saveHeatSign);

  // 🔥 EDIT BUTTON (EVENT DELEGATION — IMPORTANT)
  document.getElementById("heatSignsTable").addEventListener("click", (e) => {
    const btn = e.target.closest(".edit-btn");
    if (!btn) return;

    const name = btn.dataset.name;
    const sign = heatSigns.find(s => s.name === name);
    if (!sign) return;

    editingName = name;

    document.getElementById("signName").value = sign.name;
    document.getElementById("signWeight").value = sign.weight;
    document.getElementById("signType").value = sign.isCritical ? "critical" : "normal";
    document.getElementById("signActive").checked = sign.isActive !== false;

    openModal();
  });

  // PREV BUTTON
  document.getElementById("prevPageBtn").onclick = () => {
    if (currentPage > 1) {
      currentPage--;
      renderTable();
    }
  };

  // NEXT BUTTON
  document.getElementById("nextPageBtn").onclick = () => {
    const filtered = heatSigns.filter(s =>
      currentTab === "active" ? s.isActive !== false : s.isActive === false
    );

    const pages = Math.ceil(filtered.length / pageSize);

    if (currentPage < pages) {
      currentPage++;
      renderTable();
    }
  };
}

/* ================= INIT ================= */
async function init() {
  await fetchHeatSigns();
  renderTable();
  bindEvents();
}

document.addEventListener("DOMContentLoaded", init);