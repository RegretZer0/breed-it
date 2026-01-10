// ============================
// Clear any old auth state
// ============================
localStorage.removeItem("token");
localStorage.removeItem("user");
localStorage.removeItem("role");
localStorage.removeItem("userId");

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  if (!form) return;

  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const messageEl = document.getElementById("message");

  // ============================
  // Password toggle (eye icon)
  // ============================
  document.querySelectorAll(".toggle-pass").forEach((btn) => {
    btn.addEventListener("click", () => {
      // find the input inside the SAME input-group
      const group = btn.closest(".input-group");
      if (!group) return;

      const input = group.querySelector("input");
      const icon = btn.querySelector("i");

      if (!input || !icon) return;

      if (input.type === "password") {
        input.type = "text";
        icon.classList.remove("fa-eye");
        icon.classList.add("fa-eye-slash");
      } else {
        input.type = "password";
        icon.classList.remove("fa-eye-slash");
        icon.classList.add("fa-eye");
      }
    });
  });

  // ============================
  // Login submit
  // ============================
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

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

      // Optional token storage
      if (data.token) {
        localStorage.setItem("token", data.token);
      }

      localStorage.setItem("user", JSON.stringify(data.user));
      localStorage.setItem("userId", data.user.id);
      localStorage.setItem("role", data.user.role);

      messageEl.style.color = "green";
      messageEl.textContent = "Login successful! Redirecting...";

      setTimeout(() => {
        if (data.user.role === "admin") {
          window.location.href = "/admin/dashboard";
        } else if (data.user.role === "farmer") {
          window.location.href = "/farmer/dashboard";
        }
      }, 600);

    } catch (err) {
      console.error("Login error:", err);
      messageEl.style.color = "red";
      messageEl.textContent = err.message || "Login failed";
    }
  });
});
