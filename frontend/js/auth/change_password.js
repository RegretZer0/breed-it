document.addEventListener("DOMContentLoaded", () => {
  const requestBtn = document.getElementById("requestChangeOtpBtn");
  const form = document.getElementById("changePasswordForm");
  const messageEl = document.getElementById("changePasswordMessage");

  if (!requestBtn || !form || !messageEl) return;

  let otpSent = false;

  /* ======================
     REQUEST OTP
  ====================== */
  requestBtn.addEventListener("click", async () => {
    try {
      requestBtn.disabled = true;
      messageEl.style.color = "black";
      messageEl.textContent = "Sending OTP...";

      const res = await fetch("/api/auth/change-password/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Server returned an invalid response.");
      }

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to send OTP.");
      }

      otpSent = true;
      messageEl.style.color = "green";
      messageEl.textContent = "OTP sent to your email.";

      // Cooldown timer
      let cooldown = 30;
      requestBtn.textContent = `Resend in ${cooldown}s`;

      const timer = setInterval(() => {
        cooldown--;
        requestBtn.textContent = `Resend in ${cooldown}s`;

        if (cooldown <= 0) {
          clearInterval(timer);
          requestBtn.disabled = false;
          requestBtn.textContent = "Send OTP to Email";
        }
      }, 1000);

    } catch (err) {
      requestBtn.disabled = false;
      messageEl.style.color = "red";
      messageEl.textContent = err.message;
    }
  });

  /* ======================
     CONFIRM CHANGE
  ====================== */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const otp = document.getElementById("changeOtp")?.value.trim();
    const newPassword = document.getElementById("changeNewPassword")?.value.trim();

    if (!otpSent) {
      messageEl.style.color = "red";
      messageEl.textContent = "Please request OTP first.";
      return;
    }

    if (!otp || !newPassword) {
      messageEl.style.color = "red";
      messageEl.textContent = "OTP and new password are required.";
      return;
    }

    if (newPassword.length < 8) {
      messageEl.style.color = "red";
      messageEl.textContent = "Password must be at least 8 characters.";
      return;
    }

    try {
      messageEl.style.color = "black";
      messageEl.textContent = "Updating password...";

      const res = await fetch("/api/auth/change-password/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ otp, newPassword }),
      });

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Server returned an invalid response.");
      }

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Password change failed.");
      }

      messageEl.style.color = "green";
      messageEl.textContent = "Password changed successfully.";

      setTimeout(() => {
        window.location.reload();
      }, 1200);

    } catch (err) {
      messageEl.style.color = "red";
      messageEl.textContent = err.message;
    }
  });
});
