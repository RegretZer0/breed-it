console.log("✅ farmer_profile.js loaded");
import { authGuard } from "../auth/authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  await authGuard("farmer");

  /* =======================
     VIEW MODE ELEMENTS
  ======================= */
  const nameEl = document.getElementById("profileName");
  const emailEl = document.getElementById("email");
  const contactEl = document.getElementById("contact_no");
  const addressEl = document.getElementById("address");
  const farmerIdEl = document.getElementById("farmer_id");
  const numPensEl = document.getElementById("num_of_pens");
  const penCapacityEl = document.getElementById("pen_capacity");

  /* =======================
     EDIT MODE ELEMENTS
  ======================= */
  const editName = document.getElementById("editName");
  const editEmail = document.getElementById("editEmail");
  const editContact = document.getElementById("editContact_no"); // ✅ FIXED ID
  const editAddress = document.getElementById("editAddress");

  const messageEl = document.getElementById("profileMessage");

  try {
    // ✅ SESSION-BASED REQUEST (NO ID, NO TOKEN)
    const res = await fetch("/api/farmer/profile", {
      credentials: "include",
    });

    if (!res.ok) throw new Error("Failed to load profile");

    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    const farmer = data.farmer;

    /* =======================
       VIEW MODE POPULATION
    ======================= */
    nameEl.textContent = farmer.name || "-";
    emailEl.textContent = farmer.email || "-";
    contactEl.textContent = farmer.contact_no || "-";
    addressEl.textContent = farmer.address || "-";
    farmerIdEl.textContent = farmer.farmer_id || "-";
    numPensEl.textContent = farmer.num_of_pens ?? "0";
    penCapacityEl.textContent = farmer.pen_capacity ?? "0";

    /* =======================
       EDIT MODE PREFILL
    ======================= */
    editName.value = farmer.name || "";
    editEmail.value = farmer.email || "";
    editContact.value = farmer.contact_no || "";
    editAddress.value = farmer.address || "";

  } catch (err) {
    console.error("Profile load error:", err);
    if (messageEl) {
      messageEl.textContent = "Failed to load profile.";
    }
  }
});
