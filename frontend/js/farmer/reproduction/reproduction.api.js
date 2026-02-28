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
    endpoint.includes("piglet-action");

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
    return data;
  } catch (err) {
    debugLog("POST_ERROR", { endpoint, error: err?.message || err }, true);
    return { success: false, error: err?.message || String(err) };
  }
}