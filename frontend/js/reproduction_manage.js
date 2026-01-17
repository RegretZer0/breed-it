import { authGuard } from "./authGuard.js";
import { PerformanceHelper } from "./performance_helper.js"; // Integrated the updated helper

document.addEventListener("DOMContentLoaded", async () => {
    // 1. Authenticate and Role Check
    const user = await authGuard();
    if (!user) return;

    // --- ROLE-BASED NAVIGATION LOGIC ---
    const backLink = document.querySelector(".back-link");
    if (backLink && user.role) {
        const role = user.role.toLowerCase();
        let targetDashboard = "admin_dashboard.html"; 

        if (role === "farmer") {
            targetDashboard = "farmer_dashboard.html";
        } else if (role === "encoder") {
            targetDashboard = "encoder_dashboard.html";
        } else if (role === "farm_manager" || role === "admin") {
            targetDashboard = "admin_dashboard.html";
        }

        backLink.setAttribute("href", targetDashboard);
    }

    const BACKEND_URL = "http://localhost:5000";
    const token = localStorage.getItem("token");

    // Local State for Filtering
    let rawAiData = [];
    let rawPerformanceData = { morphology: [], deformities: [] };
    let rawSelectionData = [];

    /**
     * Helper to resolve Farmer Names
     */
    const resolveFarmerName = (item) => {
        if (item.farmer_name) return item.farmer_name;
        if (item.farmer_id && typeof item.farmer_id === 'object') {
            const firstName = item.farmer_id.first_name || '';
            const lastName = item.farmer_id.last_name || '';
            return `${firstName} ${lastName}`.trim() || "Unknown Farmer";
        }
        return "Not Assigned";
    };

    // ---------------------------------------------------------
    // SEARCH LOGIC
    // ---------------------------------------------------------
    const searchInput = document.getElementById("reproductionSearch");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            const term = e.target.value.toLowerCase();
            renderAllTables(term);
        });
    }

    function renderAllTables(filterTerm = "") {
        renderAIRecords(filterTerm);
        renderPerformanceAnalytics(filterTerm);
        renderSelectionProcess(filterTerm);
    }

    // ---------------------------------------------------------
    // 1. AI RECORDS
    // ---------------------------------------------------------
    async function loadAIRecords() {
        try {
            const res = await fetch(`${BACKEND_URL}/api/reproduction/ai-history`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await res.json();
            if (result.success) {
                rawAiData = result.data.sort((a, b) => 
                    resolveFarmerName(a).localeCompare(resolveFarmerName(b))
                );
                renderAIRecords();
            }
        } catch (err) { console.error("AI Load Error:", err); }
    }

    function renderAIRecords(term = "") {
        const tableBody = document.getElementById("aiTableBody");
        if (!tableBody) return;

        const filtered = rawAiData.filter(r => 
            resolveFarmerName(r).toLowerCase().includes(term) || 
            r.sow_tag.toLowerCase().includes(term) ||
            r.boar_tag.toLowerCase().includes(term)
        );

        tableBody.innerHTML = filtered.length > 0 ? filtered.map(record => `
            <tr>
                <td><strong>${resolveFarmerName(record)}</strong></td>
                <td><span class="badge-tag">${record.sow_tag}</span></td>
                <td><span class="badge-tag">${record.boar_tag}</span></td>
                <td>${new Date(record.date).toLocaleDateString()}</td>
            </tr>
        `).join('') : '<tr><td colspan="4" style="text-align:center; padding: 20px;">No matching records.</td></tr>';
    }

    // ---------------------------------------------------------
    // 2. PERFORMANCE & DEFORMITIES
    // ---------------------------------------------------------
    async function loadPerformanceAnalytics() {
        try {
            const res = await fetch(`${BACKEND_URL}/api/reproduction/performance-analytics`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await res.json();
            if (result.success) {
                rawPerformanceData.morphology = result.morphology.sort((a, b) => 
                    resolveFarmerName(a).localeCompare(resolveFarmerName(b))
                );
                rawPerformanceData.deformities = result.deformities.sort((a, b) => 
                    resolveFarmerName(a).localeCompare(resolveFarmerName(b))
                );
                renderPerformanceAnalytics();
            }
        } catch (err) { console.error("Performance Load Error:", err); }
    }

    function renderPerformanceAnalytics(term = "") {
        const morphBody = document.getElementById("morphTableBody");
        const deformityContainer = document.getElementById("deformityList");

        if (morphBody) {
            const filteredMorph = rawPerformanceData.morphology.filter(m => 
                resolveFarmerName(m).toLowerCase().includes(term) || 
                m.swine_tag.toLowerCase().includes(term)
            );

            morphBody.innerHTML = filteredMorph.length > 0 ? filteredMorph.map(item => {
                const isFemale = item.swine_sex === "Female";
                const teatCount = item.morphology.teat_count;
                
                const swineObj = {
                    swine_id: item.swine_tag,
                    sex: item.swine_sex,
                    current_status: item.morphology.stage, 
                    performance_records: [{
                        weight: item.morphology.weight,
                        stage: item.morphology.stage,
                        deformities: [] 
                    }]
                };
                
                const suggestion = PerformanceHelper.getSelectionStatus(swineObj, rawPerformanceData.deformities);
                
                const teatDisplay = (!isFemale || teatCount === null) ? 
                    `<span style="color: #bbb;">N/A</span>` : `<b style="color: #2e7d32;">${teatCount}</b>`;

                return `
                <tr>
                    <td>${resolveFarmerName(item)}</td>
                    <td><strong>${item.swine_tag}</strong></td>
                    <td style="font-weight: bold; color: ${isFemale ? '#d81b60' : '#1976d2'};">${item.swine_sex}</td>
                    <td><small>${item.morphology.stage}</small><br>
                        <span style="font-size:0.75rem; padding:2px 4px; border-radius:3px; background:${suggestion.bg || '#f5f5f5'}; color:${suggestion.color}; font-weight:bold;">
                            ${suggestion.suggestion}
                        </span>
                    </td>
                    <td><div style="font-size: 0.9em;">⚖️ ${item.morphology.weight}kg | 📏 ${item.morphology.body_length}cm | 🍼 ${teatDisplay}</div></td>
                    <td><small>${item.morphology.teeth}</small></td>
                    <td>${new Date(item.morphology.date).toLocaleDateString()}</td>
                </tr>`;
            }).join('') : '<tr><td colspan="7" style="text-align:center; padding: 20px;">No matching data.</td></tr>';
        }

        if (deformityContainer) {
            const filteredDef = rawPerformanceData.deformities.filter(d => 
                resolveFarmerName(d).toLowerCase().includes(term) || 
                d.swine_tag.toLowerCase().includes(term)
            );

            if (filteredDef.length === 0) {
                deformityContainer.innerHTML = `<div style="text-align:center; padding:20px; color:#2e7d32; background:#e8f5e9; border-radius:8px;">✅ No issues found.</div>`;
            } else {
                deformityContainer.innerHTML = filteredDef.map(item => `
                    <div class="deformity-item" style="border-left: 5px solid #d32f2f; padding: 15px; margin-bottom: 12px; background: #fff5f5; border-radius: 4px;">
                        <strong>Owner:</strong> ${resolveFarmerName(item)} | <strong>Tag:</strong> <span class="badge-tag">${item.swine_tag}</span> <br>
                        <strong>Issues:</strong> <span style="color: #d32f2f; font-weight:700;">${item.deformity_types}</span> <br>
                        <small>Logged: ${new Date(item.date_detected).toLocaleDateString()}</small>
                    </div>
                `).join('');
            }
        }
    }

    // ---------------------------------------------------------
    // 3. SELECTION PROCESS (FINAL STAGE ACTION)
    // ---------------------------------------------------------
    async function loadSelectionProcess() {
        try {
            const res = await fetch(`${BACKEND_URL}/api/reproduction/selection-candidates`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await res.json();
            if (result.success) {
                rawSelectionData = result.data.sort((a, b) => 
                    resolveFarmerName(a).localeCompare(resolveFarmerName(b))
                );
                renderSelectionProcess();
            }
        } catch (err) { console.error("Selection Load Error:", err); }
    }

    function renderSelectionProcess(term = "") {
        const selectionBody = document.getElementById("selectionTableBody");
        if (!selectionBody) return;

        // UPDATED: Filter to only show swines in "Final Selection" or "adult" stage
        const filtered = rawSelectionData.filter(s => {
            const matchesSearch = resolveFarmerName(s).toLowerCase().includes(term) || 
                                  s.swine_tag.toLowerCase().includes(term);
            const isFinalStage = s.current_stage === "Final Selection" || s.current_stage === "adult";
            
            return matchesSearch && isFinalStage;
        });

        selectionBody.innerHTML = filtered.length > 0 ? filtered.map(c => {
            const morph = rawPerformanceData.morphology.find(m => m.swine_tag === c.swine_tag);
            const weight = morph ? morph.morphology.weight : 0;

            const swineObj = { 
                swine_id: c.swine_tag, 
                sex: c.swine_sex || "Female", 
                current_status: c.current_stage,
                performance_records: [{ weight: weight, stage: c.current_stage }] 
            }; 
            
            const result = PerformanceHelper.getSelectionStatus(swineObj, rawPerformanceData.deformities);
            
            return `
            <tr>
                <td><strong>${c.swine_tag}</strong></td>
                <td>${resolveFarmerName(c)}</td>
                <td><span class="stage-label" style="background: #e3f2fd; color: #1976d2; padding: 2px 6px; border-radius: 4px;">${c.current_stage}</span></td>
                <td>
                    <span class="status-badge" style="padding: 4px 8px; border-radius: 4px; font-size: 0.85em; font-weight: bold; background: ${result.bg}; color: ${result.color};">
                        ${result.suggestion}
                    </span>
                    <br><small style="color: #666;">${result.reason}</small>
                    ${weight > 0 ? `<br><small style="color: #333; font-weight:bold;">⚖️ Last Weight: ${weight}kg</small>` : ''}
                </td>
                <td style="white-space: nowrap;">
                    <button class="action-btn" onclick="processSelection('${c.id || c._id}', true)" style="background:#2e7d32; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">Retain</button>
                    <button class="action-btn btn-danger" onclick="processSelection('${c.id || c._id}', false)" style="background:#d32f2f; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; margin-left:5px;">Cull</button>
                </td>
            </tr>`;
        }).join('') : '<tr><td colspan="5" style="text-align:center; padding: 20px;">No candidates ready for Final Selection.</td></tr>';
    }

    // Initial Data Fetch
    await Promise.all([loadAIRecords(), loadPerformanceAnalytics(), loadSelectionProcess()]);
});

/**
 * Handle Approval (Retain) or Culling
 */
window.processSelection = async (swineId, isApproved) => {
    const actionText = isApproved ? 'RETAIN this swine for breeding' : 'CULL this swine for market/sale';
    if (!confirm(`Confirm Action: Are you sure you want to ${actionText}?`)) return;

    try {
        const token = localStorage.getItem("token");
        const res = await fetch(`http://localhost:5000/api/reproduction/process-selection`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
            body: JSON.stringify({ swineId, isApproved })
        });
        
        const data = await res.json();
        if (data.success) {
            alert(data.message);
            location.reload(); 
        } else {
            alert("Error: " + data.message);
        }
    } catch (err) { alert("Network error. Please try again."); }
};