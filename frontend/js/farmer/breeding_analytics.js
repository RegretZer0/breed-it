import { authGuard } from "/js/authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  const user = await authGuard();
  if (!user) return;

  const BACKEND_URL = "http://localhost:5000";
  const token = localStorage.getItem("token") || "";

  // =========================================================
  // DOM REFERENCES (EXISTING IDS - DO NOT CHANGE)
  // =========================================================
  const femaleSelect = document.getElementById("femaleSelect");
  const maleSelect = document.getElementById("maleSelect");
  const matchResult = document.getElementById("matchResult");

  // =========================================================
  // DOM REFERENCES (NEW CONTROLS - SAFE)
  // =========================================================
  const rankingCards = document.getElementById("rankingCards");
  const rankingPrevBtn = document.getElementById("rankingPrevBtn");
  const rankingNextBtn = document.getElementById("rankingNextBtn");
  const rankingPageLabel = document.getElementById("rankingPageLabel");
  const rankingSearchInput = document.getElementById("rankingSearchInput");

  const sexChipAll = document.getElementById("sexChipAll");
  const sexChipFemale = document.getElementById("sexChipFemale");
  const sexChipMale = document.getElementById("sexChipMale");

  // =========================================================
  // VIEW STATE (MVP-FRIENDLY)
  // =========================================================
  const state = {
    allData: [],
    search: "",
    sex: "all", // all | Female | Male
    page: 1,
    pageSize: 5, // limit pig cards to 5 per page
  };

  // =========================================================
  // EVENT DELEGATION: TOP MATCHES ANALYZE BUTTON
  // =========================================================
  if (matchResult) {
    matchResult.addEventListener("click", (e) => {
      const btn = e.target.closest('[data-action="analyze"]');
      if (!btn) return;

      const sowId = btn.getAttribute("data-sow-id");
      const boarId = btn.getAttribute("data-boar-id");
      if (!sowId || !boarId) return;

      if (femaleSelect) femaleSelect.value = sowId;
      if (maleSelect) maleSelect.value = boarId;

      window.calculateMatch();
    });
  }

  // =========================================================
  // MODULE: INITIAL DATA LOAD
  // =========================================================
  async function initAnalytics() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/analytics/quality-ranking`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const result = await res.json();
      if (!result.success) throw new Error(result.message || "Failed to load analytics.");

      state.allData = Array.isArray(result.data) ? result.data : [];

      populateDropdowns(state.allData);
      renderRanking();
      await generateCompatibilityRankings(state.allData);

      bindUI();
    } catch (err) {
      console.error("Initialization error:", err);

      if (rankingCards) {
        rankingCards.innerHTML = `
          <div class="empty-state text-danger">
            Failed to load analytics: ${escapeHtml(err.message)}
          </div>
        `;
      }

      if (matchResult) {
        matchResult.innerHTML = `<div class="empty-state">Unable to load recommendations.</div>`;
      }
    }
  }

  // =========================================================
  // MODULE: UI BINDINGS (SEARCH, FILTERS, PAGINATION)
  // =========================================================
  function bindUI() {
    if (rankingSearchInput) {
      rankingSearchInput.addEventListener("input", () => {
        state.search = (rankingSearchInput.value || "").trim().toLowerCase();
        state.page = 1;
        renderRanking();
      });
    }

    function setActiveChip(activeEl) {
      [sexChipAll, sexChipFemale, sexChipMale].forEach((b) => b && b.classList.remove("active"));
      if (activeEl) activeEl.classList.add("active");
    }

    if (sexChipAll) {
      sexChipAll.addEventListener("click", () => {
        state.sex = "all";
        state.page = 1;
        setActiveChip(sexChipAll);
        renderRanking();
      });
    }

    if (sexChipFemale) {
      sexChipFemale.addEventListener("click", () => {
        state.sex = "Female";
        state.page = 1;
        setActiveChip(sexChipFemale);
        renderRanking();
      });
    }

    if (sexChipMale) {
      sexChipMale.addEventListener("click", () => {
        state.sex = "Male";
        state.page = 1;
        setActiveChip(sexChipMale);
        renderRanking();
      });
    }

    if (rankingPrevBtn) {
      rankingPrevBtn.addEventListener("click", () => {
        state.page = Math.max(1, state.page - 1);
        renderRanking();
      });
    }

    if (rankingNextBtn) {
      rankingNextBtn.addEventListener("click", () => {
        state.page = state.page + 1;
        renderRanking();
      });
    }
  }

  // =========================================================
  // MODULE: FILTERING LOGIC FOR RANKINGS
  // =========================================================
  function getFilteredRankingData() {
    const base = state.allData || [];

    return base.filter((sw) => {
      const id = String(sw?.swine_id || "").toLowerCase();
      const breed = String(sw?.breed || "").toLowerCase();
      const matchSearch = !state.search || id.includes(state.search) || breed.includes(state.search);

      const matchSex = state.sex === "all" ? true : sw?.sex === state.sex;
      return matchSearch && matchSex;
    });
  }

  // =========================================================
  // MODULE: RENDER RANKINGS (1 CARD PER ROW + MORE INFO)
  // =========================================================
  function renderRanking() {
    if (!rankingCards) return;

    const filtered = getFilteredRankingData();

    if (!filtered.length) {
      rankingCards.innerHTML = `<div class="empty-state">No results found for the selected filters.</div>`;
      updatePagination(1, 1, 0);
      return;
    }

    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / state.pageSize));
    state.page = Math.min(state.page, pages);

    const start = (state.page - 1) * state.pageSize;
    const pageItems = filtered.slice(start, start + state.pageSize);

    rankingCards.innerHTML = pageItems
      .map((sw, localIndex) => {
        const overallRank = start + localIndex + 1;

        const score = clampScore(sw?.qualityScore);
        const tone = score >= 76 ? "tone-good" : score >= 41 ? "tone-warn" : "tone-bad";
        const sexClass = sw?.sex === "Female" ? "badge-female" : "badge-male";

        const metaHTML = buildSwineMeta(sw);

        const photo = String(sw?.profile_photo || "").trim();
        const photoHtml = photo
          ? `<img class="swine-avatar" src="${escapeHtml(photo)}" alt="Swine photo" loading="lazy">`
          : `<div class="swine-avatar swine-avatar-fallback" aria-hidden="true"><i class="bi bi-image"></i></div>`;

        return `
          <div class="ranking-row card border-0 shadow-sm">
            <div class="card-body p-3 p-md-4">

              <div class="d-flex align-items-start justify-content-between gap-3">
                <div class="min-w-0">

                  <div class="d-flex align-items-center gap-2 mb-2 flex-wrap">
                    <span class="rank-badge">
                      <i class="bi bi-award me-1"></i>#${overallRank}
                    </span>

                    ${photoHtml}

                    <div class="swine-id text-truncate">${escapeHtml(sw?.swine_id || "N/A")}</div>
                  </div>

                  <div class="swine-breed text-truncate">${escapeHtml(sw?.breed || "Unknown Breed")}</div>

                  ${metaHTML ? `<div class="swine-meta muted small mt-2">${metaHTML}</div>` : ""}
                </div>

                <span class="sex-badge ${sexClass}">
                  ${escapeHtml(sw?.sex || "N/A")}
                </span>
              </div>

              <div class="mt-3">
                <div class="quality-label">
                  <span class="muted">Quality Index</span>
                  <strong class="${tone}">${score}%</strong>
                </div>

                <div class="progress quality-progress" role="progressbar" aria-valuenow="${score}" aria-valuemin="0" aria-valuemax="100">
                  <div class="progress-bar ${tone}" style="width:${score}%"></div>
                </div>
              </div>

            </div>
          </div>
        `;
      })
      .join("");

    updatePagination(state.page, pages, total);
  }

  // =========================================================
  // MODULE: PAGINATION UI STATE
  // =========================================================
  function updatePagination(page, pages, total) {
    if (rankingPageLabel) rankingPageLabel.textContent = `Page ${page} of ${pages} • ${total} record(s)`;
    if (rankingPrevBtn) rankingPrevBtn.disabled = page <= 1;
    if (rankingNextBtn) rankingNextBtn.disabled = page >= pages;
  }

  // =========================================================
  // MODULE: TOP RECOMMENDED MATCHES (LIMIT TO TOP 3)
  // =========================================================
  async function generateCompatibilityRankings(allSwine) {
    if (!matchResult) return;

    const sows = (allSwine || []).filter((s) => s?.sex === "Female").slice(0, 5);
    const boars = (allSwine || []).filter((b) => b?.sex === "Male").slice(0, 5);

    if (!sows.length || !boars.length) {
      matchResult.innerHTML = `
        <div class="empty-state">
          <div class="fw-semibold mb-1">No compatible pairs found in your inventory.</div>
          <div class="muted small">Ensure you have both adult Sows and Boars registered and not culled.</div>
        </div>
      `;
      return;
    }

    matchResult.innerHTML = `<div class="loading-state">Identifying best matches...</div>`;

    const pairs = [];
    for (const sow of sows) {
      for (const boar of boars) {
        try {
          const res = await fetch(
            `${BACKEND_URL}/api/analytics/compatibility?femaleId=${encodeURIComponent(sow._id)}&maleId=${encodeURIComponent(boar._id)}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );

          const data = await res.json();
          if (data?.success) pairs.push({ sow, boar, score: clampScore(data.compatibilityScore) });
        } catch {
          // ignore individual pair failures
        }
      }
    }

    pairs.sort((a, b) => b.score - a.score);

    const top = pairs.slice(0, 3);

    if (!top.length) {
      matchResult.innerHTML = `
        <div class="empty-state">
          <div class="fw-semibold mb-1">No compatibility results available.</div>
          <div class="muted small">Try using the checker to test a custom pair.</div>
        </div>
      `;
      return;
    }

    matchResult.innerHTML = `
      <div class="match-stack">
        ${top
          .map(
            (p, i) => `
          <div class="match-item">
            <div class="d-flex align-items-center justify-content-between gap-2">
              <div class="min-w-0">
                <div class="d-flex align-items-center gap-2 flex-wrap">
                  <span class="rank-pill">Match #${i + 1}</span>
                  <div class="pair-text text-truncate">
                    ${escapeHtml(p.sow?.swine_id || "Sow")} × ${escapeHtml(p.boar?.swine_id || "Boar")}
                  </div>
                </div>
                <div class="muted small mt-1">Tap Analyze to auto-fill the checker.</div>
              </div>

              <div class="text-end">
                <div class="recommendation-score">${clampScore(p.score)}%</div>
                <button
                  type="button"
                  class="btn btn-outline-theme btn-sm py-1 px-2 small mt-1"
                  data-action="analyze"
                  data-sow-id="${String(p.sow._id)}"
                  data-boar-id="${String(p.boar._id)}">
                  <i class="bi bi-search me-1"></i>Analyze
                </button>
              </div>
            </div>
          </div>
        `
          )
          .join("")}
      </div>
    `;
  }

  // =========================================================
  // MODULE: OPTIONAL GLOBAL (IF USED ELSEWHERE)
  // =========================================================
  window.autoSelectPair = (sId, bId) => {
    if (femaleSelect) femaleSelect.value = sId;
    if (maleSelect) maleSelect.value = bId;
    window.calculateMatch();
  };

  // =========================================================
  // MODULE: DROPDOWN OPTIONS (SOW + BOAR)
  // =========================================================
  function populateDropdowns(data) {
    if (!femaleSelect || !maleSelect) return;

    femaleSelect.innerHTML = '<option value="">-- Select Your Sow --</option>';
    maleSelect.innerHTML = '<option value="">-- Select Your Boar --</option>';

    (data || []).forEach((sw) => {
      const opt = document.createElement("option");
      opt.value = sw?._id;
      opt.textContent = `${sw?.swine_id || "N/A"} - ${sw?.breed || "Unknown"} (Quality: ${clampScore(sw?.qualityScore)}%)`;

      if (sw?.sex === "Female") femaleSelect.appendChild(opt);
      else if (sw?.sex === "Male") maleSelect.appendChild(opt);
    });
  }

  // =========================================================
  // MODULE: RUN COMPATIBILITY ANALYSIS
  // =========================================================
  window.calculateMatch = async () => {
    const fId = femaleSelect?.value;
    const mId = maleSelect?.value;
    if (!fId || !mId) return alert("Please select both parents.");

    try {
      const res = await fetch(
        `${BACKEND_URL}/api/analytics/compatibility?femaleId=${encodeURIComponent(fId)}&maleId=${encodeURIComponent(mId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const data = await res.json();
      if (!data?.success) throw new Error(data?.message || "Compatibility check failed.");

      const score = clampScore(data.compatibilityScore);
      const tone = score >= 71 ? "tone-good" : score >= 40 ? "tone-warn" : "tone-bad";

      const existingDetail = document.getElementById("analysisDetail");
      if (existingDetail) existingDetail.remove();

      const detailHTML = `
        <div id="analysisDetail" class="analysis-detail mt-3">
          <div class="d-flex align-items-start justify-content-between gap-2">
            <div>
              <div class="muted small text-uppercase">Detailed Pair Analysis</div>
              <div class="match-score ${tone}">${score}%</div>
            </div>
            <span class="mini-badge mini-badge-soft">
              <i class="bi bi-clipboard-data"></i> Result
            </span>
          </div>

          <div class="analysis-logs mt-3">
            ${(data.analysis || []).map((log) => `<div class="log-line">${escapeHtml(String(log || ""))}</div>`).join("")}
          </div>

          ${
            score < 40
              ? `<div class="alert alert-danger mt-3 mb-0">High risk pairing. Not recommended for breeding.</div>`
              : ""
          }
        </div>
      `;

      matchResult?.insertAdjacentHTML("beforeend", detailHTML);
      matchResult?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      alert("Error: " + err.message);
    }
  };


// =========================================================
// MODULE: BUILD EXTRA CARD INFO (WITH LABELS AND TYPE COLORS)
// =========================================================
function buildSwineMeta(sw) {
  const items = [];

  const stage = sw?.age_stage;
  const status = sw?.current_status;
  const health = sw?.health_status;

  const lp = sw?.latest_performance || {};
  const w = lp?.weight;
  const bl = lp?.body_length;
  const hg = lp?.heart_girth;

  const ageTxt = formatAge(sw?.birth_date || sw?.date_registered || sw?.createdAt);

  // Helper: only push when value is meaningful
  function pushItem(type, label, value) {
    const v = String(value ?? "").trim();
    if (!v || v === "0" || v === "0 kg" || v === "0 cm") return;

    const safeType = String(type || "").trim().toLowerCase();
    items.push(
      `<span class="meta-item ${escapeHtml(safeType)}"><span class="meta-label">${escapeHtml(label)}:</span> <span class="meta-value">${escapeHtml(v)}</span></span>`
    );
  }

  // Core info
  if (stage) pushItem("stage", "Stage", stage);
  if (status) pushItem("status", "Status", status);
  if (health) pushItem("health", "Health", health);
  if (ageTxt) pushItem("age", "Age", ageTxt);

  // Measurements (latest)
  if (isNum(w)) pushItem("weight", "Weight", `${Number(w)} kg`);
  if (isNum(bl)) pushItem("length", "Length", `${Number(bl)} cm`);
  if (isNum(hg)) pushItem("girth", "Girth", `${Number(hg)} cm`);

  return items.join("");
}

// =========================================================
// MODULE: AGE FORMATTER
// =========================================================
function formatAge(dateVal) {
  if (!dateVal) return "";
  const d = new Date(dateVal);
  if (Number.isNaN(d.getTime())) return "";

  const now = new Date();
  const days = Math.floor((now - d) / (1000 * 60 * 60 * 24));
  if (days < 31) return `${days} days`;

  let months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (months < 12) return `${months} months`;

  const years = Math.floor(months / 12);
  months = months % 12;
  return months ? `${years} yrs ${months} mos` : `${years} yrs`;
}

// =========================================================
// MODULE: NUMBER CHECK
// =========================================================
function isNum(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
}

    function isNum(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0;
    }

    function formatAge(dateVal) {
    if (!dateVal) return "";
    const d = new Date(dateVal);
    if (Number.isNaN(d.getTime())) return "";

    const now = new Date();
    let months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
    const days = Math.floor((now - d) / (1000 * 60 * 60 * 24));

    if (days < 31) return `${days}d old`;
    if (months < 12) return `${months}mo old`;
    const years = Math.floor(months / 12);
    months = months % 12;
    return months ? `${years}y ${months}mo old` : `${years}y old`;
    }

  // =========================================================
  // MODULE: UTILITIES
  // =========================================================
  function clampScore(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  initAnalytics();
});