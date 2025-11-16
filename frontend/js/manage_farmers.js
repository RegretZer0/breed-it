const token = localStorage.getItem("token");
const adminId = localStorage.getItem("userId");
const BASE_URL = "http://localhost:5000";

const farmersList = document.getElementById("farmersList");
const editModal = document.getElementById("editModal");
const editForm = document.getElementById("editFarmerForm");
const registerForm = document.getElementById("registerFarmerForm");
const farmerMessage = document.getElementById("farmerMessage");

// Fetch and display farmers
async function fetchFarmers() {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/farmers/${adminId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const text = await res.text();
    console.log("Raw fetch response:", text);

    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      console.error("Failed to parse farmers JSON:", err, text);
      farmersList.innerHTML = "<li>Error loading farmers (invalid JSON)</li>";
      return;
    }

    if (!res.ok || !data.success) {
      console.error("Failed to fetch farmers:", data.message || text);
      farmersList.innerHTML = `<li>Error: ${data.message || "Failed to fetch"}</li>`;
      return;
    }

    console.log(`Fetched ${data.farmers.length} farmers:`, data.farmers);

    if (!data.farmers.length) {
      farmersList.innerHTML = "<li>No farmers registered yet.</li>";
      return;
    }

    farmersList.innerHTML = "";
    data.farmers.forEach((farmer) => {
      const li = document.createElement("li");
      li.dataset.farmerId = farmer.farmer_id;
      li.innerHTML = `
        ${farmer.name} - Pens: ${farmer.num_of_pens}, Capacity: ${farmer.pen_capacity} 
        <button class="edit-btn">Edit</button>
      `;
      farmersList.appendChild(li);

      li.querySelector(".edit-btn").addEventListener("click", () => openEditModal(farmer));
    });
  } catch (err) {
    console.error("Error fetching farmers:", err);
    farmersList.innerHTML = "<li>Server error while fetching farmers</li>";
  }
}

// Register new farmer
registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("name").value.trim();
  const address = document.getElementById("address").value.trim();
  const contact_no = document.getElementById("contact_no").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const num_of_pens = Number(document.getElementById("num_of_pens").value);
  const pen_capacity = Number(document.getElementById("pen_capacity").value);

  try {
    const res = await fetch(`${BASE_URL}/api/auth/register-farmer`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name, address, contact_no, email, password, num_of_pens, pen_capacity, adminId }),
    });

    const text = await res.text();
    console.log("Raw register response:", text);

    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      console.error("Response is not JSON:", err, text);
      farmerMessage.style.color = "red";
      farmerMessage.textContent = "Server returned invalid response.";
      return;
    }

    if (res.ok && data.success) {
      farmerMessage.style.color = "green";
      farmerMessage.textContent = "Farmer registered successfully!";
      registerForm.reset();
      fetchFarmers();
    } else {
      farmerMessage.style.color = "red";
      farmerMessage.textContent = data.message || "Registration failed";
    }
  } catch (err) {
    console.error("Error registering farmer:", err);
    farmerMessage.style.color = "red";
    farmerMessage.textContent = "Server error";
  }
});

// Open modal to edit farmer
function openEditModal(farmer) {
  document.getElementById("editName").value = farmer.name;
  document.getElementById("editAddress").value = farmer.address || "";
  document.getElementById("editContact").value = farmer.contact_no || "";
  document.getElementById("editPens").value = farmer.num_of_pens || 0;
  document.getElementById("editCapacity").value = farmer.pen_capacity || 0;

  editForm.dataset.farmerId = farmer.farmer_id;
  editModal.style.display = "flex";
}

// Handle edit form submit
editForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const farmerId = editForm.dataset.farmerId;
  const name = document.getElementById("editName").value.trim();
  const address = document.getElementById("editAddress").value.trim();
  const contact_no = document.getElementById("editContact").value.trim();
  const num_of_pens = Number(document.getElementById("editPens").value);
  const pen_capacity = Number(document.getElementById("editCapacity").value);

  try {
    const res = await fetch(`${BASE_URL}/api/auth/update-farmer/${farmerId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name, address, contact_no, num_of_pens, pen_capacity }),
    });

    const text = await res.text();
    console.log("Raw update response:", text);

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.error("Response is not JSON:", text);
      alert("Server returned invalid response.");
      return;
    }

    if (res.ok && data.success) {
      alert("Farmer updated successfully!");
      editModal.style.display = "none";
      fetchFarmers();
    } else {
      alert(data.message || "Update failed");
    }
  } catch (err) {
    console.error("Error updating farmer:", err);
    alert("Server error");
  }
});

// Close modal
document.getElementById("closeModal").addEventListener("click", () => {
  editModal.style.display = "none";
});

// Initial fetch
fetchFarmers();
