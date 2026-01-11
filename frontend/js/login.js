document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const messageEl = document.getElementById("message");

  messageEl.style.color = "black";
  messageEl.textContent = "Logging in...";

  try {
    const res = await fetch("http://localhost:5000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      credentials: "include",
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.message || "Login failed");
    }

    // Combine first_name + last_name for consistent display
    const fullName = `${data.user.first_name || ""} ${data.user.last_name || ""}`.trim() || "User";

    // Store session + JWT info
    if (data.token) {
      localStorage.setItem("token", data.token); // ✅ Store JWT token
    }
    localStorage.setItem("user", JSON.stringify({ ...data.user, name: fullName }));
    localStorage.setItem("userId", data.user._id || data.user.id);
    localStorage.setItem("role", data.user.role);
    localStorage.setItem("name", fullName); // optional quick access to name

    messageEl.style.color = "green";
    messageEl.textContent = "Login successful! Redirecting...";

    // Redirect based on role
    setTimeout(() => {
      switch (data.user.role) {
        case "system_admin":
          window.location.href = "system_admin_dashboard.html";
          break;
        case "encoder":
          window.location.href = "encoder_dashboard.html";
          break;
        case "farm_manager":
          window.location.href = "admin_dashboard.html";
          break;
        case "farmer":
          window.location.href = "farmer_dashboard.html";
          break;
        default:
          console.warn("Unknown role detected:", data.user.role);
          messageEl.style.color = "red";
          messageEl.textContent = "Unknown role. Please contact administrator.";
      }
    }, 800);

  } catch (err) {
    console.error("Login error:", err);
    messageEl.style.color = "red";
    messageEl.textContent = err.message || "Login failed";
  }
});
