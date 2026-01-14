// report.js
import { authGuard } from "../auth/authGuard.js";

document.addEventListener("DOMContentLoaded", async () => {
  // 🔐 Farmer-only
  await authGuard("farmer");

  const token = localStorage.getItem("token");
  const userId = localStorage.getItem("userId");

  /* =========================
     ELEMENT REFERENCES
  ========================= */
  const swineSelect = document.getElementById("swineSelect");
  const pigFilter = document.getElementById("pigFilter");

  const reportForm = document.getElementById("heatReportForm");
  const reportMessage = document.getElementById("reportMessage");

  const uploadBtn = document.getElementById("uploadBtn");
  const evidenceInput = document.getElementById("evidence");
  const previewContainer = document.getElementById("previewContainer");

  const logsContainer = document.getElementById("logsContainer");
  const filteredLogsContainer = document.getElementById("filteredLogsContainer");
  const filteredSection = document.getElementById("filteredSection");

  const searchBtn = document.getElementById("searchBtn");
  const clearFilterBtn = document.getElementById("clearFilterBtn");
  const dateInput = document.querySelector('.filter input[type="date"]');
  const statusFilter = document.getElementById("statusFilter");

  const reportModal = document.getElementById("reportModal");
  const modalBody = document.getElementById("modalBody");
  const closeModalBtn = document.querySelector(".close-modal");
  

  /* =========================
     LOAD SWINE (ONLY LOGGED-IN FARMER)
  ========================= */
  async function loadSwine() {
  try {
    swineSelect.innerHTML = `<option value="">Select pig</option>`;
    pigFilter.innerHTML = `<option value="">All pigs</option>`;

    const res = await fetch("/api/swine/farmer", {
      credentials: "include",
      headers: { Accept: "application/json" }
    });

    if (!res.ok) throw new Error("Failed to fetch pigs");

    const data = await res.json();

    if (!data.success || !Array.isArray(data.swine)) {
      swineSelect.innerHTML = `<option value="">No pigs available</option>`;
      return;
    }

    if (data.swine.length === 0) {
      swineSelect.innerHTML = `<option value="">No pigs registered</option>`;
      return;
    }

    data.swine.forEach(pig => {
      const label = `${pig.swine_id} • ${pig.breed || "-"}`;

      // CREATE REPORT DROPDOWN
      const opt = document.createElement("option");
      opt.value = pig.swine_id; // this matches HeatReport logic
      opt.textContent = label;
      swineSelect.appendChild(opt);

      // FILTER DROPDOWN
      const filterOpt = document.createElement("option");
      filterOpt.value = pig.swine_id;
      filterOpt.textContent = pig.swine_id;
      pigFilter.appendChild(filterOpt);
    });

  } catch (err) {
    console.error("❌ Failed to load farmer pigs:", err);
    swineSelect.innerHTML = `<option value="">Error loading pigs</option>`;
  }
}


/* =========================
   UPLOAD (MULTI IMAGE + 1 VIDEO)
========================= */
let selectedImages = [];
let selectedVideo = null;

uploadBtn?.addEventListener("click", () => {
  evidenceInput.click();
});

evidenceInput?.addEventListener("change", () => {
  const files = Array.from(evidenceInput.files);

  for (const file of files) {

    // ================= IMAGE =================
    if (file.type.startsWith("image")) {
      if (selectedImages.length >= 10) {
        alert("You can upload a maximum of 10 images.");
        continue;
      }

      selectedImages.push(file);
      renderPreview(file, "image");
    }

    // ================= VIDEO =================
    else if (file.type.startsWith("video")) {
      if (selectedVideo) {
        alert("Only one video is allowed.");
        continue;
      }

      selectedVideo = file;
      renderPreview(file, "video");
    }

    else {
      alert("Unsupported file type.");
    }
  }

  // reset input so same file can be re-selected
  evidenceInput.value = "";
});

/* =========================
   PREVIEW RENDERER
========================= */
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
  }

  if (type === "video") {
    const video = document.createElement("video");
    video.src = URL.createObjectURL(file);
    video.controls = true;
    wrapper.appendChild(video);
  }

  wrapper.appendChild(removeBtn);
  previewContainer.appendChild(wrapper);
}


  /* =========================
     SUBMIT REPORT
  ========================= */
  reportForm?.addEventListener("submit", async e => {
    e.preventDefault();

    const swineId = swineSelect.value;

    const signs = Array.from(
      document.querySelectorAll('input[name="signs"]:checked')
    ).map(cb => cb.value);

    if (selectedImages.length === 0 && !selectedVideo) {
      reportMessage.textContent = "Please upload at least one image or video.";
      reportMessage.style.color = "red";
      return;
  }

    if ((!selectedImages.length && !selectedVideo)) {
      reportMessage.textContent = "Please provide at least one sign and evidence.";
      reportMessage.style.color = "red";
      return;
    }


    const formData = new FormData();
    formData.append("swineId", swineId);
    formData.append("signs", JSON.stringify(signs));
    formData.append("evidence", evidence);
    formData.append("farmerId", userId);

    try {
      fetch("http://localhost:5000/api/heat/add", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        },
        credentials: "include", // 🔑 THIS IS THE FIX
        body: formData
      });


      selectedImages.forEach(img => {
        formData.append("evidence", img);
      });

      if (selectedVideo) {
        formData.append("evidence", selectedVideo);
  }


      const data = await res.json();

      if (res.ok && data.success) {
        reportMessage.textContent = "Heat report submitted successfully.";
        reportMessage.style.color = "green";
        reportForm.reset();
        previewContainer.innerHTML = "";
        loadLogs();
      } else {
        throw new Error(data.message);
      }

    } catch (err) {
      console.error(err);
      reportMessage.textContent = "Failed to submit report.";
      reportMessage.style.color = "red";
    }
  });

  /* =========================
     LOAD FARMER LOGS
  ========================= */
  async function loadLogs() {
    if (!logsContainer) return;

    const params = new URLSearchParams();
    if (dateInput?.value) params.append("date", dateInput.value);
    if (pigFilter?.value) params.append("swineId", pigFilter.value);
    if (statusFilter?.value !== "Recent")
      params.append("status", statusFilter.value.toLowerCase());

    const hasFilter = [...params.keys()].length > 0;

    filteredSection.style.display = hasFilter ? "block" : "none";
    const target = hasFilter ? filteredLogsContainer : logsContainer;
    target.innerHTML = "";

    try {
      const res = await fetch(
        `http://localhost:5000/api/heat/farmer/${userId}?${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const data = await res.json();
      if (!data.success || data.reports.length === 0) {
        target.innerHTML = `<p style="text-align:center;opacity:.6;">No reports found.</p>`;
        return;
      }

      data.reports.forEach(r => {
        const card = document.createElement("div");
        card.className = "report-card";

        card.innerHTML = `
          <div>
            <p><strong>Report ID:</strong> ${r._id}</p>
            <p><strong>Pig Tag:</strong> ${r.swine_id?.swine_id || "-"}</p>
            <p><strong>Status:</strong> ${r.status}</p>
            <p><strong>Date:</strong> ${new Date(r.createdAt).toLocaleDateString()}</p>
          </div>
          <button class="view-btn">VIEW</button>
        `;

        card.querySelector(".view-btn").onclick = () => openModal(r._id);
        target.appendChild(card);
      });

    } catch (err) {
      console.error("Load logs error:", err);
    }
  }

  /* =========================
     VIEW MODAL
  ========================= */
  async function openModal(id) {
    reportModal.classList.remove("hidden");
    modalBody.innerHTML = "Loading...";

    try {
      const res = await fetch(
        `http://localhost:5000/api/heat/${id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const data = await res.json();
      if (!data.success) throw new Error();

      const r = data.report;

      modalBody.innerHTML = `
        <p><strong>Pig:</strong> ${r.swine_id?.swine_id}</p>
        <p><strong>Breed:</strong> ${r.swine_id?.breed}</p>
        <p><strong>Status:</strong> ${r.status}</p>
        <p><strong>Signs:</strong> ${r.signs.join(", ")}</p>
        ${r.evidence_url ? `<img src="${r.evidence_url}" style="width:100%;border-radius:10px;margin-top:10px;">` : ""}
      `;
    } catch {
      modalBody.innerHTML = "Failed to load report.";
    }
  }

  /* =========================
     MISC
  ========================= */
  closeModalBtn?.addEventListener("click", () => {
    reportModal.classList.add("hidden");
  });

  reportModal?.addEventListener("click", e => {
    if (e.target === reportModal) reportModal.classList.add("hidden");
  });

  searchBtn?.addEventListener("click", loadLogs);
  clearFilterBtn?.addEventListener("click", () => {
    dateInput.value = "";
    pigFilter.value = "";
    statusFilter.value = "Recent";
    loadLogs();
  });

  /* =========================
     INIT
  ========================= */
  loadSwine();
  loadLogs();
});
