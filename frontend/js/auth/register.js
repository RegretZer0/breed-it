document.getElementById("signupForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const first_name = document.getElementById("first_name").value.trim();
  const last_name = document.getElementById("last_name").value.trim();
  const email = document.getElementById("email").value.trim();
  const contact_info = document.getElementById("phone").value.trim();
  const password = document.getElementById("password").value.trim();
  const confirmPassword = document.getElementById("confirm_password").value.trim();
  const messageEl = document.getElementById("message");

  messageEl.style.color = "black";
  messageEl.textContent = "Creating account...";

  if (!first_name || !last_name || !email || !password || !confirmPassword) {
    messageEl.style.color = "red";
    messageEl.textContent = "Please fill out all required fields.";
    return;
  }

  if (password !== confirmPassword) {
    messageEl.style.color = "red";
    messageEl.textContent = "Passwords do not match.";
    return;
  }

  try {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name,
        last_name,
        email,
        contact_info,
        password,
      }),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.message || "Registration failed.");
    }

    messageEl.style.color = "green";
    messageEl.textContent = "Registration successful! Redirecting to login...";

    setTimeout(() => {
      window.location.href = "/login";
    }, 1000);

  } catch (err) {
    console.error("Registration error:", err);
    messageEl.style.color = "red";
    messageEl.textContent = err.message || "Registration failed.";
  }
});
