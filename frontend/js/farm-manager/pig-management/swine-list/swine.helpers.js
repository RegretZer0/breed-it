// swine.helpers.js

/* =========================================================
   STAGE DISPLAY
========================================================= */
export function formatStageDisplay(stage) {
  const raw = (stage ?? "").toString().trim();
  if (!raw) return "—";

  // Exact map (keep your originals)
  const exactMap = {
    "Monitoring (Day 1-30)": "Piglet",
    "Weaned (Monitoring 3 Months)": "Weaner",
    "Final Selection": "Selection",
    "Monthly Update": "Routine Update",
    Routine: "Routine",
    "Market-Ready": "Market Ready",
    Open: "Adult",
    Pregnant: "Pregnant",
    Lactating: "Lactating",
    "In-Heat": "In Heat",
    "Under Observation": "Under Observation",
    Bred: "Bred",
    Farrowing: "Farrowing",

    // schema stages
    piglet: "Piglet",
    growing: "Weaner",
    adult: "Adult",
  };

  const rawLower = raw.toLowerCase();
  if (exactMap[raw]) return exactMap[raw];
  if (exactMap[rawLower]) return exactMap[rawLower];

  // Normalize for fuzzy matching
  const norm = raw
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[–—]/g, "-")
    .trim();

  // Common variants
  const rules = [
    {
      test: (s) => s.includes("monitoring") && (s.includes("1-30") || s.includes("day")),
      val: "Piglet",
    },
    { test: (s) => s.includes("piglet"), val: "Piglet" },
    { test: (s) => s.includes("wean"), val: "Weaner" },
    {
      test: (s) => s.includes("final selection") || s === "selection" || s.includes("selection"),
      val: "Selection",
    },
    { test: (s) => s.includes("market"), val: "Market Ready" },
    { test: (s) => s === "open" || s.includes("adult"), val: "Adult" },
    { test: (s) => s.includes("pregnant"), val: "Pregnant" },
    { test: (s) => s.includes("lactat"), val: "Lactating" },
    { test: (s) => s.includes("in-heat") || s.includes("in heat") || s === "heat", val: "In Heat" },
    {
      test: (s) => s.includes("under observation") || s.includes("observation"),
      val: "Under Observation",
    },
    { test: (s) => s.includes("bred"), val: "Bred" },
    { test: (s) => s.includes("farrow"), val: "Farrowing" },
    { test: (s) => s.includes("routine") || s.includes("monthly"), val: "Routine Update" },
  ];

  for (const r of rules) {
    if (r.test(norm)) return r.val;
  }

  return raw;
}

/* =========================================================
   AGE FORMATTER
   - Accepts:
     1) months number
     2) birth_date (string/Date)
     3) object: { months, birth_date, is_dead, end_date }
   - Shows days when < 30 days (avoid "0 Months")
   - "Dead" should NOT keep updating: pass { is_dead: true, end_date: <date> }
========================================================= */
export function formatAge(input) {
  let months = null;
  let birthDate = null;
  let isDead = false;
  let endDate = null;

  // normalize object input
  if (input && typeof input === "object" && !(input instanceof Date)) {
    if (Number.isFinite(Number(input.months))) months = Number(input.months);

    if (input.birth_date) birthDate = input.birth_date instanceof Date ? input.birth_date : new Date(input.birth_date);

    if (typeof input.is_dead === "boolean") isDead = input.is_dead;

    if (input.end_date) endDate = input.end_date instanceof Date ? input.end_date : new Date(input.end_date);
  } else if (typeof input === "number" && Number.isFinite(input)) {
    months = input;
  } else if (typeof input === "string" || input instanceof Date) {
    birthDate = input instanceof Date ? input : new Date(input);
  }

  // Validate dates
  if (birthDate && Number.isNaN(birthDate.getTime())) birthDate = null;
  if (endDate && Number.isNaN(endDate.getTime())) endDate = null;

  // If we have birthDate, compute from it (preferred: supports days)
  if (birthDate) {
    const now = new Date();
    const ref = isDead ? (endDate || now) : now;

    const msDiff = ref.getTime() - birthDate.getTime();
    if (!Number.isFinite(msDiff) || msDiff < 0) return "—";

    const days = Math.floor(msDiff / (1000 * 60 * 60 * 24));
    const safeDays = Math.max(0, days);

    // ✅ Under 30 days -> show Days (avoid "0 Months")
    if (safeDays < 30) {
      return `${safeDays} ${safeDays === 1 ? "Day" : "Days"}`;
    }

    // Otherwise compute months approx (keeps your prior behavior)
    months = Math.floor(msDiff / (1000 * 60 * 60 * 24 * 30));
  }

  if (months === null) return "—";

  const m = Math.max(0, Math.floor(months));
  const years = Math.floor(m / 12);
  const remMonths = m % 12;

  const yearText = years > 0 ? `${years} ${years === 1 ? "Year" : "Years"}` : "";
  const monthText = remMonths > 0 ? `${remMonths} ${remMonths === 1 ? "Month" : "Months"}` : "";

  if (years > 0 && remMonths > 0) return `${yearText} ${monthText}`;
  if (years > 0) return yearText;

  // months-only (>= 1 month here), but keep safe fallback
  return monthText || "0 Months";
}

