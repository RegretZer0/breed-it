document.addEventListener("DOMContentLoaded", () => {
  const signupForm = document.getElementById("signupForm");
  const sendOtpBtn = document.getElementById("sendOtpBtn");
  const otpInput = document.getElementById("otp");
  const messageEl = document.getElementById("message");

  // ✅ Updated to Port 5000 to match your backend
  const BASE_URL = "http://localhost:5000";
  let otpSent = false;

  /* ======================
      SEND OTP LOGIC
  ====================== */
  sendOtpBtn.addEventListener("click", async () => {
    const email = document.getElementById("email").value.trim();

    if (!email) {
      messageEl.style.color = "red";
      messageEl.textContent = "Please enter your email first to receive an OTP.";
      return;
    }

    try {
      sendOtpBtn.disabled = true;
      messageEl.style.color = "black";
      messageEl.textContent = "Sending OTP...";

      const res = await fetch(`${BASE_URL}/api/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      // 🛡️ Guard against non-JSON responses
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const textError = await res.text();
        console.error("Server Error Response:", textError);
        throw new Error("Server Error: Check backend console for BadCredentials/Config issues.");
      }

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to send OTP.");
      }

      otpSent = true;
      messageEl.style.color = "green";
      messageEl.textContent = "OTP sent to your email!";

      let cooldown = 30;
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
      REGISTRATION LOGIC
  ====================== */
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const firstName = document.getElementById("first_name").value.trim();
    const lastName = document.getElementById("last_name").value.trim();
    const email = document.getElementById("email").value.trim();
    const phone = document.getElementById("phone").value.trim();
    const password = document.getElementById("password").value.trim();
    const confirmPassword = document.getElementById("confirm_password").value.trim();
    const otp = otpInput.value.trim();

    const role = "farm_manager";

    if (!firstName || !lastName || !email || !password || !confirmPassword || !otp) {
      messageEl.style.color = "red";
      messageEl.textContent = "Please fill out all fields, including the OTP.";
      return;
    }

    if (password.length < 8) {
      messageEl.style.color = "red";
      messageEl.textContent = "Password must be at least 8 characters long.";
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
      messageEl.style.color = "black";
      messageEl.textContent = "Creating account...";

      const res = await fetch(`${BASE_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email: email,
          contact_info: phone,
          password: password,
          role: role,
          otp: otp
        }),
      });

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Server returned an invalid response. Check your backend port.");
      }

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Registration failed.");
      }

      messageEl.style.color = "green";
      messageEl.textContent = "Registration successful! Redirecting to login...";

      setTimeout(() => {
        window.location.href = "login.html"; // Updated to .html if you aren't using EJS routes
      }, 2000);

    } catch (err) {
      console.error("Registration error:", err);
      messageEl.style.color = "red";
      messageEl.textContent = err.message || "Registration failed.";
    }
  });
});