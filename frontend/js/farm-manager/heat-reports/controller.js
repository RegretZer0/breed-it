// frontend/js/heat-reports/controller.js

import { authGuard } from "/js/authGuard.js";
import { fetchHeatReports, fetchHeatProgress } from "./service.js";
import { state } from "./state.js";
import { renderHeatCards } from "./cards.js";
import { renderTimeline } from "./progress.js";

/* =======================
   STATS HELPERS
======================= */
function getDaysLeft(targetDate) {
  if (!targetDate) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = new Date(targetDate);
  target.setHours(0, 0, 0, 0);

  const diff = target - today;
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

  if (days < 0) return "Overdue";
  if (days === 0) return "TODAY";
  return days;
}

function renderStats(reports) {
  const normalize = s =>
    (s || "").toLowerCase().replace(/\s|-/g, "_");

  const setCount = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  setCount(
    "countInHeat",
    reports.filter(r =>
      ["pending", "approved", "in_heat"].includes(normalize(r.status))
    ).length
  );

  setCount(
    "countAwaitingRecheck",
    reports.filter(r =>
      ["under_observation", "waiting_heat_check"].includes(normalize(r.status))
    ).length
  );

  setCount(
    "countPregnant",
    reports.filter(r => normalize(r.status) === "pregnant").length
  );

  setCount(
    "countFarrowingReady",
    reports.filter(r => {
      const status = normalize(r.status);
      if (!["pregnant", "farrowing_ready"].includes(status)) return false;
      if (!r.expected_farrowing) return false;

      const daysLeft = getDaysLeft(r.expected_farrowing);
      return daysLeft === "TODAY" || daysLeft === "Overdue" || daysLeft <= 7;
    }).length
  );
}

