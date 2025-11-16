document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  const farmerId = localStorage.getItem("userId");

  if (!token || !farmerId) {
    alert("Session expired. Please log in again.");
    window.location.href = "login.html";
    return;
  }

  // View Swine
  document.getElementById("viewSwineBtn").addEventListener("click", () => {
    window.location.href = "farmer_swine.html";
  });

  // Ovulation Report
  document.getElementById("ovulationBtn").addEventListener("click", () => {
    window.location.href = "ovulation_report.html";
  });

  // Logout
  document.getElementById("logoutBtn").addEventListener("click", () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userId");
    window.location.href = "login.html";
  });
});
