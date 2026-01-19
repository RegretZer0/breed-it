import { authGuard } from "/js/authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  console.time("Reproduction_Load_Time");

  // 🕵️ DEBUG LOGGER
  const debugLog = (task, data, isError = false) => {
    const icon = isError ? "❌" : "📡";
    const color = isError ? "color: #ff4d4d; font-weight: bold;" : "color: #00d1b2; font-weight: bold;";
    console.log(`%c${icon} [DEBUG: ${task}]`, color, data);
  };

  // 🔐 AUTH
  const user = await authGuard("farmer");
  if (!user) {
    debugLog("AUTH", "No user found, redirecting...", true);
    return;
  }

  // Ensure profileId is captured even if authGuard nested it differently
  user.farmerProfileId = user.farmerProfileId || user.id || user._id;
  debugLog("USER_SESSION", { role: user.role, profileId: user.farmerProfileId });

  /**
   * ✅ GET & SANITIZE TOKEN
   * Removes any accidental quotes or whitespace that cause 401 errors
   */
  const getCleanToken = () => {
    let token = localStorage.getItem("token");
    if (token && (token.startsWith('"') || token.startsWith("'"))) {
      token = token.slice(1, -1);
    }
    return token ? token.trim() : null;
  };

  const token = getCleanToken();
  console.log("🔑 Current Token:", token ? "Token Found & Sanitized" : "TOKEN MISSING!");

  // ================= STATE =================
  let rawAiData = [];
  let rawPerformanceData = { morphology: [], deformities: [] };
  let rawSelectionData = [];
  let allSwineData = [];

  // ================= HELPERS =================
  const resolveFarmerName = (item) => {
    if (item.farmer_name) return item.farmer_name;
    if (item.farmer_id && typeof item.farmer_id === "object") {
      const first = item.farmer_id.first_name || item.farmer_id.full_name || "";
      const last = item.farmer_id.last_name || "";
      return `${first} ${last}`.trim() || "Unknown Farmer";
    }
    return "Unknown Farmer";
  };

  /**
   * ✅ FIXED CENTRALIZED FETCH HANDLER
   * Uses Absolute URL to prevent port mismatch and forces sanitized token headers
   */
  async function authFetch(endpoint) {
    const BASE_URL = "http://localhost:5000"; 
    const isRepro = endpoint.includes("ai-history") || 
                    endpoint.includes("performance-analytics") || 
                    endpoint.includes("selection-candidates");
    
    // Check if your backend expects /api/reproduction/... or just /api/...
    const apiPath = isRepro ? `/api/reproduction${endpoint}` : `/api${endpoint}`;
    const fullUrl = `${BASE_URL}${apiPath}`;

    debugLog("FETCH_START", fullUrl);

    try {
      const res = await fetch(fullUrl, {
        method: "GET",
        headers: { 
          "Authorization": `Bearer ${getCleanToken()}`
          // Removed Content-Type and Accept to match the simpler 'me' fetch
        },
      });

      debugLog("HTTP_STATUS", { url: apiPath, status: res.status });

      if (res.status === 401) {
        // If this fails, the backend reproductionRouter.js likely has a bug
        return { authError: true };
      }

      return await res.json();
    } catch (err) {
      debugLog("FETCH_ERROR", err.message, true);
      return null;
    }
  }
  
  /**
   * ✅ ENHANCED SAFE LOADING
   */
  async function safeLoad(fn, name, tableId) {
    const body = document.getElementById(tableId);
    if (!body) {
      debugLog("DOM_ERROR", `Table ID "${tableId}" not found in HTML!`, true);
      return;
    }

    try {
      const result = await fn();
      
      if (result && result.authError) {
        body.innerHTML = `<tr><td colspan="10" class="text-center text-warning"><b>Session Invalid/Expired.</b><br>Please log in again.</td></tr>`;
        return;
      }

      if (!result || result.success === false) {
        debugLog("API_LOGIC_ERROR", { name, message: result?.message || "Success field is false" }, true);
        body.innerHTML = `<tr><td colspan="10" class="text-center text-danger">No data available for ${name}</td></tr>`;
      }
    } catch (err) {
      debugLog("RENDER_ERROR", { name, error: err.message }, true);
      body.innerHTML = `<tr><td colspan="10" class="text-center text-danger">Error rendering ${name}.</td></tr>`;
    }
  }

  // ================= SEARCH =================
  const searchInput = document.getElementById("reproductionSearch");
  searchInput?.addEventListener("input", (e) => {
    const term = e.target.value.toLowerCase();
    renderAll(term);
  });

  function renderAll(term = "") {
    renderAIRecords(term);
    renderPerformance(term);
    renderSelection(term);
    renderMortality(term);
  }

  // ================= 1. AI HISTORY =================
  async function loadAIRecords() {
    const data = await authFetch("/ai-history");
    if (data && data.success) {
      rawAiData = data.data || [];
      renderAIRecords();
    }
    return data;
  }

  function renderAIRecords(term = "") {
    const body = document.getElementById("aiTableBody");
    if (!body) return;

    const filtered = rawAiData.filter(r =>
      resolveFarmerName(r).toLowerCase().includes(term) ||
      (r.sow_tag || "").toLowerCase().includes(term) ||
      (r.boar_tag || "").toLowerCase().includes(term)
    );

    body.innerHTML = filtered.length
      ? filtered.map(r => `
        <tr>
          <td><strong>${resolveFarmerName(r)}</strong></td>
          <td><span class="badge bg-info text-dark">${r.sow_tag || "N/A"}</span></td>
          <td>${r.boar_tag || "N/A"}</td>
          <td>${r.date ? new Date(r.date).toLocaleDateString() : "N/A"}</td>
        </tr>`).join("")
      : `<tr><td colspan="4" class="text-center">No AI records found.</td></tr>`;
  }

  // ================= 2. PERFORMANCE & DEFORMITIES =================
  async function loadPerformance() {
    const data = await authFetch("/performance-analytics");
    if (data && data.success) {
      rawPerformanceData.morphology = data.morphology || [];
      rawPerformanceData.deformities = data.deformities || [];
      renderPerformance();
    }
    return data;
  }

  function renderPerformance(term = "") {
    const morphBody = document.getElementById("morphTableBody");
    const deformityList = document.getElementById("deformityList");

    if (morphBody) {
      const rows = rawPerformanceData.morphology.filter(m =>
        resolveFarmerName(m).toLowerCase().includes(term) ||
        (m.swine_tag || "").toLowerCase().includes(term)
      );

      morphBody.innerHTML = rows.length
        ? rows.map(item => {
            const hasDeformity = rawPerformanceData.deformities.some(d => d.swine_tag === item.swine_tag);
            let suggestionText = "✅ Active Monitoring";
            let suggestionColor = "#2e7d32";

            if (hasDeformity) {
              suggestionText = "⚠️ Suggest: Cull/Sell";
              suggestionColor = "#c62828";
            } else if (item.morphology?.stage?.toLowerCase().includes("selection")) {
              const weight = item.morphology.weight || 0;
              if (weight >= 15 && weight <= 25) {
                suggestionText = item.swine_sex === "Female" ? "⭐ Retain" : "⭐ Market Ready";
                suggestionColor = "#2e7d32";
              } else if (weight > 25) {
                suggestionText = "⚠️ Overweight";
                suggestionColor = "#e67e22";
              }
            }

            return `
              <tr>
                <td>${resolveFarmerName(item)}</td>
                <td><strong>${item.swine_tag}</strong></td>
                <td>${item.swine_sex}</td>
                <td>${item.morphology?.stage || "N/A"}<br><small style="color:${suggestionColor}; font-weight: bold;">${suggestionText}</small></td>
                <td>⚖️ ${item.morphology?.weight || 0}kg</td>
                <td>🦷 ${item.morphology?.teeth || 0}</td>
                <td>${item.morphology?.date ? new Date(item.morphology.date).toLocaleDateString() : "N/A"}</td>
              </tr>`;
          }).join("")
        : `<tr><td colspan="7" class="text-center">No performance data found.</td></tr>`;
    }

    if (deformityList) {
      const defs = rawPerformanceData.deformities.filter(d =>
        resolveFarmerName(d).toLowerCase().includes(term) || (d.swine_tag || "").toLowerCase().includes(term)
      );
      deformityList.innerHTML = defs.length ? defs.map(d => `
          <div class="deformity-item" style="padding: 10px; border-left: 4px solid #c62828; background: #fff5f5; margin-bottom: 5px;">
            <strong>${d.swine_tag}</strong>: ${d.deformity_types} <br>
            <small class="text-muted">Farmer: ${resolveFarmerName(d)} | Detected: ${new Date(d.date_detected).toLocaleDateString()}</small>
          </div>`).join("") : `<div class="text-success">✅ No deformities found.</div>`;
    }
  }

  // ================= 3. SELECTION CANDIDATES =================
  async function loadSelection() {
    const data = await authFetch("/selection-candidates");
    if (data && data.success) {
      rawSelectionData = data.data || [];
      renderSelection();
    }
    return data;
  }

  function renderSelection(term = "") {
    const body = document.getElementById("selectionTableBody");
    if (!body) return;
    const rows = rawSelectionData.filter(r => resolveFarmerName(r).toLowerCase().includes(term) || (r.swine_tag || "").toLowerCase().includes(term));
    body.innerHTML = rows.length ? rows.map(r => `
        <tr>
          <td><span class="badge bg-dark">${r.swine_tag}</span></td>
          <td>${resolveFarmerName(r)}</td>
          <td>${r.current_stage}</td>
          <td><strong>${r.recommendation || "Pending"}</strong></td>
          <td><span class="badge bg-light text-dark border">Manager Review</span></td>
        </tr>`).join("") : `<tr><td colspan="5" class="text-center">No selection candidates found.</td></tr>`;
  }

  // ================= 4. MORTALITY ANALYTICS =================
  async function loadSwine() {
    const data = await authFetch("/swine/all");
    if (data && data.success) {
      allSwineData = data.swine || data.data || [];
      renderMortality();
    }
    return data;
  }

  function renderMortality(term = "") {
    const body = document.getElementById("breedingMortalityTableBody");
    if (!body) return;
    
    const fId = user.farmerProfileId || user.id || user._id;

    let adultSows = allSwineData.filter(s => {
      const stage = (s.age_stage || s.current_status || s.current_stage || "").toLowerCase();
      const isBreeder = ["adult", "pregnant", "lactating", "farrowing", "sow"].some(tag => stage.includes(tag));
      const ownerId = s.farmer_id?._id || s.farmer_id;
      const isMine = ownerId && fId && ownerId.toString() === fId.toString();
      
      return (s.sex || "").toLowerCase() === "female" && isBreeder && (user.role === "farm_manager" || user.role === "admin" ? true : isMine);
    });

    const filtered = adultSows.filter(s => {
      const sId = s.swine_id || s.swine_tag || "";
      const name = resolveFarmerName(s).toLowerCase();
      return name.includes(term) || sId.toLowerCase().includes(term);
    });

    body.innerHTML = filtered.length ? filtered.map(sow => {
          const sowId = sow.swine_id || sow.swine_tag;
          const offspring = allSwineData.filter(child => child.dam_id === sowId || child.mother_id === sowId);
          const deceasedCount = offspring.filter(child => (child.health_status || "").includes("Deceased")).length;
          const totalBorn = offspring.length;
          let mortalityRate = totalBorn > 0 ? ((deceasedCount / totalBorn) * 100).toFixed(1) : 0;
          
          return `<tr>
              <td><strong>${resolveFarmerName(sow)}</strong></td>
              <td><span class="badge bg-secondary">${sowId}</span></td>
              <td class="text-center"><b>${totalBorn - deceasedCount}</b></td>
              <td class="text-center" style="color: #d32f2f;"><b>${deceasedCount}</b></td>
              <td class="text-center"><b>${mortalityRate}%</b></td>
            </tr>`;
        }).join("") : `<tr><td colspan="5" class="text-center">No breeder sows found.</td></tr>`;
  }

  // ================= INIT =================
  try {
    debugLog("INIT", "Starting Sequential Load...");
    await safeLoad(loadAIRecords, "AI History", "aiTableBody");
    await safeLoad(loadPerformance, "Performance", "morphTableBody");
    await safeLoad(loadSelection, "Selection", "selectionTableBody");
    await safeLoad(loadSwine, "Swine Data", "breedingMortalityTableBody");
    console.timeEnd("Reproduction_Load_Time");
  } catch (err) {
    debugLog("CRITICAL_INIT_FAILURE", err.message, true);
  }
});