/* =======================
   MAIN CONTROLLER
======================= */
document.addEventListener("DOMContentLoaded", async () => {
  const cardsContainer = document.getElementById("heatReportCards");

  // DETAILS MODAL
  const detailsOverlay = document.getElementById("detailsOverlay");
  const detailsContent = document.getElementById("detailsContent");
  const closeDetails = document.getElementById("closeDetails");
  const closeDetailsBtn = document.getElementById("closeDetailsBtn");

  // PROGRESS MODAL
  const progressOverlay = document.getElementById("progressOverlay");
  const progressTimeline = document.getElementById("progressTimeline");
  const closeProgress = document.getElementById("closeProgress");

  // EVIDENCE LIGHTBOX
  const evidenceOverlay = document.getElementById("evidenceOverlay");
  const evidencePreview = document.getElementById("evidencePreview");

  // ACTION BUTTONS
  const approveBtn = document.getElementById("approveBtn");
  const rejectBtn = document.getElementById("rejectBtn");
  const confirmAIBtn = document.getElementById("confirmAIBtn");
  const confirmPregnancyBtn = document.getElementById("confirmPregnancyBtn");
  const followUpBtn = document.getElementById("followUpBtn");
  const confirmFarrowingBtn = document.getElementById("confirmFarrowingBtn");

  // AI MODAL
  const aiConfirmModal = document.getElementById("aiConfirmModal");
  const boarSelect = document.getElementById("boarSelect");
  const submitAIBtn = document.getElementById("submitAI");

  let activeReportId = null;

  if (!cardsContainer || !detailsOverlay || !progressOverlay) {
    console.error("❌ Heat reports DOM structure incomplete");
    return;
  }

  /* ================= AUTH ================= */
  const user = await authGuard(["farm_manager", "encoder"]);
  if (!user) return;

  const token = localStorage.getItem("token");

  /* ================= LOAD REPORTS ================= */
  try {
    const data = await fetchHeatReports(token);
    state.reports = data.reports || [];

    renderHeatCards(state.reports);
    renderStats(state.reports);
  } catch (err) {
    console.error("❌ Failed to load heat reports", err);
  }

  /* ================= MODAL HELPERS ================= */
  function toggleModal(modal, show) {
    modal.style.display = show ? "flex" : "none";
    document.body.style.overflow = show ? "hidden" : "";
  }

  function closeAllModals() {
    toggleModal(detailsOverlay, false);
    toggleModal(progressOverlay, false);
    aiConfirmModal && (aiConfirmModal.style.display = "none");
  }

  function openDetailsModal() {
    closeAllModals();
    toggleModal(detailsOverlay, true);
  }

  function openProgressModal() {
    closeAllModals();
    toggleModal(progressOverlay, true);
  }

  /* ================= ACTION BUTTON VISIBILITY ================= */
  function hideAllActionButtons() {
    approveBtn && (approveBtn.style.display = "none");
    rejectBtn && (rejectBtn.style.display = "none");
    confirmAIBtn && (confirmAIBtn.style.display = "none");
    confirmPregnancyBtn && (confirmPregnancyBtn.style.display = "none");
    followUpBtn && (followUpBtn.style.display = "none");
    confirmFarrowingBtn && (confirmFarrowingBtn.style.display = "none");
  }

  function renderActionButtons(report) {
    hideAllActionButtons();

    switch (report.status) {
      case "pending":
        approveBtn && (approveBtn.style.display = "inline-block");
        rejectBtn && (rejectBtn.style.display = "inline-block");
        break;

      case "approved":
        confirmAIBtn && (confirmAIBtn.style.display = "inline-block");
        break;

      case "ai_confirmed":
      case "under_observation":
        confirmPregnancyBtn && (confirmPregnancyBtn.style.display = "inline-block");
        followUpBtn && (followUpBtn.style.display = "inline-block");
        break;

      case "pregnant":
      case "farrowing_ready":
        confirmFarrowingBtn && (confirmFarrowingBtn.style.display = "inline-block");
        break;
    }
  }

  /* ================= SIMPLE LIFECYCLE ACTIONS ================= */
  async function performLifecycleAction(endpoint, body = {}) {
    if (!activeReportId) return;

    await fetch(`/api/heat/${activeReportId}/${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    closeAllModals();
    location.reload();
  }

  /* ================= CARD HANDLERS ================= */
  cardsContainer.addEventListener("click", async (e) => {
    const viewBtn = e.target.closest(".btn-view-details");
    const trackBtn = e.target.closest(".btn-track-progress");

    if (viewBtn) {
      const reportId = viewBtn.dataset.id;
      if (!reportId) return;

      activeReportId = reportId;

      const res = await fetchHeatProgress(reportId, token);
      const r = res.report;

      renderActionButtons(r);

      detailsContent.innerHTML = `
        <p><strong>Swine:</strong> ${r.swine_id?.swine_id || "-"}</p>
        <p><strong>Farmer:</strong> ${r.farmer_id?.first_name || ""} ${r.farmer_id?.last_name || ""}</p>
        <p><strong>Status:</strong> ${r.status?.replace(/_/g, " ")}</p>
        <p><strong>Probability:</strong> ${r.heat_probability ?? 0}%</p>
        <p><strong>Signs:</strong> ${(r.signs || []).join(", ") || "-"}</p>
      `;

      openDetailsModal();
    }

    if (trackBtn) {
      const reportId = trackBtn.dataset.id;
      if (!reportId) return;

      const res = await fetchHeatProgress(reportId, token);
      renderTimeline(progressTimeline, res.report);
      openProgressModal();
    }
  });

  /* ================= APPROVE / REJECT ================= */
  approveBtn?.addEventListener("click", () => {
    performLifecycleAction("approve");
  });

  rejectBtn?.addEventListener("click", () => {
    performLifecycleAction("reject");
  });

  /* ================= AI CONFIRM FLOW (RESTORED) ================= */
  confirmAIBtn?.addEventListener("click", async (e) => {
    e.preventDefault();

    const res = await fetch(`/api/swine/all?sex=Male&age_stage=adult`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();
    if (!data.success || !data.swine?.length) {
      alert("No boars available.");
      return;
    }

    boarSelect.innerHTML = data.swine
      .map(b => `<option value="${b._id}">${b.swine_id}</option>`)
      .join("");

    aiConfirmModal.style.display = "flex";
  });

  submitAIBtn?.addEventListener("click", () => {
    const maleSwineId = boarSelect.value;
    if (!maleSwineId) return alert("Select a boar.");

    performLifecycleAction("confirm-ai", { maleSwineId });
  });

  /* ================= OTHER ACTIONS ================= */
  confirmPregnancyBtn?.addEventListener("click", () => {
    if (!confirm("Mark this sow as pregnant?")) return;
    performLifecycleAction("confirm-pregnancy");
  });

  followUpBtn?.addEventListener("click", () => {
    if (!confirm("Mark cycle as failed?")) return;
    performLifecycleAction("cycle-failed");
  });

  confirmFarrowingBtn?.addEventListener("click", () => {
    performLifecycleAction("confirm-farrowing");
  });

  /* ================= CLOSE HANDLERS ================= */
  closeDetails?.addEventListener("click", closeAllModals);
  closeDetailsBtn?.addEventListener("click", closeAllModals);
  closeProgress?.addEventListener("click", closeAllModals);

  detailsOverlay.addEventListener("click", e => {
    if (e.target === detailsOverlay) closeAllModals();
  });

  progressOverlay.addEventListener("click", e => {
    if (e.target === progressOverlay) closeAllModals();
  });

  /* ================= EVIDENCE LIGHTBOX ================= */
  document.addEventListener("click", e => {
    const thumb = e.target.closest(".evidence-thumb");
    if (!thumb) return;

    evidencePreview.src = thumb.src;
    evidenceOverlay.style.display = "flex";
  });

  evidenceOverlay.addEventListener("click", () => {
    evidenceOverlay.style.display = "none";
    evidencePreview.src = "";
  });
});
