import { authGuard } from "/js/authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  // ================= AUTH =================
  const user = await authGuard(["farm_manager", "encoder"]);
  if (!user) return;

  const token = localStorage.getItem("token");
  const role = user.role;
  const BACKEND_URL = "http://localhost:5000";

  // ================= STATE =================
  let managerId = null;
  let farmers = [];
  let selectedFarmerId = null;
  let allSwine = [];

  // ================= RESOLVE MANAGER =================
  try {
    if (role === "farm_manager") {
      managerId = user.id;
    } else {
      if (user.managerId) {
        managerId = user.managerId;
      } else {
        const res = await fetch(
          `${BACKEND_URL}/api/auth/encoders/single/${user.id}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();
        managerId = data.encoder?.managerId;
      }
    }
  } catch (err) {
    console.error("Failed to resolve managerId", err);
    return;
  }

  // ================= DOM =================
  const swineTableBody = document.getElementById("swineTableBody");

  const filterBatch = document.getElementById("filterBatch");
  const filterFarmer = document.getElementById("filterFarmer");

  const filtersForm = document.getElementById("filtersForm");
  const filterStatus = document.getElementById("filterStatus");
  const filterSex = document.getElementById("filterSex");
  const filterType = document.getElementById("filterType");
  const filterTag = document.getElementById("filterTag");

  const swineModal = document.getElementById("swineModal");

  // ================= HELPERS =================
  const formatStageDisplay = (stage) => {
    const map = {
      "Monitoring (Day 1-30)": "Piglet",
      "Weaned (Monitoring 3 Months)": "Weaner",
      "Final Selection": "Selection",
      adult: "Adult",
      piglet: "Piglet",
    };
    return map[stage] || stage || "—";
  };

  const getLatestPerf = (sw) => {
    const p = sw.performance_records?.slice(-1)[0];
    return {
      weight: p?.weight || "--",
      length: p?.body_length || "--",
    };
  };

  // ================= FARMERS =================
  async function loadFarmers() {
    const res = await fetch(`${BACKEND_URL}/api/auth/farmers/${managerId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    farmers = data.farmers || [];
    renderFarmerDropdown(farmers);


    if (filterFarmer) {
      filterFarmer.innerHTML = `<option value="">All Farmers / Owners</option>`;
      farmers.forEach((f) => {
        filterFarmer.add(
          new Option(`${f.first_name} ${f.last_name}`, f._id)
        );
      });
    }
  }

  // ================= FARMER DROPDOWN (FIXED) =================
  function renderFarmerDropdown(list) {
    const wrap = document.getElementById("farmerOptions");
    if (!wrap) return;

    wrap.innerHTML = "";

    if (!list.length) {
      wrap.innerHTML = `<div class="text-muted small">No farmers found</div>`;
      return;
    }

    list.forEach(f => {
      const div = document.createElement("div");
      div.className = "dropdown-item small";
      div.textContent = `${f.first_name} ${f.last_name}`.trim();

      div.addEventListener("click", () => {
        selectedFarmerId = f._id;
        document.getElementById("farmerDropdownBtn").textContent =
          `${f.first_name} ${f.last_name}`.trim();
      });

      wrap.appendChild(div);
    });
  }

  // Search inside dropdown
  document.getElementById("farmerSearch")?.addEventListener("input", (e) => {
    const term = e.target.value.toLowerCase();
    renderFarmerDropdown(
      farmers.filter(f =>
        `${f.first_name} ${f.last_name}`.toLowerCase().includes(term)
      )
    );
  });


// ================= FILTER PREVIEW TABLE =================
function renderFilterPreview(list) {
  const wrap = document.getElementById("filterResultWrap");
  const body = document.getElementById("filterResultBody");

  if (!wrap || !body) return;

  body.innerHTML = "";

  if (!list.length) {
    body.innerHTML = `
      <tr>
        <td colspan="5" class="text-center text-muted">
          No matching records
        </td>
      </tr>`;
    wrap.classList.remove("d-none");
    return;
  }

  list.slice(0, 5).forEach(sw => {
    const farmerName = sw.farmer_id
      ? `${sw.farmer_id.first_name || ""} ${sw.farmer_id.last_name || ""}`.trim()
      : "OFFICE / MASTER";

    body.insertAdjacentHTML("beforeend", `
      <tr>
        <td>${sw.swine_id}</td>
        <td>${farmerName}</td>
        <td>${sw.current_status || sw.status || "—"}</td>
        <td>${sw.batch || "—"}</td>
        <td>
          <div class="d-flex gap-1 mt-1">
            <button
              class="btn btn-sm btn-outline-primary view-btn"
              data-id="${sw.swine_id}">
              View
            </button>

            <button
              class="btn btn-sm btn-outline-secondary edit-btn"
              data-id="${sw.swine_id}">
              Edit
            </button>
          </div>
        </td>
      </tr>
    `);
  });

  wrap.classList.remove("d-none");

  // Attach click handlers
  body.querySelectorAll(".view-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const pig = allSwine.find(p => p.swine_id === btn.dataset.id);
      if (pig) {
        // reuse your existing modal logic
        document.querySelector(`.view-btn[data-id="${pig.swine_id}"]`)?.click();
      }
    });
  });
}


  // ================= TABLE RENDER =================
  function renderTable(list) {
    swineTableBody.innerHTML = "";

    if (!list.length) {
      swineTableBody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center text-muted">
            No swine records found
          </td>
        </tr>`;
      return;
    }

    list.forEach((sw) => {
      const farmerName = sw.farmer_id
        ? `${sw.farmer_id.first_name || ""} ${sw.farmer_id.last_name || ""}`.trim()
        : "OFFICE / MASTER";

      const perf = getLatestPerf(sw);
      const offspringCount = allSwine.filter(
        (c) => c.dam_id === sw.swine_id || c.sire_id === sw.swine_id
      ).length;

      swineTableBody.insertAdjacentHTML(
        "beforeend",
        `
        <tr>
          <td>
            <strong>${sw.swine_id}</strong><br>
            <small>Batch: ${sw.batch || "—"}</small><br>
            <div class="d-flex gap-1 mt-1">
              <button
                class="btn btn-sm btn-outline-primary view-btn"
                data-id="${sw._id}">

                View
              </button>

              <button
                class="btn btn-sm btn-outline-secondary edit-btn"
                data-id="${sw._id}">
                Edit
              </button>
            </div>
          </td>
          <td>${farmerName}</td>
          <td>
            Breed: ${sw.breed || "—"}<br>
            Age: ${formatStageDisplay(sw.age_stage)}
          </td>
          <td>
            Status: ${sw.current_status || "—"}<br>
            Health: ${sw.health_status || "—"}
          </td>
          <td>S: ${sw.sire_id || "N/A"}<br>D: ${sw.dam_id || "N/A"}</td>
          <td>Piglets: ${offspringCount}</td>
          <td>Wt: ${perf.weight} kg<br>L: ${perf.length} cm</td>
        </tr>
      `
      );
    });
  }

  // ================= LOAD SWINE =================
  async function loadSwine() {
    swineTableBody.innerHTML = `
      <tr><td colspan="7" class="text-center text-muted">
        Loading swine records...
      </td></tr>`;

    const res = await fetch(`${BACKEND_URL}/api/swine/all`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json();
    allSwine = data.swine || [];
    renderTable(allSwine);
  }


  // ================= VIEW MODAL =================
  swineTableBody.addEventListener("click", (e) => {
    const btn = e.target.closest(".view-btn");
    if (!btn) return;

    const sw = allSwine.find((s) => s.swine_id === btn.dataset.id);
    if (!sw) return;

    document.getElementById(
      "modalSwineId"
    ).textContent = `Swine History: ${sw.swine_id}`;

    // REPRO SUMMARY
    const repro = document.getElementById("reproSummarySection");
    if (sw.sex === "Female" && sw.age_stage === "adult") {
      repro.style.display = "block";
      const cycles = sw.breeding_cycles || [];
      const totalBorn = cycles.reduce(
        (a, c) => a + (c.farrowing_results?.total_born || 0),
        0
      );
      document.getElementById("statCycles").textContent = cycles.length;
      document.getElementById("statTotalBorn").textContent = totalBorn;
      document.getElementById("statAvgLitter").textContent =
        cycles.length ? (totalBorn / cycles.length).toFixed(1) : 0;
      document.getElementById("statTotalLive").textContent = cycles.reduce(
        (a, c) => a + (c.farrowing_results?.live_born || 0),
        0
      );
    } else {
      repro.style.display = "none";
    }

    // BREEDING HISTORY
    const repoBody = document.getElementById("reproductiveHistoryBody");
    repoBody.innerHTML = "";
    (sw.breeding_cycles || []).forEach((c) => {
      repoBody.insertAdjacentHTML(
        "beforeend",
        `
        <tr>
          <td>${c.cycle_number}</td>
          <td>${c.ai_service_date ? new Date(c.ai_service_date).toLocaleDateString() : "--"}</td>
          <td>${c.actual_farrowing_date ? new Date(c.actual_farrowing_date).toLocaleDateString() : "--"}</td>
          <td>${c.farrowing_results?.total_born || 0}</td>
          <td>${c.farrowing_results?.live_born || 0} / ${c.farrowing_results?.stillborn || 0}</td>
          <td>${c.status || "—"}</td>
        </tr>`
      );
    });

    // PERFORMANCE
    const perfBody = document.getElementById("performanceTimelineBody");
    perfBody.innerHTML = "";
    (sw.performance_records || []).forEach((p) => {
      perfBody.insertAdjacentHTML(
        "beforeend",
        `
        <tr>
          <td>${new Date(p.record_date).toLocaleDateString()}</td>
          <td>${p.weight} kg</td>
          <td>${p.body_length} x ${p.heart_girth}</td>
          <td>${formatStageDisplay(p.stage)}</td>
          <td>${p.remarks || "—"}</td>
        </tr>`
      );
    });

    new bootstrap.Modal(swineModal).show();
  });

  // ================= EDIT PERFORMANCE MODAL =================
const editModalEl = document.getElementById("editPerformanceModal");
const editModal = new bootstrap.Modal(editModalEl);

const editSwineIdInput = document.getElementById("editSwineId");
const editWeightInput = document.getElementById("editWeight");
const editBodyLengthInput = document.getElementById("editBodyLength");
const editHeartGirthInput = document.getElementById("editHeartGirth");

// OPEN EDIT MODAL
swineTableBody.addEventListener("click", (e) => {
  const btn = e.target.closest(".edit-btn");
  if (!btn) return;

const sw = allSwine.find(s => s._id === btn.dataset.id);
  if (!sw) return;

  const latest = sw.performance_records?.slice(-1)[0] || {};

  editSwineIdInput.value = sw.swine_id;
  editWeightInput.value = latest.weight || "";
  editBodyLengthInput.value = latest.body_length || "";
  editHeartGirthInput.value = latest.heart_girth || "";

  editModal.show();
});

// SAVE PERFORMANCE UPDATE
document.getElementById("savePerformanceBtn").addEventListener("click", async () => {
  const swineId = editSwineIdInput.value; // now holds Mongo _id

  const payload = {
    weight: editWeightInput.value,
    bodyLength: editBodyLengthInput.value,
    heartGirth: editHeartGirthInput.value
  };

  try {
    const res = await fetch(
      `${BACKEND_URL}/api/swine/performance/add/${swineId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      }
    );

    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    // Refresh table + modal data
    await loadSwine();

    editModal.hide();

  } catch (err) {
    alert(err.message || "Failed to update performance");
  }
});


  // ================= FILTER SUBMIT (PREVIEW ONLY) =================
  filtersForm.addEventListener("submit", (e) => {
    e.preventDefault();

    let filtered = [...allSwine];

    const status = filterStatus.value;
    const sex = filterSex.value;
    const type = filterType.value;
    const tag = filterTag.value.trim().toLowerCase();

    // FARMER FILTER
    if (selectedFarmerId) {
      filtered = filtered.filter(sw => {
        if (!sw.farmer_id) return false;

        const fid =
          typeof sw.farmer_id === "object"
            ? sw.farmer_id._id
            : sw.farmer_id;

        return fid === selectedFarmerId;
      });
    }

    // STATUS
    if (status) {
      filtered = filtered.filter(sw =>
        (sw.current_status || sw.status) === status
      );
    }

    // SEX
    if (sex) {
      filtered = filtered.filter(sw => sw.sex === sex);
    }

    // TYPE
    if (type) {
      filtered = filtered.filter(sw => {
        switch (type) {
          case "piglet":
            return sw.age_stage === "piglet";
          case "sow":
            return sw.sex === "Female" && sw.age_stage === "adult";
          case "boar":
            return sw.sex === "Male" &&
                  sw.age_stage === "adult" &&
                  !sw.is_external_boar;
          case "master":
            return sw.is_external_boar === true;
          default:
            return true;
        }
      });
    }

    // TAG
    if (tag) {
      filtered = filtered.filter(sw =>
        sw.swine_id?.toLowerCase().includes(tag)
      );
    }

    // ✅ ONLY show results in FILTERED RESULT TABLE
    renderFilterPreview(filtered);

    // ❌ DO NOT touch the main inventory table
  });

  document.getElementById("filterResultBody")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".edit-btn");
  if (!btn) return;

  const sw = allSwine.find(s => s.swine_id === btn.dataset.id);
  if (!sw) return;

  const latest = sw.performance_records?.slice(-1)[0] || {};

  editSwineIdInput.value = sw.swine_id;
  editWeightInput.value = latest.weight || "";
  editBodyLengthInput.value = latest.body_length || "";
  editHeartGirthInput.value = latest.heart_girth || "";

  editModal.show();
});


  // ================= RESET =================
  document.getElementById("resetFilters").addEventListener("click", () => {
    selectedFarmerId = null;

    filtersForm.reset();
    document.getElementById("farmerDropdownBtn").textContent = "Select Farmer";
    document.getElementById("filterResultWrap")?.classList.add("d-none");

    // Inventory ALWAYS shows full data
    renderTable(allSwine);
  });

    
  // ================= INIT =================
  await loadFarmers();
  await loadSwine();
});
