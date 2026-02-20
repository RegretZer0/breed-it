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
    formData.append("swineId", swineId);
    formData.append("farmerId", farmerId);
    formData.append("signs", JSON.stringify(signs));
    if (remarks && String(remarks).trim() !== "") {
        formData.append("remarks", String(remarks).trim());
    }
    (files || []).forEach(f => formData.append("evidence", f));

    return fetchWithAuth(`${BACKEND_URL}/api/heat/add`, { method: "POST", body: formData });
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