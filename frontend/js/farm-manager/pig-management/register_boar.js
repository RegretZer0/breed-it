import { authGuard } from "/js/authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  // ================= AUTH =================
  const user = await authGuard(["farm_manager", "encoder"]);
  if (!user) return;

  const BACKEND_URL = "http://localhost:5000";
  const token = localStorage.getItem("token");

  // ================= DOM =================
  const form = document.getElementById("registerBoarForm");
  const messageEl = document.getElementById("boarMessage");

  const breedInput = document.getElementById("breed");

  const colorSelect = document.getElementById("colorSelect");
  const otherColorGroup = document.getElementById("otherColorGroup");
  const otherColorInput = document.getElementById("otherColorInput");

  const dateTransferInput = document.getElementById("dateTransfer");

  // ================= LOCK BREED =================
  breedInput.value = "Native";
  breedInput.readOnly = true;

  // ================= DEFAULT DATE =================
  dateTransferInput.value = new Date().toISOString().split("T")[0];

  // ================= COLOR LOGIC (EXACT register_pig BEHAVIOR) =================
  function handleColorChange() {
    if (colorSelect.value === "Other") {
      otherColorGroup.classList.remove("d-none");

      // 🔧 Force layout reflow (important!)
      void otherColorGroup.offsetHeight;
    } else {
      otherColorGroup.classList.add("d-none");
      otherColorInput.value = "";
    }
  }

  colorSelect.addEventListener("change", handleColorChange);

  // 🔑 CRITICAL: Run once on load
  handleColorChange();

  // ================= SUBMIT =================
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    messageEl.textContent = "";

    const finalColor =
      colorSelect.value === "Other"
        ? otherColorInput.value.trim()
        : colorSelect.value;

    if (!finalColor) {
      messageEl.textContent = "Please select or specify a color.";
      messageEl.style.color = "red";
      return;
    }

    const payload = {
      breed: "Native",
      color: finalColor,
      weight: parseFloat(document.getElementById("weight").value),
      bodyLength: parseFloat(document.getElementById("bodyLength").value),
      heartGirth: parseFloat(document.getElementById("heartGirth").value),
      teethCount: parseInt(document.getElementById("teethCount").value),
      date_transfer:
        dateTransferInput.value ||
        new Date().toISOString().split("T")[0],
      health_status: "Healthy",
      current_status: "Active",

      // ✅ ADD THIS (from maintenance.js)
      manager_id: user.id || user._id
    };

    try {
      const res = await fetch(`${BACKEND_URL}/api/swine/add-master-boar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      messageEl.textContent = `✅ Master Boar Registered (ID: ${data.swine.swine_id})`;
      messageEl.style.color = "green";

      form.reset();
      breedInput.value = "Native";
      dateTransferInput.value = new Date().toISOString().split("T")[0];

      // 🔑 Re-apply color UI after reset
      handleColorChange();

    } catch (err) {
      messageEl.textContent = err.message || "Registration failed";
      messageEl.style.color = "red";
    }
  });
});
