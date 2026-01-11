document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("signupForm");

  if (!form) return;

  const fullNameInput = document.getElementById("full_name");
  const emailInput = document.getElementById("email");
  const phoneInput = document.getElementById("phone");
  const passwordInput = document.getElementById("password");
  const confirmPasswordInput = document.getElementById("confirm_password");

  // ============================
  // Password toggle (eye icon)
  // ============================
  document.querySelectorAll(".toggle-pass").forEach(btn => {
    btn.addEventListener("click", () => {
      const input = btn.closest(".input-group").querySelector("input");
      const icon = btn.querySelector("i");

      if (input.type === "password") {
        input.type = "text";
        icon.classList.replace("fa-eye", "fa-eye-slash");
      } else {
        input.type = "password";
        icon.classList.replace("fa-eye-slash", "fa-eye");
      }
    });
  });

  // ============================
  // Form submit
  // ============================
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const fullName = fullNameInput.value.trim();
    const email = emailInput.value.trim();
    const phone = phoneInput.value.trim();
    const password = passwordInput.value.trim();
    const confirmPassword = confirmPasswordInput.value.trim();

    // ============================
    // Validations
    // ============================
    if (!fullName || !email || !phone || !password || !confirmPassword) {
      alert("Please fill out all required fields.");
      return;
    }

    if (password.length < 6) {
      alert("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      alert("Passwords do not match.");
      return;
    }

    // ============================
    // Farmer is DEFAULT role
    // ============================
    const payload = {
      name: fullName,
      email,
      contact_no: phone,
      password
    };

    try {
      const response = await fetch("/api/auth/register-farmer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Registration failed.");
      }

      alert("Account created successfully! You may now log in.");
      window.location.href = "/Login";

    } catch (error) {
      console.error("Registration error:", error);
      alert(error.message);
    }
  });
});
