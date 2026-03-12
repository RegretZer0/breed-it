// heat-report/filters.js

export function initHeatReportFilters({
  user,
  token,
  BACKEND_URL,
  onApply,
  onSetFilterState,
  getFilterState,
  onResetToAll
}) {
  // ---------------- STATE ----------------
  // Use UI module as the source of truth (shared state)
  const state = getFilterState();

  // ------------- FILTER LOGIG -------------
  document.querySelectorAll(".heat-tab").forEach((tab) => {
    tab.addEventListener("click", function () {
      document.querySelectorAll(".heat-tab").forEach((t) => t.classList.remove("active"));

      this.classList.add("active");
      state.selectedStatus = this.dataset.status || "";

      onSetFilterState(state);
      onApply();
    });
  });

  // Farmer selection
  async function loadFarmerForFilter() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/farmers/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();
      const list = data.farmers || [];

      const wrap = document.getElementById("farmerOptions");
      const searchInput = document.getElementById("farmerSearch");
      const dropdownBtn = document.getElementById("farmerDropdownBtn");

      if (!wrap || !dropdownBtn) return;

      function render(listToRender) {
        wrap.innerHTML = "";

        if (!listToRender.length) {
          wrap.innerHTML = `<div class="text-muted small px-2">No farmers found</div>`;
          return;
        }

        listToRender.forEach(f => {
          const div = document.createElement("div");
          div.className = "dropdown-item small";
          div.textContent = `${f.first_name} ${f.last_name}`.trim();

          div.addEventListener("click", () => {
            state.selectedFarmerId = f._id;
            dropdownBtn.textContent = div.textContent;

            bootstrap.Dropdown.getInstance(dropdownBtn)?.hide();

            onSetFilterState(state);
          });

          wrap.appendChild(div);
        });
      }

      render(list);

      // Search filter
      if (searchInput && !searchInput.dataset.bound) {
        searchInput.dataset.bound = "true";
        searchInput.addEventListener("input", () => {
          const term = searchInput.value.toLowerCase();
          render(
            list.filter(f =>
              `${f.first_name} ${f.last_name}`.toLowerCase().includes(term)
            )
          );
        });
      }
    } catch (err) {
      console.error("Load farmers failed", err);
    }
  }

  loadFarmerForFilter();

  // ✅ Report status dropdown (workflow status)
  const reportStatusFilter = document.getElementById("reportStatusFilter");
  reportStatusFilter?.addEventListener("change", () => {
    state.selectedReportStatus = reportStatusFilter.value || "";
    onSetFilterState(state);
    // Apply is manual (button submit)
  });

  // Submit Apply
  const heatFilterForm = document.getElementById("heatFilterForm");
  heatFilterForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    // keep state in sync
    state.selectedReportStatus =
      document.getElementById("reportStatusFilter")?.value || state.selectedReportStatus || "";
    onSetFilterState(state);
    onApply();
  });

  // Reset
  const clearFilterBtn = document.getElementById("clearFilter");
  clearFilterBtn?.addEventListener("click", () => {
    const dropdownBtn = document.getElementById("farmerDropdownBtn");
    if (dropdownBtn) dropdownBtn.textContent = "Farmer";

    const sw = document.getElementById("filterSwine");
    if (sw) sw.value = "";

    if (reportStatusFilter) reportStatusFilter.value = "";

    // reset shared state
    state.selectedStatus = "";
    state.selectedFarmerId = null;
    state.selectedReportStatus = "";

    // reset tabs UI
    document.querySelectorAll(".heat-tab").forEach(t => t.classList.remove("active"));
    document.querySelector(".heat-tab")?.classList.add("active");

    onSetFilterState(state);
    onResetToAll();
  });
}