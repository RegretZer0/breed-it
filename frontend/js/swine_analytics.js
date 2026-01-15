import { authGuard } from "./authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
    // 1. Check Authentication & Role
    const user = await authGuard(); 
    if (!user) return;

    // 2. Role-Based Dashboard Redirect
    const dashboardLink = document.getElementById("backToDashboard");
    if (dashboardLink) {
        if (user.role === "farm_manager" || user.role === "manager" || user.role === "admin") {
            dashboardLink.href = "admin_dashboard.html";
        } else if (user.role === "encoder") {
            dashboardLink.href = "encoder_dashboard.html";
        } else {
            dashboardLink.href = "farmer_dashboard.html";
        }
    }

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

            // --- ROLE-BASED OWNERSHIP FILTERING ---
            let filteredData = result.data;

            if (user.role === "farmer") {
                // Filter data so farmers only see swine they registered
                filteredData = result.data.filter(sw => 
                    sw.registered_by === user._id || 
                    sw.userId === user._id || 
                    sw.farmer_id === user._id
                );
            }
            // ---------------------------------------

            renderRanking(filteredData);
            populateDropdowns(filteredData);
            
            // Generate matches ONLY for the swine accessible to this user
            await generateCompatibilityRankings(filteredData);

        } catch (err) {
            console.error("Initialization error:", err);
            rankingTable.innerHTML = `<tr><td colspan="5" style="color:red; text-align:center;">Failed to load analytics: ${err.message}</td></tr>`;
        }
    }

    // ---------------------------------------------------------
    // GENERATE BEST PAIR RANKINGS (LEADERBOARD)
    // ---------------------------------------------------------
    async function generateCompatibilityRankings(allSwine) {
        const sows = allSwine.filter(s => s.sex === "Female").slice(0, 5);
        const boars = allSwine.filter(b => b.sex === "Male").slice(0, 5);

        // Hide leaderboard if no potential pairs exist in user's inventory
        if (sows.length === 0 || boars.length === 0) {
            matchResult.style.display = "none";
            return;
        }

        matchResult.style.display = "block";
        matchResult.innerHTML = `<p style="text-align:center; color:#666;">🔍 Identifying best matches in your inventory...</p>`;

        let pairs = [];

        // Cross-match top 5 of each sex
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

        pairs.sort((a, b) => b.score - a.score);

        // Display Top 3 Recommended Pairs
        matchResult.innerHTML = `
            <h3 style="margin-top:0; color:#2c3e50; font-size:1.1em; border-bottom:1px solid #eee; padding-bottom:10px;">🏆 Your Top Recommended Matches</h3>
            <div style="display:grid; gap:10px; margin-bottom:20px;">
                ${pairs.slice(0, 3).map((p, i) => `
                    <div style="display:flex; justify-content:space-between; align-items:center; background:#fff; padding:10px; border-radius:8px; border:1px solid #e3f2fd; border-left:4px solid #28a745;">
                        <div>
                            <span style="font-weight:bold; color:#28a745;">Match #${i+1}</span><br>
                            <small>${p.sow.swine_id} × ${p.boar.swine_id}</small>
                        </div>
                        <div style="text-align:right;">
                            <span style="font-weight:bold; font-size:1.2em;">${p.score}%</span><br>
                            <button onclick="autoSelectPair('${p.sow._id}', '${p.boar._id}')" style="font-size:0.7em; cursor:pointer; background:#eee; border:1px solid #ccc; border-radius:3px; padding:2px 5px;">Analyze</button>
                        </div>
                    </div>
                `).join('')}
            </div>
            <p style="font-size:0.8em; color:#777; font-style:italic;">Select a pair above or use the dropdowns below for custom analysis.</p>
        `;
    }

    window.autoSelectPair = (sId, bId) => {
        femaleSelect.value = sId;
        maleSelect.value = bId;
        window.calculateMatch();
    };

    function renderRanking(data) {
        if (data.length === 0) {
            rankingTable.innerHTML = `<tr><td colspan="5" style="text-align:center;">No adult swine records found in your account.</td></tr>`;
            return;
        }

        rankingTable.innerHTML = data.map((sw, index) => {
            let color = sw.qualityScore > 75 ? "#28a745" : (sw.qualityScore > 40 ? "#ffc107" : "#dc3545");
            const sexClass = sw.sex === "Female" ? "badge-female" : "badge-male";

            return `
            <tr>
                <td><strong>#${index + 1}</strong></td>
                <td>${sw.swine_id}</td>
                <td><span class="${sexClass}">${sw.sex}</span></td>
                <td>${sw.breed}</td>
                <td>
                    <div class="score-bar">
                        <div class="score-fill" style="width:${sw.qualityScore}%; background:${color};"></div>
                    </div>
                    <small>${sw.qualityScore}% Quality Index</small>
                </td>
            </tr>`;
        }).join('');
    }

    function populateDropdowns(data) {
        femaleSelect.innerHTML = '<option value="">-- Select Your Sow --</option>';
        maleSelect.innerHTML = '<option value="">-- Select Your Boar --</option>';

        data.forEach(sw => {
            const opt = document.createElement("option");
            opt.value = sw._id;
            opt.textContent = `${sw.swine_id} - ${sw.breed} (Score: ${sw.qualityScore}%)`;
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
                <hr style="margin:20px 0; border:0; border-top:1px solid #eee;">
                <small style="text-transform: uppercase; color: #777;">Detailed Pair Analysis</small>
                <h2 id="matchScore" style="color: ${scoreColor}">${data.compatibilityScore}%</h2>
                <div id="matchLogs" style="text-align: left; background: #fff; padding: 15px; border-radius: 5px; border: 1px solid #eee;">
                    ${data.analysis.map(log => `<p style="margin: 8px 0; padding-left: 10px; border-left: 3px solid #5aa9e6;">${log}</p>`).join('')}
                </div>
                ${data.compatibilityScore < 40 ? '<p class="warning" style="margin-top:15px;">⚠️ High risk pairing. Consider an alternative sire.</p>' : ''}
            `;

            if (matchResult.innerHTML.includes("Your Top Breeding Matches")) {
                const existing = matchResult.innerHTML.split('<hr')[0]; 
                matchResult.innerHTML = existing + detailHTML;
            } else {
                matchResult.innerHTML = detailHTML;
            }
            matchResult.style.display = "block";
            
        } catch (err) {
            alert("Error: " + err.message);
        }
    };

    initAnalytics();
});