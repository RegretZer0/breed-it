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

  async function post(url, data = {}) {
    const res = await fetchWithAuth(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    if (!res) return { success: false, message: "No response from server" };

    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      return res.json();
    }

    const text = await res.text();
    return {
      success: res.ok,
      message: text || "Server returned a non-JSON response."
    };
  }

  async function sendAdminNotification(title, message, type = "info") {
    try {
      await fetch(`${BACKEND_URL}/api/notifications/admin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`
        },
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
    return fetchWithAuth(`${BACKEND_URL}/api/heat/${reportId}/still-heat`, {
      method: "POST"
    });
  }

  async function confirmPregnancy(reportId) {
    return fetchWithAuth(`${BACKEND_URL}/api/heat/${reportId}/confirm-pregnancy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
  }

  async function confirmFarrowing(reportId, payload) {
    return fetchWithAuth(`${BACKEND_URL}/api/heat/${reportId}/confirm-farrowing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
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

    if (farmerId) formData.append("farmerId", farmerId);

    const signsArray = Array.isArray(signs) ? signs : [];
    formData.append("signs", JSON.stringify(signsArray));

    if (remarks && String(remarks).trim() !== "") {
      formData.append("remarks", String(remarks).trim());
    }

    if (files && files.length > 0) {
      files.forEach((f) => formData.append("evidence", f));
    }

    return fetchWithAuth(`${BACKEND_URL}/api/heat/add`, {
      method: "POST",
      body: formData
    });
  }

  // Fetch heat signs from system settings
  async function fetchHeatSigns() {
    const res = await fetchWithAuth(`${BACKEND_URL}/api/system-settings/heat-signs`);
    if (!res) return null;
    return res.json();
  }

  return {
    fetchWithAuth,
    post,
    sendAdminNotification,
    fetchFarmerSwine,
    fetchFarmerReports,
    fetchReportDetail,
    stillHeat,
    confirmPregnancy,
    confirmFarrowing,
    confirmWeaning,
    submitHeatReport,
    fetchHeatSigns
  };
}