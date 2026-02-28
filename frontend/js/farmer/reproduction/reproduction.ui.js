// /js/reproduction/reproduction.ui.js

import { authGuard } from "/js/authGuard.js";
import { getCleanToken, debugLog, authPost } from "./reproduction.api.js";
import { createReproductionStore } from "./reproduction.data.js";
import { createReproViews } from "./reproduction.views.js";

document.addEventListener("DOMContentLoaded", async () => {
  console.time("Reproduction_Load_Time");

  const user = await authGuard("farmer");
  if (!user) {
    debugLog("AUTH", "No user found, redirecting...", true);
    return;
  }

  const BASE_URL = "http://localhost:5000";

  // ===== Required legacy IDs (DO NOT REMOVE) =====
  const searchInput = document.getElementById("reproductionSearch");
  const legacyPigletMonitoringBody = document.getElementById("pigletMonitoringBody");
  const legacyAiTableBody = document.getElementById("aiTableBody");
  const legacyMortalityBody = document.getElementById("breedingMortalityTableBody");
  const legacyPigletSelect = document.getElementById("pigletSelect");
  const legacyMorphBody = document.getElementById("morphTableBody");
  const legacyDeformityList = document.getElementById("deformityList");
  const legacySelectionBody = document.getElementById("selectionTableBody");

  // ===== New UI containers =====
  const sowCardsWrap = document.getElementById("sowCardsWrap");
  const sowPager = document.getElementById("sowPager");

  if (!sowCardsWrap || !sowPager) {
    debugLog("DOM_MISSING", "Required containers not found in EJS.", true);
    return;
  }

  // =========================================================
  // Auth helpers
  // =========================================================
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

  // =========================================================
  // Modal Panel (single close button only)
  // =========================================================
  let panelMountEl = null;
  let lastOpenBtn = null;

  function ensureSowModal() {
    let modalEl = document.getElementById("reproSowModal");

    if (!modalEl) {
      document.body.insertAdjacentHTML(
        "beforeend",
        `
        <div class="modal fade" id="reproSowModal" tabindex="-1" aria-labelledby="reproSowModalLabel" aria-hidden="true">
          <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-xl">
            <div class="modal-content">
              <div class="modal-header">
                <div class="d-flex align-items-center gap-2 min-w-0">
                  <span class="repro-pill"><i class="bi bi-grid"></i></span>
                  <div class="min-w-0">
                    <div class="fw-bold text-truncate" id="reproSowModalLabel">Sow Details</div>
                    <div class="small text-muted text-truncate">Overview, cycles, piglets, selection</div>
                  </div>
                </div>

                <!-- Keep ONLY ONE close control -->
                <div class="d-flex align-items-center gap-2">
                  <button type="button" class="btn btn-outline-success btn-sm" data-bs-dismiss="modal">
                    <i class="bi bi-x-lg me-1"></i> Close
                  </button>
                </div>
              </div>

              <div class="modal-body">
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

  function getPanelMount() {
    if (panelMountEl && document.body.contains(panelMountEl)) return panelMountEl;
    const m = document.getElementById("reproSowModalMount");
    panelMountEl = m || null;
    return panelMountEl;
  }

  // =========================================================
  // UI utils (passed into views)
  // =========================================================
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

    // chart draw kept here (so views can call it)
    drawAreaLineChart: (canvasId, points) => {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth || 800;
      const cssH = canvas.clientHeight || 240;
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.clearRect(0, 0, cssW, cssH);

      if (!points || !points.length) {
        ctx.font = "12px sans-serif";
        ctx.fillText("No growth data available.", 10, 20);
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
        const pad = (maxY - minY) * 0.12;
        minY -= pad;
        maxY += pad;
      }

      const padL = 44;
      const padR = 14;
      const padT = 14;
      const padB = 34;

      const plotW = cssW - padL - padR;
      const plotH = cssH - padT - padB;

      const xStep = pts.length > 1 ? plotW / (pts.length - 1) : plotW;

      const yToPx = (y) => {
        const t = (y - minY) / (maxY - minY);
        return padT + (1 - t) * plotH;
      };

      // grid
      ctx.globalAlpha = 0.18;
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = padT + (plotH * i) / 4;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(cssW - padR, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // y labels
      ctx.font = "11px sans-serif";
      ctx.fillStyle = "#6b7280";
      for (let i = 0; i <= 4; i++) {
        const yVal = minY + ((maxY - minY) * (4 - i)) / 4;
        const y = padT + (plotH * i) / 4;
        ctx.fillText(`${yVal.toFixed(0)} kg`, 6, y + 4);
      }

      // paths
      const line = new Path2D();
      pts.forEach((p, i) => {
        const x = padL + i * xStep;
        const y = yToPx(Number(p.y || 0));
        if (i === 0) line.moveTo(x, y);
        else line.lineTo(x, y);
      });

      const area = new Path2D(line);
      area.lineTo(padL + (pts.length - 1) * xStep, padT + plotH);
      area.lineTo(padL, padT + plotH);
      area.closePath();

      ctx.globalAlpha = 0.12;
      ctx.fill(area);
      ctx.globalAlpha = 1;

      ctx.lineWidth = 3;
      ctx.stroke(line);

      pts.forEach((p, i) => {
        const x = padL + i * xStep;
        const y = yToPx(Number(p.y || 0));
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      });

      // x labels
      const idxs = new Set([0, Math.floor((pts.length - 1) / 2), pts.length - 1]);
      ctx.fillStyle = "#6b7280";
      idxs.forEach((i) => {
        const x = padL + i * xStep;
        const label = ui.fmtShortDate(pts[i].x);
        const w = ctx.measureText(label).width;
        ctx.fillText(label, x - w / 2, padT + plotH + 22);
      });
    },
  };

  // =========================================================
  // Store
  // =========================================================
  const repo = createReproductionStore({ user, token, baseUrl: BASE_URL });

  // =========================================================
  // State object (shared with views)
  // =========================================================
  const state = {
    PAGE_SIZE: 5,

    sowPage: 1,
    sowTerm: "",
    activeSowId: null,
    activeCycleId: null,

    cycleView: "list",
    cycleFilterId: "all",

    CYCLE_TABS: ["#cycleAI", "#cyclePerf", "#cycleGrowth", "#cycleSelect"],
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

    dom: { sowCardsWrap, sowPager },
    getPanelMount,
  };

  // =========================================================
  // Views
  // =========================================================
  const views = createReproViews({ repo, state, ui });

  // =========================================================
  // Legacy rendering (keeps old IDs alive)
  // =========================================================
  function renderLegacy() {
    if (legacyPigletMonitoringBody) {
      const filtered = repo.store.rawMonitoringData;
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
      const rows = repo.store.rawAiData.slice(0, 10);
      legacyAiTableBody.innerHTML = rows.length
        ? rows
            .map(
              (r) => `
        <tr>
          <td>${ui.esc(r.swine_code || r.sow_tag || "N/A")}</td>
          <td>${ui.esc(r.male_swine_id || "N/A")}</td>
          <td>${ui.esc(ui.fmtDate(r.insemination_date || r.createdAt))}</td>
        </tr>`
            )
            .join("")
        : `<tr><td colspan="3" class="text-center">No AI records.</td></tr>`;
    }

    if (legacyMortalityBody) {
      const sows = repo.store.sows;
      legacyMortalityBody.innerHTML = sows.length
        ? sows
            .slice(0, 10)
            .map((s) => {
              const sowId = s.swine_id || s.swine_tag;
              const stats = repo.computeBreedingStatsForSow(sowId);
              const alive = stats.aliveMale + stats.aliveFemale;
              const mortalityRate = stats.total > 0 ? ((stats.deceased / stats.total) * 100).toFixed(1) : "0.0";
              return `
                <tr>
                  <td>${ui.esc(sowId)}</td>
                  <td class="text-center">${alive}</td>
                  <td class="text-center">${stats.deceased}</td>
                  <td class="text-center">${mortalityRate}%</td>
                </tr>`;
            })
            .join("")
        : `<tr><td colspan="4" class="text-center">No breeder records.</td></tr>`;
    }

    if (legacyPigletSelect) {
      const seen = new Set();
      const piglets = repo.store.rawPerformanceData.morphology
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
          .map((p) => `<option value="${ui.esc(p.swine_tag)}">${ui.esc(p.swine_tag)} (${ui.esc(p.swine_sex || "N/A")})</option>`)
          .join("");
    }

    if (legacyMorphBody) legacyMorphBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Use the new UI panels.</td></tr>`;
    if (legacyDeformityList) legacyDeformityList.innerHTML = `<div class="text-muted">Use the new UI panels.</div>`;
    if (legacySelectionBody) legacySelectionBody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">Use the new UI panels.</td></tr>`;
  }

  // =========================================================
  // Load all data (safe)
  // =========================================================
  async function loadAllSafe() {
    views.renderListLoading();

    const tok = getValidTokenOrLogout();
    if (!tok) return false;

    try {
      const res = await repo.loadAll();

      if (res?.authError) {
        views.renderListError("Unable to load your swine data", "Your session may have expired. Please login again.");
        return false;
      }

      if (!repo.store.loaded?.swine) {
        views.renderListError("Unable to load your swine data", "Server did not respond for swine list. Try again.");
        return false;
      }

      renderLegacy();
      views.renderSowCards();
      return true;
    } catch (err) {
      debugLog("LOAD_ALL_ERROR", err?.message || err, true);
      views.renderListError("Unable to load your swine data", "Unexpected error while loading. Try again.");
      return false;
    }
  }

  // =========================================================
  // Piglet Action endpoint (Keep/Sell)
  // =========================================================
  window.processPigletAction = async (swineId, action) => {
    const tok = getValidTokenOrLogout();
    if (!tok) return;

    const confirmMsg = action === "breeding" ? "Promote this piglet to Active Breeder?" : "Mark this piglet for Sale?";
    if (!confirm(confirmMsg)) return;

    const result = await authPost({
      endpoint: "/piglet-action",
      token: tok,
      baseUrl: BASE_URL,
      body: { swineId, action },
    });

    if (result?.authError) {
      hardLogout("Session invalid. Please login again.");
      return;
    }

    if (result?.success) {
      alert(result.message || "Updated.");

      // Reload monitoring
      await repo.loadPigletMonitoring();

      // ✅ ALSO reload selection to update summary counts
      await repo.loadSelection();

      renderLegacy();

      // If currently viewing selection tab, refresh panel
      if (state.activeSowId && state.activeCycleId) {
        views.renderCyclePanel(state.activeSowId, state.activeCycleId, "#cycleSelect");
      }
    } else {
        alert(result?.message || "Action failed.");
    }
  };

  // =========================================================
  // Global Events
  // =========================================================
  document.addEventListener("shown.bs.tab", (e) => {
    const btn = e.target;
    const t = btn?.getAttribute?.("data-bs-target");
    if (t && state.CYCLE_TABS.includes(t)) views.setCycleTabTarget(t);
  });

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;

    const act = btn.getAttribute("data-act");

    if (act === "retryLoad") return void loadAllSafe();
    if (act === "goLogin") return void (window.location.href = "/login");

    if (act === "sowPrev") {
      state.sowPage = Math.max(1, state.sowPage - 1);
      return void views.renderSowCards();
    }
    if (act === "sowNext") {
      state.sowPage += 1;
      return void views.renderSowCards();
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

      views.renderSowCards();

      const { modalEl, modal, mount } = ensureSowModal();
      const title = modalEl.querySelector("#reproSowModalLabel");
      if (title) title.textContent = `Sow • ${state.activeSowId}`;

      if (modal) {
        modal.show();
        modalEl.addEventListener("shown.bs.modal", () => views.renderSowPanel(state.activeSowId, mount), { once: true });
      } else {
        views.renderSowPanel(state.activeSowId, mount);
      }
      return;
    }

    if (act === "jumpRepro") {
      const mount = getPanelMount();
      mount?.querySelector?.('[data-bs-target="#tabReproduction"]')?.click();
      views.renderReproTabInto(mount);
      return;
    }

    if (act === "jumpSelection") {
      const mount = getPanelMount();
      mount?.querySelector?.('[data-bs-target="#tabReproduction"]')?.click();

      const cycles = views.getCyclesForSowSafe(state.activeSowId);
      if (cycles?.length) {
        state.activeCycleId = cycles[0].id;
        state.cycleView = "detail";
        state.activeCycleTabTarget = "#cycleSelect";

        state.selectionView = "list";
        state.growthView = "list";
        state.selectedPigletTagForSelection = "";
        state.selectedPigletTagForGrowth = "";

        views.renderSowPanel(state.activeSowId, mount);
        mount?.querySelector?.('[data-bs-target="#tabReproduction"]')?.click();
        views.renderCyclePanel(state.activeSowId, state.activeCycleId, "#cycleSelect");
      }
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

      views.renderSowCards();

      const mount = getPanelMount();
      views.renderSowPanel(state.activeSowId, mount);
      mount?.querySelector?.('[data-bs-target="#tabReproduction"]')?.click();
      views.renderCyclePanel(state.activeSowId, state.activeCycleId, "#cycleAI");
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
      views.renderReproTabInto(mount);
      return;
    }

    if (act === "growthSexFilter") {
      state.growthSexFilter = btn.getAttribute("data-sex") || "all";
      state.pigletPageGrowth = 1;
      state.growthView = "list";
      state.selectedPigletTagForGrowth = "";
      if (state.activeSowId && state.activeCycleId) views.renderCyclePanel(state.activeSowId, state.activeCycleId, "#cycleGrowth");
      return;
    }

    if (act === "selectionSexFilter") {
      state.selectionSexFilter = btn.getAttribute("data-sex") || "all";
      state.pigletPageSelection = 1;
      state.selectionView = "list";
      state.selectedPigletTagForSelection = "";
      if (state.activeSowId && state.activeCycleId) views.renderCyclePanel(state.activeSowId, state.activeCycleId, "#cycleSelect");
      return;
    }

    if (act === "growthBack") {
      state.growthView = "list";
      state.selectedPigletTagForGrowth = "";
      if (state.activeSowId && state.activeCycleId) views.renderCyclePanel(state.activeSowId, state.activeCycleId, "#cycleGrowth");
      return;
    }

    if (act === "selectionBack") {
      state.selectionView = "list";
      state.selectedPigletTagForSelection = "";
      if (state.activeSowId && state.activeCycleId) views.renderCyclePanel(state.activeSowId, state.activeCycleId, "#cycleSelect");
      return;
    }

    if (act === "growthPigletPrev") {
      state.pigletPageGrowth = Math.max(1, state.pigletPageGrowth - 1);
      if (state.activeSowId && state.activeCycleId) views.renderCyclePanel(state.activeSowId, state.activeCycleId, "#cycleGrowth");
      return;
    }
    if (act === "growthPigletNext") {
      state.pigletPageGrowth += 1;
      if (state.activeSowId && state.activeCycleId) views.renderCyclePanel(state.activeSowId, state.activeCycleId, "#cycleGrowth");
      return;
    }
    if (act === "selectionPigletPrev") {
      state.pigletPageSelection = Math.max(1, state.pigletPageSelection - 1);
      if (state.activeSowId && state.activeCycleId) views.renderCyclePanel(state.activeSowId, state.activeCycleId, "#cycleSelect");
      return;
    }
    if (act === "selectionPigletNext") {
      state.pigletPageSelection += 1;
      if (state.activeSowId && state.activeCycleId) views.renderCyclePanel(state.activeSowId, state.activeCycleId, "#cycleSelect");
      return;
    }

    if (act === "openPigletGrowth") {
      state.selectedPigletTagForGrowth = btn.getAttribute("data-piglet") || "";
      state.growthView = "detail";
      if (state.activeSowId && state.activeCycleId) {
        views.renderCyclePanel(state.activeSowId, state.activeCycleId, "#cycleGrowth");
        setTimeout(() => views.renderPigletGrowthDetail(state.selectedPigletTagForGrowth), 0);
      }
      return;
    }

    if (act === "openPigletSelection") {
      state.selectedPigletTagForSelection = btn.getAttribute("data-piglet") || "";
      state.selectionView = "detail";
      if (state.activeSowId && state.activeCycleId) {
        views.renderCyclePanel(state.activeSowId, state.activeCycleId, "#cycleSelect");
        setTimeout(() => views.renderPigletSelectionDetail(state.selectedPigletTagForSelection), 0);
      }
      return;
    }
  });

  // Cycle dropdown change/input (fixed)
  function handleCycleFilterChange(selectEl) {
    if (!selectEl) return;
    if (!state.activeSowId) return;

    state.cycleFilterId = selectEl.value || "all";
    state.cycleView = "list";
    state.activeCycleId = null;

    state.growthView = "list";
    state.selectionView = "list";
    state.selectedPigletTagForGrowth = "";
    state.selectedPigletTagForSelection = "";

    const mount = getPanelMount();
    views.renderReproTabInto(mount);
  }

  document.addEventListener("change", (e) => {
    if (e.target?.id === "cycleFilterSelect") handleCycleFilterChange(e.target);
  });

  document.addEventListener("input", (e) => {
    if (e.target?.id === "cycleFilterSelect") handleCycleFilterChange(e.target);

    if (e.target?.id === "reproductionSearch") {
      state.sowTerm = e.target.value || "";
      state.sowPage = 1;
      views.renderSowCards();
      return;
    }

    if (e.target?.id === "growthFilterInput") {
      state.pigletGrowthFilter = e.target.value || "";
      state.pigletPageGrowth = 1;
      state.growthView = "list";
      state.selectedPigletTagForGrowth = "";
      if (state.activeSowId && state.activeCycleId) views.renderCyclePanel(state.activeSowId, state.activeCycleId, "#cycleGrowth");
      return;
    }

    if (e.target?.id === "selectionFilterInput") {
      state.pigletSelectionFilter = e.target.value || "";
      state.pigletPageSelection = 1;
      state.selectionView = "list";
      state.selectedPigletTagForSelection = "";
      if (state.activeSowId && state.activeCycleId) views.renderCyclePanel(state.activeSowId, state.activeCycleId, "#cycleSelect");
      return;
    }
  });

  // =========================================================
  // Boot
  // =========================================================
  if (searchInput && typeof searchInput.value === "string" && searchInput.value.trim()) {
    state.sowTerm = searchInput.value || "";
  }

  await loadAllSafe();

  console.timeEnd("Reproduction_Load_Time");
});