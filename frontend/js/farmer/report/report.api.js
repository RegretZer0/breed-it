// /js/reports/report.api.js

export function createApi({ BACKEND_URL, getToken, onUnauthorized }) {
  async function fetchWithAuth(url, options = {}) {
    options.headers = {
      ...options.headers,
      Authorization: `Bearer ${getToken()}`
    };
    options.credentials = "include";

    try {
      const res = await fetch(url, options);
      if (res.status === 401) {
        onUnauthorized?.();
        return null;
      }
      return res;
    } catch (err) {
      console.error("Fetch error:", err);
      throw err;
    }
  }

  async function sendAdminNotification(title, message, type = "info") {
    try {
      await fetch(`${BACKEND_URL}/api/notifications/admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ title, message, type })
      });
    } catch (err) {
      console.error("Failed to notify admin:", err);
    }
  }

  async function fetchFarmerSwine() {
    const res = await fetchWithAuth(`${BACKEND_URL}/api/swine/farmer`);
    if (!res) return null;
    return res.json();
  }

  async function fetchFarmerReports() {
    const res = await fetchWithAuth(`${BACKEND_URL}/api/heat/farmer`);
    if (!res) return null;
    return res.json();
  }

  async function fetchReportDetail(reportId) {
    const res = await fetchWithAuth(`${BACKEND_URL}/api/heat/${reportId}/detail`);
    if (!res) return null;
    return res.json();
  }

  async function stillHeat(reportId) {
    return fetchWithAuth(`${BACKEND_URL}/api/heat/${reportId}/still-heat`, { method: "POST" });
  }

  async function confirmPregnancy(reportId) {
    return fetchWithAuth(`${BACKEND_URL}/api/heat/${reportId}/confirm-pregnancy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
  }

  async function confirmWeaning(reportId) {
    return fetchWithAuth(`${BACKEND_URL}/api/heat/${reportId}/confirm-weaning`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
  }

  async function submitHeatReport({ swineId, farmerId, signs, files, remarks }) {
    const formData = new FormData();

    // 1. Match backend route expectation for 'swineId'
    formData.append("swineId", swineId);
    
    // Included farmerId in case your backend logic needs it for specific overrides,
    // though the route primarily uses the logged-in session.
    if (farmerId) formData.append("farmerId", farmerId);

    // 2. Ensure signs is stringified JSON for Multer parsing
    const signsArray = Array.isArray(signs) ? signs : [];
    formData.append("signs", JSON.stringify(signsArray));

    // 3. Optional remarks
    if (remarks && String(remarks).trim() !== "") {
        formData.append("remarks", String(remarks).trim());
    }

    // 4. Match backend field name 'evidence'
    if (files && files.length > 0) {
        files.forEach(f => formData.append("evidence", f));
    }

    // Note: Do not manually set headers to 'multipart/form-data' here. 
    // fetch + FormData handles boundaries automatically.
    return fetchWithAuth(`${BACKEND_URL}/api/heat/add`, {
      method: "POST",
      body: formData
    });
  }

  return {
    fetchWithAuth,
    sendAdminNotification,
    fetchFarmerSwine,
    fetchFarmerReports,
    fetchReportDetail,
    stillHeat,
    confirmPregnancy,
    confirmWeaning,
    submitHeatReport
  };
}