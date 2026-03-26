document.addEventListener("DOMContentLoaded", () => {
  const signupForm = document.getElementById("signupForm");
  const sendOtpBtn = document.getElementById("sendOtpBtn");
  const otpInput = document.getElementById("otp");
  const messageEl = document.getElementById("message");

  // =========================
  // PHONE INPUT VALIDATION (FIX)
  // =========================
  const phoneInput = document.getElementById("phone");

  if (phoneInput) {

    // Prevent typing letters
    phoneInput.addEventListener("keypress", (e) => {
      if (!/[0-9]/.test(e.key)) {
        e.preventDefault();
      }
    });

    // Clean pasted input + enforce length
    phoneInput.addEventListener("input", (e) => {
      let value = e.target.value;

      // Remove non-digits
      value = value.replace(/\D/g, "");

      // Limit to 11 digits
      if (value.length > 11) {
        value = value.slice(0, 11);
      }

      e.target.value = value;
    });
  }

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

      // ✅ Guard against non-JSON responses
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const textError = await res.text();
        console.error("Server Error Response:", textError);
        throw new Error("Server error while sending OTP. Please try again.");
      }

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
    const contact_info = normalizePHNumber(
      document.getElementById("phone").value.trim()
    );
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

    if (!contact_info) {
      messageEl.style.color = "red";
      messageEl.textContent = "Enter a valid Philippine phone number (09XXXXXXXXX).";
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

      // ✅ Guard against invalid backend responses
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Server returned an invalid response.");
      }

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

  function normalizePHNumber(num) {
    if (!num) return "";

    num = String(num).replace(/\D/g, "");

    if (num.startsWith("639")) return "0" + num.slice(2);
    if (num.startsWith("9") && num.length === 10) return "0" + num;
    if (num.startsWith("09") && num.length === 11) return num;

    return "";
  }
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
