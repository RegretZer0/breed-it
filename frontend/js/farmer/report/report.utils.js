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
  // Updated to include the new lifecycle stages as "ongoing"
  if (["waiting_heat_check", "in_progress", "ongoing", "under_observation", "pregnant", "lactating"].includes(s)) return "ongoing";
  if (s === "approved") return "approved";
  if (s === "rejected") return "rejected";
  if (s === "completed") return "completed";
  return "pending";
}

export function labelApprovalStatus(normalized) {
  if (normalized === "approved") return "AI Scheduled";
  if (normalized === "rejected") return "Rejected";
  if (normalized === "ongoing") return "Active Cycle";
  if (normalized === "completed") return "Cycle Completed";
  return "Pending";
}

export function buildTimelineSteps(report) {
  const sw = report?.swine_id || {};
  const approval = normalizeApprovalStatus(report?.status);

  // Extract Dates (Including Warped Dates from Backend)
  const createdAt = toDateOrNull(report?.createdAt);
  const aiDate = toDateOrNull(report?.ai_confirmed_at);
  const nextHeat = toDateOrNull(report?.next_heat_check);
  const pregCheckDate = toDateOrNull(report?.pregnancy_confirmed_at);
  const weaningDate = toDateOrNull(report?.weaning_date);

  const expectedFarrow = toDateOrNull(
    report?.expected_farrowing ||
    sw?.expected_farrowing ||
    sw?.expected_farrowing_date
  );

  const reviewedAt = pickFirst(report, ["reviewedAt", "reviewed_at", "updatedAt", "updated_at"]);
  const reviewedDate = toDateOrNull(reviewedAt);

  const reason = pickFirst(report, ["rejection_reason", "rejectionReason", "admin_comment", "remarks", "note"]);
  const approvedMsg = pickFirst(report, ["approval_note", "approved_note", "approvalNote"]);

  const status = String(report?.status || sw?.current_status || "").toLowerCase();
  
  const events = [];

  // 1. Initial Submission
  events.push({
    title: "Report Submitted",
    desc: "Farmer submitted the heat detection report.",
    icon: "bi-journal-check",
    date: createdAt,
    dateText: createdAt ? createdAt.toLocaleDateString() : "Date N/A",
    badge: "recorded"
  });

  // 2. Review / Approval Step
  let decisionTitle = "Report Review";
  let decisionDesc = "Pending review by manager.";
  let decisionIcon = "bi-hourglass-split";
  let decisionBadge = "pending";

  if (approval === "rejected") {
    decisionTitle = "Report Rejected";
    decisionDesc = reason ? `Reason: ${reason}` : "Your report has been rejected.";
    decisionIcon = "bi-x-circle";
    decisionBadge = "recorded";
  } else if (aiDate || approval === "approved" || approval === "ongoing" || approval === "completed") {
    decisionTitle = "Report Approved";
    decisionDesc = "Report verified. Breeding cycle initiated.";
    decisionIcon = "bi-check2-circle";
    decisionBadge = "recorded";
  }

  events.push({
    title: decisionTitle,
    desc: decisionDesc,
    icon: decisionIcon,
    date: reviewedDate || createdAt,
    dateText: reviewedDate ? `Reviewed: ${reviewedDate.toLocaleDateString()}` : "In Review",
    badge: decisionBadge
  });

  // 3. AI Service (Time Warp Aware)
  if (aiDate) {
    events.push({
      title: "AI Service Confirmed",
      desc: "Artificial Insemination has been performed.",
      icon: "bi-droplet-half",
      date: aiDate,
      dateText: `Date: ${aiDate.toLocaleDateString()}`,
      badge: "recorded"
    });
  }

  // 4. Monitoring / Pregnancy Check
  if (status.includes("observation") || status.includes("preg") || status.includes("lactating") || status === "completed") {
    events.push({
      title: "Pregnancy Monitoring",
      desc: pregCheckDate ? "Pregnancy confirmed via observation." : "Monitoring for return-to-heat signs.",
      icon: pregCheckDate ? "bi-heart-pulse" : "bi-eye",
      date: pregCheckDate || nextHeat,
      dateText: pregCheckDate ? `Confirmed: ${pregCheckDate.toLocaleDateString()}` : (nextHeat ? `Due: ${nextHeat.toLocaleDateString()}` : "Ongoing"),
      badge: pregCheckDate ? "recorded" : "ongoing"
    });
  }

  // 5. Gestation & Farrowing
  if (status.includes("preg") || status.includes("lactating") || status === "completed") {
    events.push({
      title: status.includes("preg") ? "Gestation (114 Days)" : "Farrowing Completed",
      desc: status.includes("preg") ? "Sow is pregnant. Awaiting farrowing." : "Sow has successfully given birth.",
      icon: "bi-egg-fried",
      date: expectedFarrow,
      dateText: expectedFarrow ? `Target: ${expectedFarrow.toLocaleDateString()}` : "Date N/A",
      badge: status.includes("preg") ? "ongoing" : "recorded"
    });
  }

  // 6. Weaning (Final Step)
  if (weaningDate || status === "completed") {
    events.push({
      title: "Cycle Completed (Weaning)",
      desc: "Piglets weaned. Sow returned to open pool.",
      icon: "bi-flag-fill",
      date: weaningDate,
      dateText: weaningDate ? `Weaned: ${weaningDate.toLocaleDateString()}` : "Completed",
      badge: "recorded"
    });
  }

  // Sort: Newest at the top
  events.sort((a, b) => {
    const at = a.date ? a.date.getTime() : -Infinity;
    const bt = b.date ? b.date.getTime() : -Infinity;
    return bt - at;
  });

  return events;
}