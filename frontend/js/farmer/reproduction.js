import { authGuard } from "/js/authGuard.js";
import { PerformanceHelper } from "/js/performance_helper.js";

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

            const suggestion = PerformanceHelper.getSelectionStatus(
              swineObj,
              rawPerformanceData.deformities
            );

            return `
              <tr>
                <td>${resolveFarmerName(item)}</td>
                <td><strong>${item.swine_tag}</strong></td>
                <td>${item.swine_sex}</td>
                <td>
                  ${item.morphology.stage}<br>
                  <small style="color:${suggestion.color}">
                    ${suggestion.suggestion}
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

  // ================= MORTALITY =================
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

    const sows = allSwineData.filter(s =>
      (s.age_stage === "adult" || s.current_stage === "adult") &&
      (s.sex === "Female" || s.swine_sex === "Female")
    );

    body.innerHTML = sows.length
      ? sows.map(sow => `
        <tr>
          <td>${resolveFarmerName(sow)}</td>
          <td>${sow.swine_id || sow.swine_tag}</td>
          <td class="text-center">—</td>
          <td class="text-center">—</td>
          <td class="text-center">—</td>
        </tr>
      `).join("")
      : `<tr><td colspan="5" class="text-center">No sows found.</td></tr>`;
  }

  // ================= INIT =================
  await Promise.all([
    loadAIRecords(),
    loadPerformance(),
    loadSelection(),
    loadSwine()
  ]);
});