/* =========================================================
   LATEST PERFORMANCE (safe + consistent)
========================================================= */
export function getLatestPerf(sw) {
  const p = sw?.performance_records?.slice(-1)[0] || {};

  const w = p?.weight;
  const l = p?.body_length;
  const g = p?.heart_girth;

  return {
    weight: Number.isFinite(Number(w)) ? Number(w) : (w ?? "--"),
    length: Number.isFinite(Number(l)) ? Number(l) : (l ?? "--"),
    girth: Number.isFinite(Number(g)) ? Number(g) : (g ?? "--"),
    date: p?.record_date ? new Date(p.record_date) : null,
    stage: p?.stage || "Monthly Update",
  };
}

/* =========================================================
   GLOBAL LOADER
========================================================= */
export function showGlobalLoader(text = "Loading...") {
  const loader = document.getElementById("globalLoader");
  if (!loader) return;

  const textEl = loader.querySelector(".loader-text");
  if (textEl) textEl.textContent = text;

  loader.classList.remove("d-none");
}

export function hideGlobalLoader() {
  const loader = document.getElementById("globalLoader");
  if (!loader) return;

  loader.classList.add("d-none");
}

/* =========================================================
   SAFE CALL
========================================================= */
export function safeCall(fn, ...args) {
  try {
    if (typeof fn === "function") return fn(...args);
  } catch (e) {
    console.warn("safeCall error:", e);
  }
  return undefined;
}

/* =========================================================
   SAFE TEXT SETTER (handy for modal hydration)
========================================================= */
export function setText(id, value = "—") {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

/* =========================================================
   OPTIONAL HELPERS
========================================================= */
export function normalizeStr(v) {
  return String(v ?? "").trim().toLowerCase();
}

export function safeNumber(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeSex(v) {
  const s = normalizeStr(v);
  if (!s) return "";
  if (s === "m" || s === "male" || s === "boar") return "male";
  if (s === "f" || s === "female" || s === "sow") return "female";
  return s;
}

export function formatDateShort(d) {
  try {
    const dt = d instanceof Date ? d : new Date(d);
    if (!dt || Number.isNaN(dt.getTime())) return "—";
    return dt.toLocaleDateString();
  } catch {
    return "—";
  }
}

/* =========================================================
   PAGINATION HELPERS
========================================================= */
export function paginate(list = [], page = 1, perPage = 5) {
  const total = Array.isArray(list) ? list.length : 0;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const p = Math.min(totalPages, Math.max(1, Number(page) || 1));
  const start = (p - 1) * perPage;
  const items = (Array.isArray(list) ? list : []).slice(start, start + perPage);
  return { items, page: p, perPage, total, totalPages };
}