import { authGuard } from "./authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  const messageEl = document.createElement("p");
  messageEl.style.color = "red";
  messageEl.style.fontWeight = "bold";
  document.body.prepend(messageEl);

  // Check if user is authenticated and is an encoder
  const user = await authGuard("encoder");
  if (!user) return; // authGuard will redirect if not authenticated

  // Show encoder name
  const welcome = document.querySelector(".dashboard-container h2");
  if (welcome) welcome.textContent = `Welcome, ${user.name || "Encoder"}`;

  // Logout handler
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async (e) => {
      e.preventDefault();

      try {
        await fetch("http://localhost:5000/api/auth/logout", {
          method: "POST",
          credentials: "include",
        });

        // Clear frontend auth
        localStorage.clear();

        window.location.href = "login.html";
      } catch (err) {
        console.error("Logout error:", err);
        alert("Logout failed. Try again.");
      }
    });
  }

});
