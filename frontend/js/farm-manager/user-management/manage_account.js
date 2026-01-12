document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  const managerId = localStorage.getItem("userId");

  const tbody = document.getElementById("farmersTbody");

  /* =========================
     FILTER DOM REFERENCES
  ========================= */
  const filtersForm = document.getElementById("accountFiltersForm");
  const filterAccountType = document.getElementById("filterAccountType");
  const filterLocation = document.getElementById("filterLocation");
  const filterStatus = document.getElementById("filterStatus");
  const resetFiltersBtn = document.getElementById("resetFiltersBtn");

  const filteredSection = document.getElementById("filteredSection");
  const filteredTbody = document.getElementById("filteredTbody");
  const recentTbody = document.getElementById("recentTbody");

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
     EDIT MODAL
  ========================= */
  const editModal = document.getElementById("editModal");
  const editForm = document.getElementById("editFarmerForm");
  const roleLabel = document.getElementById("editRoleLabel");
  const farmerOnlyFields = document.getElementById("farmerOnlyFields");
  const closeModalBtn = document.getElementById("closeModal");
  const closeModalX = document.getElementById("closeModalX");

  let farmers = [];
  let encoders = [];
  let currentAccount = null;

  /* =========================
     FETCH DATA
  ========================= */
  async function fetchAllAccounts() {
    try {
      const [fRes, eRes] = await Promise.all([
        fetch(`/api/auth/farmers/${managerId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/auth/encoders/${managerId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const fData = await fRes.json();
      const eData = await eRes.json();

      farmers = fData.success ? fData.farmers : [];
      encoders = eData.success ? eData.encoders : [];

      updateStats();
      renderTableTo(tbody, [...farmers, ...encoders]);
      renderRecentAccounts();
    } catch (err) {
      console.error(err);
      tbody.innerHTML = `<tr><td colspan="8">Server error</td></tr>`;
    }
  }

  /* =========================
     UPDATE STATS (RESTORED)
  ========================= */
  function updateStats() {
    farmerStats.total.textContent = farmers.length;
    farmerStats.active.textContent =
      farmers.filter(f => (f.status || "active") !== "inactive").length;
    farmerStats.inactive.textContent =
      farmers.length - farmerStats.active.textContent;

    encoderStats.total.textContent = encoders.length;
    encoderStats.active.textContent =
      encoders.filter(e => (e.status || "active") !== "inactive").length;
    encoderStats.inactive.textContent =
      encoders.length - encoderStats.active.textContent;
  }

  /* =========================
     GENERIC TABLE RENDERER
  ========================= */
  function renderTableTo(tbodyEl, data) {
    tbodyEl.innerHTML = "";

    if (!data.length) {
      tbodyEl.innerHTML = `<tr><td colspan="8">No results found</td></tr>`;
      return;
    }

    data.forEach(acc => {
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>${acc.farmer_id || acc._id}</td>
        <td>${acc.first_name} ${acc.last_name}</td>
        <td>${acc.address || "-"}</td>
        <td>${acc.contact_no || acc.contact_info || "-"}</td>
        <td>${acc.num_of_pens ?? "-"}</td>
        <td>${acc.pen_capacity ?? "-"}</td>
        <td>${acc.status || "active"}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary">Edit</button>
        </td>
      `;

      tr.querySelector("button").addEventListener("click", () =>
        openEditModal(acc)
      );

      tbodyEl.appendChild(tr);
    });
  }

  /* =========================
     APPLY FILTERS
  ========================= */
  filtersForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const type = filterAccountType.value;
    const location = filterLocation.value.toLowerCase().trim();
    const status = filterStatus.value;

    let data =
      type === "farmer"
        ? farmers
        : type === "encoder"
        ? encoders
        : [...farmers, ...encoders];

    if (location) {
      data = data.filter(acc =>
        (acc.address || "").toLowerCase().includes(location)
      );
    }

    if (status && status !== "all") {
      data = data.filter(acc =>
        (acc.status || "active") === status
      );
    }

    filteredSection.classList.remove("d-none");
    renderTableTo(filteredTbody, data);
  });

  /* =========================
     RESET FILTERS
  ========================= */
  resetFiltersBtn.addEventListener("click", () => {
    filterAccountType.value = "";
    filterLocation.value = "";
    filterStatus.value = "";

    filteredSection.classList.add("d-none");
    filteredTbody.innerHTML = "";
  });

  /* =========================
     RECENTLY ADDED
  ========================= */
  function renderRecentAccounts() {
    const combined = [...farmers, ...encoders]
      .filter(acc => acc.createdAt)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5);

    recentTbody.innerHTML = "";

    combined.forEach(acc => {
      recentTbody.innerHTML += `
        <tr>
          <td>${acc.farmer_id || acc._id}</td>
          <td>${acc.first_name} ${acc.last_name}</td>
          <td>${acc.farmer_id ? "Farmer" : "Encoder"}</td>
          <td>${acc.address || "-"}</td>
          <td>${acc.status || "active"}</td>
        </tr>
      `;
    });
  }

  /* =========================
     EDIT MODAL LOGIC
  ========================= */
  function openEditModal(acc) {
    currentAccount = acc;

    const isFarmer = !!acc.farmer_id;

    roleLabel.textContent = isFarmer ? "Farmer" : "Encoder";
    farmerOnlyFields.style.display = isFarmer ? "block" : "none";

    editForm.editFirstName.value = acc.first_name;
    editForm.editLastName.value = acc.last_name;
    editForm.editAddress.value = acc.address || "";
    editForm.editContact.value = acc.contact_no || acc.contact_info || "";
    editForm.editStatus.value = acc.status || "active";

    if (isFarmer) {
      editForm.editPens.value = acc.num_of_pens || "";
      editForm.editCapacity.value = acc.pen_capacity || "";
    }

    editModal.classList.remove("d-none");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    editModal.classList.add("d-none");
    document.body.style.overflow = "";
  }

  closeModalBtn.addEventListener("click", closeModal);
  closeModalX.addEventListener("click", closeModal);

  /* =========================
     SUBMIT EDIT
  ========================= */
  editForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentAccount) return;

    const isFarmer = !!currentAccount.farmer_id;

    const payload = {
      first_name: editForm.editFirstName.value.trim(),
      last_name: editForm.editLastName.value.trim(),
      address: editForm.editAddress.value.trim(),
      contact_no: editForm.editContact.value.trim(),
      status: editForm.editStatus.value, // ✅ RESTORED
    };

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

      const data = await res.json();

      if (res.ok && data.success) {
        closeModal();
        fetchAllAccounts();
      } else {
        alert(data.message || "Update failed");
      }
    } catch (err) {
      console.error(err);
      alert("Server error");
    }
  });

  /* =========================
     INIT
  ========================= */
  fetchAllAccounts();
});
