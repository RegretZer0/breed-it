import { authGuard } from "/js/authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  // ---------------- AUTH ----------------
  const user = await authGuard(["farm_manager", "encoder"]);
  if (!user) return;

  const token = localStorage.getItem("token");
  const BACKEND_URL = "http://localhost:5000";

  // ------------- FILTER LOGIG -------------
  let selectedStatus = "";

  document.querySelectorAll(".heat-tab").forEach(tab => {
    tab.addEventListener("click", function () {

      document.querySelectorAll(".heat-tab")
        .forEach(t => t.classList.remove("active"));

      this.classList.add("active");
      selectedStatus = this.dataset.status || "";

      applyFilters();
    });
  });

  let selectedFarmerId = null;

  async function loadFarmerForFilter() {
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/auth/farmers/${user.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const data = await res.json();
      const list = data.farmers || [];

      const wrap = document.getElementById("farmerOptions");
      const searchInput = document.getElementById("farmerSearch");
      const dropdownBtn = document.getElementById("farmerDropdownBtn");

      if (!wrap || !dropdownBtn) return;

      function render(listToRender) {
        wrap.innerHTML = "";

        if (!listToRender.length) {
          wrap.innerHTML =
            `<div class="text-muted small px-2">No farmers found</div>`;
          return;
        }

        listToRender.forEach(f => {
          const div = document.createElement("div");
          div.className = "dropdown-item small";
          div.textContent =
            `${f.first_name} ${f.last_name}`.trim();

          div.addEventListener("click", () => {
            selectedFarmerId = f._id;
            dropdownBtn.textContent = div.textContent;

            bootstrap.Dropdown
              .getInstance(dropdownBtn)
              ?.hide();

            applyFilters();
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
              `${f.first_name} ${f.last_name}`
                .toLowerCase()
                .includes(term)
            )
          );
        });
      }

    } catch (err) {
      console.error("Load farmers failed", err);
    }
  }

  loadFarmerForFilter();

  
  // ---------------- DOM ----------------
  const countInHeat = document.getElementById("countInHeat");
  const countAwaitingRecheck = document.getElementById("countAwaitingRecheck");
  const countPregnant = document.getElementById("countPregnant");
  const countFarrowingReady = document.getElementById("countFarrowingReady");
  const countLactating = document.getElementById("countLactating");

  const reportDetailsModal = document.getElementById("reportDetailsModal");
  const closeReportModal = document.getElementById("closeReportModal");
  const closeReportModalBtn = document.getElementById("closeReportModalBtn");

  const reportSwine = document.getElementById("reportSwine");
  const reportFarmer = document.getElementById("reportFarmer");
  const reportSigns = document.getElementById("reportSigns");
  const reportProbability = document.getElementById("reportProbability");
  const reportStatus = document.getElementById("reportStatus");

  const confirmPregnancyBtn = document.getElementById("confirmPregnancyBtn");
  const followUpBtn = document.getElementById("followUpBtn");

  const rejectReasonModal = document.getElementById("rejectReasonModal");
  const rejectReasonInput = document.getElementById("rejectReasonInput");
  const confirmRejectBtn = document.getElementById("confirmRejectBtn");

  const prevPageBtn = document.getElementById("prevPageBtn");
  const nextPageBtn = document.getElementById("nextPageBtn");
  const pageIndicator = document.getElementById("pageIndicator");

  const clearFilterBtn = document.getElementById("clearFilter");

  // Farrowing modal
  const farrowingModal = document.getElementById("farrowingModal");
  const farrowingForm = document.getElementById("farrowingForm");


  // Media Elements
  const evidenceGallery = document.getElementById("evidenceGallery");

  const approveBtn = document.getElementById("approveBtn");
  const rejectBtn = document.getElementById("rejectBtn");
  const confirmAIBtn = document.getElementById("confirmAIBtn");
  const confirmFarrowingBtn = document.getElementById("confirmFarrowingBtn"); // Added for Farrowing

  const aiConfirmModal = document.getElementById("aiConfirmModal");
  const boarSelect = document.getElementById("boarSelect");
  const submitAIBtn = document.getElementById("submitAI");

  // Track Progress panel (placeholder)
  const progressPanel = document.getElementById("trackProgressPanel");
  const closeProgressPanel = document.getElementById("closeProgressPanel");


  const heatFilterForm = document.getElementById("heatFilterForm");

  heatFilterForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    applyFilters();
  });


  // ---------------- MODAL HELPERS ----------------
  function closeReportDetails() {
    reportDetailsModal.style.display = "none";
    document.body.style.overflow = "";

    const videos = reportDetailsModal.querySelectorAll("video");
    videos.forEach(v => {
      v.pause();
      v.currentTime = 0;
    });

    evidenceGallery.innerHTML = "";
  }

  if (closeReportModal) {
    closeReportModal.onclick = closeReportDetails;
  }

  if (closeReportModalBtn) closeReportModalBtn.onclick = closeReportDetails;

  reportDetailsModal.addEventListener("click", e => {
    if (e.target === reportDetailsModal) closeReportDetails();
  });

  let allReports = [];
  let filteredReports = [];
  let currentReportId = null;



