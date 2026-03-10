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

/**
 * UPDATED: formatCountdown
 * Now respects the Virtual Time Warp offset stored in localStorage
 */
export function formatCountdown(targetDate) {
  const target = toDateOrNull(targetDate);
  if (!target) return "";

  // ✅ Get the Virtual Now using the offset calculated in your header/dashboard
  const offset = parseInt(localStorage.getItem('timeWarpOffset') || "0");
  const virtualNow = new Date(Date.now() + offset);

  // Use the virtual date as the baseline for "Today"
  const today = startOfDay(virtualNow);
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
  const steps = [];

  const fullName = (person) => {
    if (!person) return "Unknown user";
    const first = person.first_name || "";
    const last = person.last_name || "";
    const role = person.role ? ` (${String(person.role).replace(/_/g, " ")})` : "";
    return `${first} ${last}`.trim() + role;
  };

  const fmtDate = (dateVal) => {
    if (!dateVal) return "—";
    const d = new Date(dateVal);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString();
  };

  const addStep = ({ date, icon, title, desc }) => {
    if (!date) return;
    steps.push({
      sortDate: new Date(date).getTime(),
      dateText: fmtDate(date),
      icon,
      title,
      desc
    });
  };

  addStep({
    date: report.createdAt,
    icon: "bi-file-earmark-plus",
    title: "Report Submitted",
    desc: "Heat report was submitted."
  });

  addStep({
    date: report.approved_at,
    icon: "bi-check2-circle",
    title: "Report Approved",
    desc: `Approved by ${fullName(report.approved_by)}.`
  });

  addStep({
    date: report.rejected_at,
    icon: "bi-x-circle",
    title: "Report Rejected",
    desc: `Rejected by ${fullName(report.rejected_by)}.${report.rejection_message ? ` Reason: ${report.rejection_message}` : ""}`
  });

  addStep({
    date: report.ai_confirmed_at,
    icon: "bi-clipboard2-check",
    title: "AI Service Confirmed",
    desc: `Confirmed by ${fullName(report.ai_confirmed_by)}.`
  });

  addStep({
    date: report.pregnancy_confirmed_at,
    icon: "bi-heart-pulse",
    title: "Pregnancy Confirmed",
    desc: `Confirmed by ${fullName(report.pregnancy_confirmed_by)}.`
  });

  addStep({
    date: report.still_in_heat_at,
    icon: "bi-arrow-repeat",
    title: "Returned to Heat",
    desc: `${report.still_in_heat_reason || "Returned to heat"} by ${fullName(report.still_in_heat_by)}.`
  });

  addStep({
    date: report.actual_farrowing_date,
    icon: "bi-calendar2-heart",
    title: "Farrowing Confirmed",
    desc: `Confirmed by ${fullName(report.farrowing_confirmed_by)}.`
  });

  addStep({
    date: report.weaning_date,
    icon: "bi-scissors",
    title: "Weaning Confirmed",
    desc: `Confirmed by ${fullName(report.weaning_confirmed_by)}.`
  });

  return steps.sort((a, b) => a.sortDate - b.sortDate);
}