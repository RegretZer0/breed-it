import { authGuard } from "/js/authGuard.js";
// PerformanceHelper removed

document.addEventListener("DOMContentLoaded", async () => {
  // 🔐 AUTH
  const user = await authGuard("farmer");
  if (!user) return;

  const BACKEND_URL = "http://localhost:5000";
  const token = localStorage.getItem("token");

  // ================= STATE =================
  let rawAiData = [];
  let rawPerformanceData = { morphology: [], deformities: [] };
  let rawSelectionData = [];
  let allSwineData = [];

  // ================= HELPERS =================
  const resolveFarmerName = (item) => {
    if (item.farmer_name) return item.farmer_name;
    if (item.farmer_id && typeof item.farmer_id === "object") {
      return `${item.farmer_id.first_name || ""} ${item.farmer_id.last_name || ""}`.trim();
    }
    return "Unknown Farmer";
  };

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

  // ================= AI HISTORY =================
  async function loadAIRecords() {
    const res = await fetch(`${BACKEND_URL}/api/reproduction/ai-history`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) {
      rawAiData = data.data || [];
      renderAIRecords();
    }
  }

  function renderAIRecords(term = "") {
    const body = document.getElementById("aiTableBody");
    if (!body) return;

    const filtered = rawAiData.filter(r =>
      resolveFarmerName(r).toLowerCase().includes(term) ||
      r.sow_tag?.toLowerCase().includes(term) ||
      r.boar_tag?.toLowerCase().includes(term)
    );

    body.innerHTML = filtered.length
      ? filtered.map(r => `
        <tr>
          <td><strong>${resolveFarmerName(r)}</strong></td>
          <td>${r.sow_tag}</td>
          <td>${r.boar_tag}</td>
          <td>${new Date(r.date).toLocaleDateString()}</td>
        </tr>
      `).join("")
      : `<tr><td colspan="4" class="text-center">No records found.</td></tr>`;
  }

  // ================= PERFORMANCE & DEFORMITIES =================
  async function loadPerformance() {
    const res = await fetch(`${BACKEND_URL}/api/reproduction/performance-analytics`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) {
      rawPerformanceData.morphology = data.morphology || [];
      rawPerformanceData.deformities = data.deformities || [];
      renderPerformance();
    }
  }

  function renderPerformance(term = "") {
    const morphBody = document.getElementById("morphTableBody");
    const deformityList = document.getElementById("deformityList");

    if (morphBody) {
      const rows = rawPerformanceData.morphology.filter(m =>
        resolveFarmerName(m).toLowerCase().includes(term) ||
        m.swine_tag?.toLowerCase().includes(term)
      );

      morphBody.innerHTML = rows.length
        ? rows.map(item => {
            const hasDeformity = rawPerformanceData.deformities.some(d => d.swine_tag === item.swine_tag);
            
            let suggestionText = "✅ Active Monitoring";
            let suggestionColor = "#2e7d32";

            if (hasDeformity) {
              suggestionText = "⚠️ Suggest: Cull/Sell";
              suggestionColor = "#c62828";
            } else if (item.morphology.stage === "Final Selection") {
              if (item.morphology.weight >= 15 && item.morphology.weight <= 25) {
                suggestionText = item.swine_sex === "Female" ? "⭐ Retain for Breeding" : "⭐ Market Ready";
                suggestionColor = "#2e7d32";
              } else if (item.morphology.weight > 25) {
                suggestionText = "⚠️ Overweight for Selection";
                suggestionColor = "#e67e22";
              }
            }

            return `
              <tr>
                <td>${resolveFarmerName(item)}</td>
                <td><strong>${item.swine_tag}</strong></td>
                <td>${item.swine_sex}</td>
                <td>
                  ${item.morphology.stage}<br>
                  <small style="color:${suggestionColor}; font-weight: bold;">
                    ${suggestionText}
                  </small>
                </td>
                <td>⚖️ ${item.morphology.weight}kg</td>
                <td>${item.morphology.teeth}</td>
                <td>${new Date(item.morphology.date).toLocaleDateString()}</td>
              </tr>
            `;
          }).join("")
        : `<tr><td colspan="7" class="text-center">No data found.</td></tr>`;
    }

    if (deformityList) {
      const defs = rawPerformanceData.deformities.filter(d =>
        resolveFarmerName(d).toLowerCase().includes(term)
      );

      deformityList.innerHTML = defs.length
        ? defs.map(d => `
          <div class="deformity-item">
            <strong>${d.swine_tag}</strong>: ${d.deformity_types}
          </div>
        `).join("")
        : `<div class="text-success">✅ No deformities found.</div>`;
    }
  }

  // ================= SELECTION (READ-ONLY FOR FARMER) =================
  async function loadSelection() {
    const res = await fetch(`${BACKEND_URL}/api/reproduction/selection-candidates`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) {
      rawSelectionData = data.data || [];
      renderSelection();
    }
  }

  function renderSelection(term = "") {
    const body = document.getElementById("selectionTableBody");
    if (!body) return;

    const rows = rawSelectionData.filter(r =>
      resolveFarmerName(r).toLowerCase().includes(term) ||
      r.swine_tag?.toLowerCase().includes(term)
    );

    body.innerHTML = rows.length
      ? rows.map(r => `
        <tr>
          <td>${r.swine_tag}</td>
          <td>${resolveFarmerName(r)}</td>
          <td>${r.current_stage}</td>
          <td>${r.system_suggestion || "Pending review"}</td>
          <td><em>Manager review</em></td>
        </tr>
      `).join("")
      : `<tr><td colspan="5" class="text-center">No candidates.</td></tr>`;
  }

  // ================= MORTALITY ANALYTICS =================
  async function loadSwine() {
    const res = await fetch(`${BACKEND_URL}/api/swine/all`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) {
      allSwineData = data.swine || [];
      renderMortality();
    }
  }

  function renderMortality(term = "") {
    const body = document.getElementById("breedingMortalityTableBody");
    if (!body) return;

    // 1. Expanded Filter: Look for any female that isn't a piglet or weaner
    let adultSows = allSwineData.filter(s => {
      const stage = (s.age_stage || s.current_stage || "").toLowerCase();
      const gender = (s.sex || s.swine_sex || "").toLowerCase();
      
      // Included common breeder labels: adult, sow, gilt
      const isBreederStage = ["adult", "sow", "gilt"].includes(stage);
      const isFemale = gender === "female";
      
      return isFemale && isBreederStage;
    });

    // 2. Role-based filtering for Farmers
    if (user.role.toLowerCase() === "farmer") {
        const userProfileId = user.farmerProfileId || user._id; 
        adultSows = adultSows.filter(s => {
            const fId = s.farmer_id?._id || s.farmer_id;
            // Check both ID and the name to ensure visibility
            return fId === userProfileId || resolveFarmerName(s) === `${user.first_name} ${user.last_name}`;
        });
    }

    // 3. Search Term filtering
    const filtered = adultSows.filter(s => {
      const sId = s.swine_id || s.swine_tag || "";
      return resolveFarmerName(s).toLowerCase().includes(term) || sId.toLowerCase().includes(term);
    });

    body.innerHTML = filtered.length
      ? filtered.map(sow => {
          const sowId = sow.swine_id || sow.swine_tag;
          
          // 4. Calculate Offspring Stats
          const offspring = allSwineData.filter(child => 
              child.dam_id === sowId || child.mother_id === sowId
          );
          
          const aliveCount = offspring.filter(child => child.health_status !== "Deceased").length;
          const deceasedCount = offspring.filter(child => child.health_status === "Deceased").length;
          const totalBorn = offspring.length;

          let mortalityRate = 0;
          if (totalBorn > 0) {
              mortalityRate = ((deceasedCount / totalBorn) * 100).toFixed(1);
          }

          const rateColor = mortalityRate > 15 ? "#d32f2f" : mortalityRate > 5 ? "#f57c00" : "#2e7d32";

          return `
            <tr>
              <td><strong>${resolveFarmerName(sow)}</strong></td>
              <td><span class="badge-tag">${sowId}</span></td>
              <td class="text-center"><b>${aliveCount}</b></td>
              <td class="text-center" style="color: #d32f2f;"><b>${deceasedCount}</b></td>
              <td class="text-center">
                  <span style="font-weight:bold; color: ${rateColor};">
                      ${mortalityRate}%
                  </span>
              </td>
            </tr>
          `;
        }).join("")
      : `<tr><td colspan="5" class="text-center">No registered sows found.</td></tr>`;
  }

  // ================= INIT =================
  await Promise.all([
    loadAIRecords(),
    loadPerformance(),
    loadSelection(),
    loadSwine()
  ]);
});