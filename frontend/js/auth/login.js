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
      credentials: "include",
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.message || "Login failed");
    }

    // ✅ Normalize full name (from prototype)
    const fullName =
      `${data.user.first_name || ""} ${data.user.last_name || ""}`.trim() ||
      "User";

    // Optional: store JWT if backend provides it
    if (data.token) {
      localStorage.setItem("token", data.token);
    }

    // ✅ Enhanced user storage
    localStorage.setItem(
      "user",
      JSON.stringify({ ...data.user, name: fullName })
    );
    localStorage.setItem("userId", data.user._id || data.user.id);
    localStorage.setItem("role", data.user.role);
    localStorage.setItem("name", fullName); // quick access

    messageEl.style.color = "green";
    messageEl.textContent = "Login successful! Redirecting...";

    // ✅ Centralized role → route map (kept)
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

// =========================
// TOGGLE PASSWORD VISIBILITY
// =========================
document.addEventListener("DOMContentLoaded", () => {
  const toggleBtn = document.querySelector(".toggle-pass");
  const passwordInput = document.getElementById("password");
  const icon = toggleBtn?.querySelector("i");

  if (!toggleBtn || !passwordInput || !icon) return;

  toggleBtn.addEventListener("click", () => {
    const isHidden = passwordInput.type === "password";

    passwordInput.type = isHidden ? "text" : "password";

    icon.classList.toggle("fa-eye", !isHidden);
    icon.classList.toggle("fa-eye-slash", isHidden);

    toggleBtn.setAttribute(
      "aria-label",
      isHidden ? "Hide password" : "Show password"
    );
  });
});
