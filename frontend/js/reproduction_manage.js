import { authGuard } from "./authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
    // 1. Authenticate and Role Check
    const user = await authGuard();
    if (!user) return;

    // --- ROLE-BASED NAVIGATION LOGIC ---
    const backLink = document.querySelector(".back-link");
    if (backLink && user.role) {
        const role = user.role.toLowerCase();
        let targetDashboard = "admin_dashboard.html"; // Default fallback

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

    /**
     * Helper to resolve Farmer Names from the data object.
     * Handles both direct strings and populated objects from the Farmer collection.
     */
    const resolveFarmerName = (item) => {
        // If the backend already sent a formatted string
        if (item.farmer_name) return item.farmer_name;

        // If it's a populated farmer_id object
        if (item.farmer_id && typeof item.farmer_id === 'object') {
            const firstName = item.farmer_id.first_name || '';
            const lastName = item.farmer_id.last_name || '';
            const fullName = `${firstName} ${lastName}`.trim();
            return fullName || "Unknown Farmer";
        }
        
        return "Not Assigned";
    };

    // ---------------------------------------------------------
    // 1. LOAD ARTIFICIAL INSEMINATION RECORDS
    // ---------------------------------------------------------
    async function loadAIRecords() {
        try {
            const res = await fetch(`${BACKEND_URL}/api/reproduction/ai-history`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            const result = await res.json();
            const tableBody = document.getElementById("aiTableBody");

            if (result.success && tableBody) {
                tableBody.innerHTML = result.data.length > 0 ? result.data.map(record => `
                    <tr>
                        <td><strong>${resolveFarmerName(record)}</strong></td>
                        <td><span class="badge-tag">${record.sow_tag}</span></td>
                        <td><span class="badge-tag">${record.boar_tag}</span></td>
                        <td>${new Date(record.date).toLocaleDateString()}</td>
                    </tr>
                `).join('') : '<tr><td colspan="4" style="text-align:center; padding: 20px; color: #666;">No AI history found for your account.</td></tr>';
            }
        } catch (err) {
            console.error("Error loading AI records:", err);
        }
    }

    // ---------------------------------------------------------
    // 2. LOAD MORPHOLOGY & DEFORMITY MONITORING
    // ---------------------------------------------------------
    async function loadPerformanceAnalytics() {
        try {
            const res = await fetch(`${BACKEND_URL}/api/reproduction/performance-analytics`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await res.json();

            const morphBody = document.getElementById("morphTableBody");
            if (result.success && morphBody) {
                morphBody.innerHTML = result.morphology.length > 0 ? result.morphology.map(item => {
                    const isFemale = item.swine_sex === "Female";
                    const teatCount = item.morphology.teat_count;
                    
                    let teatDisplay;
                    // Improved Teat Display Logic
                    if (!isFemale || teatCount === null || teatCount === undefined) {
                        teatDisplay = `<span style="color: #bbb; font-style: italic;">N/A</span>`;
                    } else {
                        teatDisplay = `<b style="color: #2e7d32;">${teatCount}</b>`;
                    }

                    return `
                    <tr>
                        <td>${resolveFarmerName(item)}</td>
                        <td><strong>${item.swine_tag}</strong></td>
                        <td style="font-weight: bold; color: ${isFemale ? '#d81b60' : '#1976d2'};">
                            ${item.swine_sex}
                        </td>
                        <td><small>${item.morphology.stage}</small></td>
                        <td>
                            <div style="font-size: 0.9em;">
                                ⚖️ ${item.morphology.weight}kg | 
                                📏 ${item.morphology.body_length}cm | 
                                🍼 ${teatDisplay}
                            </div>
                        </td>
                        <td><small>${item.morphology.teeth}</small></td>
                        <td>${new Date(item.morphology.date).toLocaleDateString()}</td>
                    </tr>
                `}).join('') : '<tr><td colspan="7" style="text-align:center; padding: 20px;">No performance data available.</td></tr>';
            }

            // Deformity List - Visual Alerting
            const deformityContainer = document.getElementById("deformityList");
            if (result.success && deformityContainer) {
                if (result.deformities.length === 0) {
                    deformityContainer.innerHTML = `
                        <div style="text-align:center; padding:20px; color:#2e7d32; background:#e8f5e9; border-radius:8px;">
                            ✅ No deformities detected in your current herd.
                        </div>`;
                } else {
                    deformityContainer.innerHTML = result.deformities.map(item => `
                        <div class="deformity-item" style="border-left: 5px solid #d32f2f; padding: 15px; margin-bottom: 12px; background: #fff5f5; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                            <strong>Owner:</strong> ${resolveFarmerName(item)} | <strong>Tag:</strong> <span class="badge-tag">${item.swine_tag}</span> <br>
                            <strong>Issues:</strong> <span style="color: #d32f2f; font-weight:700;">${item.deformity_types}</span> <br>
                            <small style="color: #555;">Logged on: ${new Date(item.date_detected).toLocaleDateString()}</small>
                        </div>
                    `).join('');
                }
            }
        } catch (err) {
            console.error("Error loading performance analytics:", err);
        }
    }

    // ---------------------------------------------------------
    // 3. LOAD SELECTION PROCESS CANDIDATES
    // ---------------------------------------------------------
    async function loadSelectionProcess() {
        try {
            const res = await fetch(`${BACKEND_URL}/api/reproduction/selection-candidates`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await res.json();
            const selectionBody = document.getElementById("selectionTableBody");

            if (result.success && selectionBody) {
                selectionBody.innerHTML = result.data.length > 0 ? result.data.map(c => `
                    <tr>
                        <td><strong>${c.swine_tag}</strong></td>
                        <td>${resolveFarmerName(c)}</td>
                        <td><span class="stage-label">${c.current_stage}</span></td>
                        <td>
                            <span class="status-badge ${c.can_promote ? 'status-passed' : 'status-failed'}" 
                                  style="padding: 4px 8px; border-radius: 4px; font-size: 0.85em; font-weight: bold; background: ${c.can_promote ? '#e8f5e9' : '#ffebee'}; color: ${c.can_promote ? '#2e7d32' : '#c62828'};">
                                ${c.recommendation}
                            </span>
                        </td>
                        <td style="white-space: nowrap;">
                            <button class="action-btn" onclick="processSelection('${c.id}', true)" style="background:#2e7d32; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">Approve</button>
                            <button class="action-btn btn-danger" onclick="processSelection('${c.id}', false)" style="background:#d32f2f; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; margin-left:5px;">Cull</button>
                        </td>
                    </tr>
                `).join('') : '<tr><td colspan="5" style="text-align:center; padding: 20px;">No swine currently in the selection process.</td></tr>';
            }
        } catch (err) {
            console.error("Error loading selection process:", err);
        }
    }

    // Initial Data Fetch
    await loadAIRecords();
    await loadPerformanceAnalytics();
    await loadSelectionProcess();
});

/**
 * Handle Approval or Culling of Swine
 */
window.processSelection = async (swineId, isApproved) => {
    const actionText = isApproved ? 'APPROVE this swine for the next stage' : 'CULL/MARK this swine for sale';
    if (!confirm(`Confirm Action: Are you sure you want to ${actionText}?`)) return;

    try {
        const token = localStorage.getItem("token");
        const res = await fetch(`http://localhost:5000/api/reproduction/process-selection`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ swineId, isApproved })
        });
        
        const data = await res.json();
        if (data.success) {
            alert(data.message);
            location.reload(); // Refresh to update tables
        } else {
            alert("Permission Denied: " + data.message);
        }
    } catch (err) {
        alert("Network error. Please try again.");
    }
};