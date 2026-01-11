document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const messageEl = document.getElementById("message");

  messageEl.style.color = "black";
  messageEl.textContent = "Logging in...";

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      credentials: "include", // session cookie
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.message || "Login failed");
    }

    // Optional: store JWT if backend still provides it
    if (data.token) {
      localStorage.setItem("token", data.token);
    }

    // Store user info
    localStorage.setItem("user", JSON.stringify(data.user));
    localStorage.setItem("userId", data.user._id || data.user.id);
    localStorage.setItem("role", data.user.role);

    messageEl.style.color = "green";
    messageEl.textContent = "Login successful! Redirecting...";

    // ✅ ROLE → ROUTE MAP (single source of truth)
    const roleRedirectMap = {
      system_admin: "/system-admin/dashboard",
      farm_manager: "/farm-manager/dashboard",
      encoder: "/encoder/dashboard",
      farmer: "/farmer/dashboard",
    };

    const redirectPath = roleRedirectMap[data.user.role];

    setTimeout(() => {
      if (!redirectPath) {
        console.warn("Unknown role:", data.user.role);
        messageEl.style.color = "red";
        messageEl.textContent =
          "Unknown role. Please contact the administrator.";
        return;
      }

      window.location.href = redirectPath;
    }, 800);

  } catch (err) {
    console.error("Login error:", err);
    messageEl.style.color = "red";
    messageEl.textContent = err.message || "Login failed";
  }
});
