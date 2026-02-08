// frontend/js/heat-reports/progress.js

export function renderTimeline(container, report) {
  if (!container) return;

  // ✅ Normalize timeline source
  const timeline =
    report?.timeline ||
    report?.cycle?.timeline ||
    report?.cycle?.steps ||
    [];

  // ✅ Empty state (prevents crash)
  if (!Array.isArray(timeline) || !timeline.length) {
    container.innerHTML = `
      <p class="text-muted">
        No reproductive progress available for this report.
      </p>
    `;
    return;
  }

  container.innerHTML = timeline
    .map(
      step => `
        <div class="timeline-step ${step.completed ? "completed" : ""}">
          <span class="dot"></span>

          <div class="timeline-content">
            <div class="timeline-header">
              <strong>${step.title || "Stage"}</strong>
              ${
                step.status
                  ? `<span class="timeline-badge">${step.status}</span>`
                  : ""
              }
            </div>

            ${
              step.range
                ? `<small class="timeline-range">${step.range}</small>`
                : ""
            }

            ${
              step.note
                ? `<p class="timeline-note">${step.note}</p>`
                : ""
            }
          </div>
        </div>
      `
    )
    .join("");
}
