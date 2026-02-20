// /js/reports/report.utils.js

export function toDateOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function formatCountdown(targetDate) {
  const target = toDateOrNull(targetDate);
  if (!target) return "";

  const today = startOfDay(new Date());
  const t = startOfDay(target);

  const diffDays = Math.round((t.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const daysAgo = Math.abs(diffDays);
    return daysAgo === 1 ? "Overdue (1 day ago)" : `Overdue (${daysAgo} days ago)`;
  }
  if (diffDays === 0) return "TODAY";
  if (diffDays === 1) return "Tomorrow";
  return `${diffDays} days remaining`;
}

export function updateCountdowns(root = document) {
  root.querySelectorAll(".countdown").forEach(el => {
    const d = el.dataset.date;
    const text = d ? formatCountdown(d) : "—";
    el.innerHTML = `<i class="bi bi-hourglass"></i> ${text || "—"}`;
  });
}

export function pickFirst(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return "";
}

export function normalizeApprovalStatus(raw) {
  const s = (raw || "pending").toLowerCase().trim().replace(/\s+/g, "_");
  if (s === "waiting_heat_check") return "ongoing";
  if (s === "in_progress") return "ongoing";
  if (s === "ongoing") return "ongoing";
  if (s === "approved") return "approved";
  if (s === "rejected") return "rejected";
  return "pending";
}

export function labelApprovalStatus(normalized) {
  if (normalized === "approved") return "Approved";
  if (normalized === "rejected") return "Rejected";
  if (normalized === "ongoing") return "Ongoing";
  return "Pending";
}

export function buildTimelineSteps(report) {
  const sw = report?.swine_id || {};
  const approval = normalizeApprovalStatus(report?.status);

  const createdAt = toDateOrNull(report?.createdAt);
  const nextHeat = toDateOrNull(report?.next_heat_check);

  const expectedFarrow = toDateOrNull(
    report?.expected_farrowing ||
    sw?.expected_farrowing ||
    sw?.expected_farrowing_date
  );

  const reviewedAt = pickFirst(report, ["reviewedAt", "reviewed_at", "updatedAt", "updated_at"]);
  const reviewedDate = toDateOrNull(reviewedAt);

  const reason = pickFirst(report, [
    "rejection_reason",
    "rejectionReason",
    "admin_comment",
    "adminComment",
    "remarks",
    "note",
    "message"
  ]);

  const approvedMsg = pickFirst(report, [
    "approval_note",
    "approved_note",
    "approvalNote",
    "approvedNote"
  ]);

  const status = String(sw?.current_status || "").toLowerCase();
  const isPregnant = status.includes("preg") || !!expectedFarrow;

  const events = [];

  events.push({
    title: "Report Submitted",
    desc: "Farmer submitted the heat detection report.",
    icon: "bi-journal-check",
    date: createdAt,
    dateText: createdAt ? createdAt.toLocaleDateString() : "Date N/A",
    badge: "recorded"
  });

  let decisionTitle = "Report Review";
  let decisionDesc = "Your report is pending review.";
  let decisionIcon = "bi-hourglass-split";
  let decisionBadge = "pending";

  if (approval === "approved") {
    decisionTitle = "Report Approved";
    decisionDesc = approvedMsg ? `Your report has been approved. ${approvedMsg}` : "Your report has been approved.";
    decisionIcon = "bi-check2-circle";
    decisionBadge = "recorded";
  } else if (approval === "rejected") {
    decisionTitle = "Report Rejected";
    decisionDesc = reason ? `Reason: ${reason}` : "Your report has been rejected. Please review and resubmit.";
    decisionIcon = "bi-x-circle";
    decisionBadge = "recorded";
  } else if (approval === "ongoing") {
    decisionTitle = "Report Under Review";
    decisionDesc = "Your report is currently being reviewed.";
    decisionIcon = "bi-arrow-repeat";
    decisionBadge = "ongoing";
  }

  events.push({
    title: decisionTitle,
    desc: decisionDesc,
    icon: decisionIcon,
    date: reviewedDate || createdAt,
    dateText: reviewedDate
      ? `Reviewed: ${reviewedDate.toLocaleDateString()}`
      : (createdAt ? `Submitted: ${createdAt.toLocaleDateString()}` : "Date N/A"),
    badge: decisionBadge
  });

  events.push({
    title: "Under 30 Days Monitoring",
    desc: "Monitoring for return-to-heat signs post-AI.",
    icon: "bi-eye",
    date: nextHeat || null,
    dateText: nextHeat ? `Due: ${nextHeat.toLocaleDateString()}` : "Ongoing",
    badge: nextHeat ? "recorded" : "pending"
  });

  if (isPregnant) {
    events.push({
      title: "Pregnant & Under 115 Days Monitoring",
      desc: "Pregnancy confirmed. Monitoring gestation period.",
      icon: "bi-heart-pulse",
      date: expectedFarrow || null,
      dateText: expectedFarrow ? `Due: ${expectedFarrow.toLocaleDateString()}` : "Due: N/A",
      badge: "recorded"
    });
  }

  events.sort((a, b) => {
    const at = a.date ? a.date.getTime() : -Infinity;
    const bt = b.date ? b.date.getTime() : -Infinity;
    return bt - at;
  });

  return events;
}