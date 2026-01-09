/**
 * authGuard.js
 * 
 * Protect frontend pages by checking JWT token and session with backend.
 * @param {string} requiredRole - "admin", "farmer", or null for any logged-in user
 * @returns {Promise<object|null>} - Returns user object if authenticated, else redirects
 */
export async function authGuard(requiredRole = null) {
  // Check token in localStorage
  const token = localStorage.getItem("token");

  if (!token) {
    // Not logged in
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

    const data = await res.json();

    if (!res.ok || !data.success || !data.user) {
      // Session expired or invalid
      localStorage.clear();
      alert("Session expired. Redirecting to login...");
      window.location.href = "login.html";
      return null;
    }

    // Role check
    if (requiredRole && data.user.role !== requiredRole) {
      localStorage.clear();
      alert("Access denied. Redirecting to login...");
      window.location.href = "login.html";
      return null;
    }

    // Return the authenticated user object
    return data.user;

  } catch (err) {
    console.error("Auth check failed:", err);
    localStorage.clear();
    alert("Server error. Redirecting to login...");
    window.location.href = "login.html";
    return null;
  }
}
