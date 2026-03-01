// /js/reproduction/reproduction.api.js
// API + auth helpers (MVP: Model/Data layer helpers)

export function debugLog(task, data, isError = false) {
  const icon = isError ? "❌" : "📡";
  const color = isError
    ? "color: #ff4d4d; font-weight: bold;"
    : "color: #00b894; font-weight: bold;";
  // eslint-disable-next-line no-console
  console.log(`%c${icon} [DEBUG: ${task}]`, color, data);
}

export function getCleanToken() {
  let token = localStorage.getItem("token");

  // handle tokens stored as JSON string (quoted)
  if (typeof token === "string") {
    token = token.trim();
    if (
      (token.startsWith('"') && token.endsWith('"')) ||
      (token.startsWith("'") && token.endsWith("'"))
    ) {
      token = token.slice(1, -1).trim();
    }
  }

  // normalize empties
  if (!token) return null;
  if (token === "null" || token === "undefined") return null;

  return token;
}

export function makeIsMySwine(user) {
  return (item) => {
    const ownerId =
      item?.farmer_id?._id ||
      item?.farmer_id ||
      item?.farmer ||
      item?.owner;

    const loggedInId = user?.farmerProfileId || user?.id || user?._id;

    if (!ownerId || !loggedInId) return false;
    return ownerId.toString() === loggedInId.toString();
  };
}

// ---------- internal helpers ----------
function isAuthFailureStatus(status) {
  // many backends use 401 (unauthorized) OR 403 (forbidden) for JWT problems
  return status === 401 || status === 403;
}

async function safeReadJson(res) {
  // Avoid crashing when backend returns HTML/plain text
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { success: false, message: text };
  }
}

/* =========================================================
   UX FEEDBACK MODAL (Bootstrap) — shared helper
   - Used to show success/error messages instead of alert()
   - Safe fallback to alert() if bootstrap is missing
========================================================= */
export function ensureReproFeedbackModal() {
  let el = document.getElementById("reproFeedbackModal");
  if (el) return el;

  el = document.createElement("div");
  el.className = "modal fade";
  el.id = "reproFeedbackModal";
  el.tabIndex = -1;
  el.setAttribute("aria-hidden", "true");

  el.innerHTML = `
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content border-0 shadow">
        <div class="modal-header">
          <h5 class="modal-title" id="reproFeedbackTitle">Message</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div id="reproFeedbackBody" class="small"></div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-success btn-sm" data-bs-dismiss="modal">Close</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(el);
  return el;
}

export function showReproFeedback({ title = "Message", message = "", variant = "success" } = {}) {
  const el = ensureReproFeedbackModal();

  const titleEl = el.querySelector("#reproFeedbackTitle");
  const bodyEl = el.querySelector("#reproFeedbackBody");
  const headerEl = el.querySelector(".modal-header");

  if (titleEl) titleEl.textContent = String(title || "Message");
  if (bodyEl) bodyEl.textContent = String(message || "");

  if (headerEl) {
    headerEl.classList.remove("text-success", "text-danger", "text-warning", "text-dark");
    if (variant === "danger") headerEl.classList.add("text-danger");
    else if (variant === "warning") headerEl.classList.add("text-warning");
    else headerEl.classList.add("text-success");
  }

  const modal = window.bootstrap ? bootstrap.Modal.getOrCreateInstance(el) : null;
  if (modal) modal.show();
  else window.alert(`${title}\n\n${message}`); // fallback
}

/**
 * Auth fetch for both:
 * - /api/reproduction/*
 * - /api/*
 */
export async function authFetch({ endpoint, token, baseUrl = "http://localhost:5000" }) {
  const cleanToken = token || getCleanToken();

  // ✅ IMPORTANT: do not call backend if token is missing/empty
  if (!cleanToken) {
    debugLog("AUTH_NO_TOKEN", { endpoint }, true);
    return { authError: true, reason: "NO_TOKEN" };
  }

  // identify reproduction endpoints (endpoint values usually like "/ai-history")
  const isRepro =
    endpoint.includes("ai-history") ||
    endpoint.includes("performance-analytics") ||
    endpoint.includes("selection-candidates") ||
    endpoint.includes("piglet-monitoring") ||
    endpoint.includes("piglet-action") ||
    endpoint.includes("piglets/by-cycle") ||
    endpoint.includes("due-for-farrowing") ||
    endpoint.includes("complete-cycle") ||
    endpoint.includes("batch-register-litter") ||
    endpoint.includes("process-selection");

  let apiPath = "";
  if (endpoint.startsWith("/api")) {
    apiPath = endpoint;
  } else {
    apiPath = isRepro ? `/api/reproduction${endpoint}` : `/api${endpoint}`;
  }

  const url = `${baseUrl}${apiPath}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (isAuthFailureStatus(res.status)) {
      debugLog("AUTH_ERROR_STATUS", { endpoint, status: res.status }, true);
      return { authError: true, status: res.status };
    }

    const data = await safeReadJson(res);

    // If server responded but not success, still log it (helps debugging)
    debugLog(`FETCH_SUCCESS: ${endpoint}`, data);

    // Optional: if backend uses {message:"jwt expired"} with 200/500 text,
    // you can detect and convert to authError:
    const msg = (data?.message || data?.error || "").toString().toLowerCase();
    if (msg.includes("jwt") && (msg.includes("expired") || msg.includes("invalid") || msg.includes("malformed"))) {
      return { authError: true, status: res.status || 0, message: data?.message || data?.error };
    }

    return data;
  } catch (err) {
    debugLog("FETCH_ERROR", { endpoint, error: err?.message || err }, true);
    return { success: false, error: err?.message || String(err) };
  }
}

