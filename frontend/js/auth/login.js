// Clear any old auth state on load (prevents “ghost login”)
localStorage.removeItem("token");
localStorage.removeItem("user");
localStorage.removeItem("role");
localStorage.removeItem("userId");

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
      credentials: "include",   // ⬅ important (session cookie)
    });

    const text = await res.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      console.error("Invalid JSON returned:", text);
      throw new Error("Unexpected server response");
    }

    if (!res.ok || !data.success) {
      throw new Error(data.message || "Login failed");
    }

    // ---------------------------
    // Store BOTH session + token
    // ---------------------------

    // Session is already stored as cookie automatically
    // Token is optional—only store if backend sends
    if (data.token) {
      localStorage.setItem("token", data.token);
    }

    localStorage.setItem("user", JSON.stringify(data.user));
    localStorage.setItem("userId", data.user.id || data.user._id);
    localStorage.setItem("role", data.user.role);

    messageEl.style.color = "green";
    messageEl.textContent = "Login successful! Redirecting...";

    setTimeout(() => {
      if (data.user.role === "admin") {
        window.location.href = "admin_dashboard.html";
      } else if (data.user.role === "farmer") {
        window.location.href = "farmer_dashboard.html";
      } else {
        messageEl.style.color = "red";
        messageEl.textContent = "Unknown role. Please contact admin.";
      }
    }, 800);

  } catch (err) {
    console.error(err);
    messageEl.style.color = "red";
    messageEl.textContent = err.message || "Login failed";
  }
});