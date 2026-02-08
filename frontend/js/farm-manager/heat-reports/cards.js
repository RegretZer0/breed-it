// frontend/js/heat-reports/cards.js

export function renderHeatCards(reports) {
  const container = document.getElementById("heatReportCards");
  if (!container) return;

  // Reset container
  container.innerHTML = "";

  // Empty state
  if (!Array.isArray(reports) || reports.length === 0) {
    container.innerHTML = `
      <p class="text-muted">No heat reports found.</p>
    `;
    return;
  }

  reports.forEach((r) => {
    const card = document.createElement("article");

    // ✅ Unified class name (matches CSS + layout)
    card.className = "heat-card";

    const status = r.status || "pending";

    // ✅ User-friendly status label
    const statusLabel = status
      .replace(/_/g, " ")
      .replace(/\b\w/g, c => c.toUpperCase());

    const probability = Number.isFinite(r.heat_probability)
      ? Math.min(r.heat_probability, 100)
      : 0;

    const signsHtml =
      Array.isArray(r.signs) && r.signs.length
        ? r.signs
            .map(
              s => `<span class="indicator-chip">${s}</span>`
            )
            .join("")
        : `<span class="text-muted">None</span>`;

    card.innerHTML = `
      <!-- HEADER -->
      <div class="heat-card-header">
        <div class="heat-card-left">
          <div class="heat-icon">🔥</div>

          <div class="heat-card-meta">
            <strong class="heat-swine-id">
              ${r.swine_id?.swine_id || "Unknown Swine"}
            </strong>

            <div class="heat-sub">
              ${r.farmer_id?.farm_name || "Farm"} • ${
                r.swine_id?.breed || "-"
              }
            </div>

            <div class="heat-date">
              ${
                r.createdAt
                  ? new Date(r.createdAt).toLocaleDateString()
                  : ""
              }
            </div>
          </div>
        </div>

        <span
          class="heat-status report-status"
          data-status="${status}"
        >
          ${statusLabel}
        </span>
      </div>

      <!-- PROBABILITY -->
      <div class="heat-probability">
        <div class="heat-prob-label">
          <span>Probability</span>
          <strong>${probability}%</strong>
        </div>

        <div class="heat-prob-bar">
          <span style="width:${probability}%"></span>
        </div>
      </div>

      <!-- INDICATORS -->
      <div class="heat-indicators">
        <span class="indicator-label">Indicators:</span>
        ${signsHtml}
      </div>

      <!-- ACTIONS -->
      <div class="heat-card-actions">
        <button
          type="button"
          class="btn-view-details btn-secondary"
          data-id="${r._id}"
        >
          View Details
        </button>

        <button
          type="button"
          class="btn-track-progress btn-primary"
          data-id="${r._id}"
        >
          Track Progress
        </button>
      </div>
    `;

    container.appendChild(card);
  });
}
