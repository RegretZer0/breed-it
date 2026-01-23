import { authGuard } from "/js/authGuard.js";
import { PerformanceHelper } from "/js/performance_helper.js";

document.addEventListener("DOMContentLoaded", async () => {
    // 1. Authenticate and Role Check
    const user = await authGuard();
    if (!user) return;

    const BACKEND_URL = "http://localhost:5000";
    const token = localStorage.getItem("token");

    // Local State
    let rawAiData = [];
    let rawPerformanceData = { morphology: [], deformities: [] };
    let rawSelectionData = [];
    let allSwineData = []; 
    let activeFilters = {search: "", stage: "", sex: ""};

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

    /**
     * OWNERSHIP FILTER: Ensures Farm Managers only see farmers they registered.
     */
    const isOwner = (item) => {
        if (user.role.toLowerCase() === "farm-manager") {
            const farmerObj = item.farmer_id;
            if (!farmerObj) return false;
            const managerRef = farmerObj.registered_by || farmerObj.created_by || farmerObj.manager_id;
            return managerRef === user.id || managerRef === user._id;
        }
        if (user.role.toLowerCase() === "farmer") {
            const farmerId = item.farmer_id?._id || item.farmer_id;
            return farmerId === user.farmerProfileId;
        }
        return true; // Default for Admin
    };

    // ---------------------------------------------------------
    // DRILL-DOWN SELECTORS
    // ---------------------------------------------------------
    const farmerSelect = document.getElementById("farmerSelect");
    const pigletSelect = document.getElementById("pigletSelect");

    function populateFarmerDropdown() {
        if (!farmerSelect) return;
        const filteredData = rawPerformanceData.morphology.filter(isOwner);
        const uniqueFarmers = [...new Set(filteredData.map(m => resolveFarmerName(m)))].sort();
        
        farmerSelect.innerHTML = '<option value="">-- Choose a Farmer --</option>' + 
            uniqueFarmers.map(f => `<option value="${f}">${f}</option>`).join("");
    }

    farmerSelect?.addEventListener("change", (e) => {
        const selectedFarmer = e.target.value;
        if (!pigletSelect) return;

        if (!selectedFarmer) {
            pigletSelect.innerHTML = '<option value="">-- Select Farmer First --</option>';
            renderPerformanceAnalytics(""); 
            return;
        }

        const seenTags = new Set();
        const uniquePiglets = [];

        rawPerformanceData.morphology.forEach(m => {
            const stage = (m.morphology.stage || "").toLowerCase();
            const isPiglet = stage.includes("day 1-30") || stage.includes("weaning");
            const farmerName = resolveFarmerName(m);

            if (farmerName === selectedFarmer && isPiglet && isOwner(m)) {
                if (!seenTags.has(m.swine_tag)) {
                    seenTags.add(m.swine_tag);
                    uniquePiglets.push(m);
                }
            }
        });

        uniquePiglets.sort((a, b) => a.swine_tag.localeCompare(b.swine_tag));
        pigletSelect.innerHTML = '<option value="">-- Choose a Piglet --</option>' + 
            uniquePiglets.map(p => `<option value="${p.swine_tag}">${p.swine_tag} (${p.swine_sex})</option>`).join("");
        
        renderPerformanceAnalytics(""); 
    });

    pigletSelect?.addEventListener("change", (e) => {
        renderPerformanceAnalytics(e.target.value);
    });

    // ---------------------------------------------------------
    // SEARCH & FILTER LOGIC
    // ---------------------------------------------------------
    const filterSearch = document.getElementById("filterSearch");
    const filterStage  = document.getElementById("filterStage");
    const filterSex    = document.getElementById("filterSex");
    const applyBtn = document.getElementById("applyFilterBtn");
    const resetBtn = document.getElementById("resetFilterBtn");

    function hasActiveFilters() {
        return !!(activeFilters.search || activeFilters.stage || activeFilters.sex);
    }

    applyBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        activeFilters.search = filterSearch.value.trim().toLowerCase();
        activeFilters.stage  = filterStage.value;
        activeFilters.sex    = filterSex.value;

        if (!hasActiveFilters()) {
            const card = document.getElementById("filteredResultCard");
            if (card) card.style.display = "none";
            return;
        }

        renderFilteredResults();
        const term = activeFilters.search;
        renderAIRecords(term);
        renderPerformanceAnalytics(term);
        renderSelectionProcess(term);
        renderBreedingMortalityTable(term);
    });

    resetBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        activeFilters = { search: "", stage: "", sex: "" };
        filterSearch.value = "";
        filterStage.value  = "";
        filterSex.value    = "";
        if (farmerSelect) farmerSelect.value = "";
        if (pigletSelect) pigletSelect.innerHTML = '<option value="">-- Select Farmer First --</option>';

        const card = document.getElementById("filteredResultCard");
        if (card) card.style.display = "none";
        
        renderAIRecords("");
        renderPerformanceAnalytics("");
        renderSelectionProcess("");
        renderBreedingMortalityTable("");
    });

    function renderFilteredResults() {
        const tbody = document.getElementById("filteredResultTableBody");
        const card  = document.getElementById("filteredResultCard");
        if (!hasActiveFilters() || !tbody) {
            if (card) card.style.display = "none";
            return;
        }

        const results = rawPerformanceData.morphology.filter(m => {
            if (!isOwner(m)) return false;
            if (activeFilters.stage && m.morphology.stage !== activeFilters.stage) return false;
            if (activeFilters.sex && m.swine_sex !== activeFilters.sex) return false;
            const term = activeFilters.search;
            return resolveFarmerName(m).toLowerCase().includes(term) || m.swine_tag?.toLowerCase().includes(term);
        });

        results.sort((a, b) => new Date(b.morphology.date) - new Date(a.morphology.date));

        tbody.innerHTML = results.length
            ? results.map(r => `
                <tr>
                  <td>${resolveFarmerName(r)}</td>
                  <td><strong>${r.swine_tag}</strong></td>
                  <td>${r.swine_sex}</td>
                  <td>${r.morphology.stage}</td>
                  <td>⚖️ ${r.morphology.weight}kg</td>
                </tr>`).join("")
            : `<tr><td colspan="5" class="text-center py-4">No matches found.</td></tr>`;

        if (card) card.style.display = "block";
    }

    // ---------------------------------------------------------
    // 1. AI RECORDS (DESCENDING)
    // ---------------------------------------------------------
    async function loadAIRecords() {
        try {
            const res = await fetch(`${BACKEND_URL}/api/reproduction/ai-history`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await res.json();
            if (result.success) {
                rawAiData = result.data.filter(isOwner);
                rawAiData.sort((a, b) => new Date(b.date) - new Date(a.date));
                renderAIRecords();
            }
        } catch (err) { console.error("AI Load Error:", err); }
    }

    function renderAIRecords(term = "") {
        const tableBody = document.getElementById("aiTableBody");
        if (!tableBody) return;

        const filtered = rawAiData.filter(r => 
            resolveFarmerName(r).toLowerCase().includes(term) || 
            (r.sow_tag && r.sow_tag.toLowerCase().includes(term)) ||
            (r.boar_tag && r.boar_tag.toLowerCase().includes(term))
        );

        tableBody.innerHTML = filtered.length > 0 ? filtered.map(record => `
            <tr>
                <td><strong>${resolveFarmerName(record)}</strong></td>
                <td><span class="badge-tag">${record.sow_tag}</span></td>
                <td><span class="badge-tag">${record.boar_tag}</span></td>
                <td>${new Date(record.date).toLocaleDateString()}</td>
            </tr>`).join('') : '<tr><td colspan="4" style="text-align:center; padding: 20px;">No matching records.</td></tr>';
    }

    // ---------------------------------------------------------
    // 2. PERFORMANCE & DEFORMITIES (UPDATED: TEXT LABELS)
    // ---------------------------------------------------------
    async function loadPerformanceAnalytics() {
        try {
            const res = await fetch(`${BACKEND_URL}/api/reproduction/performance-analytics`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await res.json();
            if (result.success) {
                rawPerformanceData.morphology = result.morphology
                    .filter(isOwner)
                    .sort((a, b) => new Date(b.morphology.date) - new Date(a.morphology.date));
                
                rawPerformanceData.deformities = result.deformities
                    .filter(isOwner)
                    .sort((a, b) => new Date(b.date_detected) - new Date(a.date_detected));
                
                populateFarmerDropdown();
                renderPerformanceAnalytics();
            }
        } catch (err) { console.error("Performance Load Error:", err); }
    }

    function renderPerformanceAnalytics(term = "") {
        const morphBody = document.getElementById("morphTableBody");
        const deformityContainer = document.getElementById("deformityList");

        const selectedFarmer = farmerSelect?.value;
        const selectedPiglet = pigletSelect?.value;

        if (!selectedFarmer && !selectedPiglet && !term) {
            if (morphBody) morphBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#666;">Please select a Farmer and Piglet to view analytics.</td></tr>';
            if (deformityContainer) deformityContainer.innerHTML = '<div style="text-align:center; padding:10px; color:#666;">Select a piglet to check for deformities.</div>';
            return;
        }

        if (morphBody) {
            const filteredMorph = rawPerformanceData.morphology.filter(m => {
                const stage = (m.morphology.stage || "").toLowerCase();
                const isPiglet = stage.includes("day 1-30") || stage.includes("weaning");
                if (!isPiglet) return false;

                const farmerMatch = selectedFarmer ? resolveFarmerName(m) === selectedFarmer : true;
                const pigletMatch = selectedPiglet ? m.swine_tag === selectedPiglet : true;
                const searchMatch = term ? (resolveFarmerName(m).toLowerCase().includes(term.toLowerCase()) || m.swine_tag?.toLowerCase().includes(term.toLowerCase())) : true;

                return farmerMatch && pigletMatch && searchMatch;
            });

            morphBody.innerHTML = filteredMorph.length > 0 ? filteredMorph.map(item => {
                const swineObj = {
                    swine_id: item.swine_tag, sex: item.swine_sex, current_status: item.morphology.stage, 
                    performance_records: [{ weight: item.morphology.weight, stage: item.morphology.stage, deformities: [] }]
                };
                const suggestion = PerformanceHelper.getSelectionStatus(swineObj, rawPerformanceData.deformities);

                return `
                <tr>
                    <td>${resolveFarmerName(item)}</td>
                    <td><strong>${item.swine_tag}</strong></td>
                    <td style="font-weight:bold; color:${item.swine_sex === 'Female' ? '#d81b60' : '#1976d2'};">${item.swine_sex}</td>
                    <td>
                        <small>${item.morphology.stage}</small><br>
                        <span style="font-size:0.75rem; padding:2px 4px; border-radius:3px; background:${suggestion.bg || '#f5f5f5'}; color:${suggestion.color}; font-weight:bold;">
                            ${suggestion.suggestion}
                        </span>
                    </td>
                    <td>
                        <small><strong>Weight:</strong> ${item.morphology.weight}kg</small><br>
                        <small><strong>Body Length:</strong> ${item.morphology.body_length}cm</small><br>
                        <small><strong>Heart Girth:</strong> ${item.morphology.heart_girth || 'N/A'}cm</small>
                    </td>
                    <td><small><strong>Teeth:</strong> ${item.morphology.teeth || '0'}</small></td>
                    <td>${new Date(item.morphology.date).toLocaleDateString()}</td>
                </tr>`;
            }).join('') : '<tr><td colspan="7" style="text-align:center; padding:20px;">No matching piglet records.</td></tr>';
        }

        if (deformityContainer) {
            const activeFilter = selectedPiglet || selectedFarmer || term;
            const filteredDef = rawPerformanceData.deformities.filter(d =>
                resolveFarmerName(d).includes(activeFilter) || d.swine_tag?.includes(activeFilter)
            );

            if (filteredDef.length === 0) {
                deformityContainer.innerHTML = `<div style="text-align:center; padding:20px; color:#2e7d32; background:#e8f5e9; border-radius:8px;">✅ No issues found.</div>`;
            } else {
                deformityContainer.innerHTML = filteredDef.map(item => `
                    <div class="deformity-item" style="border-left:5px solid #d32f2f; padding:15px; margin-bottom:12px; background:#fff5f5; border-radius:4px;">
                        <strong>Owner:</strong> ${resolveFarmerName(item)} | <strong>Tag:</strong> <span class="badge-tag">${item.swine_tag}</span><br>
                        <strong>Issues:</strong> <span style="color:#d32f2f; font-weight:700;">${item.deformity_types}</span><br>
                        <small>Logged: ${new Date(item.date_detected).toLocaleDateString()}</small>
                    </div>`).join('');
            }
        }
    }

    // ---------------------------------------------------------
    // 3. SELECTION PROCESS (DESCENDING)
    // ---------------------------------------------------------
    async function loadSelectionProcess() {
        try {
            const res = await fetch(`${BACKEND_URL}/api/reproduction/selection-candidates`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await res.json();
            if (result.success) {
                rawSelectionData = result.data.filter(isOwner);
                rawSelectionData.sort((a, b) => new Date(b.updatedAt || b.date) - new Date(a.updatedAt || a.date));
                renderSelectionProcess();
            }
        } catch (err) { console.error("Selection Load Error:", err); }
    }

    function renderSelectionProcess(term = "") {
        const selectionBody = document.getElementById("selectionTableBody");
        if (!selectionBody) return;

        const filtered = rawSelectionData.filter(s => {
            const isFinalStage = s.current_stage === "Final Selection" || s.current_stage === "adult";
            if (!isFinalStage) return false;
            return resolveFarmerName(s).toLowerCase().includes(term) || s.swine_tag?.toLowerCase().includes(term);
        });

        selectionBody.innerHTML = filtered.length > 0 ? filtered.map(c => {
            const morph = rawPerformanceData.morphology.find(m => m.swine_tag === c.swine_tag);
            const weight = morph ? morph.morphology.weight : 0;
            const swineObj = { 
                swine_id: c.swine_tag, sex: c.swine_sex || "Female", current_status: c.current_stage,
                performance_records: [{ weight: weight, stage: c.current_stage }] 
            }; 
            const result = PerformanceHelper.getSelectionStatus(swineObj, rawPerformanceData.deformities);
            
            return `
            <tr>
                <td><strong>${c.swine_tag}</strong></td>
                <td>${resolveFarmerName(c)}</td>
                <td><span class="stage-label" style="background:#e3f2fd; color:#1976d2; padding:2px 6px; border-radius:4px;">${c.current_stage}</span></td>
                <td>
                    <span class="status-badge" style="padding:4px 8px; border-radius:4px; font-size:0.85em; font-weight:bold; background:${result.bg}; color:${result.color};">${result.suggestion}</span>
                    <br><small style="color:#666;">${result.reason}</small>
                </td>
                <td style="white-space:nowrap;">
                    <button class="action-btn" onclick="processSelection('${c.id || c._id}', true)" style="background:#2e7d32; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">Retain</button>
                    <button class="action-btn btn-danger" onclick="processSelection('${c.id || c._id}', false)" style="background:#d32f2f; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; margin-left:5px;">Cull</button>
                </td>
            </tr>`;
        }).join('') : '<tr><td colspan="5" style="text-align:center; padding:20px;">No candidates ready for Final Selection.</td></tr>';
    }

    // ---------------------------------------------------------
    // 4. BREEDING & MORTALITY ANALYTICS
    // ---------------------------------------------------------
    async function fetchAllSwine() {
        try {
            const res = await fetch(`${BACKEND_URL}/api/swine/all`, { headers: { 'Authorization': `Bearer ${token}` } });
            const result = await res.json();
            if (result.success) {
                allSwineData = (result.swine || result.data || []).filter(isOwner);
                renderBreedingMortalityTable();
            }
        } catch (err) { console.error("Mortality Load Error:", err); }
    }

    function renderBreedingMortalityTable(term = "") {
        const tableBody = document.getElementById("breedingMortalityTableBody");
        if (!tableBody) return;

        const adultSows = allSwineData.filter(s => {
            const stage = (s.age_stage || s.current_stage || "").toLowerCase();
            const sex   = (s.sex || s.swine_sex || "").toLowerCase();
            return stage === "adult" && sex === "female";
        });

        const filtered = adultSows.filter(s => {
            return resolveFarmerName(s).toLowerCase().includes(term) || (s.swine_id || s.swine_tag || "").toLowerCase().includes(term);
        });

        tableBody.innerHTML = filtered.length > 0 ? filtered.map(sow => {
            const sowId = sow.swine_id || sow.swine_tag;
            const offspring = allSwineData.filter(child => child.dam_id === sowId || child.mother_id === sowId);
            const aliveCount = offspring.filter(child => child.health_status !== "Deceased").length;
            const deceasedCount = offspring.filter(child => child.health_status === "Deceased").length;
            const mortalityRate = offspring.length > 0 ? ((deceasedCount / offspring.length) * 100).toFixed(1) : 0;
            const rateColor = mortalityRate > 15 ? "#d32f2f" : mortalityRate > 5 ? "#f57c00" : "#2e7d32";

            return `
                <tr>
                    <td><strong>${resolveFarmerName(sow)}</strong></td>
                    <td><span class="badge-tag">${sowId}</span></td>
                    <td style="text-align:center;"><b>${aliveCount}</b></td>
                    <td style="text-align:center; color:#d32f2f;"><b>${deceasedCount}</b></td>
                    <td style="text-align:center;"><span style="font-weight:bold; color:${rateColor};">${mortalityRate}%</span></td>
                </tr>`;
        }).join('') : '<tr><td colspan="5" style="text-align:center; padding:20px;">No registered sows found.</td></tr>';
    }

    // Initial Data Fetch
    await Promise.all([loadAIRecords(), loadPerformanceAnalytics(), loadSelectionProcess(), fetchAllSwine()]);
});

window.processSelection = async (swineId, isApproved) => {
    const actionText = isApproved ? 'RETAIN this swine for breeding' : 'CULL this swine for market/sale';
    if (!confirm(`Confirm Action: Are you sure you want to ${actionText}?`)) return;

    try {
        const res = await fetch(`http://localhost:5000/api/reproduction/process-selection`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("token")}` },
            body: JSON.stringify({ swineId, isApproved })
        });
        const data = await res.json();
        if (data.success) { alert(data.message); location.reload(); } else { alert("Error: " + data.message); }
    } catch (err) { alert("Network error. Please try again."); }
};