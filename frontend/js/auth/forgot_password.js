document.addEventListener("DOMContentLoaded", () => {
  const forgotForm = document.getElementById("forgotForm");
  const resetForm = document.getElementById("resetForm");
  const messageEl = document.getElementById("fpMessage");

  const emailInput = document.getElementById("fpEmail");
  const otpInput = document.getElementById("otp");
  const newPasswordInput = document.getElementById("newPassword");

  let otpSent = false;
  let cooldownTimer = null;

  /* ======================
      SEND OTP
  ====================== */
  forgotForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();

    if (!email) {
      messageEl.style.color = "red";
      messageEl.textContent = "Please enter your email first.";
      return;
    }

    try {
      messageEl.style.color = "black";
      messageEl.textContent = "Sending OTP...";

      const res = await fetch("/api/auth/forgot-password", {
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

      // Move to reset step
      forgotForm.classList.add("d-none");
      resetForm.classList.remove("d-none");

    } catch (err) {
      console.error("Send OTP error:", err);
      messageEl.style.color = "red";
      messageEl.textContent = err.message || "Failed to send OTP.";
    }
  });

  /* ======================
      RESET PASSWORD
  ====================== */
  resetForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();
    const otp = otpInput.value.trim();
    const password = newPasswordInput.value.trim();

    if (!otp || !password) {
      messageEl.style.color = "red";
      messageEl.textContent = "Please enter OTP and new password.";
      return;
    }

    if (!otpSent) {
      messageEl.style.color = "red";
      messageEl.textContent = "Please request an OTP first.";
      return;
    }

    if (password.length < 8) {
      messageEl.style.color = "red";
      messageEl.textContent = "Password must be at least 8 characters.";
      return;
    }

    try {
      messageEl.style.color = "black";
      messageEl.textContent = "Resetting password...";

      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          otp,
          password,
        }),
      });

      // ✅ Guard against invalid backend responses
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Server returned an invalid response.");
      }

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Password reset failed.");
      }

      messageEl.style.color = "green";
      messageEl.textContent = "Password reset successful! Redirecting to login...";

      setTimeout(() => {
        window.location.href = "/login";
      }, 1500);

    } catch (err) {
      console.error("Reset password error:", err);
      messageEl.style.color = "red";
      messageEl.textContent = err.message || "Password reset failed.";
    }
  });
});
