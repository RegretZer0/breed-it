// /js/reproduction/reproduction.ui.js

import { authGuard } from "/js/authGuard.js";
import { getCleanToken, debugLog } from "./reproduction.api.js";
import { createReproductionStore } from "./reproduction.data.js";
import { createReproViews } from "./reproduction.views.js";
import { submitSelectionAction } from "./reproduction.actions.js";

document.addEventListener("DOMContentLoaded", async () => {
  console.time("Reproduction_Load_Time");

  const user = await authGuard("farmer");
  if (!user) {
    debugLog("AUTH", "No user found, redirecting...", true);
    return;
  }

  const BASE_URL = "http://localhost:5000";

  /* =========================================================
     MODULE: Local Selection Lock Persistence
     PURPOSE: Persist local selection decisions so refresh
              will not reset locked piglet actions.
  ========================================================= */
  const SELECTION_LOCK_KEY = `reproSelectionLock:${user?._id || user?.id || "anon"}`;

  function loadSelectionLockFromStorage() {
    try {
      const raw = localStorage.getItem(SELECTION_LOCK_KEY);
      if (!raw) return new Map();
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return new Map();
      return new Map(arr.map(([k, v]) => [String(k), String(v)]));
    } catch {
      return new Map();
    }
  }

  function saveSelectionLockToStorage(map) {
    try {
      const arr = [...(map instanceof Map ? map.entries() : [])];
      localStorage.setItem(SELECTION_LOCK_KEY, JSON.stringify(arr));
    } catch {}
  }

  /* =========================================================
     MODULE: Legacy and Main DOM References
     PURPOSE: Keep legacy IDs alive while powering the new UI.
  ========================================================= */
  const searchInput = document.getElementById("reproductionSearch");
  const statusFilterEl = document.getElementById("reproStatusFilter");

  const legacyPigletMonitoringBody = document.getElementById("pigletMonitoringBody");
  const legacyAiTableBody = document.getElementById("aiTableBody");
  const legacyMortalityBody = document.getElementById("breedingMortalityTableBody");
  const legacyPigletSelect = document.getElementById("pigletSelect");
  const legacyMorphBody = document.getElementById("morphTableBody");
  const legacyDeformityList = document.getElementById("deformityList");
  const legacySelectionBody = document.getElementById("selectionTableBody");

  const sowCardsWrap = document.getElementById("sowCardsWrap");
  const sowPager = document.getElementById("sowPager");

  if (!sowCardsWrap || !sowPager) {
    debugLog("DOM_MISSING", "Required containers not found in EJS.", true);
    return;
  }

  /* =========================================================
     MODULE: Auth Helpers
     PURPOSE: Decode JWT, validate expiration, and guard
              routes requiring an active session token.
  ========================================================= */
  function decodeJwtPayload(token) {
    try {
      const parts = String(token || "").split(".");
      if (parts.length !== 3) return null;
      const base64Url = parts[1];
      const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
      const jsonStr = decodeURIComponent(
        atob(base64)
          .split("")
          .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join("")
      );
      return JSON.parse(jsonStr);
    } catch {
      return null;
    }
  }

  function isJwtExpired(token) {
    const payload = decodeJwtPayload(token);
    if (!payload || !payload.exp) return false;
    const nowSec = Math.floor(Date.now() / 1000);
    return Number(payload.exp) <= nowSec;
  }

  function hardLogout(reason = "Session expired. Please login again.") {
    try {
      localStorage.removeItem("token");
    } catch {}
    alert(reason);
    window.location.href = "/login";
  }

  function getValidToken() {
    const tok = getCleanToken();
    if (!tok) return null;
    if (isJwtExpired(tok)) return null;
    return tok;
  }

  function getValidTokenOrLogout() {
    const tok = getValidToken();
    if (!tok) {
      hardLogout("Session expired. Please login again.");
      return null;
    }
    return tok;
  }

  const token = getValidTokenOrLogout();
  if (!token) return;

  /* =========================================================
     MODULE: Action Feedback Modal
     PURPOSE: Provide consistent modal-based feedback for
              success, warning, and failure states.
  ========================================================= */
  function ensureReproActionModal() {
    let modalEl = document.getElementById("reproActionModal");

    if (!modalEl) {
      document.body.insertAdjacentHTML(
        "beforeend",
        `
        <div class="modal fade" id="reproActionModal" tabindex="-1" aria-hidden="true">
          <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content border-0 shadow">
              <div class="modal-header" id="reproActionHeader" style="background: linear-gradient(135deg, var(--repro-green, #1fb87a), var(--repro-green-2, #11a56a));">
                <h5 class="modal-title text-white" id="reproActionTitle">Action Result</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>

              <div class="modal-body">
                <p class="mb-0" id="reproActionMessage"></p>
              </div>

              <div class="modal-footer">
                <button type="button" class="btn btn-success btn-sm" data-bs-dismiss="modal">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
        `
      );

      modalEl = document.getElementById("reproActionModal");
    }

    return modalEl;
  }

  function showReproModal({ title, message, type = "success" }) {
    const modalEl = ensureReproActionModal();

    if (!modalEl || !window.bootstrap) {
      alert(message || "Done.");
      return;
    }

    const titleEl = document.getElementById("reproActionTitle");
    const msgEl = document.getElementById("reproActionMessage");
    const headerEl = document.getElementById("reproActionHeader");

    if (titleEl) titleEl.textContent = title || "Result";
    if (msgEl) msgEl.textContent = message || "";

    if (headerEl) {
      headerEl.classList.remove("text-success", "text-danger", "text-warning");
      headerEl.classList.add(type === "danger" ? "text-danger" : type === "warning" ? "text-warning" : "text-success");
    }

    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
  }

  /* =========================================================
     MODULE: Monthly Update API Helpers
     PURPOSE: Save piglet monthly performance and optional
              medical data using existing backend routes.
  ========================================================= */
  async function updateSwineMonthlyRecord({ swineId, payload, token }) {
    try {
      const res = await fetch(`${BASE_URL}/api/swine/update/${encodeURIComponent(swineId)}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload || {}),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          success: false,
          message: data?.message || `Monthly update failed (${res.status})`,
          status: res.status,
        };
      }

      return data;
    } catch (err) {
      return {
        success: false,
        message: err?.message || "Unable to save monthly performance update.",
      };
    }
  }

  async function addSwineMedicalRecord({ swineId, payload, token }) {
    try {
      const res = await fetch(`${BASE_URL}/api/swine/${encodeURIComponent(swineId)}/medical`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload || {}),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          success: false,
          message: data?.message || `Medical update failed (${res.status})`,
          status: res.status,
        };
      }

      return data;
    } catch (err) {
      return {
        success: false,
        message: err?.message || "Unable to save medical update.",
      };
    }
  }

  /* =========================================================
     MODULE: Modal Mount State
     PURPOSE: Track modal panel mount and restore focus when
              modal panels are closed.
  ========================================================= */
  let panelMountEl = null;
  let lastOpenBtn = null;

  /* =========================================================
     MODULE: Sow Detail Modal
     PURPOSE: Render the primary sow details modal shell.
  ========================================================= */
  function ensureSowModal() {
    let modalEl = document.getElementById("reproSowModal");

    if (!modalEl) {
      document.body.insertAdjacentHTML(
        "beforeend",
        `
        <div class="modal fade repro-modal" id="reproSowModal" tabindex="-1" aria-labelledby="reproSowModalLabel" aria-hidden="true">
          <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
            <div class="modal-content border-0 shadow-lg overflow-hidden">

              <div
                class="modal-header border-0 position-sticky top-0"
                style="z-index: 2; background: linear-gradient(135deg, var(--repro-green, #22b07d), var(--repro-green-2, #18a56f));"
              >
                <div class="d-flex align-items-center gap-3 min-w-0">
                  <span class="repro-pill is-white">
                    <i class="bi bi-grid-1x2"></i>
                  </span>

                  <div class="min-w-0">
                    <div class="fw-bold text-white text-truncate" id="reproSowModalLabel">Sow Details</div>
                    <div class="small text-truncate" style="color: rgba(255,255,255,.84);">
                      Overview, reproduction records, monthly updates, and piglet monitoring
                    </div>
                  </div>
                </div>

                <button type="button" class="btn btn-light btn-sm" data-bs-dismiss="modal" style="border-radius:999px;">
                  <i class="bi bi-x-lg me-1"></i> Close
                </button>
              </div>

              <div class="modal-body" style="background: var(--repro-bg, #edf2f4);">
                <div id="reproSowModalMount"></div>
              </div>
            </div>
          </div>
        </div>
        `
      );

      modalEl = document.getElementById("reproSowModal");

      modalEl.addEventListener("hidden.bs.modal", () => {
        const mount = document.getElementById("reproSowModalMount");
        if (mount) mount.innerHTML = "";
        panelMountEl = null;

        if (lastOpenBtn) {
          try {
            lastOpenBtn.focus();
          } catch {}
        }
      });
    }

    const modal = window.bootstrap ? bootstrap.Modal.getOrCreateInstance(modalEl) : null;
    const mount = document.getElementById("reproSowModalMount");
    panelMountEl = mount || null;

    return { modalEl, modal, mount };
  }
  /* =========================================================
     MODULE: Monthly Updates Modal
     PURPOSE: Render the monthly monitoring panel shell.
  ========================================================= */
  function ensureMonthlyUpdatesModal() {
    let modalEl = document.getElementById("reproMonthlyUpdatesModal");

    if (!modalEl) {
      document.body.insertAdjacentHTML(
        "beforeend",
        `
        <div class="modal fade repro-modal" id="reproMonthlyUpdatesModal" tabindex="-1" aria-labelledby="reproMonthlyUpdatesModalLabel" aria-hidden="true">
          <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
            <div class="modal-content border-0 shadow-lg overflow-hidden">

              <div
                class="modal-header border-0 position-sticky top-0"
                style="z-index:2; background: linear-gradient(135deg, var(--repro-green, #22b07d), var(--repro-green-2, #18a56f));"
              >
                <div class="d-flex align-items-center gap-3 min-w-0">
                  <span class="repro-pill is-white">
                    <i class="bi bi-graph-up-arrow"></i>
                  </span>

                  <div class="min-w-0">
                    <div class="fw-bold text-white text-truncate" id="reproMonthlyUpdatesModalLabel">Monthly Monitoring Updates</div>
                    <div class="small text-truncate" style="color: rgba(255,255,255,.84);">
                      Review and update sow or piglet monthly records
                    </div>
                  </div>
                </div>

                <button type="button" class="btn btn-light btn-sm" data-bs-dismiss="modal" style="border-radius:999px;">
                  <i class="bi bi-x-lg me-1"></i> Close
                </button>
              </div>

              <div class="modal-body" style="background: var(--repro-bg, #edf2f4);">
                <div id="reproMonthlyUpdatesMount"></div>
              </div>
            </div>
          </div>
        </div>
        `
      );

      modalEl = document.getElementById("reproMonthlyUpdatesModal");
    }

    if (!modalEl.dataset.boundCleanup) {
      modalEl.addEventListener("hidden.bs.modal", () => {
        const mount = document.getElementById("reproMonthlyUpdatesMount");
        if (mount) mount.innerHTML = "";
      });
      modalEl.dataset.boundCleanup = "1";
    }

    const modal = window.bootstrap ? bootstrap.Modal.getOrCreateInstance(modalEl) : null;
    const mount = document.getElementById("reproMonthlyUpdatesMount");

    return { modalEl, modal, mount };
  }
  /* =========================================================
     MODULE: Monthly Update Confirmation Modal
     PURPOSE: Review monthly update details before saving.
  ========================================================= */
  function ensureMonthlyConfirmModal() {
    let modalEl = document.getElementById("reproMonthlyConfirmModal");

    if (!modalEl) {
      document.body.insertAdjacentHTML(
        "beforeend",
        `
        <div class="modal fade" id="reproMonthlyConfirmModal" tabindex="-1" aria-hidden="true">
          <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
            <div class="modal-content border-0 shadow-lg" style="border-radius: 24px;">
              <div
                class="modal-header border-0"
                style="background: linear-gradient(135deg, var(--repro-green, #22b07d), var(--repro-green-2, #18a56f));"
              >
                <div class="min-w-0">
                  <h5 class="modal-title text-white mb-0" id="reproMonthlyConfirmTitle">Review Monthly Update</h5>
                  <div class="small" style="color: rgba(255,255,255,.84);">Please confirm the details before saving.</div>
                </div>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>

              <div class="modal-body" id="reproMonthlyConfirmBody" style="background:#f7fafb;"></div>

              <div class="modal-footer border-0">
                <button type="button" class="btn btn-outline-success" data-bs-dismiss="modal">
                  Close
                </button>
                <button type="button" class="btn btn-success" id="reproMonthlyConfirmSaveBtn">
                  <i class="bi bi-check2-circle me-1"></i> Confirm Save
                </button>
              </div>
            </div>
          </div>
        </div>
        `
      );

      modalEl = document.getElementById("reproMonthlyConfirmModal");
    }

    const modal = window.bootstrap ? bootstrap.Modal.getOrCreateInstance(modalEl) : null;
    const body = document.getElementById("reproMonthlyConfirmBody");
    const saveBtn = document.getElementById("reproMonthlyConfirmSaveBtn");

    return { modalEl, modal, body, saveBtn };
  }

  /* =========================================================
     MODULE: Sow Monthly Confirmation Summary
     PURPOSE: Build review markup before saving sow monthly update.
  ========================================================= */
  function buildSowMonthlyConfirmHtml(draft) {
    const deformityText = Array.isArray(draft?.deformities) && draft.deformities.length
      ? draft.deformities.join(", ")
      : "None";

    return `
      <div class="row g-3">
        <div class="col-12">
          <div class="card border-0 bg-light">
            <div class="card-body">
              <div class="fw-bold mb-2">Sow Information</div>
              <div><b>Sow ID:</b> ${ui.esc(draft.sowId)}</div>
              <div><b>Record Date:</b> ${ui.esc(ui.fmtDate(draft.record_date))}</div>
              <div><b>System Status:</b> ${ui.esc(draft.current_status || "Open")}</div>
              <div><b>Health Status:</b> ${ui.esc(draft.health_status || "Healthy")}</div>
            </div>
          </div>
        </div>

        <div class="col-12 col-lg-7">
          <div class="card border-0 bg-light h-100">
            <div class="card-body">
              <div class="fw-bold mb-2">Performance Update</div>
              <div class="row g-2 small">
                <div class="col-6"><b>Weight:</b> ${ui.esc(draft.weight || "N/A")} kg</div>
                <div class="col-6"><b>Body Length:</b> ${ui.esc(draft.body_length || "N/A")} cm</div>
                <div class="col-6"><b>Heart Girth:</b> ${ui.esc(draft.heart_girth || "N/A")} cm</div>
                <div class="col-6"><b>Teeth Count:</b> ${ui.esc(draft.teeth_count || "N/A")}</div>
                <div class="col-6"><b>Leg Conformation:</b> ${ui.esc(draft.leg_conformation || "Normal")}</div>
                <div class="col-6"><b>Teat Count:</b> ${ui.esc(draft.teat_count || "N/A")}</div>
                <div class="col-12"><b>Teat Alignment:</b> ${ui.esc(draft.teat_alignment || "N/A")}</div>
                <div class="col-12"><b>Developed Deformities:</b> ${ui.esc(deformityText)}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="col-12 col-lg-5">
          <div class="card border-0 bg-light h-100">
            <div class="card-body">
              <div class="fw-bold mb-2">Medical Update</div>
              <div class="small"><b>Treatment Type:</b> ${ui.esc(draft.treatment_type || "No medical update")}</div>
              <div class="small mt-1"><b>Medicine Name:</b> ${ui.esc(draft.medicine_name || "N/A")}</div>
              <div class="small mt-1"><b>Dosage:</b> ${ui.esc(draft.dosage || "N/A")}</div>
              <div class="small mt-1"><b>Remarks:</b> ${ui.esc(draft.remarks || "N/A")}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /* =========================================================
     MODULE: Panel Mount Resolver
     PURPOSE: Resolve the current active sow modal content mount.
  ========================================================= */
  function getPanelMount() {
    if (panelMountEl && document.body.contains(panelMountEl)) return panelMountEl;
    const m = document.getElementById("reproSowModalMount");
    panelMountEl = m || null;
    return panelMountEl;
  }

  /* =========================================================
     MODULE: Sow Monthly Draft Form Reader
     PURPOSE: Collect sow monthly update values from form fields.
  ========================================================= */
  function getSowMonthlyUpdateDraftFromForm(sowId) {
    const val = (id) => document.getElementById(id)?.value ?? "";

    const systemStatus =
      document.getElementById("sowMonthlyCurrentStatusDisplay")?.dataset?.status ||
      "Open";

    const deformitiesRaw = String(val("sowMonthlyDeformities") || "").trim();
    const deformities = deformitiesRaw
      ? deformitiesRaw
          .split(",")
          .map((x) => String(x).trim())
          .filter(Boolean)
      : ["None"];

    return {
      sowId,
      record_date: val("sowMonthlyRecordDate"),
      weight: val("sowMonthlyWeight"),
      body_length: val("sowMonthlyBodyLength"),
      heart_girth: val("sowMonthlyHeartGirth"),
      teeth_count: val("sowMonthlyTeethCount"),
      leg_conformation: val("sowMonthlyLegConformation") || "Normal",
      teat_count: val("sowMonthlyTeatCount"),
      teat_alignment: val("sowMonthlyTeatAlignment") || "N/A",
      current_status: systemStatus,
      deformities,

      health_status: val("sowMonthlyHealthStatus") || "Healthy",
      treatment_type: val("sowMonthlyTreatmentType"),
      medicine_name: val("sowMonthlyMedicineName"),
      dosage: val("sowMonthlyDosage"),
      remarks: val("sowMonthlyRemarks"),
    };
  }

  /* =========================================================
     MODULE: Monthly Draft Form Reader
  ========================================================= */
  function getMonthlyUpdateDraftFromForm(pigletTag) {
    const val = (id) => document.getElementById(id)?.value ?? "";

    const systemStatus =
      document.getElementById("monthlyCurrentStatusDisplay")?.dataset?.status ||
      "Monitoring (Day 1-30)";

    const deformitiesRaw = String(val("monthlyDeformities") || "").trim();
    const deformities = deformitiesRaw
      ? deformitiesRaw
          .split(",")
          .map((x) => String(x).trim())
          .filter(Boolean)
      : ["None"];

    return {
      pigletTag,
      record_date: val("monthlyRecordDate"),
      weight: val("monthlyWeight"),
      body_length: val("monthlyBodyLength"),
      heart_girth: val("monthlyHeartGirth"),
      teeth_count: val("monthlyTeethCount"),
      leg_conformation: val("monthlyLegConformation") || "Normal",
      teat_count: val("monthlyTeatCount"),
      teat_alignment: val("monthlyTeatAlignment") || "N/A",
      current_status: systemStatus,
      deformities,

      health_status: val("monthlyHealthStatus") || "Healthy",
      treatment_type: val("monthlyTreatmentType"),
      medicine_name: val("monthlyMedicineName"),
      dosage: val("monthlyDosage"),
      remarks: val("monthlyRemarks"),
    };
  }

  function monthlyDraftReviewHtml(draft) {
    const medProvided = draft.treatment_type || draft.medicine_name || draft.dosage || draft.remarks;

    return `
      <div class="row g-3">
        <div class="col-12">
          <div class="card border-0 shadow-sm">
            <div class="card-body">
              <div class="fw-bold mb-3 d-flex align-items-center gap-2">
                <span class="repro-pill"><i class="bi bi-tag"></i></span>
                <span>${ui.esc(draft.pigletTag)}</span>
              </div>

              <div class="row g-2">
                <div class="col-6 col-md-4">
                  <div class="repro-sow-statbox">
                    <div class="k">Record Date</div>
                    <div class="v">${ui.esc(ui.fmtDate(draft.record_date))}</div>
                  </div>
                </div>
                <div class="col-6 col-md-4">
                  <div class="repro-sow-statbox">
                    <div class="k">Health Status</div>
                    <div class="v">${ui.esc(draft.health_status)}</div>
                  </div>
                </div>
                <div class="col-12 col-md-4">
                  <div class="repro-sow-statbox">
                    <div class="k">Current Status</div>
                    <div class="v">${ui.esc(draft.current_status)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="col-12 col-lg-7">
          <div class="card border-0 shadow-sm h-100">
            <div class="card-body">
              <div class="fw-bold mb-3 d-flex align-items-center gap-2">
                <span class="repro-pill"><i class="bi bi-bar-chart-line"></i></span>
                <span>Growth Update Summary</span>
              </div>

              <div class="row g-2">
                <div class="col-6 col-md-4">
                  <div class="repro-sow-statbox">
                    <div class="k">Weight</div>
                    <div class="v">${draft.weight ? `${ui.esc(draft.weight)} kg` : "N/A"}</div>
                  </div>
                </div>
                <div class="col-6 col-md-4">
                  <div class="repro-sow-statbox">
                    <div class="k">Body Length</div>
                    <div class="v">${draft.body_length ? `${ui.esc(draft.body_length)} cm` : "N/A"}</div>
                  </div>
                </div>
                <div class="col-6 col-md-4">
                  <div class="repro-sow-statbox">
                    <div class="k">Heart Girth</div>
                    <div class="v">${draft.heart_girth ? `${ui.esc(draft.heart_girth)} cm` : "N/A"}</div>
                  </div>
                </div>
                <div class="col-6 col-md-4">
                  <div class="repro-sow-statbox">
                    <div class="k">Teeth Count</div>
                    <div class="v">${draft.teeth_count ? ui.esc(draft.teeth_count) : "N/A"}</div>
                  </div>
                </div>
                <div class="col-6 col-md-4">
                  <div class="repro-sow-statbox">
                    <div class="k">Leg Conformation</div>
                    <div class="v">${ui.esc(draft.leg_conformation || "Normal")}</div>
                  </div>
                </div>
                <div class="col-6 col-md-4">
                  <div class="repro-sow-statbox">
                    <div class="k">Teat Count</div>
                    <div class="v">${draft.teat_count ? ui.esc(draft.teat_count) : "N/A"}</div>
                  </div>
                </div>
                <div class="col-12">
                  <div class="repro-sow-statbox">
                    <div class="k">Teat Alignment</div>
                    <div class="v">${ui.esc(draft.teat_alignment || "N/A")}</div>
                  </div>
                </div>
                <div class="col-12">
                  <div class="repro-sow-statbox">
                    <div class="k">Deformities</div>
                    <div class="v">${ui.esc((draft.deformities || []).join(", ") || "None")}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="col-12 col-lg-5">
          <div class="card border-0 shadow-sm h-100">
            <div class="card-body">
              <div class="fw-bold mb-3 d-flex align-items-center gap-2">
                <span class="repro-pill"><i class="bi bi-shield-plus"></i></span>
                <span>Medical Update Summary</span>
              </div>

              ${
                medProvided
                  ? `
                    <div class="row g-2">
                      <div class="col-12">
                        <div class="repro-sow-statbox">
                          <div class="k">Treatment Type</div>
                          <div class="v">${ui.esc(draft.treatment_type || "N/A")}</div>
                        </div>
                      </div>
                      <div class="col-12">
                        <div class="repro-sow-statbox">
                          <div class="k">Medicine Name</div>
                          <div class="v">${ui.esc(draft.medicine_name || "N/A")}</div>
                        </div>
                      </div>
                      <div class="col-12">
                        <div class="repro-sow-statbox">
                          <div class="k">Dosage</div>
                          <div class="v">${ui.esc(draft.dosage || "N/A")}</div>
                        </div>
                      </div>
                      <div class="col-12">
                        <div class="repro-sow-statbox">
                          <div class="k">Remarks</div>
                          <div class="v">${ui.esc(draft.remarks || "N/A")}</div>
                        </div>
                      </div>
                    </div>
                  `
                  : `
                    <div class="text-muted small">
                      <i class="bi bi-info-circle me-1"></i>No medical record will be added for this update.
                    </div>
                  `
              }
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /* =========================================================
     MODULE: Sow Monthly Draft Save
     PURPOSE: Save sow monthly performance update and optional
              medical record using existing backend routes.
  ========================================================= */
  async function saveSowMonthlyUpdateDraft(draft) {
    const tok = getValidTokenOrLogout();
    if (!tok) return { success: false, message: "Session expired." };

    const performancePayload = {
      health_status: draft.health_status,
      current_status: draft.current_status,
      overwrite_monthly: true,
      performance_records: {
        stage: "Monthly Update",
        record_date: draft.record_date,
        weight: draft.weight ? Number(draft.weight) : 0,
        body_length: draft.body_length ? Number(draft.body_length) : 0,
        heart_girth: draft.heart_girth ? Number(draft.heart_girth) : 0,
        teeth_count: draft.teeth_count ? Number(draft.teeth_count) : 0,
        leg_conformation: draft.leg_conformation || "Normal",
        teat_count: draft.teat_count ? Number(draft.teat_count) : 0,
        teat_alignment: draft.teat_alignment || "N/A",
        deformities: Array.isArray(draft.deformities) && draft.deformities.length ? draft.deformities : ["None"],
        remarks: draft.remarks || "Monthly sow update",
      },
    };

    const perfRes = await updateSwineMonthlyRecord({
      swineId: draft.sowId,
      payload: performancePayload,
      token: tok,
    });

    if (!perfRes?.success) {
      return {
        success: false,
        message: perfRes?.message || "Unable to save sow monthly performance update.",
      };
    }

    const shouldSaveMedical = draft.treatment_type || draft.medicine_name || draft.dosage || draft.remarks;

    if (shouldSaveMedical) {
      const medRes = await addSwineMedicalRecord({
        swineId: draft.sowId,
        token: tok,
        payload: {
          treatment_type: draft.treatment_type || "Other",
          medicine_name: draft.medicine_name || "Monthly health update",
          dosage: draft.dosage || "",
          remarks: draft.remarks || "",
        },
      });

      if (!medRes?.success) {
        return {
          success: false,
          message: medRes?.message || "Performance saved, but medical update failed.",
          partial: true,
        };
      }
    }

    return {
      success: true,
      message: shouldSaveMedical
        ? `Monthly sow update and medical record for ${draft.sowId} were saved successfully.`
        : `Monthly sow update for ${draft.sowId} was saved successfully.`,
    };
  }

  async function saveMonthlyUpdateDraft(draft) {
    const tok = getValidTokenOrLogout();
    if (!tok) return { success: false, message: "Session expired." };

    const performancePayload = {
      health_status: draft.health_status,
      current_status: draft.current_status,
      performance_records: {
        stage: "Monthly Update",
        record_date: draft.record_date,
        weight: draft.weight ? Number(draft.weight) : 0,
        body_length: draft.body_length ? Number(draft.body_length) : 0,
        heart_girth: draft.heart_girth ? Number(draft.heart_girth) : 0,
        teeth_count: draft.teeth_count ? Number(draft.teeth_count) : 0,
        leg_conformation: draft.leg_conformation || "Normal",
        teat_count: draft.teat_count ? Number(draft.teat_count) : 0,
        teat_alignment: draft.teat_alignment || "N/A",
        deformities: Array.isArray(draft.deformities) && draft.deformities.length ? draft.deformities : ["None"],
      },
      overwrite_monthly: true,
    };

    const perfRes = await updateSwineMonthlyRecord({
      swineId: draft.pigletTag,
      payload: performancePayload,
      token: tok,
    });

    if (!perfRes?.success) {
      return {
        success: false,
        message: perfRes?.message || "Unable to save monthly performance update.",
      };
    }

    const shouldSaveMedical = draft.treatment_type || draft.medicine_name || draft.dosage || draft.remarks;

    if (shouldSaveMedical) {
      const medRes = await addSwineMedicalRecord({
        swineId: draft.pigletTag,
        token: tok,
        payload: {
          treatment_type: draft.treatment_type || "Other",
          medicine_name: draft.medicine_name || "",
          dosage: draft.dosage || "",
          remarks: draft.remarks || "Monthly monitoring update",
        },
      });

      if (!medRes?.success) {
        return {
          success: false,
          message: medRes?.message || "Performance saved, but medical update failed.",
          partial: true,
        };
      }
    }

    return {
      success: true,
      message: shouldSaveMedical
        ? "Monthly growth and medical updates were saved successfully."
        : "Monthly growth update was saved successfully.",
    };
  }

  /* =========================================================
     MODULE: UI Utilities
     PURPOSE: Shared escape, formatting, badges, sex label,
              and growth chart rendering helpers.
  ========================================================= */
  const ui = {
    esc: (s) =>
      String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;"),

    fmtDate: (d) => {
      if (!d) return "N/A";
      const dt = new Date(d);
      if (Number.isNaN(dt.getTime())) return "N/A";
      return dt.toLocaleDateString();
    },

    fmtShortDate: (d) => {
      if (!d) return "N/A";
      const dt = new Date(d);
      if (Number.isNaN(dt.getTime())) return "N/A";
      return dt.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
    },

    badge: (text, variant = "soft") => {
      const cls =
        variant === "success"
          ? "badge bg-success"
          : variant === "danger"
          ? "badge bg-danger"
          : variant === "info"
          ? "badge bg-info text-dark"
          : variant === "warning"
          ? "badge bg-warning text-dark"
          : "badge bg-light text-dark border";
      return `<span class="${cls}">${ui.esc(text)}</span>`;
    },

    normSex: (v) => String(v || "").trim().toLowerCase(),
    sexLabel: (v) => {
      const s = ui.normSex(v);
      if (s.startsWith("m")) return "Male";
      if (s.startsWith("f")) return "Female";
      return "N/A";
    },

    drawAreaLineChart: (canvasId, points) => {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const parent = canvas.parentElement;
      const cssW = Math.max(320, Math.floor(parent?.clientWidth || canvas.clientWidth || 800));
      const cssH = Math.max(240, Math.floor(canvas.clientHeight || 280));
      const dpr = window.devicePixelRatio || 1;

      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      if (!points || !points.length) {
        ctx.font = "12px sans-serif";
        ctx.fillStyle = "#6b7280";
        ctx.fillText("No growth data available.", 18, 28);
        return;
      }

      const pts = [...points];
      const ys = pts.map((p) => Number(p.y || 0));

      let minY = Math.min(...ys);
      let maxY = Math.max(...ys);

      if (!Number.isFinite(minY) || !Number.isFinite(maxY)) return;

      if (minY === maxY) {
        minY -= 1;
        maxY += 1;
      } else {
        const pad = (maxY - minY) * 0.18;
        minY -= pad;
        maxY += pad;
      }

      const padL = cssW < 576 ? 52 : 64;
      const padR = cssW < 576 ? 18 : 28;
      const padT = 22;
      const padB = cssW < 576 ? 42 : 50;

      const plotW = Math.max(40, cssW - padL - padR);
      const plotH = Math.max(40, cssH - padT - padB);

      const xStep = pts.length > 1 ? plotW / (pts.length - 1) : 0;

      const yToPx = (y) => {
        const t = (y - minY) / (maxY - minY);
        return padT + (1 - t) * plotH;
      };

      ctx.save();

      ctx.strokeStyle = "rgba(61, 133, 113, 0.14)";
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = padT + (plotH * i) / 4;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(cssW - padR, y);
        ctx.stroke();
      }

      ctx.font = cssW < 576 ? "11px sans-serif" : "12px sans-serif";
      ctx.fillStyle = "#7b8794";
      for (let i = 0; i <= 4; i++) {
        const yVal = minY + ((maxY - minY) * (4 - i)) / 4;
        const y = padT + (plotH * i) / 4;
        ctx.fillText(`${yVal.toFixed(0)} kg`, 8, y + 4);
      }

      const line = new Path2D();
      pts.forEach((p, i) => {
        const x = padL + i * xStep;
        const y = yToPx(Number(p.y || 0));
        if (i === 0) line.moveTo(x, y);
        else line.lineTo(x, y);
      });

      const area = new Path2D(line);
      const lastX = pts.length > 1 ? padL + (pts.length - 1) * xStep : padL;
      area.lineTo(lastX, padT + plotH);
      area.lineTo(padL, padT + plotH);
      area.closePath();

      const gradient = ctx.createLinearGradient(0, padT, 0, padT + plotH);
      gradient.addColorStop(0, "rgba(38, 186, 136, 0.24)");
      gradient.addColorStop(1, "rgba(38, 186, 136, 0.08)");

      ctx.fillStyle = gradient;
      ctx.fill(area);

      ctx.strokeStyle = "rgba(24, 139, 81, 0.95)";
      ctx.lineWidth = cssW < 576 ? 2.5 : 3;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke(line);

      ctx.fillStyle = "rgba(24, 139, 81, 0.95)";
      pts.forEach((p, i) => {
        const x = padL + i * xStep;
        const y = yToPx(Number(p.y || 0));
        ctx.beginPath();
        ctx.arc(x, y, cssW < 576 ? 3.5 : 4.5, 0, Math.PI * 2);
        ctx.fill();
      });

      const idxs = new Set(
        pts.length <= 3
          ? pts.map((_, i) => i)
          : [0, Math.floor((pts.length - 1) / 2), pts.length - 1]
      );

      ctx.fillStyle = "#7b8794";
      idxs.forEach((i) => {
        const x = padL + i * xStep;
        const label = ui.fmtShortDate(pts[i].x);
        const w = ctx.measureText(label).width;
        const safeX = Math.min(Math.max(x - w / 2, padL), cssW - padR - w);
        ctx.fillText(label, safeX, padT + plotH + 24);
      });

      ctx.restore();
    },
  };

  /* =========================================================
     MODULE: Store Initialization
     PURPOSE: Initialize reproduction data repository.
  ========================================================= */
  const repo = createReproductionStore({ user, token, baseUrl: BASE_URL });

  /* =========================================================
     MODULE: Shared State
     PURPOSE: Central UI state shared with views.
  ========================================================= */
  const state = {
    PAGE_SIZE: 6,
    CYCLE_PAGE_SIZE: 4,
    cyclePage: 1,

    sowPage: 1,
    sowTerm: "",
    sowStatus: "all",
    sowTermDraft: "",
    activeSowId: null,
    activeCycleId: null,

    cycleView: "list",
    cycleFilterId: "all",

    CYCLE_TABS: ["#cycleAI", "#cycleGrowth", "#cycleSelect"],
    activeCycleTabTarget: "#cycleAI",

    pigletPageGrowth: 1,
    pigletPageSelection: 1,

    pigletGrowthFilter: "",
    selectedPigletTagForGrowth: "",
    growthView: "list",
    growthSexFilter: "all",

    pigletSelectionFilter: "",
    selectedPigletTagForSelection: "",
    selectionView: "list",
    selectionSexFilter: "all",

    selectionDecisionFilter: "all",
    monthlyDraft: null,

    dom: { sowCardsWrap, sowPager },
    getPanelMount,

    localSelectionLock: loadSelectionLockFromStorage(),
  };

  /* =========================================================
     MODULE: Views Initialization
     PURPOSE: Create the rendering layer.
  ========================================================= */
  const views = createReproViews({ repo, state, ui });

  /* =========================================================
     MODULE: Legacy Rendering
     PURPOSE: Keep old containers populated while new panels
              are used as primary UI.
  ========================================================= */
  function renderLegacy() {
    if (legacyPigletMonitoringBody) {
      const filtered = repo.store.rawMonitoringData || [];
      legacyPigletMonitoringBody.innerHTML = filtered.length
        ? filtered
            .slice(0, 10)
            .map(
              (p) => `
          <tr>
            <td><strong>${ui.esc(p.swine_tag)}</strong></td>
            <td>${ui.esc(p.current_status || "N/A")}</td>
            <td>${ui.esc(p.days_remaining ?? "")}</td>
            <td>${ui.esc(p.latest_weight ?? "")}</td>
            <td>${p.can_action ? "Action" : "In Progress"}</td>
          </tr>`
            )
            .join("")
        : `<tr><td colspan="5" class="text-center">No piglets in monitoring.</td></tr>`;
    }

    if (legacyAiTableBody) {
      const rows = (repo.store.rawAiData || []).slice(0, 10);
      legacyAiTableBody.innerHTML = rows.length
        ? rows
            .map(
              (r) => `
        <tr>
          <td>${ui.esc(r.swine_code || r.sow_tag || r.swine_tag || "N/A")}</td>
          <td>${ui.esc(r.male_swine_tag || r.boar_tag || r.male_swine_id || "N/A")}</td>
          <td>${ui.esc(ui.fmtDate(r.insemination_date || r.ai_service_date || r.createdAt))}</td>
        </tr>`
            )
            .join("")
        : `<tr><td colspan="3" class="text-center">No AI records.</td></tr>`;
    }

    if (legacyMortalityBody) {
      const sows = repo.store.sows || [];
      legacyMortalityBody.innerHTML = sows.length
        ? sows
            .slice(0, 10)
            .map((s) => {
              const sowId = s.swine_id || s.swine_tag;
              const stats = repo.computeBreedingStatsForSow ? repo.computeBreedingStatsForSow(sowId) : null;

              const safe = stats || { total: 0, deceased: 0, aliveMale: 0, aliveFemale: 0 };
              const alive = (safe.aliveMale || 0) + (safe.aliveFemale || 0);
              const mortalityRate = safe.total > 0 ? ((safe.deceased / safe.total) * 100).toFixed(1) : "0.0";

              return `
                <tr>
                  <td>${ui.esc(sowId)}</td>
                  <td class="text-center">${alive}</td>
                  <td class="text-center">${safe.deceased || 0}</td>
                  <td class="text-center">${mortalityRate}%</td>
                </tr>`;
            })
            .join("")
        : `<tr><td colspan="4" class="text-center">No breeder records.</td></tr>`;
    }

    if (legacyPigletSelect) {
      const seen = new Set();
      const morph = repo.store.rawPerformanceData?.morphology || [];

      const piglets = morph
        .filter((m) => {
          const stage = (m?.morphology?.stage || "").toLowerCase();
          return stage.includes("day 1-30") || stage.includes("weaning");
        })
        .filter((m) => {
          if (!m.swine_tag) return false;
          if (seen.has(m.swine_tag)) return false;
          seen.add(m.swine_tag);
          return true;
        })
        .sort((a, b) => (a.swine_tag || "").localeCompare(b.swine_tag || ""));

      legacyPigletSelect.innerHTML =
        '<option value="">-- Choose a Piglet to View Performance --</option>' +
        piglets
          .map(
            (p) =>
              `<option value="${ui.esc(p.swine_tag)}">${ui.esc(p.swine_tag)} (${ui.esc(p.swine_sex || "N/A")})</option>`
          )
          .join("");
    }

    if (legacyMorphBody) {
      legacyMorphBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Use the new UI panels.</td></tr>`;
    }
    if (legacyDeformityList) {
      legacyDeformityList.innerHTML = `<div class="text-muted">Use the new UI panels.</div>`;
    }
    if (legacySelectionBody) {
      legacySelectionBody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">Use the new UI panels.</td></tr>`;
    }
  }

  /* =========================================================
     MODULE: Safe Initial Load
     PURPOSE: Load all repository data with auth handling and
              render both legacy and modern views.
  ========================================================= */
  async function loadAllSafe() {
    views?.renderListLoading?.();

    const tok = getValidTokenOrLogout();
    if (!tok) return false;

    try {
      const res = await repo.loadAll();

      if (res?.authError) {
        views?.renderListError?.("Unable to load your swine data", "Your session may have expired. Please login again.");
        return false;
      }

      if (!repo.store.loaded?.swine) {
        views?.renderListError?.("Unable to load your swine data", "Server did not respond for swine list. Try again.");
        return false;
      }

      try {
        const sw = repo.store?.allSwineData || repo.store?.swine || repo.store?.sows || [];
        let changed = false;

        for (const s of sw) {
          const id = s?._id || s?.mongoId || s?.id;
          if (!id) continue;

          const decision =
            s?.selection_action ||
            s?.selectionAction ||
            s?.selection_status ||
            s?.selectionStatus ||
            s?.final_selection ||
            s?.finalSelection ||
            "";

          const norm = String(decision || "").toLowerCase().trim();
          const mapped =
            norm === "keep" || norm === "retain" || norm === "breeding"
              ? "breeding"
              : norm === "sale" || norm === "sell"
              ? "sell"
              : "";

          if (mapped && !state.localSelectionLock.has(String(id))) {
            state.localSelectionLock.set(String(id), mapped);
            changed = true;
          }
        }

        if (changed) saveSelectionLockToStorage(state.localSelectionLock);
      } catch {}

      renderLegacy();
      views?.renderSowCards?.();
      return true;
    } catch (err) {
      debugLog("LOAD_ALL_ERROR", err?.message || err, true);
      views?.renderListError?.("Unable to load your swine data", "Unexpected error while loading. Try again.");
      return false;
    }
  }

  /* =========================================================
     MODULE: Piglet Selection Action Handler
     PURPOSE: Process retain or sell actions and refresh the UI.
  ========================================================= */
  window.processPigletAction = async (swineId, action) => {
    const tok = getValidTokenOrLogout();
    if (!tok) return;

    let normalized = String(action || "").toLowerCase().trim();
    if (normalized === "sale") normalized = "sell";
    if (normalized === "keep") normalized = "breeding";

    const allowed = new Set(["breeding", "sell"]);
    if (!allowed.has(normalized)) {
      showReproModal({
        title: "Not Allowed",
        message: "Only Retain and Sell actions are available.",
        type: "warning",
      });
      return;
    }

    let confirmMsg = "Apply selection action?";
    if (normalized === "breeding") confirmMsg = "Retain this piglet for Breeding?";
    else if (normalized === "sell") confirmMsg = "Mark this piglet for Sale?";

    if (!confirm(confirmMsg)) return;

    const result = await submitSelectionAction({
      token: tok,
      baseUrl: BASE_URL,
      swineId,
      action: normalized,
    });

    if (result?.authError) {
      hardLogout("Session invalid. Please login again.");
      return;
    }

    if (result?.success) {
      try {
        if (swineId && normalized) {
          state.localSelectionLock.set(String(swineId), normalized);

          if (state.selectedPigletTagForSelection) {
            const m = repo.getMongoIdForSwineTag?.(state.selectedPigletTagForSelection);
            if (m) state.localSelectionLock.set(String(m), normalized);
          }

          saveSelectionLockToStorage(state.localSelectionLock);
        }
      } catch {}

      showReproModal({
        title: "Success",
        message: result.message || "Updated successfully.",
        type: "success",
      });

      await repo.loadAll();

      renderLegacy();
      views?.renderSowCards?.();

      if (state.activeSowId && state.activeCycleId) {
        views?.renderCyclePanel?.(state.activeSowId, state.activeCycleId, "#cycleSelect");
      } else if (state.activeSowId) {
        const mount = getPanelMount();
        if (mount) views?.renderSowPanel?.(state.activeSowId, mount);
      }
    } else {
      showReproModal({
        title: "Action Failed",
        message: result?.message || "Action failed.",
        type: "danger",
      });
    }
  };

  /* =========================================================
     MODULE: Tab Sync Listener
     PURPOSE: Keep shared cycle tab state in sync with UI tabs.
  ========================================================= */
  document.addEventListener("shown.bs.tab", (e) => {
    const btn = e.target;
    const t = btn?.getAttribute?.("data-bs-target");
    if (t && state.CYCLE_TABS.includes(t)) views?.setCycleTabTarget?.(t);
  });

  /* =========================================================
     MODULE: Delegated Click Handler
     PURPOSE: Central click routing for filters, modal panels,
              cycle navigation, piglet details, and monthly save.
  ========================================================= */
  document.addEventListener(
    "click",
    (e) => {
      try {
        const rawTarget = e.target;
        const targetEl =
          rawTarget instanceof Element
            ? rawTarget
            : rawTarget && rawTarget.parentElement instanceof Element
            ? rawTarget.parentElement
            : null;

        const btn = targetEl?.closest?.("[data-act]");
        if (!btn) return;

        const act = btn.getAttribute("data-act");

        if (act === "retryLoad") return void loadAllSafe();
        if (act === "goLogin") return void (window.location.href = "/login");

        if (act === "applySowFilters") {
          const term = (document.getElementById("reproductionSearch")?.value || "").trim();
          const st = (document.getElementById("reproStatusFilter")?.value || "all").trim();

          state.sowTermDraft = term;
          state.sowTerm = term;
          state.sowStatus = st || "all";
          state.sowPage = 1;

          return void views?.renderSowCards?.();
        }

        if (act === "resetSowFilters") {
          const inEl = document.getElementById("reproductionSearch");
          const selEl = document.getElementById("reproStatusFilter");

          if (inEl) inEl.value = "";
          if (selEl) selEl.value = "all";

          state.sowTermDraft = "";
          state.sowTerm = "";
          state.sowStatus = "all";
          state.sowPage = 1;

          return void views?.renderSowCards?.();
        }

        if (act === "sowPrev") {
          state.sowPage = Math.max(1, state.sowPage - 1);
          return void views?.renderSowCards?.();
        }

        if (act === "sowNext") {
          state.sowPage += 1;
          return void views?.renderSowCards?.();
        }

        if (act === "selDecisionTab") {
          state.selectionDecisionFilter = btn.getAttribute("data-filter") || "all";
          state.pigletPageSelection = 1;
          state.selectionView = "list";
          state.selectedPigletTagForSelection = "";

          if (state.activeSowId && state.activeCycleId) {
            views?.renderCyclePanel?.(state.activeSowId, state.activeCycleId, "#cycleSelect");
          }
          return;
        }

        if (act === "openSowMonthlyUpdates") {
          const sowId = btn.getAttribute("data-sow") || state.activeSowId;
          if (!sowId) return;

          const { modal, mount, modalEl } = ensureMonthlyUpdatesModal();
          const title = modalEl.querySelector("#reproMonthlyUpdatesModalLabel");
          if (title) title.textContent = `Monthly Updates • ${sowId}`;

          if (modal) {
            modal.show();
            modalEl.addEventListener("shown.bs.modal", () => views?.renderSowMonthlyUpdatesPanel?.(sowId, mount), {
              once: true,
            });
          } else {
            views?.renderSowMonthlyUpdatesPanel?.(sowId, mount);
          }
          return;
        }

        if (act === "openSowMonthlyUpdateForm") {
          const sowId = btn.getAttribute("data-sow") || state.activeSowId;
          if (!sowId) return;

          const { modal, mount, modalEl } = ensureMonthlyUpdatesModal();
          const title = modalEl.querySelector("#reproMonthlyUpdatesModalLabel");
          if (title) title.textContent = `Monthly Updates • ${sowId}`;

          if (modal) {
            modal.show();
            modalEl.addEventListener(
              "shown.bs.modal",
              () => views?.renderSowMonthlyUpdateFormPanel?.(sowId, mount),
              { once: true }
            );
          } else {
            views?.renderSowMonthlyUpdateFormPanel?.(sowId, mount);
          }
          return;
        }

        if (act === "openPigletMonthlyUpdates") {
          const pigletTag = btn.getAttribute("data-piglet") || "";
          if (!pigletTag) return;

          const { modal, mount, modalEl } = ensureMonthlyUpdatesModal();
          const title = modalEl.querySelector("#reproMonthlyUpdatesModalLabel");
          if (title) title.textContent = `Monthly Updates • ${pigletTag}`;

          if (modal) {
            modal.show();
            modalEl.addEventListener(
              "shown.bs.modal",
              () => views?.renderPigletMonthlyUpdatesPanel?.(pigletTag, mount),
              { once: true }
            );
          } else {
            views?.renderPigletMonthlyUpdatesPanel?.(pigletTag, mount);
          }
          return;
        }

        if (act === "submitSowMonthlyUpdateDraft") {
          const sowId = btn.getAttribute("data-sow") || state.activeSowId;
          if (!sowId) {
            showReproModal({
              title: "Missing Sow",
              message: "Unable to determine which sow should be updated.",
              type: "warning",
            });
            return;
          }

          const draft = getSowMonthlyUpdateDraftFromForm(sowId);

          if (!draft.record_date) {
            showReproModal({
              title: "Missing Record Date",
              message: "Please select a record date before reviewing the sow monthly update.",
              type: "warning",
            });
            return;
          }

          if (!draft.weight && !draft.body_length && !draft.heart_girth) {
            showReproModal({
              title: "Missing Measurements",
              message: "Please provide at least one sow measurement such as weight, body length, or heart girth.",
              type: "warning",
            });
            return;
          }

          state.monthlyDraft = draft;

          const { modal, body, saveBtn } = ensureMonthlyConfirmModal();
          if (body) body.innerHTML = buildSowMonthlyConfirmHtml(draft);

          if (saveBtn) {
            saveBtn.onclick = async () => {
              saveBtn.disabled = true;

              const result = await saveSowMonthlyUpdateDraft(state.monthlyDraft);

              saveBtn.disabled = false;

              const confirmModalEl = document.getElementById("reproMonthlyConfirmModal");
              const confirmModal =
                confirmModalEl && window.bootstrap ? bootstrap.Modal.getOrCreateInstance(confirmModalEl) : null;

              if (confirmModal) confirmModal.hide();

              if (!result?.success) {
                showReproModal({
                  title: result?.partial ? "Partially Saved" : "Update Failed",
                  message: result?.message || "Unable to save sow monthly update.",
                  type: result?.partial ? "warning" : "danger",
                });
                return;
              }

              await repo.loadAll();
              renderLegacy();
              views?.renderSowCards?.();

              const monthlyModalEl = document.getElementById("reproMonthlyUpdatesModal");
              const monthlyModal =
                monthlyModalEl && window.bootstrap ? bootstrap.Modal.getOrCreateInstance(monthlyModalEl) : null;

              if (monthlyModal) monthlyModal.hide();

              if (state.activeSowId) {
                const mount = getPanelMount();
                if (mount) views?.renderSowPanel?.(state.activeSowId, mount);
              }

              showReproModal({
                title: "Monthly Update Saved",
                message: result?.message || "Monthly sow update saved successfully.",
                type: "success",
              });
            };
          }

          if (modal) modal.show();
          return;
        }

        if (act === "submitMonthlyUpdateDraft") {
          const pigletTag = btn.getAttribute("data-piglet") || "";
          if (!pigletTag) {
            showReproModal({
              title: "Missing Piglet",
              message: "Unable to determine which piglet should be updated.",
              type: "warning",
            });
            return;
          }

          const draft = getMonthlyUpdateDraftFromForm(pigletTag);

          if (!draft.record_date) {
            showReproModal({
              title: "Missing Record Date",
              message: "Please select a record date before reviewing the monthly update.",
              type: "warning",
            });
            return;
          }

          if (!draft.weight && !draft.body_length && !draft.heart_girth) {
            showReproModal({
              title: "Missing Growth Data",
              message: "Please provide at least one growth field such as weight, body length, or heart girth.",
              type: "warning",
            });
            return;
          }

          state.monthlyDraft = draft;

          const { modal, body, saveBtn } = ensureMonthlyConfirmModal();
          if (body) body.innerHTML = monthlyDraftReviewHtml(draft);

          if (saveBtn) {
            saveBtn.onclick = async () => {
              saveBtn.disabled = true;

              const result = await saveMonthlyUpdateDraft(state.monthlyDraft);

              saveBtn.disabled = false;

              const confirmModalEl = document.getElementById("reproMonthlyConfirmModal");
              const confirmModal =
                confirmModalEl && window.bootstrap ? bootstrap.Modal.getOrCreateInstance(confirmModalEl) : null;

              if (confirmModal) confirmModal.hide();

              if (!result?.success) {
                showReproModal({
                  title: result?.partial ? "Partially Saved" : "Update Failed",
                  message: result?.message || "Unable to save monthly update.",
                  type: result?.partial ? "warning" : "danger",
                });
                return;
              }

              await repo.loadAll();
              renderLegacy();
              views?.renderSowCards?.();

              const monthlyModalEl = document.getElementById("reproMonthlyUpdatesModal");
              const monthlyModal =
                monthlyModalEl && window.bootstrap ? bootstrap.Modal.getOrCreateInstance(monthlyModalEl) : null;

              if (monthlyModal) monthlyModal.hide();

              if (state.activeSowId && state.activeCycleId) {
                views?.renderCyclePanel?.(state.activeSowId, state.activeCycleId, "#cycleGrowth");
              } else if (state.activeSowId) {
                const mount = getPanelMount();
                if (mount) views?.renderSowPanel?.(state.activeSowId, mount);
              }

              showReproModal({
                title: "Monthly Update Saved",
                message: result?.message || "Monthly update saved successfully.",
                type: "success",
              });
            };
          }

          if (modal) modal.show();
          return;
        }

        if (act === "openSow") {
          const tok = getValidTokenOrLogout();
          if (!tok) return;

          lastOpenBtn = btn;

          state.activeSowId = btn.getAttribute("data-sow");
          state.activeCycleId = null;

          state.cycleView = "list";
          state.cycleFilterId = "all";
          state.activeCycleTabTarget = "#cycleAI";
          state.cyclePage = 1;

          state.pigletPageGrowth = 1;
          state.pigletPageSelection = 1;
          state.pigletGrowthFilter = "";
          state.pigletSelectionFilter = "";

          state.growthView = "list";
          state.selectionView = "list";
          state.selectedPigletTagForGrowth = "";
          state.selectedPigletTagForSelection = "";
          state.growthSexFilter = "all";
          state.selectionSexFilter = "all";
          state.selectionDecisionFilter = "all";

          views?.renderSowCards?.();

          const { modalEl, modal, mount } = ensureSowModal();
          const title = modalEl.querySelector("#reproSowModalLabel");
          if (title) title.textContent = `Sow • ${state.activeSowId}`;

          if (modal) {
            modal.show();
            modalEl.addEventListener("shown.bs.modal", () => views?.renderSowPanel?.(state.activeSowId, mount), {
              once: true,
            });
          } else {
            views?.renderSowPanel?.(state.activeSowId, mount);
          }
          return;
        }

        if (act === "jumpRepro") {
          const mount = getPanelMount();
          mount?.querySelector?.('[data-bs-target="#tabReproduction"]')?.click();
          views?.renderReproTabInto?.(mount);
          return;
        }

        if (act === "jumpSelection") {
          const mount = getPanelMount();
          mount?.querySelector?.('[data-bs-target="#tabReproduction"]')?.click();

          const cycles = views?.getCyclesForSowSafe?.(state.activeSowId);
          if (cycles?.length) {
            state.activeCycleId = cycles[0].id;
            state.cycleView = "detail";
            state.activeCycleTabTarget = "#cycleSelect";

            state.selectionView = "list";
            state.growthView = "list";
            state.selectedPigletTagForSelection = "";
            state.selectedPigletTagForGrowth = "";

            state.selectionDecisionFilter = "all";
            state.pigletPageSelection = 1;

            views?.renderSowPanel?.(state.activeSowId, mount);
            mount?.querySelector?.('[data-bs-target="#tabReproduction"]')?.click();
            views?.renderCyclePanel?.(state.activeSowId, state.activeCycleId, "#cycleSelect");
          }
          return;
        }

        if (act === "cyclePrev") {
          state.cyclePage = Math.max(1, state.cyclePage - 1);
          const mount = getPanelMount();
          views?.renderReproTabInto?.(mount);
          return;
        }

        if (act === "cycleNext") {
          state.cyclePage += 1;
          const mount = getPanelMount();
          views?.renderReproTabInto?.(mount);
          return;
        }

        if (act === "openCycle") {
          state.activeSowId = btn.getAttribute("data-sow");
          state.activeCycleId = btn.getAttribute("data-cycle");

          state.cycleView = "detail";
          state.activeCycleTabTarget = "#cycleAI";

          state.growthView = "list";
          state.selectionView = "list";
          state.selectedPigletTagForGrowth = "";
          state.selectedPigletTagForSelection = "";

          state.selectionDecisionFilter = "all";
          state.pigletPageSelection = 1;

          views?.renderSowCards?.();

          const mount = getPanelMount();
          views?.renderSowPanel?.(state.activeSowId, mount);
          mount?.querySelector?.('[data-bs-target="#tabReproduction"]')?.click();
          views?.renderCyclePanel?.(state.activeSowId, state.activeCycleId, "#cycleAI");
          return;
        }

        if (act === "cycleBack") {
          state.cycleView = "list";
          state.activeCycleId = null;

          state.growthView = "list";
          state.selectionView = "list";
          state.selectedPigletTagForGrowth = "";
          state.selectedPigletTagForSelection = "";

          const mount = getPanelMount();
          views?.renderReproTabInto?.(mount);
          return;
        }

        if (act === "growthSexFilter") {
          state.growthSexFilter = btn.getAttribute("data-sex") || "all";
          state.pigletPageGrowth = 1;
          state.growthView = "list";
          state.selectedPigletTagForGrowth = "";
          if (state.activeSowId && state.activeCycleId) {
            views?.renderCyclePanel?.(state.activeSowId, state.activeCycleId, "#cycleGrowth");
          }
          return;
        }

        if (act === "selectionSexFilter") {
          state.selectionSexFilter = btn.getAttribute("data-sex") || "all";
          state.pigletPageSelection = 1;
          state.selectionView = "list";
          state.selectedPigletTagForSelection = "";
          if (state.activeSowId && state.activeCycleId) {
            views?.renderCyclePanel?.(state.activeSowId, state.activeCycleId, "#cycleSelect");
          }
          return;
        }

        if (act === "growthBack") {
          state.growthView = "list";
          state.selectedPigletTagForGrowth = "";
          if (state.activeSowId && state.activeCycleId) {
            views?.renderCyclePanel?.(state.activeSowId, state.activeCycleId, "#cycleGrowth");
          }
          return;
        }

        if (act === "selectionBack") {
          state.selectionView = "list";
          state.selectedPigletTagForSelection = "";
          if (state.activeSowId && state.activeCycleId) {
            views?.renderCyclePanel?.(state.activeSowId, state.activeCycleId, "#cycleSelect");
          }
          return;
        }

        if (act === "growthPigletPrev") {
          state.pigletPageGrowth = Math.max(1, state.pigletPageGrowth - 1);
          if (state.activeSowId && state.activeCycleId) {
            views?.renderCyclePanel?.(state.activeSowId, state.activeCycleId, "#cycleGrowth");
          }
          return;
        }

        if (act === "growthPigletNext") {
          state.pigletPageGrowth += 1;
          if (state.activeSowId && state.activeCycleId) {
            views?.renderCyclePanel?.(state.activeSowId, state.activeCycleId, "#cycleGrowth");
          }
          return;
        }

        if (act === "selectionPigletPrev") {
          state.pigletPageSelection = Math.max(1, state.pigletPageSelection - 1);
          if (state.activeSowId && state.activeCycleId) {
            views?.renderCyclePanel?.(state.activeSowId, state.activeCycleId, "#cycleSelect");
          }
          return;
        }

        if (act === "selectionPigletNext") {
          state.pigletPageSelection += 1;
          if (state.activeSowId && state.activeCycleId) {
            views?.renderCyclePanel?.(state.activeSowId, state.activeCycleId, "#cycleSelect");
          }
          return;
        }

        if (act === "openPigletGrowth") {
          state.selectedPigletTagForGrowth = btn.getAttribute("data-piglet") || "";
          state.growthView = "detail";
          if (state.activeSowId && state.activeCycleId) {
            views?.renderCyclePanel?.(state.activeSowId, state.activeCycleId, "#cycleGrowth");
            setTimeout(() => views?.renderPigletGrowthDetail?.(state.selectedPigletTagForGrowth), 0);
          }
          return;
        }

        if (act === "openPigletSelection") {
          state.selectedPigletTagForSelection = btn.getAttribute("data-piglet") || "";
          state.selectionView = "detail";
          if (state.activeSowId && state.activeCycleId) {
            views?.renderCyclePanel?.(state.activeSowId, state.activeCycleId, "#cycleSelect");
            setTimeout(() => views?.renderPigletSelectionDetail?.(state.selectedPigletTagForSelection), 0);
          }
          return;
        }
      } catch (err) {
        debugLog("CLICK_HANDLER_ERROR", err?.message || err, true);
      }
    },
    true
  );

  /* =========================================================
     MODULE: Cycle Filter Change Handler
     PURPOSE: Reset cycle detail state when cycle filter changes.
  ========================================================= */
  function handleCycleFilterChange(selectEl) {
    if (!selectEl) return;
    if (!state.activeSowId) return;

    state.cycleFilterId = selectEl.value || "all";
    state.cycleView = "list";
    state.activeCycleId = null;

    state.cyclePage = 1;
    state.growthView = "list";
    state.selectionView = "list";
    state.selectedPigletTagForGrowth = "";
    state.selectedPigletTagForSelection = "";
    state.selectionDecisionFilter = "all";
    state.pigletPageSelection = 1;

    const mount = getPanelMount();
    views?.renderReproTabInto?.(mount);
  }

  /* =========================================================
     MODULE: Change Listener
     PURPOSE: Handle select/dropdown changes for cycle filter
              and sow status filter draft state.
  ========================================================= */
  document.addEventListener("change", (e) => {
    if (e.target?.id === "cycleFilterSelect") handleCycleFilterChange(e.target);

    if (e.target?.id === "cycleFilterSelectOverview") {
      state.cycleFilterId = e.target.value || "all";
    }

    if (e.target?.id === "reproStatusFilter") {
      state.sowStatus = String(e.target.value || "all").trim();
    }
  });

  /* =========================================================
     MODULE: Debounce Helper
     PURPOSE: Limit rapid input-triggered state updates.
  ========================================================= */
  let searchT = null;
  function debounce(fn, ms = 150) {
    return (...args) => {
      clearTimeout(searchT);
      searchT = setTimeout(() => fn(...args), ms);
    };
  }

  const onSearchInput = debounce((val) => {
    state.sowTermDraft = val || "";
  }, 120);

  /* =========================================================
     MODULE: Input Listener
     PURPOSE: Update search and piglet filter state from input fields.
  ========================================================= */
  document.addEventListener("input", (e) => {
    if (e.target?.id === "reproductionSearch") {
      onSearchInput(e.target.value || "");
      return;
    }

    if (e.target?.id === "growthFilterInput") {
      state.pigletGrowthFilter = e.target.value || "";
      state.pigletPageGrowth = 1;
      state.growthView = "list";
      state.selectedPigletTagForGrowth = "";
      if (state.activeSowId && state.activeCycleId) {
        views?.renderCyclePanel?.(state.activeSowId, state.activeCycleId, "#cycleGrowth");
      }
      return;
    }

    if (e.target?.id === "selectionFilterInput") {
      state.pigletSelectionFilter = e.target.value || "";
      state.pigletPageSelection = 1;
      state.selectionView = "list";
      state.selectedPigletTagForSelection = "";
      if (state.activeSowId && state.activeCycleId) {
        views?.renderCyclePanel?.(state.activeSowId, state.activeCycleId, "#cycleSelect");
      }
      return;
    }
  });

  /* =========================================================
    MODULE: Enter Key Search Apply
  ========================================================= */
  document.addEventListener("keydown", (e) => {
    if (e.target?.id === "reproductionSearch" && e.key === "Enter") {
      e.preventDefault();

      const term = (document.getElementById("reproductionSearch")?.value || "").trim();
      const st = (document.getElementById("reproStatusFilter")?.value || "all").trim();

      state.sowTermDraft = term;
      state.sowTerm = term;
      state.sowStatus = st || "all";
      state.sowPage = 1;

      views?.renderSowCards?.();
    }
  });

  /* =========================================================
     MODULE: Boot
     PURPOSE: Seed initial filter state and load data.
  ========================================================= */
  if (searchInput && typeof searchInput.value === "string" && searchInput.value.trim()) {
    state.sowTermDraft = searchInput.value || "";
    state.sowTerm = searchInput.value || "";
  }

  if (statusFilterEl) {
    state.sowStatus = String(statusFilterEl.value || "all").trim();
  }

  await loadAllSafe();

  console.timeEnd("Reproduction_Load_Time");
});