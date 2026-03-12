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

  const fmtDate = (dateVal) => {
    if (!dateVal) return "—";
    const d = new Date(dateVal);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString();
  };

  const roleText = (role) => String(role || "unknown").replace(/_/g, " ");

  const fullName = (person) => {
    if (!person) return "Unknown user";
    const first = person.first_name || "";
    const last = person.last_name || "";
    const full = `${first} ${last}`.trim();
    const base =
      full ||
      person.name ||
      person.full_name ||
      person.display_name ||
      person.email ||
      "Unknown user";
    const role = person.role ? ` (${roleText(person.role)})` : "";
    return `${base}${role}`;
  };

  const actorLineFromHistory = (item) => {
    const actorName =
      item?.actor_name ||
      item?.actorName ||
      "Unknown user";

    const actorRole =
      item?.actor_role ||
      item?.actorRole ||
      "unknown";

    return `${actorName} (${roleText(actorRole)})`;
  };

  const iconFromEvent = (eventKey, toStatus) => {
    const key = String(eventKey || "").toLowerCase();
    const st = String(toStatus || "").toLowerCase();

    if (key.includes("submitted")) return "bi-file-earmark-plus";
    if (key.includes("approved")) return "bi-check2-circle";
    if (key.includes("rejected")) return "bi-x-circle";
    if (key.includes("ai")) return "bi-clipboard2-check";
    if (key.includes("pregnancy")) return "bi-heart-pulse";
    if (key.includes("still_in_heat") || key.includes("reset")) return "bi-arrow-repeat";
    if (key.includes("farrowing")) return "bi-calendar2-heart";
    if (key.includes("weaning")) return "bi-scissors";

    if (st === "pending") return "bi-file-earmark-plus";
    if (st === "approved") return "bi-check2-circle";
    if (st === "rejected") return "bi-x-circle";
    if (st === "under_observation") return "bi-clipboard2-check";
    if (st === "pregnant") return "bi-heart-pulse";
    if (st === "lactating") return "bi-calendar2-heart";
    if (st === "completed") return "bi-scissors";

    return "bi-clock-history";
  };

  const addStep = ({ date, icon, title, desc }) => {
    if (!date) return;

    const ts = new Date(date).getTime();
    if (Number.isNaN(ts)) return;

    steps.push({
      sortDate: ts,
      dateText: fmtDate(date),
      icon,
      title,
      desc
    });
  };

  const history = Array.isArray(report?.progress_history) ? report.progress_history : [];

  if (history.length) {
    history.forEach((item) => {
      const eventKey = item?.event_key || "";
      const title = item?.title || "Activity Recorded";
      const description = item?.description || "No description available.";
      const toStatus = item?.to_status || "";
      const date = item?.action_at || item?.createdAt || null;

      addStep({
        date,
        icon: iconFromEvent(eventKey, toStatus),
        title,
        desc: `${description} By ${actorLineFromHistory(item)}.`
      });
    });

    return steps.sort((a, b) => b.sortDate - a.sortDate);
  }

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

  return steps.sort((a, b) => b.sortDate - a.sortDate);
}