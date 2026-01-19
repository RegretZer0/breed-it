document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("token");
  if (!token) return console.error("No token found");

  /* =========================
     GET LOGGED-IN MANAGER
  ========================= */
  const meRes = await fetch("/api/auth/me", {
    credentials: "include",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!meRes.ok) return console.error("Failed to fetch /me");

  const meData = await meRes.json();
  const managerId = meData.user.id;

  const form = document.getElementById("createAccountForm");
  const accountTypeSelect = document.getElementById("accountType");
  const alertBox = document.getElementById("formAlert");
  const sendOtpBtn = document.getElementById("sendOtpBtn");
  const otpInput = document.getElementById("otp");

  let pendingPayload = null;
  let pendingEndpoint = null;
  let otpSent = false;

  /* =========================
     ALERT HELPERS
  ========================= */
  function showAlert(type, message) {
    alertBox.className = `alert alert-${type} mt-3`;
    alertBox.textContent = message;
    alertBox.classList.remove("d-none");
  }

  function hideAlert() {
    alertBox.classList.add("d-none");
  }

  /* =========================
     SEND OTP
  ========================= */
  sendOtpBtn?.addEventListener("click", async () => {
    const email = document.getElementById("email").value.trim();

    if (!email) {
      showAlert("danger", "Please enter an email first.");
      return;
    }

    try {
      sendOtpBtn.disabled = true;
      showAlert("info", "Sending OTP...");

      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const contentType = res.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        throw new Error("Server error while sending OTP.");
      }

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to send OTP.");
      }

      otpSent = true;
      showAlert("success", "OTP sent to email.");

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
      showAlert("danger", err.message);
    }
  });

  /* =========================
     MEMBERSHIP DATE (PH)
  ========================= */
  function setMembershipDatePH() {
    const input = document.getElementById("membership_date");
    if (!input) return;

    input.value = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Manila",
    });
  }
  setMembershipDatePH();

  /* =========================
     TOGGLE FARMER FIELDS
  ========================= */
  function toggleFarmerFields() {
    const isFarmer = accountTypeSelect.value === "farmer";
    document.querySelectorAll(".farmer-only").forEach(el => {
      el.style.display = isFarmer ? "" : "none";
    });
  }
  accountTypeSelect.addEventListener("change", toggleFarmerFields);
  toggleFarmerFields();

  
  function fillConfirmationModal(payload, accountType) {
    // Account type
    document.getElementById("preview_account_type").textContent =
      accountType === "farmer" ? "Farmer" : "Encoder";

    // Name
    document.getElementById("preview_name").textContent =
      `${payload.first_name} ${payload.last_name}`;

    // Email
    document.getElementById("preview_email").textContent =
      payload.email || "-";

    // Contact Info
    document.getElementById("preview_contact").textContent =
      payload.contact_no || "-";

    // Address
    document.getElementById("preview_address").textContent =
      payload.address || "-";

    // Farmer-only preview sections
    const farmerPreviewEls = document.querySelectorAll(".farmer-preview");

    if (accountType === "farmer") {
      farmerPreviewEls.forEach(el => (el.style.display = ""));

      document.getElementById("preview_production").textContent =
        payload.production_type || "-";

      document.getElementById("preview_pens").textContent =
        payload.num_of_pens ?? "-";

      document.getElementById("preview_capacity").textContent =
        payload.pen_capacity ?? "-";

      document.getElementById("preview_membership").textContent =
        payload.membership_date || "-";
    } else {
      // Hide farmer-only fields for encoder
      farmerPreviewEls.forEach(el => (el.style.display = "none"));
    }
  }


  /* =========================
     FORM SUBMIT (PREVIEW)
  ========================= */
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    hideAlert();

    const otp = otpInput.value.trim();
    if (!otpSent || !otp) {
      showAlert("danger", "Please send and enter OTP first.");
      return;
    }

    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirm_password").value;

    if (!password || !confirmPassword) {
      showAlert("danger", "Password fields are required.");
      return;
    }

    if (password !== confirmPassword) {
      showAlert("danger", "Passwords do not match.");
      return;
    }

    const contactNo = document.getElementById("contact_info").value.trim();
    if (!contactNo) {
      showAlert("danger", "Contact number is required.");
      return;
    }

    const accountType = accountTypeSelect.value;

    const payload = {
      first_name: document.getElementById("first_name").value.trim(),
      last_name: document.getElementById("last_name").value.trim(),
      address: document.getElementById("address").value.trim(),
      contact_no: contactNo,
      email: document.getElementById("email").value.trim(),
      password,
      managerId,
      otp,
    };

    let endpoint = "/api/auth/register-encoder";

    if (accountType === "farmer") {
      endpoint = "/api/auth/register-farmer";
      payload.production_type =
        document.getElementById("production_type").value;
      payload.num_of_pens =
        Number(document.getElementById("num_of_pens").value) || 0;
      payload.pen_capacity =
        Number(document.getElementById("pen_capacity").value) || 0;
      payload.membership_date =
        document.getElementById("membership_date").value;
    }

    pendingPayload = payload;
    pendingEndpoint = endpoint;

    // ✅ FILL CONFIRMATION MODAL HERE
    fillConfirmationModal(payload, accountType);

    new bootstrap.Modal(
      document.getElementById("confirmModal")
    ).show();
  });

  /* =========================
     CONFIRM & SAVE
  ========================= */
  document
    .getElementById("confirmSubmitBtn")
    .addEventListener("click", async () => {
      if (!pendingPayload || !pendingEndpoint) return;

      showAlert("info", "Creating account...");

      try {
        const res = await fetch(pendingEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(pendingPayload),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.message || "Registration failed");
        }

        bootstrap.Modal
          .getInstance(document.getElementById("confirmModal"))
          .hide();

        showAlert("success", "✅ Account created successfully!");

        form.reset();
        otpSent = false;
        sendOtpBtn.disabled = false;
        sendOtpBtn.textContent = "Send OTP";
        toggleFarmerFields();
        setMembershipDatePH();

        pendingPayload = null;
        pendingEndpoint = null;

      } catch (err) {
        showAlert("danger", `❌ ${err.message}`);
      }
    });
});
