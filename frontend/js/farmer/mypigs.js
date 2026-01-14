console.log("✅ mypigs.js loaded");

document.addEventListener("DOMContentLoaded", async () => {
  const pigList = document.getElementById("pigList");
  const loadingMessage = document.getElementById("loadingMessage");

  if (!pigList || !loadingMessage) {
    console.error("❌ Required DOM elements missing");
    return;
  }

  try {
    loadingMessage.textContent = "Loading pigs...";

    // ✅ SESSION-BASED REQUEST
    const res = await fetch("/api/swine/farmer", {
      credentials: "include",
      headers: {
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`Request failed with status ${res.status}`);
    }

    const data = await res.json();

    if (!data.success) {
      loadingMessage.textContent = data.message || "Failed to load pigs.";
      return;
    }

    const pigs = data.swine;

    if (!pigs || pigs.length === 0) {
      loadingMessage.textContent = "No pigs registered yet.";
      return;
    }

    loadingMessage.textContent = "";
    pigList.innerHTML = "";

    pigs.forEach((pig) => {
      const card = document.createElement("div");
      card.className = "pig-card";

      card.innerHTML = `
        <h4>${pig.swine_id || "Unnamed Pig"}</h4>
        <p><strong>Breed:</strong> ${pig.breed || "-"}</p>
        <p><strong>Color:</strong> ${pig.color || "-"}</p>
        <p><strong>Sex:</strong> ${pig.sex || "-"}</p>
        <p><strong>Status:</strong> ${pig.status || "-"}</p>
        <p><strong>Batch:</strong> ${pig.batch || "-"}</p>
        <p><strong>Date Registered:</strong>
          ${
            pig.date_registered
              ? new Date(pig.date_registered).toLocaleDateString()
              : "-"
          }
        </p>
      `;

      pigList.appendChild(card);
    });

  } catch (err) {
    console.error("❌ Error loading pigs:", err);
    loadingMessage.textContent =
      "Server error occurred while loading pigs.";
  }
});
