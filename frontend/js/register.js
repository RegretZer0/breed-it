document.getElementById("registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const fullName = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  
  // Automatically set role to admin
  const role = "farm_manager";

  if (!fullName || !email || !password) {
    alert("Please fill out all fields.");
    return;
  }

  try {
    const response = await fetch("http://localhost:5000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName, email, password, role }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Registration failed.");
    }

    alert("Registration successful! Please log in.");
    window.location.href = "login.html";
  } catch (error) {
    console.error("Registration error:", error);
    alert(error.message);
  }
});