// ===== MAIN TABLE PAGINATION =====
let currentPage = 1;
const ROWS_PER_PAGE = 10;

  // ---------------- HELPERS ----------------
  function getDaysLeft(targetDate) {
    if (!targetDate) return "-";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(targetDate);
    target.setHours(0, 0, 0, 0);
    
    const diff = target - today;
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    
    if (days < 0) return "Overdue";
    if (days === 0) return "TODAY";
    return `${days} days`;
  }

  // ---------------- FETCH REPORTS ----------------
  async function loadReports() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/heat/all`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include"
      });

      if (res.status === 401 || res.status === 403) {
        alert("Session expired. Please log in again.");
        window.location.href = "login.html";
        return;
      }

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error("Failed to load reports");

      // This is the specific line that prevents rejected reports from displaying
      allReports = (data.reports || []).filter(r => r.status !== "rejected");

      filteredReports = [...allReports];

      renderStats(allReports);
      renderCards(filteredReports);

    } catch (err) {
      console.error("Reports load error:", err);
    }
  }

  // ---------------- STATS ----------------
  function renderStats(reports) {
    if (countInHeat) countInHeat.textContent = reports.filter(r => ["pending", "approved"].includes(r.status)).length;
    if (countAwaitingRecheck) countAwaitingRecheck.textContent = reports.filter(r => ["under_observation", "waiting_heat_check"].includes(r.status)).length;
    if (countPregnant) countPregnant.textContent = reports.filter(r => r.status === "pregnant").length;
    if (countLactating) {
    countLactating.textContent = reports.filter(r => r.status === "lactating").length;
  }
    
    if (countFarrowingReady) {
      countFarrowingReady.textContent = reports.filter(r => {
        if (!["pregnant", "farrowing_ready"].includes(r.status) || !r.expected_farrowing) {
           return false;
        }
        const daysStr = getDaysLeft(r.expected_farrowing);
        if (daysStr === "Overdue" || daysStr === "TODAY") return true;
        const daysNum = parseInt(daysStr);
        return !isNaN(daysNum) && daysNum <= 7;
      }).length;
    }
  }

  // ---------------- TABLE ----------------
  function renderCards(reports) {
    const cardList = document.getElementById("reportsCardList");
    if (!cardList) return;

    cardList.innerHTML = "";

    const totalPages = Math.ceil(reports.length / ROWS_PER_PAGE);
    if (currentPage > totalPages) currentPage = totalPages || 1;

    const start = (currentPage - 1) * ROWS_PER_PAGE;
    const pageItems = reports.slice(start, start + ROWS_PER_PAGE);

    if (!pageItems.length) {
      cardList.innerHTML = "<p class='text-muted'>No reports found.</p>";
      pageIndicator.textContent = `Page 1 of 1`;
      prevPageBtn.disabled = true;
      nextPageBtn.disabled = true;
      return;
    }

    pageItems.forEach(r => {
      const probability = r.heat_probability ?? 0;
      const status = r.status || "pending";
      const statusLabel = status.replace(/_/g, " ");

      const card = document.createElement("div");
      card.className = "report-card";

      card.innerHTML = `
        <div class="report-card-header">
          <div>
            <strong class="swine-id">
              ${r.swine_id?.swine_id || "-"}
            </strong>
            <div class="subtext">
              ${r.farmer_id
                ? `${r.farmer_id.first_name} ${r.farmer_id.last_name}`
                : "Unknown Farmer"}
            </div>
            <div class="date">
              ${new Date(r.createdAt).toLocaleDateString()}
            </div>
          </div>

          <span class="status-badge ${status}">
            ${statusLabel}
          </span>
        </div>

        <div class="probability-block">
          <div class="label">Probability</div>
          <div class="progress-row">
            <div class="progress-bar">
              <div class="progress-fill" style="width:${probability}%"></div>
            </div>
            <strong>${probability}%</strong>
          </div>
        </div>

        <div class="indicators">
          ${
            Array.isArray(r.signs) && r.signs.length
              ? r.signs
                  .map(
                    s => `<span class="indicator-chip">${s}</span>`
                  )
                  .join("")
              : `<span class="text-muted">No indicators</span>`
          }
        </div>

        <div class="report-card-actions">
          <button
            class="btn-nav secondary btn-view"
            data-id="${r._id}">
            View Details
          </button>

          <button
            class="btn-nav btn-track"
            data-id="${r._id}">
            Track Progress
          </button>
        </div>
      `;

      cardList.appendChild(card);
    });

    async function openProgressPanel(reportId) {
    if (!progressPanel) return;
    
    // --- FIX: RE-ATTACH CLOSE LOGIC ---
    const closeBtn = document.getElementById("closeProgressPanel");
    if (closeBtn) {
        closeBtn.onclick = () => progressPanel.classList.remove("open");
    }

    progressPanel.classList.add("open");

    try {
        const res = await fetch(`${BACKEND_URL}/api/heat/${reportId}/detail`, {
            headers: { Authorization: `Bearer ${token}` },
            credentials: "include"
        });
        const data = await res.json();
        if (!data.success) return;

        const r = data.report;
        
        // 1. Update Header Info
        const farmerEl = document.getElementById("progressFarmerName");

        if (farmerEl) {
          farmerEl.textContent = `Farmer: ${
            r.farmer_id
              ? `${r.farmer_id.first_name} ${r.farmer_id.last_name}`
              : "N/A"
          }`;
        }
        
        document.getElementById("progressSwineId").textContent = `${r.swine_id?.swine_id || 'Unknown'}`;
        
        const timelineContainer = document.getElementById("cycleTimeline");
        timelineContainer.innerHTML = ""; 

        // 2. Build Dynamic Event List (Most recent first)
        const events = [];

        // --- EVENT: LACTATING ---
        if (r.status === "lactating") {
            events.push({
                title: "Lactating",
                desc: "Sow is currently nursing piglets.",
                icon: "bi-heart-pulse-fill",
                date: "Currently Active"
            });
        }

        // --- EVENT: FARROWING ---
        if (["farrowing_ready", "lactating"].includes(r.status)) {
            events.push({
                title: "Farrowing Confirmed",
                desc: "Birth process recorded successfully.",
                icon: "bi-piggy-bank",
                date: r.actual_farrowing_date ? new Date(r.actual_farrowing_date).toLocaleDateString() : "Check Records"
            });
        }

        // --- EVENT: PREGNANT (115 Days Monitoring) ---
        if (["pregnant", "farrowing_ready", "lactating"].includes(r.status)) {
            events.push({
                title: "Pregnant & Under 115 Days Monitoring",
                desc: "Pregnancy confirmed. Monitoring gestation period.",
                icon: "bi-person-hearts",
                date: r.expected_farrowing ? `Due: ${new Date(r.expected_farrowing).toLocaleDateString()}` : "Ongoing"
            });
        }

        // --- EVENT: UNDER 30 DAYS MONITORING ---
        if (["under_observation", "pregnant", "farrowing_ready", "lactating"].includes(r.status)) {
            events.push({
                title: "Under 30 Days Monitoring",
                desc: "Monitoring for 'return to heat' signs post-AI.",
                icon: "bi-eye",
                date: r.ai_date ? `Started: ${new Date(r.ai_date).toLocaleDateString()}` : "Ongoing"
            });
        }

        // --- EVENT: AI CONFIRMED ---
        if (["ai_confirmed", "under_observation", "pregnant", "farrowing_ready", "lactating"].includes(r.status)) {
            events.push({
                title: "Artificial Insemination Performed",
                desc: "Farm Manager/Encoder confirmed Artificial Isemination procedure.",
                icon: "bi-droplet-half",
                date: r.ai_date ? new Date(r.ai_date).toLocaleDateString() : "Date N/A"
            });
        }

        // --- EVENT: APPROVED & SCHEDULED ---
        if (r.status !== "pending" && r.status !== "rejected") {
            events.push({
                title: "Sow In Heat & Scheduled for AI",
                desc: "Report approved by Farm Manager. AI preparation started.",
                icon: "bi-calendar-check",
                date: r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : "Approved"
            });
        }

        // --- EVENT: REPORT SUBMITTED ---
        events.push({
            title: "Report Submitted",
            desc: "Farmer submitted the heat detection report.",
            icon: "bi-file-earmark-text",
            date: r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "Pending"
        });

        // 3. Render Events
        events.forEach(event => {
            const stepDiv = document.createElement("div");
            stepDiv.className = `timeline-step completed`; 
            
            stepDiv.innerHTML = `
                <div class="step-icon"><i class="bi ${event.icon}"></i></div>
                <div class="step-content">
                    <div class="step-header">
                        <strong>${event.title}</strong>
                        <span class="step-status completed">recorded</span>
                    </div>
                    <p class="step-desc">${event.desc}</p>
                    <div class="step-meta">
                        <span>${event.date}</span>
                    </div>
                </div>
            `;
            timelineContainer.appendChild(stepDiv);
        });

        // 4. Update Current Stage Label
        const currentStageEl = document.getElementById("currentStage");
        if (currentStageEl) {
            currentStageEl.textContent = r.status.replace(/_/g, " ").toUpperCase();
        }

        // ================= TIME-BASED REMAINING =================
        const remainingEl = document.getElementById("remainingDays");

        if (remainingEl) {
          if (r.expected_farrowing) {
            remainingEl.textContent =
              getDaysLeft(r.expected_farrowing) + " remaining";
          } else {
            remainingEl.textContent = "—";
          }
        }

        } catch (err) {
            console.error("Error loading dynamic progress:", err);
        }
    }

    // Pagination UI
    pageIndicator.textContent = `Page ${currentPage} of ${totalPages || 1}`;
    prevPageBtn.disabled = currentPage === 1;
    nextPageBtn.disabled = currentPage === totalPages || totalPages === 0;

    // View details binding
    cardList.querySelectorAll(".btn-view").forEach(btn => {
      btn.onclick = () => viewReport(btn.dataset.id);
    });

    // Track progress (placeholder)
    cardList.querySelectorAll(".btn-track").forEach(btn => {
      btn.onclick = () => openProgressPanel(btn.dataset.id);
    });

  }


  // ================= MAIN TABLE PAGINATION CONTROLS =================
  prevPageBtn?.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      renderCards(filteredReports);
    }
  });

  nextPageBtn?.addEventListener("click", () => {
    const totalPages = Math.ceil(filteredReports.length / ROWS_PER_PAGE);

    if (currentPage < totalPages) {
      currentPage++;
      renderCards(filteredReports);
    }
  });



// ---------------- VIEW DETAILS ----------------
async function viewReport(id) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/heat/${id}/detail`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include"
    });
    const data = await res.json();

    console.log("DETAIL RESPONSE:", data);
    console.log("STATUS CODE:", res.status);

    if (!res.ok || !data.success) {
      throw new Error(data.message || "Could not load report details");
    }

    const r = data.report;
    currentReportId = id;

    // ================= BASIC INFO =================
    reportSwine.innerHTML = `<strong>Swine:</strong> ${r.swine_id?.swine_id || "Unknown"}`;

    // ✅ REPORT STATUS (CAPSULE)
    const status = r.status || "pending";
    const statusLabel = status.replace(/_/g, " ");

    reportStatus.textContent = statusLabel;
    reportStatus.setAttribute("data-status", status);

    reportFarmer.innerHTML = `<strong>Farmer:</strong> ${r.farmer_id?.first_name} ${r.farmer_id?.last_name}`;

    reportProbability.innerHTML = `
      <strong>Probability:</strong>
      ${r.heat_probability != null ? r.heat_probability + "%" : "N/A"}
    `;

    // ================= OBSERVED SIGNS =================
    if (Array.isArray(r.signs) && r.signs.length) {
      reportSigns.innerHTML = r.signs
        .map(sign => `<span class="sign-chip">${sign}</span>`)
        .join("");
    } else {
      reportSigns.innerHTML = `<span class="text-muted">No signs recorded.</span>`;
    }

    // ================= MEDIA GALLERY =================
    evidenceGallery.innerHTML = "";
    const evidences = Array.isArray(r.evidence_url)
      ? r.evidence_url
      : r.evidence_url
      ? [r.evidence_url]
      : [];

    if (!evidences.length) {
      evidenceGallery.innerHTML =
        "<p class='text-muted'><em>No media evidence provided.</em></p>";
    } else {
      evidences.forEach(path => {
        if (!path) return;

        const cleanPath = path.replace(/\\/g, "/");
        const fullUrl = cleanPath.startsWith("http")
          ? cleanPath
          : `${BACKEND_URL}/${cleanPath.replace(/^\/+/, "")}`;

        const isVideo = /\.(mp4|mov|webm)$/i.test(fullUrl);
        const wrapper = document.createElement("div");
        wrapper.className = "dynamic-media";

        if (isVideo) {
          wrapper.innerHTML = `
            <video controls preload="metadata">
              <source src="${fullUrl}">
              Your browser does not support video.
            </video>
            <small><a href="${fullUrl}" target="_blank">Open video</a></small>
          `;
        } else {
          wrapper.innerHTML = `
            <img src="${fullUrl}" alt="Evidence"
                 onclick="window.open('${fullUrl}', '_blank')"
                 onerror="this.src='https://placehold.co/400x300?text=Load+Error'">
            <small>Click to enlarge</small>
          `;
        }

        evidenceGallery.appendChild(wrapper);
      });
    }

    // ================= ACTION BUTTONS =================
    approveBtn.style.display = "none";
    if (rejectBtn) rejectBtn.style.display = "none";
    confirmAIBtn.style.display = "none";
    if (confirmPregnancyBtn) confirmPregnancyBtn.style.display = "none";
    if (confirmFarrowingBtn) confirmFarrowingBtn.style.display = "none";
    if (followUpBtn) followUpBtn.style.display = "none";

    switch (r.status) {
      case "pending":
        approveBtn.style.display = "inline-block";
        if (rejectBtn) rejectBtn.style.display = "inline-block";
        break;

      case "approved":
        confirmAIBtn.style.display = "inline-block";
        break;

      case "ai_confirmed":
      case "under_observation":
        if (confirmPregnancyBtn) confirmPregnancyBtn.style.display = "inline-block";
        if (followUpBtn) followUpBtn.style.display = "inline-block";
        break;

      case "pregnant":
      case "farrowing_ready": {
        if (!r.expected_farrowing) break;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const farrowDate = new Date(r.expected_farrowing);
        farrowDate.setHours(0, 0, 0, 0);

        if (today >= farrowDate) {
          confirmFarrowingBtn.style.display = "inline-block";
        }
        break;
      }
    }

    // ================= SHOW MODAL =================
    reportDetailsModal.style.display = "flex";
    document.body.style.overflow = "hidden";

  } catch (err) {
    console.error(err);
    alert("Error loading report details.");
  }
}


  // ---------------- ACTION HANDLER ----------------
  async function action(endpoint, message, extraBody = {}) {
    if (!currentReportId) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/heat/${currentReportId}/${endpoint}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify(extraBody)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Action failed");

      alert(message);
      closeReportDetails();
      loadReports();
    } catch (err) {
      alert(err.message || "Action failed");
    }
  }

  approveBtn.onclick = () => action("approve", "Report approved. AI is now scheduled.");

  if (rejectBtn) {
    rejectBtn.onclick = () => {
      rejectReasonInput.value = "";
      rejectReasonModal.style.display = "flex";
    };
  }

  confirmAIBtn.onclick = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/swine/all?sex=Male&age_stage=adult`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include"
      });
      const data = await res.json();
      if (!data.success || !data.swine?.length) return alert("No adult boars found.");
      const masterBoars = data.swine.filter(b => b.swine_id?.startsWith("BOAR-") || b.farmer_id === null);
      if (!masterBoars.length) return alert("No Master Boars available.");
      boarSelect.innerHTML = masterBoars.map(b => `<option value="${b._id}">${b.swine_id}</option>`).join("");
      aiConfirmModal.style.display = "flex";
    } catch (err) {
      console.error(err);
      alert("Failed to load boars.");
    }
  };

  submitAIBtn.onclick = async () => {
    const maleSwineId = boarSelect.value;
    if (!maleSwineId) return alert("Please select a boar.");
    action("confirm-ai", "AI Confirmed! Swine moved to Under Observation.", { maleSwineId });
    aiConfirmModal.style.display = "none";
  };

  // Confirm Reject Action
    confirmRejectBtn.onclick = () => {
    const reason = rejectReasonInput.value.trim();

    if (!reason) {
      alert("Rejection reason is required.");
      return;
    }

    action(
      "reject",
      "Report rejected successfully.",
      { reason }
    );

    rejectReasonModal.style.display = "none";
    rejectReasonInput.value = "";
  };


  // Confirm Pregnancy Action
  if (confirmPregnancyBtn) {
    confirmPregnancyBtn.onclick = () => {
      if (!confirm("Confirm pregnancy for this sow?")) return;
      action(
        "confirm-pregnancy",
        "Pregnancy confirmed. Expected farrowing date calculated."
      );
    };
  }

  // Cycle Failed / Return to Heat
  if (followUpBtn) {
    followUpBtn.onclick = () => {
      if (!confirm("Mark cycle as failed and return sow to heat?")) return;
      action(
        "cycle-failed",
        "Cycle failed. Sow returned to In-Heat status."
      );
    };
  }

  // Open Farrowing Modal
if (confirmFarrowingBtn) {
  confirmFarrowingBtn.onclick = () => {
    if (!farrowingModal) return;
    farrowingModal.style.display = "flex";
    document.getElementById("farrowingDateInput").valueAsDate = new Date();
  };
}

// ================= FARROWING SUBMIT =================
if (farrowingForm) {
  farrowingForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const farrowingDateInput = document.getElementById("farrowingDateInput");
    const liveInput = document.getElementById("liveCount");
    const mummyInput = document.getElementById("mummyCount");
    const stillInput = document.getElementById("stillCount");

    const payload = {
      farrowing_date: farrowingDateInput?.value || null,
      total_live: Number(liveInput?.value || 0),
      mummified: Number(mummyInput?.value || 0),
      stillborn: Number(stillInput?.value || 0),
    };

    await action(
      "confirm-farrowing",
      "Farrowing registered! Sow is now Lactating.",
      payload
    );

    if (farrowingModal) farrowingModal.style.display = "none";
    farrowingForm.reset();
  });
}


// ================= CLEAR FILTER =================
clearFilterBtn?.addEventListener("click", () => {

  const dropdownBtn = document.getElementById("farmerDropdownBtn");
  if (dropdownBtn) {
    dropdownBtn.textContent = "Farmer";
  }

  document.getElementById("filterSwine").value = "";

  selectedStatus = "";
  selectedFarmerId = null;

  // Reset tabs
  document.querySelectorAll(".heat-tab")
    .forEach(t => t.classList.remove("active"));

  document.querySelector(".heat-tab")
    ?.classList.add("active");

  filteredReports = [...allReports];
  currentPage = 1;

  renderCards(filteredReports);
});


function applyFilters() {

  const swineTerm =
    document.getElementById("filterSwine")
      ?.value.trim().toLowerCase() || "";

  filteredReports = allReports.filter(r => {

    // Swine filter
    const swineMatch =
      !swineTerm ||
      (r.swine_id?.swine_id || "")
        .toLowerCase()
        .includes(swineTerm);

    // Status filter (tabs)
    const statusMatch =
      !selectedStatus ||
      r.status === selectedStatus;

    // Farmer filter
    let farmerMatch = true;

    if (selectedFarmerId) {
      const farmerId =
        typeof r.farmer_id === "object"
          ? r.farmer_id._id
          : r.farmer_id;

      farmerMatch =
        farmerId &&
        farmerId.toString() === selectedFarmerId.toString();
    }

    return swineMatch && statusMatch && farmerMatch;
  });

  currentPage = 1;
  renderCards(filteredReports);
}


  loadReports();
});