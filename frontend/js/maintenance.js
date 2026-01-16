import { authGuard } from "./authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
    // 🔐 Protect the page - Only Farm Manager/Admin/Encoder
    const user = await authGuard(["farm_manager", "encoder"]);
    if (!user) return;

    const BACKEND_URL = "http://localhost:5000";
    const token = localStorage.getItem("token");
    const boarForm = document.getElementById("boarMaintenanceForm");
    const tableBody = document.getElementById("masterBoarTableBody");

    // 1. Fetch and Display ONLY Master Boars
    const fetchMasterBoars = async () => {
        try {
            // Fetching specifically adult males
            const res = await fetch(`${BACKEND_URL}/api/swine/all?sex=Male&age_stage=adult`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            
            if (data.success) {
                tableBody.innerHTML = "";
                
                // FILTER: Only show swine that are Master Boars (BOAR- prefix or no farmer_id)
                const masterBoars = data.swine.filter(boar => 
                    boar.swine_id.startsWith("BOAR-") || boar.farmer_id === null
                );

                if (masterBoars.length === 0) {
                    tableBody.innerHTML = "<tr><td colspan='5' style='text-align:center;'>No Master Boars registered.</td></tr>";
                    return;
                }

                masterBoars.forEach(boar => {
                    const latestPerf = (boar.performance_records || []).slice(-1)[0] || {};
                    tableBody.innerHTML += `
                        <tr>
                            <td><strong>${boar.swine_id}</strong></td>
                            <td>${boar.breed}</td>
                            <td>${boar.color || 'N/A'}</td>
                            <td>
                                <b>Wt:</b> ${latestPerf.weight || '--'} kg<br>
                                <small><b>Dim:</b> ${latestPerf.body_length || '--'}L x ${latestPerf.heart_girth || '--'}G</small>
                            </td>
                            <td>
                                <span class="status-badge" style="background: ${boar.health_status === 'Healthy' ? '#27ae60' : '#e74c3c'}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.8em;">
                                    ${boar.health_status}
                                </span><br>
                                <small>${boar.current_status}</small>
                            </td>
                        </tr>
                    `;
                });
            }
        } catch (err) { 
            console.error("Load error:", err); 
            tableBody.innerHTML = "<tr><td colspan='5'>Error loading master boars.</td></tr>";
        }
    };

    // 2. Submit New Boar (Auto-ID Trigger)
    boarForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        // Constructing payload to match your swineRoutes.js "add-master-boar" route
        const payload = {
            breed: "Native", 
            color: document.getElementById("boarColor").value.trim(),
            weight: parseFloat(document.getElementById("weight").value),
            bodyLength: parseFloat(document.getElementById("bodyLength").value),
            heartGirth: parseFloat(document.getElementById("heartGirth").value),
            teethCount: parseInt(document.getElementById("teethCount").value),
            date_transfer: document.getElementById("dateTransfer").value || new Date().toISOString().split('T')[0],
            health_status: "Healthy",
            current_status: "Active"
        };

        try {
            const res = await fetch(`${BACKEND_URL}/api/swine/add-master-boar`, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}` 
                },
                body: JSON.stringify(payload)
            });
            
            const data = await res.json();
            
            if (data.success) {
                alert(`Master Boar Registered Successfully!\nGenerated ID: ${data.swine.swine_id}`);
                boarForm.reset();
                
                // Reset date to today
                const dateTransferInput = document.getElementById("dateTransfer");
                if (dateTransferInput) {
                    dateTransferInput.value = new Date().toISOString().split('T')[0];
                }
                
                fetchMasterBoars(); // Refresh the list
            } else {
                alert("Error: " + data.message);
            }
        } catch (err) { 
            console.error("Submission error:", err);
            alert("Server connection error. Please try again."); 
        }
    });

    // Navigation
    const backBtn = document.getElementById("backBtn");
    if (backBtn) {
        backBtn.onclick = () => window.location.href = "admin_dashboard.html";
    }

    // Initialize Page
    fetchMasterBoars();

    // Set default date to today for the transfer field
    const dateTransferInput = document.getElementById("dateTransfer");
    if (dateTransferInput) {
        dateTransferInput.value = new Date().toISOString().split('T')[0];
    }
});