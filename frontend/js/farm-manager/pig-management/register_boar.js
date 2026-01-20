import { authGuard } from "/js/authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  // ================= AUTH =================
  const user = await authGuard(["farm_manager", "encoder"]);
  if (!user) return;

  const BACKEND_URL = "http://localhost:5000";
  const token = localStorage.getItem("token");

  // ================= RESOLVE MANAGER ID =================
  // Scoping IDs to the manager ensures BOAR-0001 starts at 1 for every new farm.
  const managerId = user.role === "farm_manager" ? (user.id || user._id) : user.managerId;

  // ================= DOM =================
  const form = document.getElementById("registerBoarForm");
  const messageEl = document.getElementById("boarMessage");
  const breedInput = document.getElementById("breed");
  const colorSelect = document.getElementById("colorSelect");
  const otherColorGroup = document.getElementById("otherColorGroup");
  const otherColorInput = document.getElementById("otherColorInput");
  const dateTransferInput = document.getElementById("dateTransfer");
  
  // Optional: If you have a span or input to show the next ID
  const nextIdPreview = document.getElementById("nextBoarIdPreview");

  // ================= LOCK BREED =================
  breedInput.value = "Native";
  breedInput.readOnly = true;

  // ================= DEFAULT DATE =================
  dateTransferInput.value = new Date().toISOString().split("T")[0];

  // ================= ID PREVIEW LOGIC =================
  async function updateNextBoarId() {
    if (!nextIdPreview) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/swine/next-boar-id?managerId=${managerId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        nextIdPreview.textContent = `Next ID: ${data.nextId}`;
      }
    } catch (err) {
      console.error("Error fetching next Boar ID", err);
    }
  }

  // ================= COLOR LOGIC =================
  function handleColorChange() {
    if (colorSelect.value === "Other") {
      otherColorGroup.classList.remove("d-none");
      void otherColorGroup.offsetHeight; // Force layout reflow
    } else {
      otherColorGroup.classList.add("d-none");
      otherColorInput.value = "";
    }
  }

  colorSelect.addEventListener("change", handleColorChange);

  // Initial UI Setup
  handleColorChange();
  updateNextBoarId();

  // ================= SUBMIT =================
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    messageEl.textContent = "Registering...";
    messageEl.style.color = "blue";

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
      
      // ✅ SCOPING: Use the resolved managerId so the backend knows
      // which sequence (Farm A or Farm B) to increment.
      managerId: managerId 
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

      // Reset Form
      form.reset();
      breedInput.value = "Native";
      dateTransferInput.value = new Date().toISOString().split("T")[0];

      // Re-apply UI states
      handleColorChange();
      
      // Update the ID preview for the next registration after a short delay
      setTimeout(updateNextBoarId, 500);

    } catch (err) {
      messageEl.textContent = err.message || "Registration failed";
      messageEl.style.color = "red";
    }
  });
});