export async function authPost({ endpoint, token, body, baseUrl = "http://localhost:5000" }) {
  const cleanToken = token || getCleanToken();

  // ✅ IMPORTANT: do not call backend if token is missing/empty
  if (!cleanToken) {
    debugLog("AUTH_NO_TOKEN_POST", { endpoint }, true);
    return { authError: true, reason: "NO_TOKEN" };
  }

  const url = endpoint.startsWith("/api")
    ? `${baseUrl}${endpoint}`
    : `${baseUrl}/api/reproduction${endpoint}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body || {}),
    });

    if (isAuthFailureStatus(res.status)) {
      debugLog("AUTH_ERROR_STATUS_POST", { endpoint, status: res.status }, true);
      return { authError: true, status: res.status };
    }

    const data = await safeReadJson(res);
    debugLog(`POST_SUCCESS: ${endpoint}`, data);

    // If backend responds non-2xx but still returns JSON, preserve it and let caller decide
    // (we don't throw; we normalize in postPigletAction)
    return data;
  } catch (err) {
    debugLog("POST_ERROR", { endpoint, error: err?.message || err }, true);
    return { success: false, error: err?.message || String(err) };
  }
}

// ---------------------------------------------------------
// Piglet actions (Selection Process)
// ---------------------------------------------------------
function normalizePigletAction(action) {
  const a = String(action || "").toLowerCase().trim();
  if (a === "retain") return "breeding";
  if (a === "sale") return "sell"; // normalize UI "sale" -> backend "sell"
  if (a === "sell") return "sell";
  if (a === "breeding") return "breeding";
  if (a === "pending") return "pending";
  return a;
}

function actionLabel(act) {
  if (act === "breeding") return "Retain";
  if (act === "sell") return "Sale";
  if (act === "pending") return "Pending";
  return act;
}

function guessVariantFromActAndOk(act, ok) {
  if (!ok) return "danger";
  if (act === "breeding") return "success";
  if (act === "sell") return "danger";
  return "warning";
}

function humanizeKnownBackendErrors(message) {
  const msg = String(message || "");
  const low = msg.toLowerCase();

  // "Swine validation failed: current_status: ... not a valid enum value ..."
  if (low.includes("validation failed") && low.includes("current_status") && low.includes("enum")) {
    return "Backend rejected the update because the status value is not allowed by the Swine schema enum. This cannot be fixed purely in frontend. Update /api/reproduction/piglet-action to save enum-safe values (example: Active / Under Monitoring / Culled/Sold).";
  }

  return msg;
}

/**
 * POST /api/reproduction/piglet-action
 * Body: { swineId, action }
 * Returns: backend JSON + extra UI hints
 */
export async function postPigletAction({ swineId, action, token, baseUrl }) {
  const act = normalizePigletAction(action);

  const res = await authPost({
    endpoint: "/piglet-action",
    token,
    baseUrl,
    body: { swineId, action: act },
  });

  const ok = !!res?.success;
  const rawMsg = (res?.message || res?.error || "Request failed").toString();
  const msg = humanizeKnownBackendErrors(rawMsg);
  const variant = guessVariantFromActAndOk(act, ok);

  return {
    ...res,
    ok,
    action: act,
    actionLabel: actionLabel(act),
    variant,
    message: msg,
  };
}

/**
 * Executes piglet action, then shows a Bootstrap modal message automatically.
 * - Does NOT refresh any UI by itself (caller should reload/re-render).
 */
export async function postPigletActionWithModal({ swineId, action, token, baseUrl, title } = {}) {
  const result = await postPigletAction({ swineId, action, token, baseUrl });

  const t = title || (result.ok ? "Saved" : "Action failed");
  const suffix = result?.actionLabel ? ` (${result.actionLabel})` : "";

  showReproFeedback({
    title: `${t}${suffix}`,
    message: result.message || (result.ok ? "Update saved." : "Request failed."),
    variant: result.variant || (result.ok ? "success" : "danger"),
  });

  return result;
}

/* =========================================================
   GLOBAL FALLBACK HANDLER (so you don't need to find where it is)
   - Your views currently call: onclick="processPigletAction('id','breeding')"
   - If you can't find the file that defines it, this guarantees it exists.
========================================================= */
function toBaseUrlMaybe() {
  // allow overriding via global if you have it
  return window.BACKEND_URL || "http://localhost:5000";
}

function normalizeActionFromUI(action) {
  // accepts: breeding/sell/pending OR retain/sale
  const a = String(action || "").toLowerCase().trim();
  if (a === "retain") return "breeding";
  if (a === "sale") return "sell";
  return a;
}

// Expose global ONLY if not already defined (avoid breaking your other module)
if (typeof window !== "undefined" && typeof window.processPigletAction !== "function") {
  window.processPigletAction = async (swineId, action, opts = {}) => {
    const baseUrl = opts.baseUrl || toBaseUrlMaybe();
    const token = opts.token || getCleanToken();

    const act = normalizeActionFromUI(action);

    // Optional confirm UX
    const confirmEnabled = opts.confirm !== false; // default true
    if (confirmEnabled) {
      const label = act === "breeding" ? "Retain" : act === "sell" ? "Sale" : "Pending";
      const ok = window.confirm(`Confirm action: ${label}?`);
      if (!ok) return { ok: false, cancelled: true };
    }

    const result = await postPigletActionWithModal({
      swineId,
      action: act,
      token,
      baseUrl,
      title: opts.title,
    });

    // Optional callback for refresh/re-render if you want to pass it from UI:
    if (result?.ok && typeof opts.onSuccess === "function") {
      try {
        await opts.onSuccess(result);
      } catch (e) {
        debugLog("POST_ACTION_onSuccess_ERROR", e?.message || e, true);
      }
    }

    return result;
  };
}