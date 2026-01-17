document.addEventListener("DOMContentLoaded", () => {
  const signupForm = document.getElementById("signupForm");
  const sendOtpBtn = document.getElementById("sendOtpBtn"); // Ensure this ID exists in your HTML
  const otpInput = document.getElementById("otp"); // Ensure this ID exists in your HTML
  const messageEl = document.getElementById("message");

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
      messageEl.textContent = "OTP sent to your email!";

      // 30-second cooldown timer for the button
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

    messageEl.style.color = "black";
    messageEl.textContent = "Creating account...";

    // 1. Basic Field Validation
    if (!firstName || !lastName || !email || !password || !confirmPassword || !otp) {
      messageEl.style.color = "red";
      messageEl.textContent = "Please fill out all fields, including the OTP.";
      return;
    }

    // 2. Password Length Validation (Strengthening)
    if (password.length < 8) {
      messageEl.style.color = "red";
      messageEl.textContent = "Password must be at least 8 characters long.";
      return;
    }

    // 3. Match Validation
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
          first_name: firstName,   // Updated to match backend
          last_name: lastName,     // Updated to match backend
          email: email,
          contact_info: phone,     // Updated to match backend
          password: password,
          role: role,
          otp: otp                 // Required for the new backend check
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
      }, 2000);

    } catch (err) {
      console.error("Registration error:", err);
      messageEl.style.color = "red";
      messageEl.textContent = err.message || "Registration failed.";
    }
  });
});