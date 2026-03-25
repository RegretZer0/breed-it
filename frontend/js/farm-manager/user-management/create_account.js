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
  const alertBox = document.getElementById("formAlert"); // kept for compatibility, but we won't use it
  const sendOtpBtn = document.getElementById("sendOtpBtn");
  const otpInput = document.getElementById("otp");

  let pendingPayload = null;
  let pendingEndpoint = null;
  let otpSent = false;

  /* Clear red border as the user fixes the field */
  form?.addEventListener("input", (e) => {
    const el = e.target;
    if (el?.classList?.contains("is-invalid")) clearInvalid(el);
  });

  form?.addEventListener("change", (e) => {
    const el = e.target;
    if (el?.classList?.contains("is-invalid")) clearInvalid(el);
  });

  /* =========================================================
   BOOTSTRAP FIELD INDICATION (is-invalid / is-valid)
  ========================================================= */
  function setInvalid(el, message = "") {
    if (!el) return;

    el.classList.add("is-invalid");
    el.classList.remove("is-valid");

    // attach / update invalid-feedback next to the field
    let fb = el.parentElement?.querySelector(".invalid-feedback");

    // For input-group, put feedback after the group container
    const isInInputGroup = el.closest(".input-group");
    const host = isInInputGroup ? el.closest(".input-group") : el;

    fb = host?.parentElement?.querySelector(".invalid-feedback");

    if (!fb) {
      fb = document.createElement("div");
      fb.className = "invalid-feedback";
      host?.parentElement?.appendChild(fb);
    }

    fb.textContent = message || "This field is required.";
  }

  function clearInvalid(el) {
    if (!el) return;
    el.classList.remove("is-invalid");
  }

  function setValid(el) {
    if (!el) return;
    el.classList.remove("is-invalid");
    el.classList.add("is-valid");
  }

  /* clear all validation states in the form */
  function clearAllValidation(formEl) {
    if (!formEl) return;
    formEl.querySelectorAll(".is-invalid, .is-valid").forEach((x) => {
      x.classList.remove("is-invalid", "is-valid");
    });
  }

  /* =========================================================
     FIX: STUCK GREY SCREEN / UNCLICKABLE AFTER MODAL CLOSE
     - remove lingering backdrops
     - remove modal-open and body locks
  ========================================================= */
  function hardResetBootstrapModalState() {
    document.querySelectorAll(".modal-backdrop").forEach((b) => b.remove());
    document.body.classList.remove("modal-open");
    document.body.style.removeProperty("overflow");
    document.body.style.removeProperty("padding-right");
  }

  /* =========================================================
     STATUS MODAL (REPLACES ALERT BOX)
     - centered modal with [X] close button
     - injected dynamically, no EJS edits required
     - includes cleanup to prevent stuck backdrop
  ========================================================= */
  function ensureStatusModal() {
    if (document.getElementById("statusModal")) return;

    const modalHTML = `
      <div class="modal fade theme-modal" id="statusModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content theme-modal-content">
            <div class="modal-header theme-modal-header">
              <div class="d-flex align-items-center gap-2">
                <span class="icon-badge sm" id="statusModalIcon">
                  <i class="bi bi-info-circle"></i>
                </span>
                <h5 class="modal-title mb-0" id="statusModalTitle">Message</h5>
              </div>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>

            <div class="modal-body theme-modal-body">
              <div id="statusModalMessage" class="text-muted">...</div>
            </div>

            <div class="modal-footer theme-modal-footer">
              <button type="button" class="btn btn-outline-secondary btn-pill" data-bs-dismiss="modal">
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML("beforeend", modalHTML);

    // IMPORTANT: cleanup when status modal closes
    const statusModalEl = document.getElementById("statusModal");
    statusModalEl?.addEventListener("hidden.bs.modal", () => {
      hardResetBootstrapModalState();
    });
  }

  function showStatusModal(type, title, message) {
    ensureStatusModal();

    const statusModalEl = document.getElementById("statusModal");
    if (!statusModalEl) return;

    const titleEl = document.getElementById("statusModalTitle");
    const msgEl = document.getElementById("statusModalMessage");
    const iconWrap = document.getElementById("statusModalIcon");

    if (titleEl) titleEl.textContent = title || "Message";
    if (msgEl) msgEl.textContent = message || "";

    if (iconWrap) {
      iconWrap.classList.remove("status-info", "status-success", "status-danger", "status-warning");
      iconWrap.classList.add(`status-${type}`);

      const i = iconWrap.querySelector("i");
      if (i) {
        i.className = "";
        if (type === "success") i.className = "bi bi-check2-circle";
        else if (type === "danger") i.className = "bi bi-x-circle";
        else if (type === "warning") i.className = "bi bi-exclamation-triangle";
        else i.className = "bi bi-info-circle";
      }
    }

    // Use getOrCreateInstance to avoid multiple instances/backdrops
    const inst = bootstrap.Modal.getOrCreateInstance(statusModalEl, {
      backdrop: true,
      keyboard: true,
      focus: true,
    });

    inst.show();
  }

  // Keep these for compatibility (do nothing visually)
  function showAlert(type, message) {
    if (!alertBox) return;
    alertBox.className = `alert alert-${type} mt-3 d-none`;
    alertBox.textContent = message;
  }
  function hideAlert() {
    if (!alertBox) return;
    alertBox.classList.add("d-none");
  }

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
    const isFarmer = accountTypeSelect?.value === "farmer";

    document.querySelectorAll(".farmer-only").forEach((el) => {
      el.style.display = isFarmer ? "" : "none";
    });

    const productionTypeEl = document.getElementById("production_type");
    const pensEl = document.getElementById("num_of_pens");
    const capacityEl = document.getElementById("pen_capacity");
    const membershipEl = document.getElementById("membership_date");

    const farmerFields = [productionTypeEl, pensEl, capacityEl, membershipEl].filter(Boolean);

    farmerFields.forEach((field) => {
      if (isFarmer) {
        field.disabled = false;

        if (field === productionTypeEl || field === pensEl || field === capacityEl) {
          field.setAttribute("required", "required");
        }
      } else {
        field.disabled = true;
        field.removeAttribute("required");
        field.classList.remove("is-invalid", "is-valid");
      }
    });

    if (!isFarmer) {
      if (productionTypeEl) productionTypeEl.value = "";
      if (pensEl) pensEl.value = "";
      if (capacityEl) capacityEl.value = "";
    } else {
      setMembershipDatePH();
    }
  }
  accountTypeSelect?.addEventListener("change", toggleFarmerFields);
  toggleFarmerFields();

  /* =========================================================
     PH ADDRESS: CASCADING SELECTS + COMPOSE TO #address
     - dataset: /data/ph-address.json
     - region option values use dataset code (e.g. "17")
     - label uses dataset name (e.g. "REGION IV-B (MIMAROPA)")
  ========================================================= */
  const addrHidden = document.getElementById("address");
  const regionEl = document.getElementById("ph_region");
  const provEl = document.getElementById("ph_province");
  const cityEl = document.getElementById("ph_city");
  const brgyEl = document.getElementById("ph_barangay");
  const streetEl = document.getElementById("ph_street");
  const addrPreview = document.getElementById("phAddressPreview");

  let regionMap = new Map();

  function normalizePart(v) {
    return (v || "").toString().trim().replace(/\s+/g, " ");
  }

  function resetSelect(selectEl, placeholder, disabled = true) {
    if (!selectEl) return;
    selectEl.innerHTML = "";
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = placeholder;
    opt.disabled = true;
    opt.hidden = true;
    opt.selected = true;
    selectEl.appendChild(opt);
    selectEl.disabled = disabled;
  }

  function fillSelect(selectEl, items, getValue, getLabel) {
    if (!selectEl) return;
    (items || []).forEach((item) => {
      const opt = document.createElement("option");
      opt.value = String(getValue(item) ?? "");
      opt.textContent = String(getLabel(item) ?? "");
      selectEl.appendChild(opt);
    });
    selectEl.disabled = false;
  }

  function getSelectedText(sel) {
    if (!sel || sel.selectedIndex < 0) return "";
    const opt = sel.options[sel.selectedIndex];
    if (!opt) return "";
    if (opt.disabled && opt.hidden) return "";
    return normalizePart(opt.textContent);
  }

  function composePHAddress() {
    if (!addrHidden) return "";

    if (!regionEl || !provEl || !cityEl || !brgyEl || !streetEl) {
      return addrHidden.value.trim();
    }

    const street = normalizePart(streetEl.value);
    const region = getSelectedText(regionEl);
    const prov = getSelectedText(provEl);
    const city = getSelectedText(cityEl);
    const brgyRaw = getSelectedText(brgyEl);

    const brgy = brgyRaw ? `Brgy. ${brgyRaw.replace(/^brgy\.?\s*/i, "")}` : "";

    const parts = [street, brgy, city, prov, region, "Philippines"].filter(Boolean);

    const formatted = parts.join(", ");
    addrHidden.value = formatted;

    if (addrPreview) {
      addrPreview.classList.add("show");
      const span = addrPreview.querySelector("span");
      if (span) span.textContent = formatted || "Address will be formatted automatically.";
    }

    return formatted;
  }

  async function loadPHAddressData() {
    const res = await fetch("/data/ph-address.json", { cache: "force-cache" });
    if (!res.ok) throw new Error("Failed to load /data/ph-address.json");
    return res.json();
  }

  function populateRegions(regions) {
    if (!regionEl) return;

    regionEl.innerHTML = "";
    const ph = document.createElement("option");
    ph.value = "";
    ph.textContent = "Select Region";
    ph.disabled = true;
    ph.hidden = true;
    ph.selected = true;
    regionEl.appendChild(ph);

    const sorted = [...(regions || [])].sort((a, b) =>
      String(a.name).localeCompare(String(b.name))
    );

    sorted.forEach((r) => {
      const opt = document.createElement("option");
      opt.value = String(r.code);
      opt.textContent = String(r.name);
      regionEl.appendChild(opt);
    });
  }

  async function initPHAddressCascading() {
    if (!regionEl || !provEl || !cityEl || !brgyEl || !streetEl) return;

    resetSelect(provEl, "Select Province", true);
    resetSelect(cityEl, "Select City / Municipality", true);
    resetSelect(brgyEl, "Select Barangay", true);

    try {
      const phData = await loadPHAddressData();
      const regions = Array.isArray(phData?.regions) ? phData.regions : [];

      populateRegions(regions);
      regionMap = new Map(regions.map((r) => [String(r.code), r]));

      regionEl.addEventListener("change", () => {
        const region = regionMap.get(String(regionEl.value));

        resetSelect(provEl, "Select Province", !region);
        resetSelect(cityEl, "Select City / Municipality", true);
        resetSelect(brgyEl, "Select Barangay", true);

        if (region) {
          fillSelect(provEl, region.provinces || [], (p) => p.code, (p) => p.name);
        }

        composePHAddress();
      });

      provEl.addEventListener("change", () => {
        const region = regionMap.get(String(regionEl.value));
        const prov = (region?.provinces || []).find((p) => String(p.code) === String(provEl.value));

        resetSelect(cityEl, "Select City / Municipality", !prov);
        resetSelect(brgyEl, "Select Barangay", true);

        if (prov) {
          fillSelect(cityEl, prov.cities || [], (c) => c.code, (c) => c.name);
        }

        composePHAddress();
      });

      cityEl.addEventListener("change", () => {
        const region = regionMap.get(String(regionEl.value));
        const prov = (region?.provinces || []).find((p) => String(p.code) === String(provEl.value));
        const city = (prov?.cities || []).find((c) => String(c.code) === String(cityEl.value));

        resetSelect(brgyEl, "Select Barangay", !city);

        if (city) {
          fillSelect(
            brgyEl,
            city.barangays || [],
            (b) => (typeof b === "string" ? b : b?.name),
            (b) => (typeof b === "string" ? b : b?.name)
          );
        }

        composePHAddress();
      });

      brgyEl.addEventListener("change", composePHAddress);
      streetEl.addEventListener("input", composePHAddress);

      composePHAddress();
    } catch (err) {
      console.error(err);
      showStatusModal(
        "warning",
        "Address Data Missing",
        "Address dataset failed to load. Please check that /data/ph-address.json is reachable."
      );
      resetSelect(provEl, "Select Province", true);
      resetSelect(cityEl, "Select City / Municipality", true);
      resetSelect(brgyEl, "Select Barangay", true);
    }
  }

  initPHAddressCascading();

  /* =========================
      SEND OTP (UPDATED)
  ========================= */
  sendOtpBtn?.addEventListener("click", async () => {
    const emailInput = document.getElementById("email");
    const email = emailInput?.value.trim();

    // 1. Client-side Validation
    if (!email) {
      showStatusModal("danger", "Missing Email", "Please enter an email address first.");
      if (emailInput) emailInput.classList.add("is-invalid");
      return;
    }

    // Basic regex check before hitting the server
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showStatusModal("danger", "Invalid Email", "Please enter a valid email format.");
      return;
    }

    try {
      // 2. UI Feedback: Disable button and show loading state
      sendOtpBtn.disabled = true;
      const originalText = sendOtpBtn.textContent;
      sendOtpBtn.textContent = "Sending...";
      
      showStatusModal("info", "Sending OTP", "Verifying email and sending your code. Please wait...");

      // 3. API Call
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const contentType = res.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        throw new Error("Server communication error. Please try again later.");
      }

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to send OTP.");
      }

      // 4. Success State
      otpSent = true; 
      showStatusModal("success", "OTP Sent", `A verification code has been sent to ${email}. Please check the inbox.`);

      // 5. Cooldown Timer (Prevents Spamming)
      let cooldown = 30;
      sendOtpBtn.textContent = `Resend in ${cooldown}s`;

      const timer = setInterval(() => {
        cooldown--;
        if (cooldown > 0) {
          sendOtpBtn.textContent = `Resend in ${cooldown}s`;
        } else {
          clearInterval(timer);
          sendOtpBtn.disabled = false;
          sendOtpBtn.textContent = "Send OTP";
          // If they changed the email after sending, reset the flag
          otpSent = false; 
        }
      }, 1000);

    } catch (err) {
      // 6. Error Handling
      sendOtpBtn.disabled = false;
      sendOtpBtn.textContent = "Send OTP";
      console.error("OTP Error:", err);
      showStatusModal("danger", "OTP Failed", err.message);
    }
  });

  /* EXTRA SAFETY: If the manager changes the email after 
    sending the OTP, we must invalidate the 'otpSent' flag.
  */
  document.getElementById("email")?.addEventListener("input", () => {
    otpSent = false;
  });

  /* =========================
     CONFIRM MODAL FILLER
  ========================= */
  function fillConfirmationModal(payload, accountType) {
    document.getElementById("preview_account_type").textContent =
      accountType === "farmer" ? "Farmer" : "Encoder";

    document.getElementById("preview_name").textContent =
      `${payload.first_name} ${payload.last_name}`;

    // Sex preview is optional (won't crash if missing)
    const sexPrev = document.getElementById("preview_sex");
    if (sexPrev) sexPrev.textContent = payload.sex || "-";

    document.getElementById("preview_email").textContent = payload.email || "-";
    document.getElementById("preview_contact").textContent = payload.contact_no || "-";
    document.getElementById("preview_address").textContent = payload.address || "-";

    const farmerPreviewEls = document.querySelectorAll(".farmer-preview");
    if (accountType === "farmer") {
      farmerPreviewEls.forEach((el) => (el.style.display = ""));
      document.getElementById("preview_production").textContent = payload.production_type || "-";
      document.getElementById("preview_pens").textContent = payload.num_of_pens ?? "-";
      document.getElementById("preview_capacity").textContent = payload.pen_capacity ?? "-";
      document.getElementById("preview_membership").textContent = payload.membership_date || "-";
    } else {
      farmerPreviewEls.forEach((el) => (el.style.display = "none"));
    }
  }

  /* =========================
    FORM SUBMIT (PREVIEW & OTP SYNC)
   ========================= */
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    // hideAlert(); // Keep if you use a specific alert div

    // Clear previous red borders / messages
    if (typeof clearAllValidation === 'function') {
      clearAllValidation(form);
    }

    let hasError = false;

    // Local Helper for Field Validation
    function requireField(el, msg) {
      const val = (el?.value ?? "").toString().trim();
      if (!val) {
        if (typeof setInvalid === 'function') setInvalid(el, msg);
        hasError = true;
        return false;
      }
      if (typeof setValid === 'function') setValid(el);
      return true;
    }

    // =========================
    // FIELD VALIDATION
    // =========================

    // Basic user fields
    requireField(document.getElementById("first_name"), "First name is required.");
    requireField(document.getElementById("last_name"), "Last name is required.");
    const emailEl = document.getElementById("email");
    requireField(emailEl, "Email is required.");
    requireField(document.getElementById("contact_no"), "Contact number is required.");

    // Sex
    const sexEl = document.getElementById("sex");
    if (sexEl) requireField(sexEl, "Please select sex.");

    // Address fields (using your cascading logic)
    if (typeof regionEl !== 'undefined' && regionEl) requireField(regionEl, "Please select a Region.");
    if (typeof provEl !== 'undefined' && provEl && !provEl.disabled) requireField(provEl, "Please select a Province.");
    if (typeof cityEl !== 'undefined' && cityEl && !cityEl.disabled) requireField(cityEl, "Please select a City / Municipality.");
    if (typeof brgyEl !== 'undefined' && brgyEl && !brgyEl.disabled) requireField(brgyEl, "Please select a Barangay.");
    if (typeof streetEl !== 'undefined' && streetEl) requireField(streetEl, "House No. / Street / Subdivision is required.");

    // OTP VALIDATION (CRITICAL FIX)
    if (!requireField(otpInput, "OTP is required.")) {
      hasError = true;
    } else if (!otpSent) {
      if (typeof setInvalid === 'function') setInvalid(otpInput, "Please click 'Send OTP' and verify the email first.");
      hasError = true;
    }

    // Passwords
    const passEl = document.getElementById("password");
    const confEl = document.getElementById("confirm_password");

    requireField(passEl, "Password is required.");
    requireField(confEl, "Confirm password is required.");

    if (passEl?.value && confEl?.value && passEl.value !== confEl.value) {
      if (typeof setInvalid === 'function') setInvalid(confEl, "Passwords do not match.");
      hasError = true;
    }

    // Compose final address string (using your helper)
    const finalAddress = typeof composePHAddress === 'function' ? composePHAddress() : "";
    if (!finalAddress) {
      if (typeof showStatusModal === 'function') {
        showStatusModal("danger", "Address Required", "Please complete all Philippines address fields.");
      }
      hasError = true;
    }

    // Stop immediately if there are invalid fields
    if (hasError) {
      const firstInvalid = form.querySelector(".is-invalid");
      firstInvalid?.focus?.();
      return;
    }

    // =========================
    // BUILD PAYLOAD
    // =========================
    const contactNo = document.getElementById("contact_no")?.value.trim();
    const password = passEl?.value;
    const otp = otpInput?.value.trim();
    const accountType = accountTypeSelect?.value || "encoder";

    // Base Payload for all roles
    const payload = {
      first_name: document.getElementById("first_name")?.value.trim(),
      last_name: document.getElementById("last_name")?.value.trim(),
      sex: sexEl?.value, 
      address: finalAddress,
      contact_no: contactNo,
      email: emailEl?.value.trim(),
      password: password,
      otp: otp,           // Required by updated backend
      managerId: managerId, // Fetched from /me at top of script
    };

    let endpoint = "/api/auth/register-encoder";

    // Add Farmer-specific fields if applicable
    if (accountType === "farmer") {
      endpoint = "/api/auth/register-farmer";
      payload.production_type = document.getElementById("production_type")?.value;
      payload.num_of_pens = Number(document.getElementById("num_of_pens")?.value) || 0;
      payload.pen_capacity = Number(document.getElementById("pen_capacity")?.value) || 0;
      payload.membership_date = document.getElementById("membership_date")?.value;
    }

    // Store in global variables for the Confirm Modal's "Final Save" button
    pendingPayload = payload;
    pendingEndpoint = endpoint;

    // =========================
    // OPEN PREVIEW/CONFIRM MODAL
    // =========================
    if (typeof fillConfirmationModal === 'function') {
      fillConfirmationModal(payload, accountType);
    }

    const confirmEl = document.getElementById("confirmModal");
    if (!confirmEl) return;

    // Bind cleanup once to handle Bootstrap modal state
    if (!confirmEl.dataset.boundCleanup) {
      confirmEl.addEventListener("hidden.bs.modal", () => {
        if (typeof hardResetBootstrapModalState === 'function') {
          hardResetBootstrapModalState();
        }
      });
      confirmEl.dataset.boundCleanup = "1";
    }

    // Show the Preview Modal
    if (window.bootstrap) {
      bootstrap.Modal.getOrCreateInstance(confirmEl, {
        backdrop: "static",
        keyboard: false,
      }).show();
    }
  });

  /* =========================
     CONFIRM & SAVE
  ========================= */
  document.getElementById("confirmSubmitBtn")?.addEventListener("click", async () => {
    if (!pendingPayload || !pendingEndpoint) return;

    const confirmEl = document.getElementById("confirmModal");
    const confirmInstance = confirmEl ? bootstrap.Modal.getInstance(confirmEl) : null;

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
      if (!res.ok || !data.success) throw new Error(data.message || "Registration failed");

      // Hide confirm first, then show status after it is fully closed (prevents stacked backdrops)
      if (confirmEl && confirmInstance) {
        confirmEl.addEventListener(
          "hidden.bs.modal",
          () => {
            hardResetBootstrapModalState();
            showStatusModal("success", "Account Created", "Account created successfully!");
          },
          { once: true }
        );
        confirmInstance.hide();
      } else {
        showStatusModal("success", "Account Created", "Account created successfully!");
      }

      form?.reset(); // triggers reset handler (clears address)
      otpSent = false;

      if (sendOtpBtn) {
        sendOtpBtn.disabled = false;
        sendOtpBtn.textContent = "Send OTP";
      }

      toggleFarmerFields();
      setMembershipDatePH();

      pendingPayload = null;
      pendingEndpoint = null;
    } catch (err) {
      // Also hide confirm cleanly before showing error modal
      if (confirmEl && confirmInstance) {
        confirmEl.addEventListener(
          "hidden.bs.modal",
          () => {
            hardResetBootstrapModalState();
            showStatusModal("danger", "Create Failed", err.message);
          },
          { once: true }
        );
        confirmInstance.hide();
      } else {
        showStatusModal("danger", "Create Failed", err.message);
      }
    }
  });

  /* =========================
     FORM RESET (CLEAR BUTTON FIX)
  ========================= */
  form?.addEventListener("reset", () => {
    setTimeout(() => {
      if (addrHidden) addrHidden.value = "";

      addrPreview?.classList.remove("show");
      const span = addrPreview?.querySelector("span");
      if (span) span.textContent = "Address will be formatted automatically.";

      if (regionEl) regionEl.value = "";

      if (provEl) resetSelect(provEl, "Select Province", true);
      if (cityEl) resetSelect(cityEl, "Select City / Municipality", true);
      if (brgyEl) resetSelect(brgyEl, "Select Barangay", true);

      if (streetEl) streetEl.value = "";

      otpSent = false;
      if (sendOtpBtn) {
        sendOtpBtn.disabled = false;
        sendOtpBtn.textContent = "Send OTP";
      }

      // Safety: if any stray backdrop exists after reset, clear it
      clearAllValidation(form);
      hardResetBootstrapModalState();
    }, 0);
  });

  /* =========================
     PASSWORD TOGGLE (FIXED)
  ========================= */
  document.querySelectorAll(".toggle-password").forEach((btn) => {
    btn.addEventListener("click", () => {
      const inputId = btn.getAttribute("data-target");
      const input = document.getElementById(inputId);
      const icon = btn.querySelector("i");
      if (!input || !icon) return;

      const show = input.type === "password";
      input.type = show ? "text" : "password";

      icon.classList.remove("bi-eye", "bi-eye-slash");
      icon.classList.add(show ? "bi-eye-slash" : "bi-eye");

      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
  });

  /* =========================
     GLOBAL SAFETY NET:
     If no modal is open but a backdrop remains, remove it.
  ========================= */
  document.addEventListener("click", () => {
    const anyOpen = document.querySelector(".modal.show");
    const anyBackdrop = document.querySelector(".modal-backdrop");
    if (!anyOpen && anyBackdrop) hardResetBootstrapModalState();
  });
});