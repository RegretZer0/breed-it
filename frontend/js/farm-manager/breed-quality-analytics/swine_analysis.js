import { authGuard } from "/js/authGuard.js";

    document.addEventListener("DOMContentLoaded", async () => {
    const user = await authGuard();
    if (!user) return;

    const BACKEND_URL = "http://localhost:5000";
    const token = localStorage.getItem("token");

    const rankingGrid = document.getElementById("rankingGrid");
    const rankingSearch = document.getElementById("rankingSearch");
    const recommendationsList = document.getElementById("recommendationsList");

    const femaleSelect = document.getElementById("femaleSelect");
    const maleSelect = document.getElementById("maleSelect");
    const matchPanel = document.getElementById("matchPanel");
    const calcBtn = document.getElementById("calcBtn");

    let cachedAnalytics = [];

    const rankPrevBtn = document.getElementById("rankPrevBtn");
    const rankNextBtn = document.getElementById("rankNextBtn");
    const rankPageLabel = document.getElementById("rankPageLabel");

    const RANKS_PER_PAGE = 5;
    let rankPage = 1;
    let filteredRanking = [];
    let activeSex = "all";


  async function initAnalytics() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/analytics/quality-ranking`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.message);

      cachedAnalytics = result.data || [];

      filteredRanking = [...cachedAnalytics];
        rankPage = 1;
        applyRankingFilters();


      populateDropdowns(cachedAnalytics);
      await generateCompatibilityRankings(cachedAnalytics);

    } catch (err) {
      console.error("Initialization error:", err);
      if (rankingGrid) {
        rankingGrid.innerHTML = `
          <div class="state-box">
            <i class="bi bi-exclamation-triangle" style="font-size:22px; color:#dc3545;"></i>
            <div style="font-weight:900;">Failed to load analytics</div>
            <div class="muted">${err.message}</div>
          </div>
        `;
      }
      if (recommendationsList) {
        recommendationsList.innerHTML = `
          <div class="state-box compact">
            <i class="bi bi-exclamation-triangle" style="font-size:18px; color:#dc3545;"></i>
            <div class="muted">Unable to generate recommendations.</div>
          </div>
        `;
      }
    }
  }

  function scoreColor(score) {
    if (score > 75) return "#28a745";
    if (score > 40) return "#ffc107";
    return "#dc3545";
  }

  function clampPage() {
    const totalPages = Math.max(1, Math.ceil(filteredRanking.length / RANKS_PER_PAGE));
    if (rankPage > totalPages) rankPage = totalPages;
    if (rankPage < 1) rankPage = 1;
    return totalPages;
    }

    function updateRankPager(totalPages) {
    if (!rankPageLabel || !rankPrevBtn || !rankNextBtn) return;

    rankPageLabel.textContent = `Page ${rankPage} of ${totalPages}`;
    rankPrevBtn.disabled = rankPage <= 1;
    rankNextBtn.disabled = rankPage >= totalPages;
    }

    function renderRankingPage() {
    const totalPages = clampPage();
    const start = (rankPage - 1) * RANKS_PER_PAGE;
    const pageData = filteredRanking.slice(start, start + RANKS_PER_PAGE);

    renderRanking(pageData, start); // pass start offset for correct rank number
    updateRankPager(totalPages);
    }


    function renderRanking(data, offset = 0) {
        if (!rankingGrid) return;

        if (!data || data.length === 0) {
            rankingGrid.innerHTML = `
            <div class="state-box">
                <i class="bi bi-inbox" style="font-size:22px; color:#6c757d;"></i>
                <div style="font-weight:900;">No adult swine records available</div>
                <div class="muted">Add adult sows/boars to enable breed quality ranking.</div>
            </div>
            `;
            return;
        }

        rankingGrid.innerHTML = data.map((sw, index) => {
            const color = scoreColor(sw.qualityScore);
            const sexClass = sw.sex === "Female" ? "badge-female" : "badge-male";

            return `
            <div class="rank-card"
                data-search="${(sw.swine_id || "").toLowerCase()}">
                <div class="rank-top">
                <div class="rank-pill">
                    <i class="bi bi-trophy"></i>
                    #${offset + index + 1}
                </div>

                <div class="rank-meta">
                    <span class="badge ${sexClass}">
                    <i class="bi ${sw.sex === "Female" ? "bi-gender-female" : "bi-gender-male"}"></i>
                    ${sw.sex}
                    </span>
                </div>
                </div>

                <div class="rank-main">
                <p class="swine-id">${sw.swine_id || "—"}</p>
                </div>

                <div class="q-wrap">
                <div class="q-row">
                    <div class="q-label">Quality Index</div>
                    <div class="q-val">${sw.qualityScore ?? 0}%</div>
                </div>
                <div class="q-bar">
                    <div class="q-fill" style="width:${sw.qualityScore ?? 0}%; background:${color};"></div>
                </div>
                </div>
            </div>
            `;
        }).join("");
    }

    function applyRankingFilters() {
    const q = (rankingSearch?.value || "").trim().toLowerCase();

    filteredRanking = cachedAnalytics.filter(sw => {
        const matchesSearch = (sw.swine_id || "").toLowerCase().includes(q);
        const matchesSex = activeSex === "all" ? true : sw.sex === activeSex;
        return matchesSearch && matchesSex;
    });

    rankPage = 1;
    renderRankingPage();
    }


  function populateDropdowns(data) {
    if (!femaleSelect || !maleSelect) return;

    femaleSelect.innerHTML = '<option value="">-- Select Your Sow --</option>';
    maleSelect.innerHTML = '<option value="">-- Select Your Boar --</option>';

    data.forEach(sw => {
      const opt = document.createElement("option");
      opt.value = sw._id;
      opt.textContent = `${sw.swine_id} (Quality: ${sw.qualityScore}%)`;
      if (sw.sex === "Female") femaleSelect.appendChild(opt);
      else maleSelect.appendChild(opt);
    });
  }

  async function generateCompatibilityRankings(allSwine) {
    if (!recommendationsList) return;

    const sows = allSwine.filter(s => s.sex === "Female").slice(0, 5);
    const boars = allSwine.filter(b => b.sex === "Male").slice(0, 5);

    if (sows.length === 0 || boars.length === 0) {
      recommendationsList.innerHTML = `
        <div class="state-box compact">
          <i class="bi bi-info-circle" style="font-size:18px; color:#6c757d;"></i>
          <div style="font-weight:900;">No recommended pairs yet</div>
          <div class="muted">Ensure you have adult sows and boars registered and not culled.</div>
        </div>
      `;
      return;
    }

    recommendationsList.innerHTML = `
      <div class="state-box compact">
        <div class="spinner"></div>
        <div class="muted">Identifying best matches…</div>
      </div>
    `;

    let pairs = [];

    for (let sow of sows) {
      for (let boar of boars) {
        try {
          const res = await fetch(
            `${BACKEND_URL}/api/analytics/compatibility?femaleId=${sow._id}&maleId=${boar._id}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          const data = await res.json();
          if (data.success) pairs.push({ sow, boar, score: data.compatibilityScore });
        } catch (e) {}
      }
    }

    pairs.sort((a, b) => b.score - a.score);

    if (pairs.length === 0) {
      recommendationsList.innerHTML = `
        <div class="state-box compact">
          <i class="bi bi-info-circle" style="font-size:18px; color:#6c757d;"></i>
          <div class="muted">No compatibility results returned.</div>
        </div>
      `;
      return;
    }

    recommendationsList.innerHTML = pairs.slice(0, 3).map((p, i) => {
      const c = scoreColor(p.score);
      return `
        <div class="match-card">
          <div class="match-left">
            <p class="match-name">
              <i class="bi bi-stars"></i>
              Match #${i + 1}
            </p>
            <div class="match-sub">${p.sow.swine_id} × ${p.boar.swine_id}</div>
          </div>

          <div class="match-right">
            <div class="match-score" style="color:${c};">${p.score}%</div>
            <button class="btn-mini" type="button"
              data-sow="${p.sow._id}" data-boar="${p.boar._id}">
              <i class="bi bi-activity"></i> Analyze
            </button>
          </div>
        </div>
      `;
    }).join("");

    // wire buttons
    recommendationsList.querySelectorAll(".btn-mini").forEach(btn => {
      btn.addEventListener("click", () => {
        femaleSelect.value = btn.dataset.sow;
        maleSelect.value = btn.dataset.boar;
        calculateMatch();
      });
    });
  }

  async function calculateMatch() {
    const fId = femaleSelect.value;
    const mId = maleSelect.value;

    if (!fId || !mId) {
      alert("Please select both parents.");
      return;
    }

    try {
      const res = await fetch(
        `${BACKEND_URL}/api/analytics/compatibility?femaleId=${fId}&maleId=${mId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      const c = scoreColor(data.compatibilityScore);

      matchPanel.innerHTML = `
        <div class="match-panel-head">
          <h5 class="match-panel-title">
            <i class="bi bi-clipboard-data"></i>
            Detailed Pair Analysis
          </h5>

          <div style="text-align:right;">
            <div class="muted" style="text-transform:uppercase; font-size:0.75rem; font-weight:900;">
              Estimated Match Score
            </div>
            <div class="score-big" style="color:${c};">${data.compatibilityScore}%</div>
          </div>
        </div>

        <div class="log-list">
          ${(data.analysis || []).map(log => `
            <div class="log-item">
              <i class="bi bi-check-circle"></i>
              <div>${log}</div>
            </div>
          `).join("")}
        </div>

        ${data.compatibilityScore < 40 ? `
          <div class="warning-box">
            <i class="bi bi-exclamation-triangle"></i>
            <div>High risk pairing. Not recommended for breeding.</div>
          </div>
        ` : ""}
      `;

      matchPanel.style.display = "block";
      matchPanel.scrollIntoView({ behavior: "smooth", block: "start" });

    } catch (err) {
      alert("Error: " + err.message);
    }
  }

    // button
    if (calcBtn) calcBtn.addEventListener("click", calculateMatch);

    // search filter (MVP)
    if (rankingSearch) {
    rankingSearch.addEventListener("input", applyRankingFilters);
    }

    // Sex filter chips (All / Sows / Boars)
    document.querySelectorAll(".rank-filter").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".rank-filter").forEach(b => {
            b.classList.remove("active");
            b.setAttribute("aria-pressed", "false");
            });

            btn.classList.add("active");
            btn.setAttribute("aria-pressed", "true");

            activeSex = btn.dataset.sex || "all";
            applyRankingFilters();
        });
    });

    if (rankPrevBtn) {
        rankPrevBtn.addEventListener("click", () => {
            rankPage--;
            renderRankingPage();
        });
    }

    if (rankNextBtn) {
        rankNextBtn.addEventListener("click", () => {
            rankPage++;
            renderRankingPage();
        });
    }



  initAnalytics();
});
