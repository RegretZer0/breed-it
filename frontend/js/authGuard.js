/**
 * authGuard.js
 * 
 * Protect frontend pages by checking JWT token and session with backend.
 * @param {string|string[]|null} requiredRole - "admin", "farm_manager", "farmer", "encoder", or null for any logged-in user
 * @returns {Promise<object|null>} - Returns user object if authenticated, else redirects
 */
export async function authGuard(requiredRole = null) {
  // Convert single role string to array for uniformity
  let allowedRoles = [];
  if (typeof requiredRole === "string") {
    allowedRoles = [requiredRole];
  } else if (Array.isArray(requiredRole)) {
    allowedRoles = requiredRole;
  }

  // Check token in localStorage
  const token = localStorage.getItem("token");

  if (!token) {
    console.warn("[authGuard] No token found in localStorage.");
    alert("You are not logged in. Redirecting to login...");
    window.location.href = "login.html";
    return null;
  }

  try {
    // Verify session + token with backend
    const res = await fetch("http://localhost:5000/api/auth/me", {
      method: "GET",
      credentials: "include", // include session cookie
      headers: {
        Authorization: `Bearer ${token}`, // JWT token
      },
    });

    let data;
    try {
      data = await res.json();
    } catch (parseErr) {
      console.error("[authGuard] Failed to parse JSON from /api/auth/me:", parseErr);
      console.log("[authGuard] Raw response text:", await res.text());
      localStorage.clear();
      alert("Server returned invalid response. Redirecting to login...");
      window.location.href = "login.html";
      return null;
    }

    console.log("[authGuard] /api/auth/me response:", res.status, data);

    if (!res.ok || !data.success || !data.user) {
      console.warn("[authGuard] Session invalid or expired. Clearing localStorage.");
      localStorage.clear();
      alert("Session expired. Please log in again.");
      window.location.href = "login.html";
      return null;
    }

    // Role check
    if (allowedRoles.length > 0 && !allowedRoles.includes(data.user.role)) {
      console.warn(`[authGuard] Access denied. Allowed roles: ${allowedRoles.join(", ")}, actual role: ${data.user.role}`);
      localStorage.clear();
      alert("Access denied. Redirecting to login...");
      window.location.href = "login.html";
      return null;
    }

    // Success
    console.log("[authGuard] Authenticated user:", data.user);
    return data.user;

  } catch (err) {
    console.error("[authGuard] Auth check failed due to server error:", err);
    localStorage.clear();
    alert("Server error. Redirecting to login...");
    window.location.href = "login.html";
    return null;
  }
}
