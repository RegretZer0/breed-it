document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("token");

  if (!token) {
    console.error("No token found");
    return;
  }

  // 🔐 Get logged-in user
  const meRes = await fetch("/api/auth/me", {
    credentials: "include",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!meRes.ok) {
    console.error("Failed to fetch /me");
    return;
  }

  const meData = await meRes.json();
  const managerId = meData.user.id;

  const form = document.getElementById("createAccountForm");
  const accountTypeSelect = document.getElementById("accountType");
  const messageEl = document.getElementById("formMessage");

  /* =========================
     ALERT HELPERS
  ========================= */
  const alertBox = document.getElementById("formAlert");

  function showAlert(type, message) {
    if (!alertBox) return;
    alertBox.className = `alert alert-${type} mt-3`;
    alertBox.textContent = message;
    alertBox.classList.remove("d-none");
  }

  function hideAlert() {
    if (!alertBox) return;
    alertBox.classList.add("d-none");
  }

  let pendingPayload = null;
  let pendingEndpoint = null;

  /* =========================
     MEMBERSHIP DATE (PH)
  ========================= */
  function setMembershipDatePH() {
    const input = document.getElementById("membership_date");
    if (!input) return;

    const todayPH = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Manila",
    });

    input.value = todayPH;
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

  /* =========================
     PREVIEW HELPERS
  ========================= */
  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value ?? "—";
  }

  function fillPreview(payload, accountType) {
    setText("preview_account_type", accountType.toUpperCase());
    setText("preview_name", `${payload.first_name} ${payload.last_name}`);
    setText("preview_email", payload.email);
    setText("preview_contact", payload.contact_no);
    setText("preview_address", payload.address);

    document.querySelectorAll(".farmer-preview").forEach(el => {
      el.style.display = accountType === "farmer" ? "" : "none";
    });

    if (accountType === "farmer") {
      setText("preview_production", payload.production_type);
      setText("preview_pens", payload.num_of_pens);
      setText("preview_capacity", payload.pen_capacity);
      setText("preview_membership", payload.membership_date);
    }
  }

  /* =========================
     FORM SUBMIT (PREVIEW)
  ========================= */
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    hideAlert();

    const accountType = accountTypeSelect.value;

    const payload = {
      first_name: document.getElementById("first_name").value.trim(),
      last_name: document.getElementById("last_name").value.trim(),
      address: document.getElementById("address").value.trim(),
      contact_no: document.getElementById("contact_info").value.trim(),
      email: document.getElementById("email").value.trim(),
      password: document.getElementById("password").value,
      managerId,
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

    fillPreview(payload, accountType);

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

      showAlert("info", "Creating account, please wait...");

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

        showAlert(
          "success",
          "✅ Account created successfully!"
        );

        form.reset();
        toggleFarmerFields();
        setMembershipDatePH();

        pendingPayload = null;
        pendingEndpoint = null;

      } catch (err) {
        showAlert("danger", `❌ ${err.message}`);
      }
    });
});
