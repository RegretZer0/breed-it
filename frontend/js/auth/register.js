document.addEventListener("DOMContentLoaded", () => {
  const signupForm = document.getElementById("signupForm");
  const sendOtpBtn = document.getElementById("sendOtpBtn");
  const otpInput = document.getElementById("otp");
  const messageEl = document.getElementById("message");

  let otpSent = false;

  /* ======================
      SEND OTP
  ====================== */
  sendOtpBtn?.addEventListener("click", async () => {
    const email = document.getElementById("email").value.trim();

    if (!email) {
      messageEl.style.color = "red";
      messageEl.textContent = "Please enter your email first.";
      return;
    }

    try {
      sendOtpBtn.disabled = true;
      messageEl.style.color = "black";
      messageEl.textContent = "Sending OTP...";

      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to send OTP.");
      }

      otpSent = true;
      messageEl.style.color = "green";
      messageEl.textContent = "OTP sent to your email.";

      // cooldown
      let cooldown = 30;
      sendOtpBtn.textContent = `Resend in ${cooldown}s`;

      const timer = setInterval(() => {
        cooldown--;
        sendOtpBtn.textContent = `Resend in ${cooldown}s`;
        if (cooldown <= 0) {
          clearInterval(timer);
          sendOtpBtn.disabled = false;
          sendOtpBtn.textContent = "Send OTP";
        }
      }, 1000);

    } catch (err) {
      sendOtpBtn.disabled = false;
      messageEl.style.color = "red";
      messageEl.textContent = err.message;
    }
  });

  /* ======================
      REGISTER
  ====================== */
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const first_name = document.getElementById("first_name").value.trim();
    const last_name = document.getElementById("last_name").value.trim();
    const email = document.getElementById("email").value.trim();
    const contact_info = document.getElementById("phone").value.trim();
    const password = document.getElementById("password").value.trim();
    const confirmPassword = document.getElementById("confirm_password").value.trim();
    const otp = otpInput.value.trim();

    messageEl.style.color = "black";
    messageEl.textContent = "Creating account...";

    if (!first_name || !last_name || !email || !password || !confirmPassword || !otp) {
      messageEl.style.color = "red";
      messageEl.textContent = "Please fill out all fields, including OTP.";
      return;
    }

    if (password.length < 8) {
      messageEl.style.color = "red";
      messageEl.textContent = "Password must be at least 8 characters.";
      return;
    }

    if (password !== confirmPassword) {
      messageEl.style.color = "red";
      messageEl.textContent = "Passwords do not match.";
      return;
    }

    if (!otpSent) {
      messageEl.style.color = "red";
      messageEl.textContent = "Please request an OTP first.";
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
          role: "farm_manager",
          otp,
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
      }, 1500);

    } catch (err) {
      console.error("Registration error:", err);
      messageEl.style.color = "red";
      messageEl.textContent = err.message || "Registration failed.";
    }
  });
});

/* ======================
   TOGGLE PASSWORD VISIBILITY
====================== */
const toggleButtons = document.querySelectorAll(".toggle-pass");

toggleButtons.forEach((toggleBtn) => {
  const input = toggleBtn.previousElementSibling;
  const icon = toggleBtn.querySelector("i");

  if (!input || !icon) return;

  toggleBtn.addEventListener("click", () => {
    const isHidden = input.type === "password";

    input.type = isHidden ? "text" : "password";

    icon.classList.toggle("fa-eye", !isHidden);
    icon.classList.toggle("fa-eye-slash", isHidden);

    toggleBtn.setAttribute(
      "aria-label",
      isHidden ? "Hide password" : "Show password"
    );
  });
});
