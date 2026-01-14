// admin_dashboard_summary.js
import { authGuard } from "./authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  // ---------------- AUTHENTICATION ----------------
  const user = await authGuard(["farm_manager", "encoder"]);
  if (!user) return;

  const BACKEND_URL = "http://localhost:5000";

  // DOM Elements
  const countInHeat = document.getElementById("countInHeat");
  const countAwaitingRecheck = document.getElementById("countAwaitingRecheck");
  const countPregnant = document.getElementById("countPregnant");
  const countFarrowingReady = document.getElementById("countFarrowingReady");

  /**
   * Fetches all swine data and calculates real-time reproductive stats
   */
  async function loadDashboardStats() {
    try {
      const token = localStorage.getItem("token");

      const res = await fetch(`${BACKEND_URL}/api/swine/all`, {
        method: "GET",
        headers: { 
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        credentials: "include" 
      });

      const data = await res.json();

      if (data.success) {
        const swine = data.swine || [];
        const today = new Date();
        const nextWeek = new Date();
        nextWeek.setDate(today.getDate() + 7);

        // Calculate counts using status enums and date logic
        const stats = {
          inHeat: 0,
          awaiting: 0,
          pregnant: 0,
          farrowingSoon: 0
        };

        swine.forEach(s => {
          // 1. Check for Active Heat
          if (s.current_status === "In-Heat") {
            stats.inHeat++;
          } 
          
          // 2. Check for Awaiting Recheck (Post-AI wait period)
          else if (s.current_status === "Awaiting Recheck") {
            stats.awaiting++;
          } 
          
          // 3. Check for Pregnancy & Imminent Farrowing
          else if (s.current_status === "Pregnant") {
            stats.pregnant++;
            
            // If the swine is pregnant, check if expected farrowing is within 7 days
            if (s.expected_farrowing) {
              const farrowDate = new Date(s.expected_farrowing);
              if (farrowDate >= today && farrowDate <= nextWeek) {
                stats.farrowingSoon++;
              }
            }
          }
          
          // 4. Fallback: If status is explicitly set to Farrowing
          else if (s.current_status === "Farrowing") {
            stats.farrowingSoon++;
          }
        });

        // --- UPDATE UI ---
        // We use textContent for security and performance
        if (countInHeat) countInHeat.textContent = stats.inHeat;
        if (countAwaitingRecheck) countAwaitingRecheck.textContent = stats.awaiting;
        if (countPregnant) countPregnant.textContent = stats.pregnant;
        if (countFarrowingReady) countFarrowingReady.textContent = stats.farrowingSoon;

        // Log for debugging
        console.log(`Stats updated at ${new Date().toLocaleTimeString()}:`, stats);

      } else {
        console.error("Failed to load stats:", data.message);
      }
    } catch (err) {
      console.error("Dashboard Stats Error:", err);
    }
  }

  // Initial load
  loadDashboardStats();
  
  // Refresh stats every 60 seconds (upped from 5 mins for better real-time feel)
  setInterval(loadDashboardStats, 60000);
});