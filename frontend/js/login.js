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
    });

    const text = await res.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.error("Raw response from server:", text);
      throw new Error("Server returned invalid response.");
    }

    if (!res.ok || !data.success) {
      throw new Error(data.message || "Login failed");
    }

    // Save auth info
    localStorage.setItem("token", data.token);
    localStorage.setItem("userId", data.user._id);
    localStorage.setItem("role", data.role);
    localStorage.setItem("user", JSON.stringify(data.user));

    messageEl.style.color = "green";
    messageEl.textContent = "Login successful! Redirecting...";

    // ROLE-BASED REDIRECT (RESTORED)
    setTimeout(() => {
      if (data.role === "admin") {
        window.location.href = "admin_dashboard.html";
      } else if (data.role === "farmer") {
        window.location.href = "farmer_dashboard.html";
      } else {
        messageEl.style.color = "red";
        messageEl.textContent = "Unknown role. Please contact admin.";
      }
    }, 800);

  } catch (err) {
    console.error("Login error:", err);
    messageEl.style.color = "red";
    messageEl.textContent = err.message;
  }
});
