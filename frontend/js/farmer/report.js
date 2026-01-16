import { authGuard } from "../auth/authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  // ================= AUTH (SESSION-ONLY) =================
  const user = await authGuard("farmer");
  if (!user) return;

  const BACKEND_URL = "http://localhost:5000";

  // ================= DOM =================
  const swineSelect = document.getElementById("swineSelect");
  const reportForm = document.getElementById("heatReportForm");
  const reportMessage = document.getElementById("reportMessage");
  const evidenceInput = document.getElementById("evidence");
  const previewContainer = document.getElementById("previewContainer");
  const uploadBtn = document.getElementById("uploadBtn");

  // ================= STATE =================
  let selectedImages = [];
  let selectedVideo = null;

  // ================= FETCH HELPER (SESSION ONLY) =================
  async function fetchWithSession(url, options = {}) {
    options.credentials = "include";
    const res = await fetch(url, options);

    if (res.status === 401) {
      alert("Session expired. Please log in again.");
      window.location.href = "/login";
      return null;
    }
    return res;
  }

  // ================= LOAD FARMER SWINE =================
  async function loadSwine() {
    try {
      const res = await fetchWithSession(`${BACKEND_URL}/api/swine/farmer`);
      if (!res) return;

      const data = await res.json();
      swineSelect.innerHTML = `<option value="">Select pig</option>`;

      if (!data.success || !data.swine?.length) {
        swineSelect.innerHTML = `<option value="">No pigs available</option>`;
        return;
      }

      data.swine.forEach(sw => {
        const opt = document.createElement("option");
        opt.value = sw.swine_id;
        opt.textContent = `${sw.swine_id} • ${sw.breed || "-"}`;
        swineSelect.appendChild(opt);
      });

    } catch (err) {
      console.error("Load swine error:", err);
      swineSelect.innerHTML = `<option value="">Error loading pigs</option>`;
    }
  }

  // ================= UPLOAD HANDLING =================
  uploadBtn?.addEventListener("click", () => evidenceInput.click());

  evidenceInput?.addEventListener("change", () => {
    const files = Array.from(evidenceInput.files);

    for (const file of files) {
      if (file.type.startsWith("image")) {
        if (selectedImages.length >= 10) {
          alert("Maximum 10 images allowed");
          continue;
        }
        selectedImages.push(file);
        renderPreview(file, "image");
      } 
      else if (file.type.startsWith("video")) {
        if (selectedVideo) {
          alert("Only one video allowed");
          continue;
        }
        selectedVideo = file;
        renderPreview(file, "video");
      }
    }

    evidenceInput.value = "";
  });

  function renderPreview(file, type) {
    const wrapper = document.createElement("div");
    wrapper.className = "preview-item";

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "×";
    removeBtn.className = "remove-preview";

    removeBtn.onclick = () => {
      wrapper.remove();
      if (type === "image") {
        selectedImages = selectedImages.filter(f => f !== file);
      } else {
        selectedVideo = null;
      }
    };

    if (type === "image") {
      const img = document.createElement("img");
      img.src = URL.createObjectURL(file);
      wrapper.appendChild(img);
    } else {
      const video = document.createElement("video");
      video.src = URL.createObjectURL(file);
      video.controls = true;
      wrapper.appendChild(video);
    }

    wrapper.appendChild(removeBtn);
    previewContainer.appendChild(wrapper);
  }

  // ================= SUBMIT REPORT =================
  reportForm?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const swineId = swineSelect.value;
    const signs = Array.from(
      document.querySelectorAll('input[name="signs"]:checked')
    ).map(cb => cb.value);

    if (!swineId || !signs.length || (!selectedImages.length && !selectedVideo)) {
      reportMessage.textContent =
        "Please select a pig, at least one sign, and upload evidence.";
      reportMessage.style.color = "red";
      return;
    }

    const formData = new FormData();
    formData.append("swineId", swineId);
    formData.append("signs", JSON.stringify(signs));

    selectedImages.forEach(img => formData.append("evidence", img));
    if (selectedVideo) formData.append("evidence", selectedVideo);

    try {
      reportMessage.style.color = "blue";
      reportMessage.textContent = "Submitting report...";

      const res = await fetchWithSession(`${BACKEND_URL}/api/heat/add`, {
        method: "POST",
        body: formData
      });

      if (!res) return;
      const data = await res.json();

      if (res.ok && data.success) {
        reportMessage.style.color = "green";
        reportMessage.textContent = "Heat report submitted successfully!";
        reportForm.reset();
        previewContainer.innerHTML = "";
        selectedImages = [];
        selectedVideo = null;
      } else {
        throw new Error(data.message || "Submission failed");
      }
    } catch (err) {
      console.error("Submit error:", err);
      reportMessage.style.color = "red";
      reportMessage.textContent = "Failed to submit report.";
    }
  });

  // ================= INIT =================
  await loadSwine();
});
