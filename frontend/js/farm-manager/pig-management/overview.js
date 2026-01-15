import { authGuard } from "/js/authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  // ================= AUTH =================
  const user = await authGuard(["farm_manager", "encoder"]);
  if (!user) return;

  const token = localStorage.getItem("token");
  const role = user.role;

  // ================= STATE =================
  let managerId = null;
  let farmers = [];
  let selectedFarmerId = null;
  let allSwine = [];
  let currentPig = null;
  let originalPig = null;


  // ================= RESOLVE MANAGER =================
  try {
    if (role === "farm_manager") {
      managerId = user.id;
    } else if (role === "encoder") {
      if (user.managerId) {
        managerId = user.managerId;
      } else {
        const res = await fetch(
          `http://localhost:5000/api/auth/encoders/single/${user.id}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            credentials: "include",
          }
        );

        const data = await res.json();
        if (!res.ok || !data.success) throw new Error();
        managerId = data.encoder.managerId;
      }
    }
  } catch (err) {
    console.error("Failed to resolve managerId", err);
    return;
  }

  if (!managerId) return;

  // ================= DOM =================
  const swineTableBody = document.getElementById("swineTableBody");
  const filtersForm = document.getElementById("filtersForm");

  const filterStatus = document.getElementById("filterStatus");
  const filterSex = document.getElementById("filterSex");
  const filterTag = document.getElementById("filterTag");

  // ================= HELPERS =================
  function calculateAge(birthDate) {
    if (!birthDate) return "—";

    const birth = new Date(birthDate);
    const today = new Date();

    let years = today.getFullYear() - birth.getFullYear();
    let months = today.getMonth() - birth.getMonth();
    let days = today.getDate() - birth.getDate();

    if (days < 0) { months--; days += 30; }
    if (months < 0) { years--; months += 12; }

    return `${years}Y ${months}M ${days}D`;
  }

  // ================= FARMER DROPDOWN =================
  function renderFarmerDropdown(list) {
    const wrap = document.getElementById("farmerOptions");
    wrap.innerHTML = "";

    if (!list.length) {
      wrap.innerHTML = `<div class="text-muted small">No farmers found</div>`;
      return;
    }

    list.forEach(f => {
      const div = document.createElement("div");
      div.className = "dropdown-item small";
      div.textContent = `${f.first_name} ${f.last_name}`.trim();
      div.onclick = () => {
        selectedFarmerId = f._id;
        document.getElementById("farmerDropdownBtn").textContent =
          `${f.first_name} ${f.last_name}`.trim();
      };
      wrap.appendChild(div);
    });
  }

  document.getElementById("farmerSearch").addEventListener("input", (e) => {
    const term = e.target.value.toLowerCase();
    renderFarmerDropdown(
      farmers.filter(f =>
        `${f.first_name} ${f.last_name}`.toLowerCase().includes(term)
      )
    );
  });

  // ================= TABLE RENDER =================
  function renderTable(list) {
    swineTableBody.innerHTML = "";

    if (!list.length) {
      swineTableBody.innerHTML = `
        <tr>
          <td colspan="10" class="text-center text-muted">
            No swine records found
          </td>
        </tr>`;
      return;
    }

    list.forEach(sw => {
      const birthYear = sw.birth_date
        ? new Date(sw.birth_date).getFullYear()
        : "—";

      swineTableBody.innerHTML += `
        <tr>
          <td>${birthYear}</td>
          <td>${sw.swine_id || "—"}</td>
          <td>${sw.sex || "—"}</td>
          <td>${sw.color || "—"}</td>
          <td>${sw.breed || "—"}</td>
          <td>${sw.birth_date ? new Date(sw.birth_date).toLocaleDateString() : "—"}</td>
          <td>${calculateAge(sw.birth_date)}</td>
          <td>${sw.current_status || sw.status || "—"}</td>
          <td>${sw.batch || "—"}</td>
          <td>
            <button
              class="btn btn-outline-primary btn-sm view-btn"
              data-id="${sw._id}">
              View
            </button>
          </td>
        </tr>
      `;
    });
  }

  // ================= FILTER PREVIEW =================
  function renderFilterPreview(list) {
    const wrap = document.getElementById("filterResultWrap");
    const body = document.getElementById("filterResultBody");

    body.innerHTML = "";

    if (!list.length) {
      body.innerHTML = `
        <tr>
          <td colspan="4" class="text-center text-muted">
            No matching records
          </td>
        </tr>`;
      wrap.classList.remove("d-none");
      return;
    }

    list.slice(0, 5).forEach(sw => {
      body.innerHTML += `
        <tr>
          <td>${sw.swine_id}</td>
          <td>${sw.farmer_id?.first_name || "—"}</td>
          <td>${sw.current_status || sw.status}</td>
          <td>${sw.batch || "—"}</td>
        </tr>
      `;
    });

    wrap.classList.remove("d-none");
  }

  // ================= LOAD FARMERS =================
  async function loadFarmers() {
    const res = await fetch(
      `http://localhost:5000/api/auth/farmers/${managerId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      }
    );

    const data = await res.json();
    if (!res.ok || !data.success) return [];

    farmers = data.farmers;
    renderFarmerDropdown(farmers);

    return farmers.map(f => f._id.toString());
  }

  // ================= LOAD SWINE =================
  async function loadSwine(farmerIds) {
    try {
      swineTableBody.innerHTML = `
        <tr>
          <td colspan="10" class="text-center text-muted">
            Loading swine records...
          </td>
        </tr>`;

      const res = await fetch("http://localhost:5000/api/swine/all", {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error();

      allSwine = data.swine.filter(sw => {
        const fid =
          typeof sw.farmer_id === "object"
            ? sw.farmer_id._id
            : sw.farmer_id;
        return farmerIds.includes(fid?.toString());
      });

      renderTable(allSwine);

      document.querySelectorAll(".view-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          const pig = allSwine.find(p => p._id === btn.dataset.id);
          if (pig) openPigModal(pig);
        });
      });

      window.openPigModal = function (pig) {
      currentPig = pig;
      originalPig = JSON.parse(JSON.stringify(pig));

      pigTag.value = pig.swine_id;
      pigSex.value = pig.sex || "";
      pigColor.value = pig.color || "";
      pigBreed.value = pig.breed || "";
      pigBirthDate.value = pig.birth_date ? pig.birth_date.split("T")[0] : "";
      pigStatus.value = pig.current_status || pig.status || "";
      pigBatch.value = pig.batch || "";

      setEditMode(false);
      new bootstrap.Modal(pigModal).show();
    };

    function setEditMode(editing) {
      ["pigSex","pigColor","pigBreed","pigBirthDate","pigStatus","pigBatch"]
        .forEach(id => document.getElementById(id).disabled = !editing);

      editPigBtn.classList.toggle("d-none", editing);
      savePigBtn.classList.toggle("d-none", !editing);
      cancelEditBtn.classList.toggle("d-none", !editing);
    }

    editPigBtn.onclick = () => setEditMode(true);

    cancelEditBtn.onclick = () => {
      openPigModal(originalPig);
    };

    savePigBtn.onclick = () => {
      new bootstrap.Modal(confirmSaveModal).show();
    };



    } catch (err) {
      console.error("Swine load failed", err);
      swineTableBody.innerHTML = `
        <tr>
          <td colspan="10" class="text-danger text-center">
            Failed to load swine data
          </td>
        </tr>`;
    }
  }

  // ================= FILTER SUBMIT =================
  filtersForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const status = filterStatus.value;
    const sex = filterSex.value;
    const tag = filterTag.value.toLowerCase();

    let filtered = [...allSwine];

    if (selectedFarmerId) {
      filtered = filtered.filter(sw => {
        const fid =
          typeof sw.farmer_id === "object"
            ? sw.farmer_id._id
            : sw.farmer_id;
        return fid === selectedFarmerId;
      });
    }

    if (status) {
      filtered = filtered.filter(sw =>
        (sw.current_status || sw.status) === status
      );
    }

    if (sex) {
      filtered = filtered.filter(sw => sw.sex === sex);
    }

    if (tag) {
      filtered = filtered.filter(sw =>
        sw.swine_id?.toLowerCase().includes(tag)
      );
    }

    renderFilterPreview(filtered);
  });

  // ================= RESET =================
  document.getElementById("resetFilters").addEventListener("click", () => {
    selectedFarmerId = null;

    filtersForm.reset();
    document.getElementById("farmerDropdownBtn").textContent = "Select Farmer";
    document.getElementById("filterResultWrap").classList.add("d-none");

    renderTable(allSwine);
  });

  // ================= INIT =================
  const farmerIds = await loadFarmers();
  await loadSwine(farmerIds);
});
