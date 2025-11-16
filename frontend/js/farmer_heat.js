document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("token");
  const userId = localStorage.getItem("userId"); // farmer ID

  const swineSelect = document.getElementById("swineSelect");
  const reportForm = document.getElementById("heatReportForm");
  const reportMessage = document.getElementById("reportMessage");

  // Load farmer's swine
  try {
    const res = await fetch(`http://localhost:5000/api/swine?userId=${userId}&role=farmer`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || "Failed to fetch swine");

    data.swine.forEach(sw => {
      const option = document.createElement("option");
      option.value = sw.swine_id;
      option.textContent = `${sw.swine_id} - ${sw.breed}`;
      swineSelect.appendChild(option);
    });
  } catch (err) {
    console.error("Error loading swine:", err);
    swineSelect.innerHTML = "<option value=''>Error loading swine</option>";
  }

  // Handle form submission
  reportForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const selectedSwine = swineSelect.value;
    const signs = Array.from(document.querySelectorAll('input[name="signs"]:checked')).map(cb => cb.value);
    const evidence = document.getElementById("evidence").files[0];

    if (!selectedSwine || signs.length === 0 || !evidence) {
      reportMessage.style.color = "red";
      reportMessage.textContent = "Please select swine, at least one sign, and upload evidence.";
      return;
    }

    const formData = new FormData();
    formData.append("swineId", selectedSwine);
    formData.append("signs", JSON.stringify(signs));
    formData.append("evidence", evidence);
    formData.append("farmerId", userId);

    try {
      const res = await fetch("http://localhost:5000/api/heat/add", { 
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      const data = await res.json();

      if (res.ok && data.success) {
        reportMessage.style.color = "green";
        reportMessage.textContent = "Heat report submitted successfully!";
        reportForm.reset();
      } else {
        reportMessage.style.color = "red";
        reportMessage.textContent = data.message || "Failed to submit report";
      }
    } catch (err) {
      console.error("Error submitting report:", err);
      reportMessage.style.color = "red";
      reportMessage.textContent = "Server error occurred.";
    }
  });
});
