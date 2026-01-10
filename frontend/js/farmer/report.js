// report.js
import { authGuard } from "../auth/authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  // 🔐 Farmer-only
  await authGuard("farmer");

  const token = localStorage.getItem("token");
  const userId = localStorage.getItem("userId");

  // =========================
  // CREATE REPORT REFERENCES
  // =========================
  const swineSelect = document.getElementById("swineSelect");
  const reportForm = document.getElementById("heatReportForm");
  const reportMessage = document.getElementById("reportMessage");

  // =========================
  // LOGS REFERENCES
  // =========================
  const logsContainer = document.getElementById("logsContainer");
  const searchBtn = document.getElementById("searchBtn");
  const dateInput = document.querySelector('.filter input[type="date"]');
  const filteredSection = document.getElementById("filteredSection");
  const filteredLogsContainer = document.getElementById("filteredLogsContainer");

  // FILTER ELEMENTS
  const pigFilter = document.getElementById("pigFilter");
  const clearFilterBtn = document.getElementById("clearFilterBtn");
  const activeFilterLabel = document.getElementById("activeFilter");

  // ✅ FIX: report status filter reference (already exists in UI)
  const statusFilter = document.getElementById("statusFilter");

  // =========================
  // VIEW REPORT MODAL REFERENCES
  // =========================
  const reportModal = document.getElementById("reportModal");
  const modalBody = document.getElementById("modalBody");
  const closeModalBtn = document.querySelector(".close-modal");

  // =========================
  // INITIAL UI STATE
  // =========================
  if (searchBtn) searchBtn.disabled = false;

  if (logsContainer) {
    logsContainer.innerHTML = `
      <p style="text-align:center; opacity:0.6;">
        Loading logs...
      </p>
    `;
  }

  // =========================
  // LOAD FARMER SWINE
  // =========================
  try {
    const res = await fetch(
      `http://localhost:5000/api/swine?userId=${userId}&role=farmer`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    data.swine.forEach(sw => {
      // CREATE REPORT DROPDOWN
      if (swineSelect) {
        const option = document.createElement("option");
        option.value = sw.swine_id;
        option.textContent = `${sw.swine_id} - ${sw.breed}`;
        swineSelect.appendChild(option);
      }

      // FILTER DROPDOWN
      if (pigFilter) {
        const filterOption = document.createElement("option");
        filterOption.value = sw.swine_id;
        filterOption.textContent = sw.swine_id;
        pigFilter.appendChild(filterOption);
      }
    });

  } catch (err) {
    console.error("Error loading swine:", err);
  }

  // =========================
  // SUBMIT REPORT
  // =========================
  if (reportForm) {
    reportForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const selectedSwine = swineSelect.value;
      const signs = Array.from(
        document.querySelectorAll('input[name="signs"]:checked')
      ).map(cb => cb.value);

      const evidence = document.getElementById("evidence")?.files[0];

      if (!selectedSwine || signs.length === 0 || !evidence) {
        reportMessage.textContent = "Please complete all fields.";
        reportMessage.style.color = "red";
        return;
      }

      const formData = new FormData();
      formData.append("swineId", selectedSwine);
      formData.append("signs", JSON.stringify(signs));
      formData.append("evidence", evidence);
      formData.append("farmerId", userId);

      try {
        const res = await fetch("http://localhost:5000/api/heat/add", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData
        });

        const data = await res.json();

        if (res.ok && data.success) {
          reportMessage.textContent = "Heat report submitted successfully!";
          reportMessage.style.color = "green";
          reportForm.reset();
          loadLogs();
        }

      } catch (err) {
        console.error(err);
        reportMessage.textContent = "Failed to submit report.";
        reportMessage.style.color = "red";
      }
    });
  }

  // =========================
  // LOAD FARMER LOGS
  // =========================
  async function loadLogs() {
    if (!logsContainer) return;

    if (searchBtn) searchBtn.disabled = true;

    const params = new URLSearchParams({ farmerId: userId });

    const isDateFiltered = !!dateInput?.value;
    const isPigFiltered = !!pigFilter?.value;
    const isStatusFiltered =
      statusFilter && statusFilter.value !== "Recent";

    const hasFilter = isDateFiltered || isPigFiltered || isStatusFiltered;

    if (dateInput?.value) params.append("date", dateInput.value);
    if (pigFilter?.value) params.append("swineId", pigFilter.value);

    if (isStatusFiltered) {
      params.append("status", statusFilter.value.toLowerCase());
}

    if (filteredLogsContainer) filteredLogsContainer.innerHTML = "";

    if (filteredSection) {
      filteredSection.style.display = hasFilter ? "block" : "none";
    }

    if (!hasFilter && logsContainer) {
      logsContainer.innerHTML = "";
    }

    try {
      const res = await fetch(
        `http://localhost:5000/api/heat/farmer/logs?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const data = await res.json();
      if (searchBtn) searchBtn.disabled = false;

      const targetContainer = hasFilter
        ? filteredLogsContainer
        : logsContainer;

      if (!data.success || data.logs.length === 0) {
        targetContainer.innerHTML = `
          <p style="text-align:center; opacity:0.6;">
            ${hasFilter
              ? "No reports match your selected filter."
              : "No reports yet. Create a report to get started."
            }
          </p>
        `;
        return;
      }

      data.logs.forEach(log => {
        const card = document.createElement("div");
        card.className = "report-card";

        card.innerHTML = `
          <div class="report-info">
            <p><strong>Report ID:</strong> ${log.report_id}</p>
            <p><strong>Pig Tag ID:</strong> ${log.pig_tag}</p>
            <p><strong>Status:</strong> ${log.status || "pending"}</p>
            <p><strong>Date Created:</strong> ${new Date(log.date_created).toLocaleDateString()}</p>
          </div>
          <button class="view-btn">VIEW</button>
        `;

        targetContainer.appendChild(card);

        // =========================
        // VIEW BUTTON HANDLER
        // =========================
        const viewBtn = card.querySelector(".view-btn");

        viewBtn.addEventListener("click", async () => {
          reportModal.classList.remove("hidden");
          modalBody.innerHTML = "<p>Loading...</p>";

          try {
            const res = await fetch(
              `http://localhost:5000/api/heat/${log.report_id}`,
              { headers: { Authorization: `Bearer ${token}` } }
            );

            const data = await res.json();
            if (!data.success) throw new Error("Failed to load report");

            const r = data.report;

            modalBody.innerHTML = `
              <p><strong>Report ID:</strong> ${r._id}</p>
              <p><strong>Pig Tag:</strong> ${r.swine_code}</p>
              <p><strong>Breed:</strong> ${r.swine_breed}</p>
              <p><strong>Status:</strong> ${r.status}</p>
              <p><strong>Farmer:</strong> ${r.farmer_name}</p>
              <p><strong>Heat Probability:</strong> ${r.heat_probability}%</p>
              <p><strong>Signs:</strong> ${r.signs.join(", ")}</p>

              ${r.evidence_url ? `
                <img 
                  src="${r.evidence_url}" 
                  style="width:100%;margin-top:10px;border-radius:10px;" 
                />
              ` : ""}
            `;
          } catch (err) {
            modalBody.innerHTML = "<p>Error loading report.</p>";
            console.error(err);
          }
        });
      });

    } catch (err) {
      console.error("Error loading logs:", err);
    }
  }

  // =========================
  // EVENT WIRING (FIXED)
  // =========================
  loadLogs();

  searchBtn?.addEventListener("click", loadLogs);

  clearFilterBtn?.addEventListener("click", () => {
    if (dateInput) dateInput.value = "";
    if (pigFilter) pigFilter.value = "";
    if (statusFilter) statusFilter.value = "Recent";
    loadLogs();
  });

  // =========================
  // MODAL CLOSE LOGIC
  // =========================
  closeModalBtn?.addEventListener("click", () => {
    reportModal.classList.add("hidden");
  });

  reportModal?.addEventListener("click", e => {
    if (e.target === reportModal) {
      reportModal.classList.add("hidden");
    }
  });
});
