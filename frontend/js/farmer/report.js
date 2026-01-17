import { authGuard } from "../auth/authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  // ================= AUTH =================
  const user = await authGuard("farmer");
  if (!user) return;

  const BACKEND_URL = "http://localhost:5000";
  const token = localStorage.getItem("token");

  if (!token) {
    alert("Authentication token missing. Please log in again.");
    window.location.href = "/login";
    return;
  }

  // ✅ PUT THE MAPPING RIGHT HERE
  const SIGN_LABEL_MAP = {
    reddened_vulva: "Reddened Vulva",
    swollen_vulva: "Swollen Vulva",
    mucous_discharge: "Mucous Discharge",
    seeking_boar: "Seeking the Boar",
    perked_ears: "Perked/Twitching Ears",
    standing_reflex: "Standing Reflex",
    back_pressure_test: "Back Pressure Test"
  };

  // ================= DOM =================
  const swineSelect = document.getElementById("swineSelect");
  const reportForm = document.getElementById("heatReportForm");
  const reportMessage = document.getElementById("reportMessage");
  const evidenceInput = document.getElementById("evidence");
  const previewContainer = document.getElementById("previewContainer");
  const uploadBtn = document.getElementById("uploadBtn");
  const logsContainer = document.getElementById("logsContainer");
  const submitBtn = reportForm.querySelector("button[type='submit']");

  // ================= LIMITS =================
  const MAX_IMAGES = 6;
  const MAX_IMAGE_SIZE = 35 * 1024 * 1024; // 35 MB
  const MAX_VIDEO_SIZE = 250 * 1024 * 1024; // 250 MB

  // ================= STATE =================
  let selectedImages = [];
  let selectedVideo = null;

  // ================= FETCH WITH AUTH =================
  async function fetchWithAuth(url, options = {}) {
    options.headers = options.headers || {};
    options.headers.Authorization = `Bearer ${token}`;
    options.credentials = "include";

    const res = await fetch(url, options);

    if (res.status === 401) {
      try {
        const data = await res.clone().json();
        if (
          data.message?.includes("Invalid") ||
          data.message?.includes("Not authenticated")
        ) {
          alert("Your session has expired. Please log in again.");
          localStorage.clear();
          window.location.href = "/login";
          return null;
        }
      } catch (_) {}
    }

    return res;
  }

  // ================= LOAD FARMER SWINE =================
  async function loadSwine() {
    try {
      const res = await fetchWithAuth(`${BACKEND_URL}/api/swine/farmer`);
      if (!res) return;

      const data = await res.json();
      swineSelect.innerHTML = `<option value="">Select pig</option>`;

      if (!data.success || !data.swine?.length) {
        swineSelect.innerHTML = `<option value="">No pigs available</option>`;
        return;
      }

      data.swine.forEach(swine => {
        const opt = document.createElement("option");
        opt.value = swine.swine_id;
        opt.textContent = `${swine.swine_id} • ${swine.breed || "-"}`;
        swineSelect.appendChild(opt);
      });
    } catch (err) {
      console.error("Load swine error:", err);
      swineSelect.innerHTML = `<option value="">Error loading pigs</option>`;
    }
  }

  // ================= LOAD REPORT LOGS =================
  async function loadLogs() {
    try {
      const res = await fetchWithAuth(
        `${BACKEND_URL}/api/heat/farmer/${user.id}`
      );
      if (!res) return;

      const data = await res.json();
      logsContainer.innerHTML = "";

      if (!data.success || !data.reports?.length) {
        logsContainer.innerHTML = "<p>No reports found.</p>";
        return;
      }

      data.reports.forEach(r => {
        const div = document.createElement("div");
        div.className = "log-card";
        div.innerHTML = `
          <strong>${r.swine_id?.swine_id || r.swine_id}</strong>
          <div>Status: ${r.status}</div>
          <div>${new Date(r.createdAt).toLocaleString()}</div>
        `;
        logsContainer.appendChild(div);
      });
    } catch (err) {
      console.error("Load logs error:", err);
      logsContainer.innerHTML = "<p>Error loading reports.</p>";
    }
  }

  // ================= PREVIEW =================
  function renderPreview(file) {
    const wrapper = document.createElement("div");
    wrapper.className = "preview-item";

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "×";
    removeBtn.className = "remove-preview";
    removeBtn.onclick = () => {
      wrapper.remove();
      if (file.type.startsWith("image")) {
        selectedImages = selectedImages.filter(f => f !== file);
      } else {
        selectedVideo = null;
      }
    };

    if (file.type.startsWith("image")) {
      const img = document.createElement("img");
      img.src = URL.createObjectURL(file);
      img.style.width = "100%";
      wrapper.appendChild(img);
    } else if (file.type.startsWith("video")) {
      const video = document.createElement("video");
      video.src = URL.createObjectURL(file);
      video.controls = true;
      video.style.width = "100%";
      wrapper.appendChild(video);
    }

    wrapper.appendChild(removeBtn);
    previewContainer.appendChild(wrapper);
  }

  // ================= UPLOAD =================
  uploadBtn.onclick = () => evidenceInput.click();

  evidenceInput.onchange = () => {
    Array.from(evidenceInput.files).forEach(file => {
      if (file.type.startsWith("image")) {
        if (file.size > MAX_IMAGE_SIZE) {
          alert("Each image must be 35 MB or less.");
          return;
        }
        if (selectedImages.length >= MAX_IMAGES) {
          alert("Maximum of 6 images allowed.");
          return;
        }
        selectedImages.push(file);
        renderPreview(file);
      } else if (file.type.startsWith("video")) {
        if (file.size > MAX_VIDEO_SIZE) {
          alert("Video must be 250 MB or less.");
          return;
        }
        if (selectedVideo) {
          alert("Only one video is allowed.");
          return;
        }
        selectedVideo = file;
        renderPreview(file);
      }
    });

    evidenceInput.value = "";
  };

  // ================= SUBMIT =================
  reportForm.onsubmit = async e => {
    e.preventDefault();
    submitBtn.disabled = true;

    const signs = Array.from(
      document.querySelectorAll('input[name="signs"]:checked')
    )
      .map(cb => SIGN_LABEL_MAP[cb.value])
      .filter(Boolean);

    if (!swineSelect.value || !signs.length) {
      reportMessage.textContent = "Please select a pig and at least one sign.";
      reportMessage.style.color = "red";
      submitBtn.disabled = false;
      return;
    }

    if (!selectedImages.length && !selectedVideo) {
      reportMessage.textContent = "Please upload at least one image or video.";
      reportMessage.style.color = "red";
      submitBtn.disabled = false;
      return;
    }

    const formData = new FormData();
    formData.append("swineId", swineSelect.value);
    formData.append("signs", JSON.stringify(signs));

    selectedImages.forEach(f => formData.append("evidence", f));
    if (selectedVideo) formData.append("evidence", selectedVideo);

    try {
      reportMessage.textContent = "Submitting report...";
      reportMessage.style.color = "blue";

      const res = await fetchWithAuth(
        `${BACKEND_URL}/api/heat/add`,
        { method: "POST", body: formData }
      );
      if (!res) return;

      const data = await res.json();

      if (res.ok && data.success) {
        reportMessage.textContent = "Heat report submitted successfully!";
        reportMessage.style.color = "green";
        reportForm.reset();
        previewContainer.innerHTML = "";
        selectedImages = [];
        selectedVideo = null;
        await loadLogs();
      } else {
        reportMessage.textContent = data.message || "Submission failed.";
        reportMessage.style.color = "red";
      }
    } catch (err) {
      console.error("Submit error:", err);
      reportMessage.textContent = "Failed to submit report.";
      reportMessage.style.color = "red";
    } finally {
      submitBtn.disabled = false;
    }
  };

  // ================= INIT =================
  await loadSwine();
  await loadLogs();
});
