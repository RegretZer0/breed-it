// farmer_swine.js
import { authGuard } from "./authGuard.js"; // 🔐 import authGuard

document.addEventListener("DOMContentLoaded", async () => {
  // 🔐 Protect the page: only farmers
  await authGuard("farmer");

  const token = localStorage.getItem("token");
  const swineTableBody = document.querySelector("#swineTableBody");
  const loadingMessage = document.querySelector("#loadingMessage");

  try {
    loadingMessage.textContent = "Loading swine list...";
    console.log(token);

    // ✅ CALL the correct endpoint (no /farmer)
    const response = await fetch(`http://localhost:5000/api/swine/farmer`, {
      headers: {
        "Authorization": `Bearer ${token}`,
      },
      credentials: "include",
    });

    // 🔒 Safe parsing
    const text = await response.text();
    console.log("Raw server response:", text); // for debugging
    const data = JSON.parse(text);

    if (!response.ok || !data.success) {
      loadingMessage.textContent = data.message || "Failed to fetch swine.";
      return;
    }

    swineTableBody.innerHTML = "";

    if (!data.swine || data.swine.length === 0) {
      loadingMessage.textContent = "No swine records found.";
      return;
    }

    loadingMessage.textContent = "";

    data.swine.forEach(swine => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${swine.swine_id || "-"}</td>
        <td>${swine.breed || "-"}</td>
        <td>${swine.color || "-"}</td>
        <td>${swine.sex || "-"}</td>
        <td>${swine.status || "-"}</td>
        <td>${swine.batch || "-"}</td>
        <td>${swine.date_registered ? new Date(swine.date_registered).toLocaleDateString() : "-"}</td>
      `;
      swineTableBody.appendChild(row);
    });
  } catch (error) {
    console.error("Error fetching swine:", error);
    loadingMessage.textContent = "Server error occurred while loading swine.";
  }
});
