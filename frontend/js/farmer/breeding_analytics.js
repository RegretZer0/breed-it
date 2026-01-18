import { authGuard } from "/js/authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
    // 1. Check Authentication & Role
    const user = await authGuard(); 
    if (!user) return;

    // 2. Role-Based Dashboard Redirect
    const BACKEND_URL = "http://localhost:5000";
    const token = localStorage.getItem("token");

    const rankingTable = document.getElementById("rankingTable");
    const femaleSelect = document.getElementById("femaleSelect");
    const maleSelect = document.getElementById("maleSelect");
    const matchResult = document.getElementById("matchResult");

    // ---------------------------------------------------------
    // LOAD RANKINGS & GENERATE TOP PAIRS
    // ---------------------------------------------------------
    async function initAnalytics() {
        try {
            const res = await fetch(`${BACKEND_URL}/api/analytics/quality-ranking`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await res.json();

            if (!result.success) throw new Error(result.message);

            /**
             * NOTE: Filtering is now handled by the Backend for security.
             * 'result.data' already contains only the swine this user is allowed to see.
             */
            const analyticsData = result.data;

            renderRanking(analyticsData);
            populateDropdowns(analyticsData);
            
            // Generate matches for the accessible swine
            await generateCompatibilityRankings(analyticsData);

        } catch (err) {
            console.error("Initialization error:", err);
            if (rankingTable) {
                rankingTable.innerHTML = `<tr><td colspan="5" style="color:red; text-align:center;">Failed to load analytics: ${err.message}</td></tr>`;
            }
        }
    }

    // ---------------------------------------------------------
    // GENERATE BEST PAIR RANKINGS (LEADERBOARD)
    // ---------------------------------------------------------
    async function generateCompatibilityRankings(allSwine) {
        // Use the top 5 highest quality sows and boars to find the best match
        const sows = allSwine.filter(s => s.sex === "Female").slice(0, 5);
        const boars = allSwine.filter(b => b.sex === "Male").slice(0, 5);

        if (sows.length === 0 || boars.length === 0) {
            if (matchResult) {
                matchResult.style.display = "block";
                matchResult.innerHTML = `<p style="text-align:center; color:#666; padding: 20px;">
                    No compatible pairs found in your inventory.<br>
                    <small>Ensure you have both adult Sows and Boars registered and not culled.</small>
                </p>`;
            }
            return;
        }

        matchResult.style.display = "block";
        matchResult.innerHTML = `<p style="text-align:center; color:#666;">🔍 Identifying best matches in your inventory...</p>`;

        let pairs = [];

        // Cross-match selected top swine
        for (let sow of sows) {
            for (let boar of boars) {
                try {
                    const res = await fetch(`${BACKEND_URL}/api/analytics/compatibility?femaleId=${sow._id}&maleId=${boar._id}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const data = await res.json();
                    if (data.success) {
                        pairs.push({ sow, boar, score: data.compatibilityScore });
                    }
                } catch (e) { continue; }
            }
        }

        // Sort pairs by highest compatibility score
        pairs.sort((a, b) => b.score - a.score);

        matchResult.innerHTML = `
            <h3 style="margin-top:0; color:#2c3e50; font-size:1.1em; border-bottom:1px solid #eee; padding-bottom:10px;">🏆 Top Recommended Matches</h3>
            <div style="display:grid; gap:10px; margin-bottom:20px;">
                ${pairs.slice(0, 3).map((p, i) => `
                    <div style="display:flex; justify-content:space-between; align-items:center; background:#fff; padding:10px; border-radius:8px; border:1px solid #e3f2fd; border-left:4px solid #28a745;">
                        <div>
                            <span style="font-weight:bold; color:#28a745;">Match #${i+1}</span><br>
                            <small>${p.sow.swine_id} × ${p.boar.swine_id}</small>
                        </div>
                        <div style="text-align:right;">
                        <span class="recommendation-score">${p.score}%</span><br>
                        <button
                            class="btn-analyze"
                            onclick="autoSelectPair('${p.sow._id}', '${p.boar._id}')">
                            🔍 Analyze
                        </button>
                        </div>
                    </div>
                `).join('')}
            </div>
            <p style="font-size:0.8em; color:#777; font-style:italic;">Select a pair above or use the dropdowns below for custom analysis.</p>
        `;
    }

    // Exposed to global scope for the 'Analyze' buttons in the match list
    window.autoSelectPair = (sId, bId) => {
        femaleSelect.value = sId;
        maleSelect.value = bId;
        window.calculateMatch();
    };

    function renderRanking(data) {
        if (!rankingTable) return;
        if (data.length === 0) {
            rankingTable.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 20px;">No adult swine records available for analysis.</td></tr>`;
            return;
        }

        rankingTable.innerHTML = data.map((sw, index) => {
            let color = sw.qualityScore > 75 ? "#28a745" : (sw.qualityScore > 40 ? "#ffc107" : "#dc3545");
            const sexClass = sw.sex === "Female" ? "badge-female" : "badge-male";

            return `
            <tr>
                <td><strong>#${index + 1}</strong></td>
                <td>${sw.swine_id}</td>
                <td><span class="badge ${sexClass}">${sw.sex}</span></td>
                <td>${sw.breed}</td>
                <td>
                    <div class="score-bar" style="background:#eee; height:10px; border-radius:5px; width:100px; overflow:hidden;">
                        <div class="score-fill" style="width:${sw.qualityScore}%; background:${color}; height:100%;"></div>
                    </div>
                    <small>${sw.qualityScore}% Quality Index</small>
                </td>
            </tr>`;
        }).join('');
    }

    function populateDropdowns(data) {
        if (!femaleSelect || !maleSelect) return;
        femaleSelect.innerHTML = '<option value="">-- Select Your Sow --</option>';
        maleSelect.innerHTML = '<option value="">-- Select Your Boar --</option>';

        data.forEach(sw => {
            const opt = document.createElement("option");
            opt.value = sw._id;
            opt.textContent = `${sw.swine_id} - ${sw.breed} (Quality: ${sw.qualityScore}%)`;
            if (sw.sex === "Female") femaleSelect.appendChild(opt);
            else maleSelect.appendChild(opt);
        });
    }

    window.calculateMatch = async () => {
        const fId = femaleSelect.value;
        const mId = maleSelect.value;
        if (!fId || !mId) return alert("Please select both parents.");

        try {
            const res = await fetch(`${BACKEND_URL}/api/analytics/compatibility?femaleId=${fId}&maleId=${mId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.message);

            let scoreColor = data.compatibilityScore > 70 ? "#28a745" : "#dc3545";
            
            const detailHTML = `
                <div id="analysisDetail">
                    <hr style="margin:20px 0; border:0; border-top:1px solid #eee;">
                    <small style="text-transform: uppercase; color: #777;">Detailed Pair Analysis</small>
                    <h2 id="matchScore" style="color: ${scoreColor}">${data.compatibilityScore}%</h2>
                    <div id="matchLogs" style="text-align: left; background: #f9f9f9; padding: 15px; border-radius: 5px; border: 1px solid #eee;">
                        ${data.analysis.map(log => `<p style="margin: 8px 0; padding-left: 10px; border-left: 3px solid #5aa9e6;">${log}</p>`).join('')}
                    </div>
                    ${data.compatibilityScore < 40 ? '<p class="warning" style="margin-top:15px; color:red; font-weight:bold;">⚠️ High risk pairing. Not recommended for breeding.</p>' : ''}
                </div>
            `;

            // If the Top Recommended Matches list is present, append detail. Otherwise, replace.
            const existingDetail = document.getElementById("analysisDetail");
            if (existingDetail) existingDetail.remove();
            
            matchResult.insertAdjacentHTML('beforeend', detailHTML);
            matchResult.style.display = "block";
            
        } catch (err) {
            alert("Error: " + err.message);
        }
    };

    initAnalytics();
});