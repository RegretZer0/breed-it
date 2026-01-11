document.addEventListener("DOMContentLoaded", () => {

  /* =========================
     AUTH / SESSION
  ========================== */
  const token = localStorage.getItem("token");
  const adminId = localStorage.getItem("userId");
  const role = localStorage.getItem("role");

  /* =========================
     ELEMENT REFERENCES
  ========================== */
  const registerForm = document.getElementById("registerSwineForm");
  const swineMessage = document.getElementById("swineMessage");

  const clearBtn = document.querySelector(".btn-clear");

  const farmerInput = document.getElementById("farmerSelect");
  const batchInput = document.getElementById("batch");
  const sexSelect = document.getElementById("sex");
  const breedSelect = document.getElementById("breed");
  const colorSelect = document.getElementById("color");
  const birthDateInput = document.getElementById("birth_date");
  const purposeSelect = document.getElementById("purpose");
  const statusSelect = document.getElementById("status");

  const inventoryStatusInput = document.getElementById("inventory_status");
  const dateTransferInput = document.getElementById("date_transfer");

  if (!registerForm) return;

  /* =========================
     CLEAR BUTTON
  ========================== */
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      registerForm.querySelectorAll("input, select").forEach(el => {
        if (el.tagName === "INPUT") el.value = "";
        if (el.tagName === "SELECT") el.selectedIndex = 0;
      });

      if (swineMessage) swineMessage.textContent = "";
    });
  }

  /* =========================
     SAVE / SUBMIT
  ========================== */
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!batchInput.value.trim()) {
      swineMessage.textContent = "TAG / Batch is required";
      swineMessage.style.color = "red";
      return;
    }

    if (!sexSelect.value) {
      swineMessage.textContent = "Please select sex";
      swineMessage.style.color = "red";
      return;
    }

    const payload = {
      farmer_name: farmerInput.value.trim(),
      batch: batchInput.value.trim(),
      sex: sexSelect.value,
      breed: breedSelect.value,
      color: colorSelect.value,
      birthDate: birthDateInput.value,
      purpose: purposeSelect?.value || "",
      status: statusSelect.value,
      inventoryStatus: inventoryStatusInput?.value || "",
      dateTransfer: dateTransferInput?.value || "",
      adminId
    };

    try {
      const res = await fetch("http://localhost:5000/api/swine/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (res.ok && data.success) {
        swineMessage.textContent = "Pig registered successfully!";
        swineMessage.style.color = "green";

        /* ✅ CONFIRMATION PROMPT (ADDED) */
        alert("Pig successfully registered and added to the system.");

        registerForm.reset();
      } else {
        swineMessage.textContent = data.message || "Failed to register pig";
        swineMessage.style.color = "red";
      }

    } catch (err) {
      console.error("Register error:", err);
      swineMessage.textContent = "Server error";
      swineMessage.style.color = "red";
    }
  });

});
