/* =========================================================
   SYSTEM SETTINGS - HEAT SIGNS
========================================================= */

/* ---------------- STATE ---------------- */
let heatSigns = [];
let currentPage = 1;
const pageSize = 6;
let editingName = null;

/* ---------------- FETCH DATA ---------------- */
async function fetchHeatSigns() {
  const res = await fetch("/api/system-settings/heat-signs");
  const data = await res.json();
  heatSigns = data.data || [];
}

/* ---------------- RENDER TABLE ---------------- */
function renderTable() {
  const table = document.getElementById("heatSignsTable");

  const start = (currentPage - 1) * pageSize;
  const pageData = heatSigns.slice(start, start + pageSize);

  table.innerHTML = pageData.map(sign => `
    <tr>
        <td data-label="Sign">${sign.name}</td>
        <td data-label="Weight">${sign.weight}</td>
        <td data-label="Category">
        <span class="badge ${sign.isCritical ? 'critical' : 'normal'}">
            ${sign.isCritical ? 'Critical' : 'Normal'}
        </span>
        </td>
        <td data-label="Status">
        <span class="badge ${sign.isActive ? 'active' : 'disabled'}">
            ${sign.isActive ? 'Active' : 'Disabled'}
        </span>
        </td>
        <td data-label="Action" class="text-end">
        <button class="btn btn-sm btn-light edit-btn"
            data-name="${sign.name}"
            data-weight="${sign.weight}"
            data-critical="${sign.isCritical}"
            data-active="${sign.isActive}">
            <i class="bi bi-pencil"></i>
        </button>
        </td>
    </tr>
    `).join("");

  renderPagination();
}

/* ---------------- PAGINATION ---------------- */
function renderPagination() {
  const totalPages = Math.ceil(heatSigns.length / pageSize);

  document.getElementById("pageInfo").innerText =
    `Page ${currentPage} of ${totalPages}`;

  document.getElementById("prevPageBtn").disabled = currentPage === 1;
  document.getElementById("nextPageBtn").disabled = currentPage === totalPages;
}

/* ---------------- MODAL CONTROL ---------------- */
function openModal(isEdit = false, data = null) {
  const modal = document.getElementById("heatSignModal");

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

  modal.classList.add("active");
}

function closeModal() {
  document.getElementById("heatSignModal").classList.remove("active");
}

/* ---------------- SAVE (UI ONLY FOR NOW) ---------------- */
function saveHeatSign() {
  const name = document.getElementById("signName").value;
  const weight = parseInt(document.getElementById("signWeight").value);
  const isCritical = document.getElementById("signType").value === "critical";
  const isActive = document.getElementById("signActive").checked;

  if (!name) return alert("Sign name required");

  if (editingName) {
    const index = heatSigns.findIndex(s => s.name === editingName);
    heatSigns[index] = { name, weight, isCritical, isActive };
  } else {
    heatSigns.push({ name, weight, isCritical, isActive });
  }

  closeModal();
  renderTable();
}

/* ---------------- EVENT BINDINGS ---------------- */
function bindEvents() {

  document.getElementById("addHeatSignBtn")
    .addEventListener("click", () => openModal());

  document.getElementById("closeModalBtn")
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
    if (!e.target.classList.contains("edit-btn")) return;

    openModal(true, {
      name: e.target.dataset.name,
      weight: e.target.dataset.weight,
      isCritical: e.target.dataset.critical === "true",
      isActive: e.target.dataset.active === "true"
    });
  });
}

/* ---------------- INIT ---------------- */
async function initSystemSettings() {
  await fetchHeatSigns();
  renderTable();
  bindEvents();
}

document.addEventListener("DOMContentLoaded", initSystemSettings);