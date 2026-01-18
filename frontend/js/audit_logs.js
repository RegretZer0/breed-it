document.addEventListener("DOMContentLoaded", () => {
    fetchAuditLogs();

    // Real-time search filter
    const logSearch = document.getElementById("logSearch");
    if (logSearch) {
        logSearch.addEventListener("keyup", function() {
            const value = this.value.toLowerCase();
            const rows = document.querySelectorAll("#auditLogBody tr");

            rows.forEach(row => {
                const text = row.innerText.toLowerCase();
                row.style.display = text.includes(value) ? "" : "none";
            });
        });
    }
});

/**
 * Fetches logs from the backend
 */
async function fetchAuditLogs() {
    const token = localStorage.getItem("token");
    const tableBody = document.getElementById("auditLogBody");

    if (!tableBody) return;

    // UI Loading state
    tableBody.innerHTML = `
        <tr>
            <td colspan="6" class="text-center py-5">
                <div class="spinner-border text-primary" role="status"></div>
                <br><span class="mt-2 d-block">Retrieving logs...</span>
            </td>
        </tr>
    `;

    try {
        // Using relative path to match your index.js mounting point (/api/auth)
        const response = await fetch("/api/auth/audit-logs", {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });

        // Safety: If the server returns 404 or 500, response.json() might fail
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Server error: ${response.status}`);
        }

        const data = await response.json();

        if (data.success) {
            displayLogs(data.logs);
        } else {
            showError(data.message || "Failed to load audit logs.");
        }
    } catch (error) {
        console.error("Fetch error:", error);
        showError("Connection error. Please ensure the server is running on port 5000.");
    }
}

/**
 * Renders log data into the table
 */
function displayLogs(logs) {
    const tableBody = document.getElementById("auditLogBody");
    
    if (!logs || logs.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center">No activity recorded yet.</td></tr>';
        return;
    }

    tableBody.innerHTML = logs.map(log => {
        // Formatting date/time
        const dateObj = new Date(log.timestamp);
        const date = dateObj.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
        const time = dateObj.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
        
        // Safety check for user_id (handles cases where user might be deleted/null)
        const userData = log.user_id || { 
            first_name: 'Unknown', 
            last_name: 'User', 
            role: 'unknown', 
            email: 'N/A' 
        };

        const roleClass = userData.role === 'farm_manager' ? 'badge-manager' : 'badge-encoder';
        const roleLabel = userData.role.replace('_', ' ').toUpperCase();

        return `
            <tr>
                <td style="white-space: nowrap;">
                    <i class="far fa-clock text-muted mr-1"></i> ${date} <br>
                    <small class="text-muted ml-4">${time}</small>
                </td>
                <td>
                    <div class="font-weight-bold">${userData.first_name} ${userData.last_name}</div>
                    <small class="text-muted">${userData.email}</small>
                </td>
                <td><span class="badge ${roleClass} px-2 py-1">${roleLabel}</span></td>
                <td><span class="action-code">${log.action}</span></td>
                <td>
                    <small class="font-weight-bold text-uppercase text-secondary">
                        ${log.module.replace('_', ' ')}
                    </small>
                </td>
                <td class="small">${log.details}</td>
            </tr>
        `;
    }).join('');
}

function showError(msg) {
    const tableBody = document.getElementById("auditLogBody");
    if (tableBody) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center text-danger py-4">
                    <i class="fas fa-exclamation-triangle mr-2"></i> ${msg}
                </td>
            </tr>
        `;
    }
}