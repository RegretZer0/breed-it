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

  // Ensure profileId is captured correctly
  const farmerProfileId = user.farmerProfileId || user.id || user._id;
  debugLog("USER_SESSION", { role: user.role, name: user.name, profileId: farmerProfileId });

  const getCleanToken = () => {
    let token = localStorage.getItem("token");
    if (token && (token.startsWith('"') || token.startsWith("'"))) {
      token = token.slice(1, -1);
    }
    return token ? token.trim() : null;
  };

  const token = getCleanToken();

  // ================= STATE =================
  let rawAiData = [];
  let rawPerformanceData = { morphology: [], deformities: [] };
  let rawSelectionData = [];
  let allSwineData = [];

  // ================= HELPERS (UPDATED FOR NAME AND ID MATCHING) =================
  const isMySwine = (item) => {
    if (!item) return false;

    // 1. Try matching by ID first
    const ownerId = item.farmer_id?._id || item.farmer_id || item.swine_id?.farmer_id;
    if (ownerId && farmerProfileId && ownerId.toString() === farmerProfileId.toString()) {
      return true;
    }

    // 2. Fallback: Match by farmer_name (Handles cases where ID isn't provided in the record)
    if (item.farmer_name && user.name) {
      return item.farmer_name.trim().toLowerCase() === user.name.trim().toLowerCase();
    }

    return false;
  };

  // ================= PIGLET DRILL-DOWN =================
  const pigletSelect = document.getElementById("pigletSelect");

  function populatePigletDropdown() {
    if (!pigletSelect) return;

    const seenTags = new Set();
    const uniquePiglets = [];

    rawPerformanceData.morphology.forEach(m => {
      const stage = (m.morphology?.stage || "").toLowerCase();
      const isPigletStage = stage.includes("day 1-30") || stage.includes("weaning");
      
      if (isPigletStage && m.swine_tag && !seenTags.has(m.swine_tag)) {
        seenTags.add(m.swine_tag);
        uniquePiglets.push(m);
      }
    });

    uniquePiglets.sort((a, b) => (a.swine_tag || "").localeCompare(b.swine_tag || ""));

    pigletSelect.innerHTML = '<option value="">-- Choose a Piglet to View Performance --</option>' + 
      uniquePiglets.map(p => `<option value="${p.swine_tag}">${p.swine_tag} (${p.swine_sex || 'N/A'})</option>`).join("");
  }

  pigletSelect?.addEventListener("change", (e) => {
    const selectedTag = e.target.value.toLowerCase();
    renderPerformance(selectedTag);
  });

  // ================= FETCH HANDLER =================
  async function authFetch(endpoint) {
    const BASE_URL = "http://localhost:5000"; 
    
    const isRepro = endpoint.includes("ai-history") || 
                    endpoint.includes("performance-analytics") || 
                    endpoint.includes("selection-candidates");
    
    let apiPath = "";
    if (endpoint.startsWith("/api")) {
        apiPath = endpoint;
    } else {
        apiPath = isRepro ? `/api/reproduction${endpoint}` : `/api${endpoint}`;
    }
    
    const fullUrl = `${BASE_URL}${apiPath}`;

    try {
      const res = await fetch(fullUrl, {
        method: "GET",
        headers: { 
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        },
      });

      if (res.status === 401) return { authError: true };
      const data = await res.json();
      debugLog(`FETCH_SUCCESS: ${endpoint}`, data);
      return data;
    } catch (err) {
      debugLog("FETCH_ERROR", err.message, true);
      return null;
    }
  }
  
  async function safeLoad(fn, name, tableId) {
    const body = document.getElementById(tableId);
    if (!body) return;

    try {
      const result = await fn();
      if (result && result.authError) {
        body.innerHTML = `<tr><td colspan="10" class="text-center text-warning"><b>Session Invalid.</b></td></tr>`;
        return;
      }
    } catch (err) {
      debugLog(`SAFE_LOAD_ERROR: ${name}`, err.message, true);
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

  // ================= 1. AI HISTORY (FIXED FIELDS) =================
  async function loadAIRecords() {
    const data = await authFetch("/ai-history");
    if (data && data.success) {
      const rawList = data.data || data.records || [];
      rawAiData = rawList.filter(isMySwine);
      
      // Sorted by insemination_date as per schema
      rawAiData.sort((a, b) => new Date(b.insemination_date || b.createdAt) - new Date(a.insemination_date || a.createdAt));
      renderAIRecords();
    }
    return data;
  }

  function renderAIRecords(term = "") {
    const body = document.getElementById("aiTableBody");
    if (!body) return;

    // Updated to match Schema fields: swine_code and male_swine_id
    const filtered = rawAiData.filter(r =>
      (r.swine_code || r.sow_tag || "").toLowerCase().includes(term) ||
      (r.male_swine_id || "").toLowerCase().includes(term)
    );

    body.innerHTML = filtered.length
      ? filtered.map(r => `
        <tr>
          <td><span class="badge bg-info text-dark">${r.swine_code || r.sow_tag || "N/A"}</span></td>
          <td>${r.male_swine_id || "N/A"}</td>
          <td>${(r.insemination_date || r.createdAt) ? new Date(r.insemination_date || r.createdAt).toLocaleDateString() : "N/A"}</td>
        </tr>`).join("")
      : `<tr><td colspan="3" class="text-center">No AI records found for your swines.</td></tr>`;
  }

  // ================= 2. PERFORMANCE & DEFORMITIES =================
  async function loadPerformance() {
    const data = await authFetch("/performance-analytics");
    if (data && data.success) {
      rawPerformanceData.morphology = (data.morphology || []).filter(isMySwine);
      rawPerformanceData.deformities = (data.deformities || []).filter(isMySwine);
      
      rawPerformanceData.morphology.sort((a, b) => new Date(b.morphology?.date || b.createdAt) - new Date(a.morphology?.date || a.createdAt));
      rawPerformanceData.deformities.sort((a, b) => new Date(b.date_detected || b.createdAt) - new Date(a.date_detected || a.createdAt));

      populatePigletDropdown();
      renderPerformance(""); 
    }
    return data;
  }

  function renderPerformance(term = "") {
    const morphBody = document.getElementById("morphTableBody");
    const deformityList = document.getElementById("deformityList");
    
    const selectedDropdownValue = pigletSelect?.value.toLowerCase();
    
    if (!selectedDropdownValue && !term) {
      if (morphBody) morphBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Please select a piglet from the dropdown to view performance data.</td></tr>`;
      if (deformityList) deformityList.innerHTML = `<div class="text-muted">Select a piglet to check for deformities.</div>`;
      return;
    }

    const activeFilter = selectedDropdownValue || term;

    if (morphBody) {
      const rows = rawPerformanceData.morphology.filter(m =>
        (m.swine_tag || "").toLowerCase().includes(activeFilter)
      );

      morphBody.innerHTML = rows.length
        ? rows.map(item => {
            const hasDeformity = rawPerformanceData.deformities.some(d => d.swine_tag === item.swine_tag);
            let suggestionText = hasDeformity ? "⚠️ Suggest: Cull/Sell" : "✅ Active Monitoring";
            let suggestionColor = hasDeformity ? "#c62828" : "#2e7d32";

            return `
              <tr>
                <td><strong>${item.swine_tag}</strong></td>
                <td><span style="color: ${item.swine_sex === 'Female' ? '#e91e63' : '#2196f3'}; font-weight: bold;">${item.swine_sex || 'N/A'}</span></td>
                <td>
                  ${item.morphology?.stage || "N/A"}<br>
                  <small style="color:${suggestionColor}; font-weight: bold;">${suggestionText}</small>
                </td>
                <td>
                  <small><strong>Weight:</strong> ${item.morphology?.weight || 0}kg</small><br>
                  <small><strong>Heart Girth:</strong> ${item.morphology?.heart_girth || 0}cm</small><br>
                  <small><strong>Body Length:</strong> ${item.morphology?.body_length || 0}cm</small>
                </td>
                <td><small><strong>Teeth:</strong> ${item.morphology?.teeth || 0}</small></td>
                <td>${(item.morphology?.date || item.createdAt) ? new Date(item.morphology.date || item.createdAt).toLocaleDateString() : "N/A"}</td>
              </tr>`;
          }).join("")
        : `<tr><td colspan="6" class="text-center">No performance data matches "${activeFilter}".</td></tr>`;
    }

    if (deformityList) {
      const defs = rawPerformanceData.deformities.filter(d =>
        (d.swine_tag || "").toLowerCase().includes(activeFilter)
      );
      deformityList.innerHTML = defs.length ? defs.map(d => `
          <div class="deformity-item" style="padding: 10px; border-left: 4px solid #c62828; background: #fff5f5; margin-bottom: 5px;">
            <strong>${d.swine_tag}</strong>: ${d.deformity_types} <br>
            <small class="text-muted">Detected: ${new Date(d.date_detected || d.createdAt).toLocaleDateString()}</small>
          </div>`).join("") : `<div class="text-success">✅ No deformities found for this selection.</div>`;
    }
  }

  // ================= 3. SELECTION CANDIDATES =================
  async function loadSelection() {
    const data = await authFetch("/selection-candidates");
    if (data && data.success) {
      rawSelectionData = (data.data || []).filter(isMySwine);
      rawSelectionData.sort((a, b) => new Date(b.updatedAt || b.date || b.createdAt) - new Date(a.updatedAt || a.date || a.createdAt));
      renderSelection();
    }
    return data;
  }

  function renderSelection(term = "") {
    const body = document.getElementById("selectionTableBody");
    if (!body) return;
    const rows = rawSelectionData.filter(r => (r.swine_tag || "").toLowerCase().includes(term));
    body.innerHTML = rows.length ? rows.map(r => `
        <tr>
          <td><span class="badge bg-dark">${r.swine_tag}</span></td>
          <td>${r.current_stage || "N/A"}</td>
          <td><strong>${r.recommendation || "Pending"}</strong></td>
          <td><span class="badge bg-light text-dark border">Manager Review</span></td>
        </tr>`).join("") : `<tr><td colspan="4" class="text-center">No selection candidates found.</td></tr>`;
  }

  // ================= 4. MORTALITY ANALYTICS =================
  async function loadSwine() {
    const data = await authFetch("/api/swine/all");
    if (data && data.success) {
      const swineList = data.swine || data.data || [];
      allSwineData = swineList.filter(isMySwine);
      renderMortality();
    }
    return data;
  }

  function renderMortality(term = "") {
    const body = document.getElementById("breedingMortalityTableBody");
    if (!body) return;

    let adultSows = allSwineData.filter(s => {
      const stage = (s.age_stage || s.current_status || s.current_stage || "").toLowerCase();
      const isBreeder = ["adult", "pregnant", "lactating", "farrowing", "sow"].some(tag => stage.includes(tag));
      return (s.sex || "").toLowerCase() === "female" && isBreeder;
    });

    const filtered = adultSows.filter(s => {
      const sId = s.swine_id || s.swine_tag || "";
      return sId.toLowerCase().includes(term);
    });

    body.innerHTML = filtered.length ? filtered.map(sow => {
          const sowId = sow.swine_id || sow.swine_tag;
          const offspring = allSwineData.filter(child => child.dam_id === sowId || child.mother_id === sowId);
          const deceasedCount = offspring.filter(child => (child.health_status || "").includes("Deceased")).length;
          const totalBorn = offspring.length;
          let mortalityRate = totalBorn > 0 ? ((deceasedCount / totalBorn) * 100).toFixed(1) : 0;
          
          return `<tr>
              <td><span class="badge bg-secondary">${sowId}</span></td>
              <td class="text-center"><b>${totalBorn - deceasedCount}</b></td>
              <td class="text-center" style="color: #d32f2f;"><b>${deceasedCount}</b></td>
              <td class="text-center"><b>${mortalityRate}%</b></td>
            </tr>`;
        }).join("") : `<tr><td colspan="4" class="text-center">No breeder sows found.</td></tr>`;
  }

  // ================= INIT =================
  try {
    debugLog("INIT", "Starting Load...");
    await safeLoad(loadAIRecords, "AI History", "aiTableBody");
    await safeLoad(loadPerformance, "Performance", "morphTableBody");
    await safeLoad(loadSelection, "Selection", "selectionTableBody");
    await safeLoad(loadSwine, "Swine Data", "breedingMortalityTableBody");
    console.timeEnd("Reproduction_Load_Time");
  } catch (err) {
    debugLog("CRITICAL_INIT_FAILURE", err.message, true);
  }
});