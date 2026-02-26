/**
 * /js/authGuard.js
 *
 * Protect frontend pages by checking JWT token + backend session.
 * - Supports requiredRole as string | string[] | null
 * - IMPORTANT: Do NOT clear token/logout on AbortError (common during fast navigation)
 */
export async function authGuard(requiredRole = null) {
  // Normalize roles
  const allowedRoles = Array.isArray(requiredRole)
    ? requiredRole
    : typeof requiredRole === "string"
    ? [requiredRole]
    : [];

  const token = localStorage.getItem("token");

  if (!token) {
    console.warn("[authGuard] No token found in localStorage.");
    alert("You are not logged in. Redirecting to login...");
    window.location.href = "/login";
    return null;
  }

  // Abort request if page is navigating away (prevents “false logout”)
  const controller = new AbortController();
  const abortOnLeave = () => controller.abort();
  window.addEventListener("pagehide", abortOnLeave, { once: true });
  window.addEventListener("beforeunload", abortOnLeave, { once: true });

  try {
    const res = await fetch("http://localhost:5000/api/auth/me", {
      method: "GET",
      credentials: "include",
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
      cache: "no-store",
    });

    // Try parse JSON safely
    let data = null;
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        data = await res.json();
      } catch (e) {
        console.warn("[authGuard] JSON parse failed, continuing with null data:", e);
      }
    } else {
      // not JSON (sometimes happens if server returns HTML error page)
      try {
        const text = await res.text();
        console.warn("[authGuard] Non-JSON response from /api/auth/me:", text?.slice?.(0, 200));
      } catch {}
    }

    // Hard auth failure: ONLY here we clear + redirect
    if (res.status === 401 || res.status === 403) {
      console.warn("[authGuard] Unauthorized:", res.status, data);
      localStorage.removeItem("token");
      alert("Session expired. Please log in again.");
      window.location.href = "/login";
      return null;
    }

    // Any other non-ok response: do NOT auto logout (could be server hiccup)
    if (!res.ok) {
      console.error("[authGuard] Server returned error status:", res.status, data);
      // Keep user logged in; you may optionally show a toast instead of alert
      return null;
    }

    // Validate payload shape
    if (!data?.success || !data?.user) {
      console.warn("[authGuard] Invalid payload shape:", data);
      // If backend explicitly indicates invalid session, you MAY logout.
      // But only do it when it's explicit.
      // If you want stricter behavior, uncomment below:
      // localStorage.removeItem("token");
      // alert("Session expired. Please log in again.");
      // window.location.href = "/login";
      return null;
    }

    // Role check (case-insensitive)
    if (allowedRoles.length) {
      const userRole = String(data.user.role || "").toLowerCase().trim();
      const normalizedAllowed = allowedRoles.map(r => String(r).toLowerCase().trim());

      if (!normalizedAllowed.includes(userRole)) {
        console.warn("[authGuard] Access denied:", { allowed: normalizedAllowed, actual: userRole });
        // Access denied is real → clear token and redirect
        localStorage.removeItem("token");
        alert("Access denied. Redirecting to login...");
        window.location.href = "/login";
        return null;
      }
    }

    return data.user;
  } catch (err) {
    // IMPORTANT: AbortError happens during rapid navigation — DO NOT logout.
    if (err?.name === "AbortError") {
      console.debug("[authGuard] Request aborted due to navigation; not logging out.");
      return null;
    }

    // Network/server error — do NOT clear token; keep session and allow retry
    console.error("[authGuard] Auth check failed (network/server). Not clearing token:", err);
    // Optional: show a non-blocking message instead of alert.
    // alert("Connection issue. Please try again.");
    return null;
  } finally {
    window.removeEventListener("pagehide", abortOnLeave);
    window.removeEventListener("beforeunload", abortOnLeave);
  }
}