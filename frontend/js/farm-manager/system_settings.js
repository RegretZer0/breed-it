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
    currentTab === "active" ? s.isActive === true : s.isActive === false
  );

  const start = (currentPage - 1) * pageSize;
  const page = filtered.slice(start, start + pageSize);

  // COUNTS
  document.getElementById("activeCount").innerText =
    heatSigns.filter(s => s.isActive === true).length;

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

          <span class="badge ${s.isActive ? 'badge-active' : 'badge-disabled'}">
            ${s.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>

        <button class="toggle-btn" data-name="${s.name}">
          ${s.isActive ? 'Disable' : 'Enable'}
        </button>

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

  const nameEl = document.getElementById("signName");
  const weightEl = document.getElementById("signWeight");

  if (nameEl) nameEl.value = "";
  if (weightEl) weightEl.value = "";

  editingName = null;
}

function getTotalWeight(signs) {
  return signs
    .filter(s => s.isActive === true)
    .reduce((sum, s) => sum + (Number(s.weight) || 0), 0);
}

async function saveHeatSign() {
  const name = document.getElementById("signName").value.trim();
  const weightInput = document.getElementById("signWeight").value;
  const weight = Number(weightInput);

  if (isNaN(weight) || weight < 0) {
    alert("Invalid weight value");
    return;
  }
  const existing = heatSigns.find(s => s.name === editingName);
  const isActive = editingName ? (existing?.isActive === true) : true;
  const isCritical = false;
  let finalWeight = weight;

  if (!name) {
    alert("Sign name required");
    return;
  }

  // 🧠 CREATE TEMP COPY (DO NOT MUTATE YET)
  let tempSigns = [...heatSigns];

  if (editingName) {
    const index = tempSigns.findIndex(s => s.name === editingName);
    if (index !== -1) {
      tempSigns[index] = {
        name,
        weight: finalWeight,
        isActive
      };
    }
  } else {
    tempSigns.push({
      name,
      weight: finalWeight,
      isActive
    });
  }

  // REMOVE ANY INVALID OR STALE DATA
  tempSigns = tempSigns.map(s => ({
    name: s.name,
    isActive: s.isActive === true || s.isActive === "true",
    weight: Number(s.weight) || 0
  }));

  const totalWeight = getTotalWeight(tempSigns);

  if (totalWeight > 100) {

    // ONLY AUTO-FIX IF ADDING NEW
    if (!editingName) {

      // Find the newly added sign
      const newIndex = tempSigns.findIndex(s => s.name === name);

      if (newIndex !== -1) {
        tempSigns[newIndex].isActive = false;
      }

      // RECOMPUTE TOTAL AFTER FIX
      const correctedTotal = getTotalWeight(tempSigns);

      // Show warning but DO NOT BLOCK
      showWeightLimitModal(
        tempSigns.filter(s => s.isActive === true),
        correctedTotal
      );

    } else {
      // editing existing → still block (safer)
      showWeightLimitModal(
        tempSigns.filter(s => s.isActive === true),
        totalWeight
      );
      return;
    }
  }

  // APPLY ONLY IF VALID
  heatSigns = tempSigns;

  // SEND CORRECT FORMAT TO BACKEND
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

function showWeightLimitModal(signs, total) {
  const modalHtml = `
    <div class="custom-overlay">

      <div class="custom-modal">

        <!-- HEADER -->
        <div class="weight-modal-header">
          <i class="bi bi-exclamation-triangle-fill"></i>
          <div>
            <h4>Weight Limit Exceeded</h4>
            <p>Total weight cannot exceed <strong>100%</strong></p>
          </div>
        </div>

        <!-- LIST -->
        <div class="weight-list">
          ${signs
            .filter(s => s.isActive === true)
            .map(s => `
              <div class="weight-item">
                <span class="weight-name">${s.name}</span>
                <span class="weight-value">${s.weight}</span>
              </div>
            `).join("")}
        </div>

        <!-- TOTAL -->
        <div class="weight-total">
          <span>Total</span>
          <strong>${total}%</strong>
        </div>

        <!-- ACTION -->
        <div class="weight-actions">
          <button id="closeWeightModal" class="btn-save">
            OK
          </button>
        </div>

      </div>

    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", modalHtml);

  document.getElementById("closeWeightModal").onclick = () => {
    document.querySelector(".custom-overlay").remove();
  };
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

  // Save button
  document.getElementById("saveHeatSignBtn")
    .addEventListener("click", saveHeatSign);

  // 🔥 COMBINED EVENT DELEGATION (TOGGLE + EDIT)
  document.getElementById("heatSignsTable").addEventListener("click", async (e) => {

    // ===== TOGGLE BUTTON =====
    const toggleBtn = e.target.closest(".toggle-btn");
      if (toggleBtn) {
        const name = toggleBtn.dataset.name;
        const sign = heatSigns.find(s => s.name === name);
        if (!sign) return;

        const newState = !sign.isActive;

        // 🔥 IF ENABLING → VALIDATE FIRST
        if (newState === true) {

          // simulate enabling
          const tempSigns = heatSigns.map(s =>
            s.name === name ? { ...s, isActive: true } : s
          );

          const totalWeight = getTotalWeight(tempSigns);

          if (totalWeight > 100) {
            // ❌ BLOCK ENABLE
            showWeightLimitModal(
              tempSigns.filter(s => s.isActive === true),
              totalWeight
            );
            return;
          }
        }

        // ✅ APPLY CHANGE (safe)
        sign.isActive = newState;

        try {
          await fetch("/api/system-settings/heat-signs", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              signs: heatSigns
            })
          });

          await fetchHeatSigns();
          renderTable();

        } catch (err) {
          console.error("Toggle failed:", err);
          alert("Failed to update status");
        }

        return;
      }

    // ===== EDIT BUTTON =====
  const btn = e.target.closest(".edit-btn");
  if (!btn) return;

  const name = btn.dataset.name;
  const sign = heatSigns.find(s => s.name === name);
  if (!sign) return;

  editingName = name;

  document.getElementById("signName").value = sign.name;
  document.getElementById("signWeight").value = sign.weight;

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
      currentTab === "active" ? s.isActive === true : s.isActive === false
    );

    const pages = Math.ceil(filtered.length / pageSize);

    if (currentPage < pages) {
      currentPage++;
      renderTable();
    }
  };
}

//Displays Total Weight and highlights if over 100%
function updateLiveTotal() {
  const total = getTotalWeight(heatSigns);

  const el = document.getElementById("totalWeightValue");
  const wrapper = document.getElementById("weightTotalDisplay");

  if (!el || !wrapper) return;

  el.innerText = `${total}%`;

  // Visual feedback
  wrapper.classList.remove("safe", "warn");

  if (total > 100) {
    wrapper.classList.add("warn");
  } else {
    wrapper.classList.add("safe");
  }
}

/* ================= INIT ================= */
async function init() {
  await fetchHeatSigns();
  renderTable();
  updateLiveTotal();
  bindEvents();
}

document.addEventListener("DOMContentLoaded", init);