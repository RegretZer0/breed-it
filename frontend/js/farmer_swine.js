document.addEventListener("DOMContentLoaded", async () => {
  const userId = localStorage.getItem("userId");
  const role = "farmer";
  const token = localStorage.getItem("token");

  const swineTableBody = document.querySelector("#swineTableBody");
  const loadingMessage = document.querySelector("#loadingMessage");

  try {
    loadingMessage.textContent = "Loading swine list...";

    const response = await fetch(`http://localhost:5000/api/swine?userId=${userId}&role=${role}`, {
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });

    const data = await response.json();

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
