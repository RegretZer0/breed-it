// /js/reports.module.js
export function buildReportsModule(state, dom, ui) {
  const { BACKEND_URL, token, user } = state;

  // ✅ NEW: Normalize + derived-status helpers (add near top of buildReportsModule)
  function normalizeReportStatus(status) {
    // backend statuses you actually have:
    // pending, approved, under_observation, pregnant, lactating, completed, rejected
    return (status || "").toString().trim().toLowerCase();
  }

  function isFarrowingReady(report) {
    // NOT a real DB status — derived from pregnancy + expected_farrowing date
    const st = normalizeReportStatus(report?.status);
    if (st !== "pregnant") return false;

    const d = report?.expected_farrowing;
    if (!d) return false;

    const daysStr = ui.getDaysLeft(d);
    if (daysStr === "Overdue" || daysStr === "TODAY") return true;

    const daysNum = parseInt(daysStr, 10);
    return Number.isFinite(daysNum) && daysNum <= 7;
  }

  async function loadFarmerForFilter() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/farmers/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();
      const list = data.farmers || [];

      const wrap = dom.farmerOptions;
      const searchInput = dom.farmerSearch;
      const dropdownBtn = dom.farmerDropdownBtn;

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
            applyFilters();
          });

          wrap.appendChild(div);
        });
      }

      render(list);

      if (searchInput && !searchInput.dataset.bound) {
        searchInput.dataset.bound = "true";
        searchInput.addEventListener("input", () => {
          const term = searchInput.value.toLowerCase();
          render(list.filter(f =>
            `${f.first_name} ${f.last_name}`.toLowerCase().includes(term)
          ));
        });
      }
    } catch (err) {
      console.error("Load farmers failed", err);
    }
  }

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

      state.allReports = (data.reports || []).filter(r => r.status !== "rejected");
      state.filteredReports = [...state.allReports];

      renderStats(state.allReports);
      renderCards(state.filteredReports);
    } catch (err) {
      console.error("Reports load error:", err);
    }
  }

  function renderStats(reports) {
    const list = Array.isArray(reports) ? reports : [];

    // In-Heat (AI scheduled / due) -> approved
    if (dom.countInHeat) {
      dom.countInHeat.textContent = list.filter(r =>
        normalizeReportStatus(r.status) === "approved"
      ).length;
    }

    // Under Observation -> under_observation
    if (dom.countAwaitingRecheck) {
      dom.countAwaitingRecheck.textContent = list.filter(r =>
        normalizeReportStatus(r.status) === "under_observation"
      ).length;
    }

    // Pregnant -> pregnant
    if (dom.countPregnant) {
      dom.countPregnant.textContent = list.filter(r =>
        normalizeReportStatus(r.status) === "pregnant"
      ).length;
    }

    // Lactating -> lactating
    if (dom.countLactating) {
      dom.countLactating.textContent = list.filter(r =>
        normalizeReportStatus(r.status) === "lactating"
      ).length;
    }

    // Farrowing Ready (derived) -> pregnant + due date within 7 days / overdue / today
    if (dom.countFarrowingReady) {
      dom.countFarrowingReady.textContent = list.filter(isFarrowingReady).length;
    } 
  }

  // ---------------- RENDER CARDS ----------------
  function renderCards(reports) {
    const cardList = document.getElementById("reportsCardList");
    if (!cardList) return;

    cardList.innerHTML = "";

    const totalPages = Math.max(1, Math.ceil(reports.length / state.ROWS_PER_PAGE));
    if (state.currentPage > totalPages) state.currentPage = totalPages || 1;

    const start = (state.currentPage - 1) * state.ROWS_PER_PAGE;
    const pageItems = reports.slice(start, start + state.ROWS_PER_PAGE);

    if (!pageItems.length) {
      cardList.innerHTML = "<p class='text-muted'>No reports found.</p>";
      if (dom.pageIndicator) dom.pageIndicator.textContent = `Page 1 of 1`;
      if (dom.prevPageBtn) dom.prevPageBtn.disabled = true;
      if (dom.nextPageBtn) dom.nextPageBtn.disabled = true;
      return;
    }

    // ---------------- helpers (local) ----------------
    const escapeHtml = (v) => {
      const s = (v ?? "").toString();
      return s
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    };

    const formatDate = (d) => {
      if (!d) return "—";
      const dt = new Date(d);
      if (Number.isNaN(dt.getTime())) return "—";
      return dt.toLocaleDateString();
    };

    const getPigProfileUrl = (swineObj) => {
      const raw =
        swineObj?.profile_picture ||
        swineObj?.image ||
        swineObj?.photo ||
        swineObj?.picture ||
        null;

      if (!raw) return null;

      const clean = String(raw).replace(/\\/g, "/");
      if (clean.startsWith("http://") || clean.startsWith("https://")) return clean;

      // most common in your app: "/uploads/...."
      if (clean.startsWith("/")) return `${state.BACKEND_URL}${clean}`;

      // fallback
      return `${state.BACKEND_URL}/uploads/${clean.replace(/^\/+/, "")}`;
    };

    const normalizeWorkflowLabel = (status) => {
      const s = String(status || "pending").toLowerCase();
      const map = {
        pending: "Pending",
        approved: "Approved",
        rejected: "Rejected",
        completed: "Completed",
      };
      return map[s] || s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    };

    const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

    // ---------------- render ----------------
    pageItems.forEach(r => {
      const probability = clamp(Number(r.heat_probability ?? 0), 0, 100);
      const status = (r.status || "pending").toLowerCase();
      const statusLabel = normalizeWorkflowLabel(status);

      // pig + farmer
      const pigTag = r.swine_id?.swine_id || "-";
      const farmerName = r.farmer_id
        ? `${r.farmer_id.first_name || ""} ${r.farmer_id.last_name || ""}`.trim()
        : "Unknown Farmer";

      const createdDate = formatDate(r.createdAt);

      // signs (limit to keep card compact)
      const signsArr = Array.isArray(r.signs) ? r.signs.filter(Boolean) : [];
      const SIGN_LIMIT = 4;
      const shownSigns = signsArr.slice(0, SIGN_LIMIT);
      const extraCount = Math.max(0, signsArr.length - shownSigns.length);

      // avatar
      const pigImgUrl = getPigProfileUrl(r.swine_id);

      const card = document.createElement("div");
      card.className = "report-card compact"; // css later (you asked structure first)

      card.innerHTML = `
        <div class="report-card-grid">
          <!-- LEFT: Pig profile slot -->
          <div class="report-pig-slot" aria-label="Pig profile">
            ${
              pigImgUrl
                ? `
                  <img class="report-pig-img"
                      src="${escapeHtml(pigImgUrl)}"
                      alt="Pig ${escapeHtml(pigTag)}"
                      loading="lazy"
                      onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                  <div class="report-pig-fallback" style="display:none;">
                    <i class="bi bi-piggy-bank"></i>
                  </div>
                `
                : `
                  <div class="report-pig-fallback">
                    <i class="bi bi-piggy-bank"></i>
                  </div>
                `
            }
          </div>

          <!-- MIDDLE: Main info -->
          <div class="report-main">
            <div class="report-top">
              <div class="report-title-wrap">
                <div class="report-swine-id">${escapeHtml(pigTag)}</div>

                <div class="report-meta">
                  <span class="meta-item">
                    <span class="meta-label">Farmer:</span> ${escapeHtml(farmerName)}
                  </span>
                  <span class="meta-dot">•</span>
                  <span class="meta-item">
                    <span class="meta-label">Date Created:</span> ${escapeHtml(createdDate)}
                  </span>
                </div>
              </div>

              <!-- RIGHT: Workflow status badge -->
              <div class="report-status-wrap">
                <span class="status-badge ${escapeHtml(status)}">${escapeHtml(statusLabel)}</span>
              </div>
            </div>

            <!-- Probability row -->
            <div class="report-prob">
              <div class="prob-label">Probability</div>
              <div class="prob-row">
                <div class="progress-bar"
                    role="progressbar"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    aria-valuenow="${probability}">
                  <div class="progress-fill" style="width:${probability}%"></div>
                </div>

                <!-- wrapper helps prevent % text clipping on tight screens -->
                <div class="prob-val-wrap">
                  <strong class="prob-val">${probability}%</strong>
                </div>
              </div>
            </div>

            <!-- Observed signs row -->
            <div class="report-signs-row">
              <div class="signs-label">Observed Signs:</div>
              <div class="indicators compact">
                ${
                  shownSigns.length
                    ? shownSigns.map(s => `<span class="indicator-chip">${escapeHtml(s)}</span>`).join("")
                    : `<span class="text-muted">—</span>`
                }
                ${
                  extraCount > 0
                    ? `<span class="indicator-chip more">+${extraCount} more</span>`
                    : ``
                }
              </div>
            </div>
          </div>

          <div class="report-actions card-actions">
            <button class="btn-nav secondary btn-view" type="button" data-id="${escapeHtml(r._id)}">
              <i class="bi bi-eye"></i>
              View Details
            </button>

            <button class="btn-nav btn-track" type="button" data-id="${escapeHtml(r._id)}">
              <i class="bi bi-graph-up-arrow"></i>
              Track Progress
            </button>
          </div>
        </div>
      `;

      cardList.appendChild(card);
    });

    // Pagination UI
    if (dom.pageIndicator) dom.pageIndicator.textContent = `Page ${state.currentPage} of ${totalPages || 1}`;
    if (dom.prevPageBtn) dom.prevPageBtn.disabled = state.currentPage === 1;
    if (dom.nextPageBtn) dom.nextPageBtn.disabled = state.currentPage === totalPages || totalPages === 0;

    // View details binding
    cardList.querySelectorAll(".btn-view").forEach(btn => {
      btn.onclick = () => viewReport(btn.dataset.id);
    });

    // Track progress binding
    cardList.querySelectorAll(".btn-track").forEach(btn => {
      btn.onclick = () => openProgressPanel(btn.dataset.id);
    });
  }

    function applyFilters() {
      const swineTerm = dom.filterSwine?.value.trim().toLowerCase() || "";

      // Report workflow status (dropdown): pending / approved / rejected / completed
      const reportStatusPick = (dom.reportStatusFilter?.value || "").toLowerCase();

      state.filteredReports = state.allReports.filter(r => {
        // ---------------- SWINE TAG FILTER ----------------
        const swineMatch =
          !swineTerm ||
          (r.swine_id?.swine_id || "").toLowerCase().includes(swineTerm);

        // ---------------- PHASE / STAGE FILTER (tabs) ----------------
        const phaseSelected = (state.selectedStatus || "").toLowerCase();

        const phaseMatch =
          !phaseSelected
            ? true
            : phaseSelected === "farrowing_ready"
              ? isFarrowingReady(r) 
              : normalizeReportStatus(r.status) === phaseSelected; 

        // ---------------- REPORT STATUS FILTER (dropdown) ----------------

        const workflowMatch =
          !reportStatusPick
            ? true
            : String(r.status || "").toLowerCase() === reportStatusPick;

        // ---------------- FARMER FILTER ----------------
        let farmerMatch = true;
        if (state.selectedFarmerId) {
          const farmerId = typeof r.farmer_id === "object" ? r.farmer_id._id : r.farmer_id;
          farmerMatch = farmerId && farmerId.toString() === state.selectedFarmerId.toString();
        }

        return swineMatch && phaseMatch && workflowMatch && farmerMatch;
      });

      state.currentPage = 1;
      renderCards(state.filteredReports);
    }

  function clearFilters() {
    if (dom.farmerDropdownBtn) dom.farmerDropdownBtn.textContent = "Farmer";
    if (dom.filterSwine) dom.filterSwine.value = "";

    // reset workflow status dropdown
    if (dom.reportStatusFilter) dom.reportStatusFilter.value = "";

    // reset phase tabs
    state.selectedStatus = "";
    state.selectedFarmerId = null;

    document.querySelectorAll(".heat-tab").forEach(t => t.classList.remove("active"));
    document.querySelector(".heat-tab")?.classList.add("active");

    state.filteredReports = [...state.allReports];
    state.currentPage = 1;

    renderCards(state.filteredReports);
  }

  // ---------------- VIEW DETAILS ----------------
  async function viewReport(id) {
    ui.showReportLoading();

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
      state.currentReportId = id;
      state.currentReportData = r;

      // ---------------- LOCAL RESOLVERS ----------------
      const toNumberOrNull = (v) => {
        if (v === null || v === undefined || v === "") return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };

      const pickLatestByDate = (arr, dateKeys = ["date", "createdAt", "updatedAt", "recordedAt"]) => {
        if (!Array.isArray(arr) || !arr.length) return null;
        const withDate = arr
          .map(x => {
            const d = dateKeys.map(k => x?.[k]).find(Boolean);
            const t = d ? new Date(d).getTime() : NaN;
            return { x, t };
          })
          .filter(o => Number.isFinite(o.t))
          .sort((a, b) => b.t - a.t);

        return withDate[0]?.x || arr[arr.length - 1] || null;
      };

      const resolveCurrentWeight = (swine) => {
        if (!swine || typeof swine !== "object") return null;

        const directKeys = ["current_weight", "currentWeight", "latest_weight", "latestWeight", "weight", "weight_kg", "currentKg"];
        for (const k of directKeys) {
          const n = toNumberOrNull(swine[k]);
          if (n !== null) return n;
        }

        const nested = swine.weight_record || swine.latest_weight_record || swine.latestWeightRecord;
        const nestedVal = toNumberOrNull(nested?.weight ?? nested?.kg ?? nested?.value);
        if (nestedVal !== null) return nestedVal;

        const candidates = [swine.weight_records, swine.weightRecords, swine.weights, swine.growth_records, swine.growthRecords]
          .find(a => Array.isArray(a) && a.length);

        if (candidates) {
          const latest = pickLatestByDate(candidates);
          const n = toNumberOrNull(latest?.weight ?? latest?.kg ?? latest?.value ?? latest?.current_weight);
          if (n !== null) return n;
        }

        return null;
      };

      const resolveCurrentCycle = (swine, report) => {
        const reportCycle = toNumberOrNull(report?.cycle_no ?? report?.cycleNo ?? report?.cycle);
        if (reportCycle !== null) return reportCycle;

        if (!swine || typeof swine !== "object") return null;

        const directKeys = ["cycle_no", "cycleNo", "current_cycle", "currentCycle", "cycle", "cycle_number", "cycleNumber", "parity", "parity_no", "parityNo"];
        for (const k of directKeys) {
          const n = toNumberOrNull(swine[k]);
          if (n !== null) return n;
        }

        const cyclesArr = swine.cycles || swine.breeding_cycles || swine.breedingCycles;
        if (Array.isArray(cyclesArr) && cyclesArr.length) {
          const latest = pickLatestByDate(cyclesArr);
          const n = toNumberOrNull(latest?.cycle_no ?? latest?.cycleNo ?? latest?.cycle);
          if (n !== null) return n;
          return cyclesArr.length;
        }

        return null;
      };

      // ✅ FIXED: uses swineMongoId properly (no undefined variable)
      const tryFetchSwineDetail = async (swineMongoId) => {
        if (!swineMongoId) return null;

        const url = `${BACKEND_URL}/api/swine/${swineMongoId}`; // <-- change if needed

        try {
            const rr = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
            credentials: "include"
            });

            // ✅ silently ignore missing route
            if (rr.status === 404) return null;
            if (!rr.ok) return null;

            const dd = await rr.json();
            const sw = dd?.swine || dd?.data || dd;
            return (sw && typeof sw === "object") ? sw : null;
        } catch {
            // ✅ silent failure (no console spam)
            return null;
        }
        };

      // ---------------- STATUS (capsule) ----------------
      const status = r.status || "pending";
      const statusLabel = status.replace(/_/g, " ");

      if (dom.reportStatus) {
        dom.reportStatus.textContent = statusLabel;
        dom.reportStatus.setAttribute("data-status", status);
      }

      // New modal fields
      const pigTagEl = document.getElementById("pigTag");
      const pigWeightEl = document.getElementById("pigWeight");
      const pigCycleEl = document.getElementById("pigCycle");
      const pigStageEl = document.getElementById("pigStage");

      if (pigTagEl) pigTagEl.textContent = r.swine_id?.swine_id || "—";

      // Weight + cycle
      let swineObj = r.swine_id && typeof r.swine_id === "object" ? r.swine_id : null;

      let weightVal = resolveCurrentWeight(swineObj);
      let cycleVal = resolveCurrentCycle(swineObj, r);

      if ((weightVal === null || cycleVal === null) && swineObj?._id) {
        const swineDetail = await tryFetchSwineDetail(swineObj._id);
        if (swineDetail) {
          weightVal = weightVal ?? resolveCurrentWeight(swineDetail);
          cycleVal = cycleVal ?? resolveCurrentCycle(swineDetail, r);
        }
      }

      if (pigWeightEl) pigWeightEl.textContent = (weightVal !== null) ? `${weightVal} kg` : "—";
      if (pigCycleEl) pigCycleEl.textContent = (cycleVal !== null) ? `Cycle ${cycleVal}` : "—";
      if (pigStageEl) pigStageEl.textContent = statusLabel || "—";

      // Health pill
      const healthPill = document.getElementById("pigHealthPill");
      const healthText = document.getElementById("pigHealthText");

      const rawHealth =
        r.swine_id?.health_status ??
        r.swine_id?.healthStatus ??
        r.swine_id?.status_health ??
        r.swine_id?.condition ??
        r.swine_id?.health ??
        "unknown";

      const normalizedHealth = String(rawHealth || "unknown").toLowerCase();

      const healthLabel =
        normalizedHealth === "healthy" ? "Healthy" :
        normalizedHealth === "sick" ? "Sick" :
        normalizedHealth === "injured" ? "Injured" :
        normalizedHealth === "quarantine" ? "Quarantine" :
        "Unknown";

      if (healthText) healthText.textContent = healthLabel;

      if (healthPill) {
        const key = normalizedHealth === "healthy" ? "healthy" : normalizedHealth === "sick" ? "sick" : "unknown";
        healthPill.setAttribute("data-health", key);
      }

      // Farmer fields + reported-by
      const farmerNameEl = document.getElementById("farmerName");
      const farmerIdEl = document.getElementById("farmerIdText");
      const farmerPhoneEl = document.getElementById("farmerPhone");
      const farmerAddressEl = document.getElementById("farmerAddress");

      const farmerObj = r.farmer_id && typeof r.farmer_id === "object" ? r.farmer_id : null;

      const reportedByName = document.getElementById("reportedByName");
      const reportedById = document.getElementById("reportedById");

      const farmerDisplayName = farmerObj
        ? `${farmerObj.first_name || ""} ${farmerObj.last_name || ""}`.trim()
        : "Unknown Farmer";

      if (reportedByName) reportedByName.textContent = farmerDisplayName || "Unknown Farmer";
      if (reportedById) {
        const fid = farmerObj?.farmer_id || farmerObj?._id || "";
        reportedById.textContent = fid ? `(${fid})` : "";
      }

      ui.setFarmerCardVisible(false);

      if (farmerNameEl) farmerNameEl.textContent = farmerDisplayName || "Unknown Farmer";
      if (farmerIdEl) farmerIdEl.textContent = farmerObj?.farmer_id || farmerObj?._id || "—";
      if (farmerPhoneEl) farmerPhoneEl.textContent = farmerObj?.contact_no || farmerObj?.phone || "—";
      if (farmerAddressEl) farmerAddressEl.textContent = farmerObj?.address || "—";

      // Avatars
      const farmerImg = document.getElementById("farmerAvatarImg");
      const pigImg = document.getElementById("pigAvatarImg");

      ui.setImageEl(farmerImg, farmerObj?.profile_picture);

      const pigPic =
        r.swine_id?.profile_picture ||
        r.swine_id?.image ||
        r.swine_id?.photo ||
        r.swine_id?.picture ||
        null;

      ui.setImageEl(pigImg, pigPic);

      // Meta
      const probEl = document.getElementById("reportProbabilityValue");
      const dtEl = document.getElementById("reportDateTime");

      if (probEl) probEl.textContent = r.heat_probability != null ? `${r.heat_probability}%` : "—";
      if (dtEl) dtEl.textContent = r.createdAt ? new Date(r.createdAt).toLocaleString() : "—";

      const notesEl = document.getElementById("reportNotes");
      const notesText = (r.remarks || r.notes || r.comment || "").toString().trim();
      if (notesEl) notesEl.innerHTML = notesText ? notesText : `<span class="text-muted">No remarks provided.</span>`;

      // Backward compat
      if (dom.reportSwine) dom.reportSwine.innerHTML = `<strong>Swine:</strong> ${r.swine_id?.swine_id || "Unknown"}`;

      if (dom.reportFarmer) {
        const nm = farmerObj ? `${farmerObj.first_name || ""} ${farmerObj.last_name || ""}`.trim() : "Unknown Farmer";
        dom.reportFarmer.innerHTML = `<strong>Farmer:</strong> ${nm || "Unknown Farmer"}`;
      }

      if (dom.reportProbability) {
        dom.reportProbability.innerHTML = `
          <strong>Probability:</strong>
          ${r.heat_probability != null ? r.heat_probability + "%" : "N/A"}
        `;
      }

      // Observed signs
      if (dom.reportSigns) {
        if (Array.isArray(r.signs) && r.signs.length) {
          dom.reportSigns.innerHTML = r.signs.map(sign => `<span class="sign-chip">${sign}</span>`).join("");
        } else {
          dom.reportSigns.innerHTML = `<span class="text-muted">No signs recorded.</span>`;
        }
      }

      // Media gallery
      if (dom.evidenceGallery) dom.evidenceGallery.innerHTML = "";
      const preview = document.getElementById("evidencePreview");
      if (preview) {
        preview.style.display = "none";
        preview.innerHTML = "";
      }

      const evidences = Array.isArray(r.evidence_url) ? r.evidence_url : (r.evidence_url ? [r.evidence_url] : []);

      if (!dom.evidenceGallery) {
        console.warn("evidenceGallery not found in DOM");
      } else if (!evidences.length) {
        dom.evidenceGallery.innerHTML = "<p class='text-muted'><em>No media evidence provided.</em></p>";
      } else {
        evidences.forEach((path, idx) => {
          if (!path) return;

          const cleanPath = path.replace(/\\/g, "/");
          const fullUrl = cleanPath.startsWith("http")
            ? cleanPath
            : cleanPath.startsWith("/uploads")
              ? `${BACKEND_URL}${cleanPath}`
              : `${BACKEND_URL}/${cleanPath.replace(/^\/+/, "")}`;

          const isVideo = /\.(mp4|mov|webm)$/i.test(fullUrl);

          const wrapper = document.createElement("div");
          wrapper.className = "dynamic-media";
          wrapper.style.cursor = "pointer";

          wrapper.innerHTML = isVideo
            ? `<video muted preload="metadata" style="width:100%; border-radius:10px;"><source src="${fullUrl}"></video><small>Tap to view</small>`
            : `<img src="${fullUrl}" alt="Evidence ${idx + 1}" onerror="this.src='https://placehold.co/400x300?text=Load+Error'"><small>Tap to view</small>`;

          wrapper.addEventListener("click", () => ui.openEvidencePanel({ url: fullUrl, isVideo }));
          dom.evidenceGallery.appendChild(wrapper);
        });
      }

      // Action buttons (kept)
      if (dom.approveBtn) dom.approveBtn.style.display = "none";
      if (dom.rejectBtn) dom.rejectBtn.style.display = "none";
      if (dom.confirmAIBtn) dom.confirmAIBtn.style.display = "none";
      if (dom.confirmPregnancyBtn) dom.confirmPregnancyBtn.style.display = "none";
      if (dom.confirmFarrowingBtn) dom.confirmFarrowingBtn.style.display = "none";
      if (dom.followUpBtn) dom.followUpBtn.style.display = "none";

      switch (r.status) {
        case "pending":
          if (dom.approveBtn) dom.approveBtn.style.display = "inline-block";
          if (dom.rejectBtn) dom.rejectBtn.style.display = "inline-block";
          break;

        case "approved":
          if (dom.confirmAIBtn) dom.confirmAIBtn.style.display = "inline-block";
          break;

        case "ai_confirmed":
        case "under_observation":
          if (dom.confirmPregnancyBtn) dom.confirmPregnancyBtn.style.display = "inline-block";
          if (dom.followUpBtn) dom.followUpBtn.style.display = "inline-block";
          break;

        case "pregnant":
        case "farrowing_ready": {
          if (!r.expected_farrowing) break;

          const today = new Date(); today.setHours(0, 0, 0, 0);
          const farrowDate = new Date(r.expected_farrowing); farrowDate.setHours(0, 0, 0, 0);

          if (today >= farrowDate && dom.confirmFarrowingBtn) {
            dom.confirmFarrowingBtn.style.display = "inline-block";
          }
          break;
        }
      }

      // show modal
      if (dom.reportDetailsModal) {
        dom.reportDetailsModal.style.display = "flex";
        document.body.style.overflow = "hidden";
      }
    } catch (err) {
      console.error(err);
      alert("Error loading report details.");
    } finally {
      // ✅ Fix: overlay always removed even on error
      ui.hideReportLoading();
    }
  }

  // ---------------- ACTION HANDLER ----------------
  async function action(endpoint, message, extraBody = {}, btnRef = null) {
    if (!state.currentReportId) return;

    try {
      if (btnRef) btnRef.disabled = true;

      const res = await fetch(`${BACKEND_URL}/api/heat/${state.currentReportId}/${endpoint}`, {
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
      ui.closeEvidencePanel();
      ui.closeReportDetails();
      loadReports();
    } catch (err) {
      alert(err.message || "Action failed");
    } finally {
      if (btnRef) btnRef.disabled = false;
    }
  }

  // ---------------- PROGRESS PANEL ----------------
  async function openProgressPanel(reportId) {
    if (!dom.progressPanel) return;

    const closeBtn = document.getElementById("closeProgressPanel");
    if (closeBtn) closeBtn.onclick = () => dom.progressPanel.classList.remove("open");

    dom.progressPanel.classList.add("open");

    try {
      let r = state.currentReportData && state.currentReportData._id === reportId
        ? state.currentReportData
        : null;

      if (!r) {
        const res = await fetch(`${BACKEND_URL}/api/heat/${reportId}/detail`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include"
        });
        const data = await res.json();
        if (!res.ok || !data.success) return;

        r = data.report;
        state.currentReportData = r;
      }

      const farmerEl = document.getElementById("progressFarmerName");
      if (farmerEl) {
        farmerEl.textContent = `Farmer: ${
          r.farmer_id ? `${r.farmer_id.first_name} ${r.farmer_id.last_name}` : "N/A"
        }`;
      }

      const swineIdEl = document.getElementById("progressSwineId");
      if (swineIdEl) swineIdEl.textContent = r.swine_id?.swine_id || "Unknown";

      const timelineContainer = document.getElementById("cycleTimeline");
      if (!timelineContainer) return;
      timelineContainer.innerHTML = "";

      const events = [];

      if (r.status === "lactating") {
        events.push({ title: "Lactating", desc: "Sow is currently nursing piglets.", icon: "bi-heart-pulse-fill", date: "Currently Active" });
      }

      if (["farrowing_ready", "lactating"].includes(r.status)) {
        events.push({
          title: "Farrowing Confirmed",
          desc: "Birth process recorded successfully.",
          icon: "bi-piggy-bank",
          date: r.actual_farrowing_date ? new Date(r.actual_farrowing_date).toLocaleDateString() : "Check Records"
        });
      }

      if (["pregnant", "farrowing_ready", "lactating"].includes(r.status)) {
        events.push({
          title: "Pregnant & Under 115 Days Monitoring",
          desc: "Pregnancy confirmed. Monitoring gestation period.",
          icon: "bi-person-hearts",
          date: r.expected_farrowing ? `Due: ${new Date(r.expected_farrowing).toLocaleDateString()}` : "Ongoing"
        });
      }

      if (["under_observation", "pregnant", "farrowing_ready", "lactating"].includes(r.status)) {
        events.push({
          title: "Under 30 Days Monitoring",
          desc: "Monitoring for 'return to heat' signs post-AI.",
          icon: "bi-eye",
          date: r.ai_date ? `Started: ${new Date(r.ai_date).toLocaleDateString()}` : "Ongoing"
        });
      }

      if (["ai_confirmed", "under_observation", "pregnant", "farrowing_ready", "lactating"].includes(r.status)) {
        events.push({
          title: "Artificial Insemination Performed",
          desc: "Farm Manager/Encoder confirmed Artificial Insemination procedure.",
          icon: "bi-droplet-half",
          date: r.ai_date ? new Date(r.ai_date).toLocaleDateString() : "Date N/A"
        });
      }

      if (r.status !== "pending" && r.status !== "rejected") {
        events.push({
          title: "Sow In Heat & Scheduled for AI",
          desc: "Report approved by Farm Manager. AI preparation started.",
          icon: "bi-calendar-check",
          date: r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : "Approved"
        });
      }

      events.push({
        title: "Report Submitted",
        desc: "Farmer submitted the heat detection report.",
        icon: "bi-file-earmark-text",
        date: r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "Pending"
      });

      events.forEach(event => {
        const stepDiv = document.createElement("div");
        stepDiv.className = "timeline-step completed";
        stepDiv.innerHTML = `
          <div class="step-icon"><i class="bi ${event.icon}"></i></div>
          <div class="step-content">
            <div class="step-header">
              <strong>${event.title}</strong>
              <span class="step-status completed">recorded</span>
            </div>
            <p class="step-desc">${event.desc}</p>
            <div class="step-meta"><span>${event.date}</span></div>
          </div>
        `;
        timelineContainer.appendChild(stepDiv);
      });

      const currentStageEl = document.getElementById("currentStage");
      if (currentStageEl) currentStageEl.textContent = (r.status || "").replace(/_/g, " ").toUpperCase();

      const remainingEl = document.getElementById("remainingDays");
      if (remainingEl) {
        remainingEl.textContent = r.expected_farrowing
          ? `${ui.getDaysLeft(r.expected_farrowing)} remaining`
          : "—";
      }
    } catch (err) {
      console.error("Error loading dynamic progress:", err);
    }
  }

  // ---------------- BUTTON WIRING (kept behavior) ----------------
  if (dom.approveBtn) dom.approveBtn.onclick = (e) => action("approve", "Report approved. AI is now scheduled.", {}, e.target);

  if (dom.rejectBtn) {
    dom.rejectBtn.onclick = () => {
      if (dom.rejectReasonInput) dom.rejectReasonInput.value = "";
      if (dom.rejectReasonModal) dom.rejectReasonModal.style.display = "flex";
    };
  }

  if (dom.confirmAIBtn) {
    dom.confirmAIBtn.onclick = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/swine/all?sex=Male&age_stage=adult`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include"
        });

        const data = await res.json();
        if (!data.success || !data.swine?.length) return alert("No adult boars found.");

        const masterBoars = data.swine.filter(b => b.swine_id?.startsWith("BOAR-") || b.farmer_id === null);
        if (!masterBoars.length) return alert("No Master Boars available.");

        if (dom.boarSelect) {
          dom.boarSelect.innerHTML = masterBoars.map(b => `<option value="${b._id}">${b.swine_id}</option>`).join("");
        }

        if (dom.aiConfirmModal) dom.aiConfirmModal.style.display = "flex";
      } catch (err) {
        console.error(err);
        alert("Failed to load boars.");
      }
    };
  }

  if (dom.submitAIBtn) {
    dom.submitAIBtn.onclick = async () => {
      const maleSwineId = dom.boarSelect?.value;
      if (!maleSwineId) return alert("Please select a boar.");

      action("confirm-ai", "AI Confirmed! Swine moved to Under Observation.", { maleSwineId });
      if (dom.aiConfirmModal) dom.aiConfirmModal.style.display = "none";
    };
  }

  if (dom.confirmRejectBtn) {
    dom.confirmRejectBtn.onclick = () => {
      const reason = dom.rejectReasonInput?.value.trim() || "";
      if (!reason) return alert("Rejection reason is required.");

      action("reject", "Report rejected successfully.", { reason });

      if (dom.rejectReasonModal) dom.rejectReasonModal.style.display = "none";
      if (dom.rejectReasonInput) dom.rejectReasonInput.value = "";
    };
  }

  if (dom.confirmPregnancyBtn) {
    dom.confirmPregnancyBtn.onclick = () => {
      if (!confirm("Confirm pregnancy for this sow?")) return;
      action("confirm-pregnancy", "Pregnancy confirmed. Expected farrowing date calculated.");
    };
  }

  if (dom.followUpBtn) {
    dom.followUpBtn.onclick = () => {
      if (!confirm("Mark cycle as failed and return sow to heat?")) return;
      action("cycle-failed", "Cycle failed. Sow returned to In-Heat status.");
    };
  }

  if (dom.confirmFarrowingBtn) {
    dom.confirmFarrowingBtn.onclick = () => {
      if (!dom.farrowingModal) return;
      dom.farrowingModal.style.display = "flex";
      document.getElementById("farrowingDateInput").valueAsDate = new Date();
    };
  }

  if (dom.farrowingForm) {
    dom.farrowingForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const submitBtn = dom.farrowingForm.querySelector('button[type="submit"]');
      if (!submitBtn || submitBtn.disabled) return;

      submitBtn.disabled = true;
      const originalText = submitBtn.innerHTML;
      submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Processing...`;

      const farrowingDateInput = document.getElementById("farrowingDateInput");
      const liveInput = document.getElementById("liveCount");
      const mortalityinput = document.getElementById("mortalityCount");

      const payload = {
        farrowing_date: farrowingDateInput?.value || null,
        total_live: Number(liveInput?.value || 0),
        mortality_born: Number(mortalityinput?.value || 0),
      };

      try {
        await action("confirm-farrowing", "Farrowing registered! Sow is now Lactating.", payload);
        if (dom.farrowingModal) dom.farrowingModal.style.display = "none";
        dom.farrowingForm.reset();
      } catch (err) {
        console.error("Farrowing registration failed:", err);
        alert("Error: " + err.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    });
  }

  return {
    loadFarmerForFilter,
    loadReports,
    renderStats,
    renderCards,
    applyFilters,
    clearFilters,
  };
}