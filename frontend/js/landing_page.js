// scripts.js
// Currently minimal — used for interactivity later (e.g., hooking buttons to routes).
document.addEventListener('DOMContentLoaded', function () {
  // Example: wire "GET STARTED" to a route you can implement server-side
  const getStarted = document.querySelector('.btn-outline-success');
  if (getStarted) {
    getStarted.addEventListener('click', (e) => {
      e.preventDefault();
      // Example: navigate to registration page (implement route in Node)
      window.location.href = '/register';
    });
  }

  const learnMore = document.querySelector('.btn-success.filled');
  if (learnMore) {
    learnMore.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = '/about';
    });
  }
});
