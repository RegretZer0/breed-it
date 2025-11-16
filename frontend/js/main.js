document.getElementById("loginForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const messageEl = document.getElementById("message");

  messageEl.textContent = "Logging in...";

  try {
    const res = await fetch("http://localhost:5000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || "Login failed");
    }

    // Save token
    localStorage.setItem("token", data.token);

    messageEl.style.color = "green";
    messageEl.textContent = "Login successful! Redirecting...";

    // Redirect by role
    setTimeout(() => {
      if (data.user.role === "admin") {
        window.location.href = "admin_dashboard.html";
      } else if (data.user.role === "farmer") {
        window.location.href = "farmer_dashboard.html";
      } else {
        messageEl.textContent = "Unknown role.";
      }
    }, 1000);
  } catch (err) {
    messageEl.style.color = "red";
    messageEl.textContent = err.message;
  }
});
