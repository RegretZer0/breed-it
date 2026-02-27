// /js/farmer/reproduction/reproduction_monitoring.js
import { authGuard } from "/js/authGuard.js";
import { initReproList } from "/js/farmer/reproduction/reproduction_list.js";
import { initReproModal } from "/js/farmer/reproduction/reproduction_modal.js";

document.addEventListener("DOMContentLoaded", async () => {
  // =========================
  // DEBUG LOG
  // =========================
  const debugLog = (task, data, isError = false) => {
    const icon = isError ? "❌" : "📡";
    const color = isError ? "color:#ff4d4d;font-weight:bold;" : "color:#00b894;font-weight:bold;";
    console.log(`%c${icon} [${task}]`, color, data);
  };

  // =========================
  // AUTH
  // =========================
  const user = await authGuard();
  if (!user) return;

  const getCleanToken = () => {
    let t = localStorage.getItem("token");
    if (!t) return null;
    if (t.startsWith('"') || t.startsWith("'")) t = t.slice(1, -1);
    return t.trim();
  };

  const token = getCleanToken();
  if (!token) return;

  // =========================
  // CONFIG
  // =========================
  const BACKEND_URL = window.BACKEND_URL || "http://localhost:5000";

  // =========================
  // SHARED HELPERS (used by list + modal)
  // =========================
  const safeLower = (v) => (v ?? "").toString().trim().toLowerCase();
  const safeText = (v) => (v ?? "—").toString();

  function fmtDate(d) {
    if (!d) return "—";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "—";
    return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
  }

  function computeAgeText(sw) {
    const raw = sw.birth_date || sw.birthDate || sw.dob || sw.birthdate;
    if (!raw) return "—";
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return "—";
    const now = new Date();
    const diff = Math.max(0, now - d);
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days < 30) return `${days} day(s)`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month(s)`;
    const years = Math.floor(months / 12);
    return `${years} year(s)`;
  }

  function normalizeHealth(sw) {
    const hs = safeLower(sw.health_status || sw.healthStatus || "");
    if (hs.includes("deceased") || hs.includes("dead")) return "dead";
    if (hs.includes("healthy") || hs.includes("sick") || hs.includes("alive")) return "alive";
    return "";
  }

  function normalizeStage(sw) {
    return safeLower(sw.current_status || sw.current_stage || "");
  }

  function normalizeSex(sw) {
    return safeLower(sw.sex || "");
  }

  function normalizeAgeStage(sw) {
    return safeLower(sw.age_stage || "");
  }

  function getSwineTag(sw) {
    return sw.swine_id || sw.swine_tag || sw.tag || sw.code || "N/A";
  }

  function isSowOnly(sw) {
    return normalizeSex(sw) === "female" && normalizeAgeStage(sw) === "adult";
  }

  function badgeForStage(stage) {
    const s = safeLower(stage);
    if (s.includes("preg")) return "text-bg-info";
    if (s.includes("in-heat") || s.includes("heat")) return "text-bg-warning";
    if (s.includes("under observation") || s.includes("observation")) return "text-bg-dark";
    if (s.includes("lact")) return "text-bg-success";
    if (s.includes("farrow")) return "text-bg-primary";
    if (s.includes("open")) return "text-bg-secondary";
    return "text-bg-secondary";
  }

  function badgeForHealth(health) {
    if (health === "dead") return "text-bg-danger";
    if (health === "alive") return "text-bg-success";
    return "text-bg-secondary";
  }

  function buildPhotoUrlFromPath(p) {
    const path = (p || "").toString().trim();
    if (!path) return "";
    if (path.startsWith("http")) return path;
    return `${BACKEND_URL}${path}`;
  }

  function pick(obj, keys, fallback = null) {
    for (const k of keys) {
      if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
    }
    return fallback;
  }

  async function apiGet(path) {
    const url = `${BACKEND_URL}${path}`;
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        debugLog("API_ERROR", { url, status: res.status, json }, true);
        return null;
      }
      return json;
    } catch (err) {
      debugLog("FETCH_FAIL", { url, err: err.message }, true);
      return null;
    }
  }

  const helpers = {
    debugLog,
    BACKEND_URL,
    token,
    safeLower,
    safeText,
    fmtDate,
    computeAgeText,
    normalizeHealth,
    normalizeStage,
    normalizeSex,
    normalizeAgeStage,
    getSwineTag,
    isSowOnly,
    badgeForStage,
    badgeForHealth,
    buildPhotoUrlFromPath,
    pick,
    apiGet,
  };

  // =========================
  // INIT MODAL (returns openDetailsModal + state getters)
  // =========================
  const modal = initReproModal(helpers);

  // =========================
  // INIT LIST (connects list -> modal.openDetailsModal)
  // =========================
  const list = initReproList({
    ...helpers,
    onOpenDetails: modal.openDetailsModal,
    onModalStateChanged: modal.onModalStateChanged,
  });

  // Initial load
  await list.loadSows();
});