document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const messageEl = document.getElementById("message");

  messageEl.style.color = "black";
  messageEl.textContent = "Logging in...";

  try {
    // Use full backend URL
    const res = await fetch("http://localhost:5000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    // Read raw text
    const text = await res.text();

    // Parse JSON safely
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.error("Raw response from server:", text);
      throw new Error("Server returned invalid response.");
    }

    // Check if backend indicated success
    if (!res.ok || !data.success) {
      throw new Error(data.message || "Login failed");
    }

    // Save token and user info in localStorage
    localStorage.setItem("token", data.token);
    localStorage.setItem("role", data.role);
    localStorage.setItem("userId", data.user._id);
    localStorage.setItem("user", JSON.stringify(data.user));

    messageEl.style.color = "green";
    messageEl.textContent = "Login successful! Redirecting...";

    // Redirect based on role
    setTimeout(() => {
      if (data.role === "admin") {
        window.location.href = "admin_dashboard.html";
      } else if (data.role === "farmer") {
        window.location.href = "farmer_dashboard.html";
      } else {
        messageEl.style.color = "red";
        messageEl.textContent = "Unknown role. Please contact admin.";
      }
    }, 1000);

  } catch (err) {
    console.error("Login error:", err);
    messageEl.style.color = "red";
    messageEl.textContent = err.message;
  }
});
