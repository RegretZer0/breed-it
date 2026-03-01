// /js/reproduction/reproduction.views.js

export function createReproViews({ repo, state, ui }) {
  const { esc, fmtDate, fmtShortDate, badge, sexLabel, normSex } = ui;

  // =========================
  // Selection UI Helpers
  // =========================
  function norm(v) {
    return String(v ?? "").trim();
  }
  function normLower(v) {
    return norm(v).toLowerCase();
  }
  function toKey(v) {
    return v == null ? "" : String(v).trim();
  }

  function findSwineByTag(tag) {
    const t = norm(tag);
    if (!t) return null;
    return (
      (repo.store.allSwineData || []).find(
        (s) => norm(s?.swine_tag) === t || norm(s?.swine_id) === t || norm(s?.tag) === t
      ) || null
    );
  }

  function findMonitoringRow(tag) {
    const t = norm(tag);
    if (!t) return null;
    return (
      (repo.store.rawMonitoringData || []).find(
        (r) => norm(r?.swine_tag) === t || norm(r?.swine_id) === t || norm(r?.tag) === t
      ) || null
    );
  }

  // Current status to display for a piglet
  // Priority: selection record -> swine final decision -> monitoring -> swine -> fallback
  function getPigletDisplayStatus(tag) {
    const sw = findSwineByTag(tag);

    const swStatus = norm(sw?.current_status);
    const swStatusLower = normLower(swStatus);
    const swStageLower = normLower(sw?.age_stage);

    // If swine already has a DECISION / FINAL status, show it immediately
    // (these are enum-safe values you are using now)
    const isFinalDecision =
      swStageLower === "adult" ||
      swStatusLower === "active" ||
      swStatusLower.includes("culled") ||
      swStatusLower.includes("sold") ||
      swStatusLower.includes("inactive") ||
      swStatusLower.includes("marked for sale");

    if (isFinalDecision && swStatus) {
      return swStatus;
    }

    // Priority: selection record -> monitoring -> swine -> fallback
    const sel = repo.getSelectionForPiglet?.(tag);
    const fromSel = sel?.recommendation || sel?.decision || sel?.status || "";
    if (norm(fromSel)) return String(fromSel);

    const mon = findMonitoringRow(tag);
    if (norm(mon?.current_status)) return String(mon.current_status);

    if (swStatus) return swStatus;
    if (norm(sw?.age_stage)) return String(sw.age_stage);

    return "Monitoring (Day 1-30)";
  }

  function statusVariant(statusText) {
    const s = normLower(statusText);

    // treat Final Selection as retain/success
    if (s.includes("final selection")) return "success";

    if (s.includes("retain") || s.includes("breeding") || s.includes("keep")) return "success";

    // treat sold as sell/danger
    if (
      s.includes("sell") ||
      s.includes("sale") ||
      s.includes("market") ||
      s.includes("cull") ||
      s.includes("sold")
    )
      return "danger";

    if (s.includes("pending") || s.includes("review") || s.includes("monitor")) return "warning";
    return "light";
  }

  function statusChipHtml(statusText) {
    // ✅ Default to real stage instead of "Pending"
    const st = norm(statusText) || "Monitoring (Day 1-30)";
    const v = statusVariant(st);
    // Use app-like subtle chips (keeps theme consistent)
    if (v === "success")
      return `<span class="repro-chip bg-success-subtle text-success border border-success-subtle">Status: <b>${esc(
        st
      )}</b></span>`;
    if (v === "danger")
      return `<span class="repro-chip bg-danger-subtle text-danger border border-danger-subtle">Status: <b>${esc(
        st
      )}</b></span>`;
    if (v === "warning")
      return `<span class="repro-chip bg-warning-subtle text-dark border border-warning-subtle">Status: <b>${esc(
        st
      )}</b></span>`;
    return `<span class="repro-chip bg-light text-dark border">Status: <b>${esc(st)}</b></span>`;
  }

  // ---------------------------------------------------------
  // Selection Decision Helpers (Pending default)
  // ---------------------------------------------------------
  function decisionFromSelectionRow(selRow) {
    const raw = String(selRow?.recommendation || selRow?.decision || selRow?.status || "").toLowerCase();
    if (!raw) return ""; // unknown
    if (raw.includes("retain") || raw.includes("keep") || raw.includes("breeding")) return "retain";
    if (raw.includes("sell") || raw.includes("sale") || raw.includes("market")) return "sell";
    if (raw.includes("pending")) return "pending";
    return "";
  }

  // ✅ single source of truth for decision shown in UI
  function getPigletDecision(pigletTag) {
    const tag = toKey(pigletTag);
    if (!tag) return { key: "", decision: "pending", locked: false, source: "default" };

    // 1) DB selection row (if your endpoint returns it)
    const sel = repo.getSelectionForPiglet?.(tag) || null;
    const d1 = sel ? decisionFromSelectionRow(sel) : "";
    if (d1) return { key: tag, decision: d1, locked: d1 !== "pending", source: "db" };

    // 2) Local lock (works even if selection-candidates is empty)
    const mongoId = toKey(repo.getMongoIdForSwineTag?.(tag) || "");
    const local = mongoId ? state.localSelectionLock?.get(mongoId) : null;
    if (local === "breeding") return { key: mongoId || tag, decision: "retain", locked: true, source: "local" };
    if (local === "sell") return { key: mongoId || tag, decision: "sell", locked: true, source: "local" };

    // 3) Default: Pending (this is what you want)
    return { key: mongoId || tag, decision: "pending", locked: false, source: "default" };
  }

  function decisionLabel(decision) {
    if (decision === "retain") return "Retain";
    if (decision === "sell") return "For Sale";
    return "Pending";
  }

  function decisionVariant(decision) {
    if (decision === "retain") return "success";
    if (decision === "sell") return "danger";
    return "warning";
  }

  // ✅ Use this for the "Status pill" in selection UI
  function selectionStatusChipHtml(decision) {
    const label = decisionLabel(decision);
    const variant = decisionVariant(decision);
    const cls =
      variant === "success"
        ? "badge bg-success"
        : variant === "danger"
        ? "badge bg-danger"
        : "badge bg-warning text-dark";
    return `<span class="${cls}">${esc(label)}</span>`;
  }

  // ✅ Stats should be based on selection decisions, not Swine "Active"
  function computeSelectionSummaryForPiglets(pigletTags) {
    const sum = { total: 0, retain: 0, sell: 0, pending: 0 };
    for (const tag of pigletTags || []) {
      const d = getPigletDecision(tag).decision; // retain/sell/pending
      sum.total += 1;
      if (d === "retain") sum.retain += 1;
      else if (d === "sell") sum.sell += 1;
      else sum.pending += 1;
    }
    return sum;
  }

  // ---------------------------------------------------------
  // Selection lock: once a decision is made, buttons should lock/hide
  // ---------------------------------------------------------
  function isDecisionLocked(statusText) {
    const s = normLower(statusText);

    // Any of these means: user already decided / no more actions
    return (
      s.includes("final selection") ||
      s.includes("retain") ||
      s.includes("breeding") ||
      s.includes("keep") ||
      s.includes("sell") ||
      s.includes("sale") ||
      s.includes("market") ||
      s.includes("cull") ||
      s.includes("culled") ||
      s.includes("sold") ||
      s.includes("inactive") ||
      s.includes("to be culled") ||
      s.includes("pending") // lock pending too (one-time selection)
    );
  }

  function decisionLabelFromStatus(statusText) {
    const s = normLower(statusText);
    if (s.includes("final selection") || s.includes("retain") || s.includes("breeding") || s.includes("keep"))
      return "Retain";
    if (
      s.includes("sell") ||
      s.includes("sale") ||
      s.includes("market") ||
      s.includes("cull") ||
      s.includes("culled") ||
      s.includes("sold")
    )
      return "Sale";
    if (s.includes("pending")) return "Pending";
    return "";
  }

  function computeSelectionStatsFromPiglets(piglets) {
    const sum = { total: 0, retain: 0, sell: 0, pending: 0 };
    const list = Array.isArray(piglets) ? piglets : [];
    sum.total = list.length;

    for (const p of list) {
      const tag = p?.swine_tag || p?.swine_id || p?.tag || "";
      const st = normLower(getPigletDisplayStatus(tag));

      // ✅ count Final Selection as retain
      if (st.includes("final selection") || st.includes("retain") || st.includes("breeding") || st.includes("keep")) {
        sum.retain += 1;
      }
      // ✅ count Sold as sell
      else if (st.includes("sell") || st.includes("sale") || st.includes("market") || st.includes("cull") || st.includes("sold")) {
        sum.sell += 1;
      } else {
        sum.pending += 1;
      }
    }
    return sum;
  }

  // ---------------------------------------------------------
  // Shared small helpers
  // ---------------------------------------------------------
  function paginate(list, page, pageSize) {
    const total = list.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(Math.max(1, page), pages);
    const start = (safePage - 1) * pageSize;
    return { page: safePage, pages, total, items: list.slice(start, start + pageSize) };
  }

  function pickFirst(obj, keys) {
    for (const k of keys) {
      const v = obj?.[k];
      if (v == null) continue;
      const s = String(v).trim();
      if (s && s !== "null" && s !== "undefined") return v;
    }
    return null;
  }

  function yesNo(val) {
    if (val === true) return "Yes";
    if (val === false) return "No";
    const s = String(val ?? "").toLowerCase().trim();
    if (!s) return "N/A";
    if (["yes", "y", "true", "1", "confirmed"].includes(s)) return "Yes";
    if (["no", "n", "false", "0"].includes(s)) return "No";
    return String(val);
  }

  function normalizeRecommendation(rec) {
    const r = String(rec || "").trim();
    if (!r) return { label: "Pending", variant: "warning" };

    const low = r.toLowerCase();
    if (low.includes("retain") || low.includes("breeding") || low.includes("keep"))
      return { label: "Retain for Breeding", variant: "success" };
    if (low.includes("sell") || low.includes("sale") || low.includes("market") || low.includes("cull"))
      return { label: "Mark for Sale", variant: "danger" };
    if (low.includes("pending")) return { label: "Pending", variant: "warning" };

    return { label: r, variant: "light" };
  }

  // ---------------------------------------------------------
  // System Suggestion (kept for details + helpful context)
  // NOTE: The PILL on piglet cards is now CURRENT STATUS (per request).
  // ---------------------------------------------------------
  function computeSystemSuggestion(pigletTag, pigletObj) {
    const tag = toKey(pigletTag || pigletObj?.swine_id || pigletObj?.swine_tag);
    if (!tag) {
      return {
        badge: { label: "Pending", variant: "warning" },
        text: "System Suggestion: Pending (missing piglet tag).",
      };
    }

    const hs = String(pigletObj?.health_status || "").toLowerCase();
    if (hs.includes("deceased") || hs.includes("dead")) {
      return {
        badge: { label: "Deceased", variant: "danger" },
        text: "System Suggestion: No action (piglet is marked deceased).",
      };
    }

    const defs = repo.getDeformitiesForPiglet(tag) || [];
    if (defs.length) {
      return {
        badge: { label: "Mark for Sale", variant: "danger" },
        text: "System Suggestion: Mark for sale (deformity detected).",
      };
    }

    const sel = repo.getSelectionForPiglet(tag);
    if (sel) {
      const rec = normalizeRecommendation(sel?.recommendation || sel?.decision || sel?.status);
      const text =
        rec.variant === "success"
          ? "System Suggestion: Retain this piglet for breeding based on evaluation."
          : rec.variant === "danger"
          ? "System Suggestion: Mark this piglet for sale (not ideal for breeding)."
          : "System Suggestion: Set this piglet as Pending while awaiting more records or evaluation.";
      return { badge: rec, text };
    }

    const history = repo.getMorphHistoryForPiglet(tag) || [];
    const latest = history.length ? history[history.length - 1] : null;

    const latestWeight = latest ? Number(latest.weight || 0) : 0;
    const stageRaw = String(
      latest?.stage || pigletObj?.age_stage || pigletObj?.current_status || pigletObj?.current_stage || ""
    ).toLowerCase();

    const sex = normSex(pigletObj?.sex);
    const isFemale = sex.startsWith("f");

    const isMonitoring = stageRaw.includes("day 1-30") || stageRaw.includes("monitoring") || stageRaw.includes("piglet");
    const isWeaned =
      stageRaw.includes("weaned") ||
      stageRaw.includes("weaning") ||
      stageRaw.includes("weaner") ||
      stageRaw.includes("3 months");
    const isFinal = stageRaw.includes("final selection") || stageRaw.includes("final") || stageRaw.includes("adult");

    if (isFinal) {
      if (latestWeight >= 15 && latestWeight <= 25) {
        return {
          badge: { label: isFemale ? "Retain for Breeding" : "Market Ready", variant: "success" },
          text: `System Suggestion: Ideal selection weight (${latestWeight} kg). ${
            isFemale ? "Retain for breeding." : "Market ready."
          }`,
        };
      }
      if (latestWeight > 25) {
        return {
          badge: { label: "Mark for Sale", variant: "danger" },
          text: `System Suggestion: Overweight (${latestWeight} kg). Consider market/sale.`,
        };
      }
      return {
        badge: { label: "Pending", variant: "warning" },
        text: `System Suggestion: Underweight (${latestWeight} kg). Continue monitoring.`,
      };
    }

    if (isWeaned) {
      return {
        badge: { label: "Pending", variant: "warning" },
        text: "System Suggestion: No deformities detected. Continue monitoring toward final selection.",
      };
    }

    if (isMonitoring) {
      return {
        badge: { label: "Pending", variant: "warning" },
        text: "System Suggestion: No deformities detected. Continue monitoring (Day 1–30).",
      };
    }

    return {
      badge: { label: "Pending", variant: "warning" },
      text: "System Suggestion: Pending (insufficient records).",
    };
  }

  function filterPiglets(piglets, term) {
    const t = (term || "").trim().toLowerCase();
    if (!t) return piglets;
    return piglets.filter((p) => {
      const tag = (p?.swine_id || p?.swine_tag || p?.tag || "").toLowerCase();
      const st = (p?.age_stage || p?.current_status || p?.current_stage || "").toLowerCase();
      return tag.includes(t) || st.includes(t);
    });
  }

  function filterPigletsBySex(piglets, sexFilter) {
    const f = String(sexFilter || "all").toLowerCase();
    if (f === "all") return piglets;
    return piglets.filter((p) => {
      const s = normSex(p?.sex);
      if (f === "male") return s.startsWith("m");
      if (f === "female") return s.startsWith("f");
      return true;
    });
  }

  // ---------------------------------------------------------
  // Sow helpers (for Overview tab)
  // ---------------------------------------------------------
  function getSowByIdOrTag(sowId) {
    return (
      repo.store.sowMap?.get?.(sowId) ||
      repo.store.allSwineData?.find?.((x) => (x?.swine_id || x?.swine_tag || x?.tag) === sowId) ||
      null
    );
  }

  function getLatestPerf(swine) {
    const list = Array.isArray(swine?.performance_records) ? swine.performance_records : [];
    return list.length ? list[list.length - 1] : null;
  }

  // ---------------------------------------------------------
  // Left list rendering
  // ---------------------------------------------------------
  function renderListLoading() {
    state.dom.sowCardsWrap.innerHTML = `<div class="text-muted small">Loading sows...</div>`;
    state.dom.sowPager.innerHTML = "";
  }

  function renderListError(
    message = "Unable to load your swine data",
    sub = "Your session may have expired, or the server failed to respond."
  ) {
    state.dom.sowCardsWrap.innerHTML = `
      <div class="text-center text-muted py-4">
        <div class="mb-2"><i class="bi bi-wifi-off"></i></div>
        <div class="fw-bold">${esc(message)}</div>
        <div class="small">${esc(sub)}</div>
        <div class="d-flex justify-content-center gap-2 mt-3">
          <button class="btn btn-outline-success btn-sm" data-act="retryLoad">
            <i class="bi bi-arrow-clockwise me-1"></i> Retry
          </button>
          <button class="btn btn-success btn-sm" data-act="goLogin">
            <i class="bi bi-box-arrow-in-right me-1"></i> Login
          </button>
        </div>
      </div>
    `;
    state.dom.sowPager.innerHTML = "";
  }

  function renderListNoData() {
    state.dom.sowCardsWrap.innerHTML = `
      <div class="text-center text-muted py-4">
        <i class="bi bi-info-circle me-1"></i> No sows found in your account yet.
      </div>
    `;
    state.dom.sowPager.innerHTML = "";
  }

  function getFilteredSows() {
    const term = (state.sowTerm || "").trim().toLowerCase();
    const list = repo.store.sows || [];
    if (!term) return list;

    return list.filter((s) => {
      const sowId = (s?.swine_id || s?.swine_tag || s?.tag || "").toLowerCase();
      const stage = (s?.age_stage || s?.current_status || s?.current_stage || "").toLowerCase();
      return sowId.includes(term) || stage.includes(term);
    });
  }

  function renderSowPagination(meta) {
    state.dom.sowPager.innerHTML = `
      <div class="d-flex align-items-center justify-content-between gap-2">
        <button class="btn btn-sm btn-outline-success" ${meta.page <= 1 ? "disabled" : ""} data-act="sowPrev">
          <i class="bi bi-chevron-left"></i> Prev
        </button>
        <div class="small text-muted">
          Page <b>${meta.page}</b> of <b>${meta.pages}</b> • <b>${meta.total}</b> sows
        </div>
        <button class="btn btn-sm btn-outline-success" ${meta.page >= meta.pages ? "disabled" : ""} data-act="sowNext">
          Next <i class="bi bi-chevron-right"></i>
        </button>
      </div>
    `;
  }

  function sowCardHtml(s) {
    const sowId = s?.swine_id || s?.swine_tag || s?.tag || "N/A";
    const stage = s?.age_stage || s?.current_status || s?.current_stage || "N/A";
    const breed = s?.breed || "N/A";
    const dob = s?.birth_date ? fmtDate(s.birth_date) : "N/A";

    const stats = repo.computeBreedingStatsForSow(sowId);
    const alive = stats.aliveMale + stats.aliveFemale;
    const isActive = state.activeSowId && state.activeSowId === sowId;

    return `
      <div class="repro-card card shadow-sm border-0 ${isActive ? "repro-card-active" : ""}">
        <div class="card-body">
          <div class="d-flex align-items-start justify-content-between gap-2">
            <div class="min-w-0">
              <div class="d-flex align-items-center gap-2">
                <span class="repro-pill"><i class="bi bi-heart-pulse"></i></span>
                <h6 class="mb-0 text-truncate">${esc(sowId)}</h6>
              </div>
              <div class="small text-muted mt-1 text-truncate">
                Stage: <b>${esc(stage)}</b> • Breed: <b>${esc(breed)}</b>
              </div>
              <div class="small text-muted text-truncate">
                DOB: ${esc(dob)}
              </div>
            </div>

            <div class="text-end">
              <div class="small text-muted">Piglets</div>
              <div class="fw-bold">${alive} alive</div>
              <div class="small text-danger">${stats.deceased} dead</div>
            </div>
          </div>

          <div class="d-flex gap-2 mt-3">
            <button class="btn btn-success btn-sm flex-grow-1" data-act="openSow" data-sow="${esc(sowId)}">
              View <i class="bi bi-arrow-right-circle ms-1"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function renderSowCards() {
    if (!repo.store.loaded?.swine) return void renderListLoading();
    if ((repo.store.sows || []).length === 0) return void renderListNoData();

    const list = getFilteredSows();
    const meta = paginate(list, state.sowPage, state.PAGE_SIZE);
    state.sowPage = meta.page;

    if (meta.total === 0 && (state.sowTerm || "").trim()) {
      state.dom.sowCardsWrap.innerHTML = `
        <div class="text-center text-muted py-4">
          <i class="bi bi-search me-1"></i> No sows match your filter.
        </div>`;
      state.dom.sowPager.innerHTML = `<div class="small text-muted text-center">0 sows</div>`;
      return;
    }

    state.dom.sowCardsWrap.innerHTML = meta.items.length ? meta.items.map(sowCardHtml).join("") : "";
    renderSowPagination(meta);
  }

  // ---------------------------------------------------------
  // Cycle dropdown / list + pagination
  // ---------------------------------------------------------
  function getCyclesForSowSafe(sowId) {
    const raw = repo.getCyclesForSow(sowId) || [];

    const seen = new Set();
    const cycles = [];
    for (const c of raw) {
      const id = String(c?.id || "");
      if (!id) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      cycles.push(c);
    }

    const ids = new Set(cycles.map((c) => String(c?.id || "")));

    if (state.cycleFilterId !== "all" && !ids.has(String(state.cycleFilterId))) {
      state.cycleFilterId = "all";
    }
    return cycles;
  }

  function getFilteredCyclesForSow(sowId) {
    const cycles = getCyclesForSowSafe(sowId);
    if (state.cycleFilterId === "all") return cycles;
    const want = String(state.cycleFilterId);
    return cycles.filter((c) => String(c?.id) === want);
  }

  function renderCycleFilterDropdown(sowId) {
    const cycles = getCyclesForSowSafe(sowId);
    if (!cycles.length) return "";

    const opts =
      `<option value="all"${state.cycleFilterId === "all" ? " selected" : ""}>All cycles</option>` +
      cycles
        .map((c, idx) => {
          const label = c?.date ? `Cycle ${idx + 1} • ${fmtDate(c.date)}` : `Cycle ${idx + 1}`;
          const val = String(c?.id ?? "");
          return `<option value="${esc(val)}"${
            String(state.cycleFilterId) === val ? " selected" : ""
          }>${esc(label)}</option>`;
        })
        .join("");

    return `
      <div class="d-flex align-items-center justify-content-between gap-2 flex-wrap mb-3">
        <div class="min-w-0">
          <div class="fw-bold"><i class="bi bi-diagram-3 me-1"></i> Cycles</div>
          <div class="small text-muted">Choose a cycle to view records.</div>
        </div>

        <div class="d-flex align-items-center gap-2">
          <div class="small text-muted">Cycle</div>
          <select class="form-select form-select-sm" style="min-width:260px" id="cycleFilterSelect">
            ${opts}
          </select>
        </div>
      </div>
    `;
  }

  function cycleCardHtml(cycle, cycleNo, sowId) {
    const dateLabel = cycle?.date ? fmtDate(cycle.date) : "N/A";
    const boar = cycle?.boarCode || "N/A";
    const status = cycle?.status || "Recorded";

    const badgeVariant =
      String(status).toLowerCase().includes("fail")
        ? "danger"
        : String(status).toLowerCase().includes("preg")
        ? "info"
        : String(status).toLowerCase().includes("success")
        ? "success"
        : "light";

    return `
      <div class="card repro-subcard shadow-sm border-0">
        <div class="card-body">
          <div class="d-flex align-items-start justify-content-between gap-2">
            <div class="min-w-0">
              <div class="fw-bold text-truncate">
                <i class="bi bi-calendar2-week me-1"></i> Cycle ${cycleNo}
              </div>
              <div class="small text-muted text-truncate">
                Service Date: <b>${esc(dateLabel)}</b>
              </div>
              <div class="small text-muted text-truncate">
                Boar: <b>${esc(boar)}</b>
              </div>
            </div>

            <div class="text-end">
              ${badge(status, badgeVariant)}
            </div>
          </div>

          <div class="d-flex gap-2 mt-3 justify-content-end">
            <button
              class="btn btn-success btn-sm"
              data-act="openCycle"
              data-cycle="${esc(String(cycle.id))}"
              data-sow="${esc(String(sowId))}"
            >
              Open Cycle <i class="bi bi-chevron-right ms-1"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function renderCyclePager(meta) {
    return `
      <div class="d-flex align-items-center justify-content-between gap-2 mt-3">
        <button class="btn btn-sm btn-outline-success" ${meta.page <= 1 ? "disabled" : ""} data-act="cyclePrev">
          <i class="bi bi-chevron-left"></i> Prev
        </button>
        <div class="small text-muted">
          Page <b>${meta.page}</b> of <b>${meta.pages}</b> • <b>${meta.total}</b> cycles
        </div>
        <button class="btn btn-sm btn-outline-success" ${meta.page >= meta.pages ? "disabled" : ""} data-act="cycleNext">
          Next <i class="bi bi-chevron-right"></i>
        </button>
      </div>
    `;
  }

  function renderCycleList(sowId) {
    const cyclesAll = getCyclesForSowSafe(sowId);
    if (!cyclesAll.length) {
      return `
        <div class="text-muted small">
          <i class="bi bi-info-circle me-1"></i> No AI records yet for this sow.
        </div>
      `;
    }

    const filtered = getFilteredCyclesForSow(sowId);

    const meta = paginate(filtered, state.cyclePage, state.CYCLE_PAGE_SIZE);
    state.cyclePage = meta.page;

    const baseIndexOffset = meta.items.length ? Math.max(0, filtered.indexOf(meta.items[0])) : 0;

    return `
      ${renderCycleFilterDropdown(sowId)}
      <div class="vstack gap-3" id="cycleCardsWrap">
        ${
          meta.items.length
            ? meta.items.map((c, idx) => cycleCardHtml(c, baseIndexOffset + idx + 1, sowId)).join("")
            : `<div class="text-muted small"><i class="bi bi-info-circle me-1"></i>No cycles match.</div>`
        }
      </div>
      ${renderCyclePager(meta)}
    `;
  }

  // ---------------------------------------------------------
  // Reduce stacking in Reproduction tab: single mount
  // ---------------------------------------------------------
  function getReproTabMount(mountRoot) {
    return mountRoot?.querySelector?.("#reproReproMount") || document.getElementById("reproReproMount");
  }

  function renderReproTabBodyHtml(sowId) {
    if (state.cycleView !== "detail" || !state.activeCycleId) {
      return renderCycleList(sowId);
    }

    const activeTab = state.activeCycleTabTarget || "#cycleAI";
    const isGrowthDetail = activeTab === "#cycleGrowth" && state.growthView === "detail";
    const isSelectionDetail = activeTab === "#cycleSelect" && state.selectionView === "detail";

    let backAct = "cycleBack";
    let backLabel = "Back to Cycles";

    if (isGrowthDetail) {
      backAct = "growthBack";
      backLabel = "Back to Piglets";
    } else if (isSelectionDetail) {
      backAct = "selectionBack";
      backLabel = "Back to Piglets";
    }

    return `
      <div class="d-flex align-items-center justify-content-between gap-2 flex-wrap">
        <div class="min-w-0">
          <div class="fw-bold text-truncate">
            <i class="bi bi-folder2-open me-1"></i> Cycle Details
          </div>
          <div class="small text-muted text-truncate">
            AI record • performance • growth • selection
          </div>
        </div>

        <button type="button" class="btn btn-outline-success btn-sm" data-act="${backAct}">
          <i class="bi bi-arrow-left me-1"></i> ${backLabel}
        </button>
      </div>

      <hr class="my-3"/>

      <div id="cyclePanelMount"></div>
    `;
  }

  function renderReproTabInto(mountRoot) {
    const m = getReproTabMount(mountRoot);
    if (!m) return;

    if (!state.activeSowId) {
      m.innerHTML = `<div class="text-muted small">Select a sow to view cycles.</div>`;
      return;
    }

    getCyclesForSowSafe(state.activeSowId);

    m.innerHTML = renderReproTabBodyHtml(state.activeSowId);

    if (state.cycleView === "detail" && state.activeCycleId) {
      renderCyclePanel(state.activeSowId, state.activeCycleId);
    }
  }

  // ---------------------------------------------------------
  // Cycle Panel (tabs)
  // ---------------------------------------------------------
  function getCurrentActiveCycleTabTarget() {
    const activeBtn = document.querySelector(".repro-tabs .nav-link.active");
    const t = activeBtn?.getAttribute("data-bs-target");
    if (t && state.CYCLE_TABS.includes(t)) return t;
    return state.activeCycleTabTarget || "#cycleAI";
  }

  function setCycleTabTarget(nextTarget) {
    if (nextTarget && state.CYCLE_TABS.includes(nextTarget)) state.activeCycleTabTarget = nextTarget;
  }

  // ✅ AI Record
  function renderCycleAIRecord(sowId, cycle) {
    const r = cycle?.raw || {};

    const boarId = toKey(
      cycle.boarCode || pickFirst(r, ["male_swine_tag", "boar_tag", "male_swine_id", "boar_id"]) || "N/A"
    );
    const recordId = toKey(pickFirst(r, ["_id", "id", "record_id", "ai_record_id"]) || cycle.id);

    const tech = pickFirst(r, ["technician", "ai_technician", "performed_by", "vet", "handled_by"]);
    const semenSrc = pickFirst(r, ["semen_source", "source", "batch_source", "batch_id", "source_id"]);

    const preg = pickFirst(r, ["pregnancy_confirmed", "pregnant", "is_pregnant", "pregnancy"]);
    const expected = pickFirst(r, ["expected_farrowing", "expected_farrowing_date", "farrowing_date", "expected_date"]);

    const serviceDate = pickFirst(r, ["insemination_date", "ai_service_date", "service_date", "date", "createdAt"]);
    const status = pickFirst(r, ["cycle_status", "status", "pregnancy_status", "result"]) || cycle.status;

    const notes = pickFirst(r, ["remarks", "notes", "comment", "description"]);

    const badgeVariant =
      String(status).toLowerCase().includes("fail")
        ? "danger"
        : String(status).toLowerCase().includes("preg")
        ? "info"
        : String(status).toLowerCase().includes("success")
        ? "success"
        : "light";

    return `
      <div class="row g-3">
        <div class="col-12 col-lg-6">
          <div class="card repro-subcard h-100 shadow-sm border-0">
            <div class="card-body">
              <div class="fw-bold mb-2"><i class="bi bi-journal-text me-1"></i> Artificial Insemination Record</div>

              <div class="small text-muted">Sow</div>
              <div class="fw-semibold">${esc(sowId)}</div>

              <div class="small text-muted mt-2">AI Service Date</div>
              <div class="fw-semibold">${esc(fmtDate(serviceDate))}</div>

              <div class="small text-muted mt-2">Cycle Status</div>
              <div>${badge(status, badgeVariant)}</div>

              <hr class="my-3"/>

              <div class="small text-muted">AI Record ID</div>
              <div class="fw-semibold text-break">${esc(recordId)}</div>
            </div>
          </div>
        </div>

        <div class="col-12 col-lg-6">
          <div class="card repro-subcard h-100 shadow-sm border-0">
            <div class="card-body">
              <div class="fw-bold mb-2"><i class="bi bi-clipboard2-check me-1"></i> Service Details</div>

              <div class="small text-muted">Boar (Sire Tag / Code)</div>
              <div class="fw-semibold text-break">${esc(boarId)}</div>

              <div class="small text-muted mt-2">Pregnancy Confirmed</div>
              <div class="fw-semibold">${esc(yesNo(preg))}</div>

              <div class="small text-muted mt-2">Expected Farrowing</div>
              <div class="fw-semibold">${esc(fmtDate(expected))}</div>

              ${
                tech
                  ? `
                <div class="small text-muted mt-2">Technician</div>
                <div class="fw-semibold">${esc(tech)}</div>
              `
                  : ""
              }

              ${
                semenSrc
                  ? `
                <div class="small text-muted mt-2">Batch / Source</div>
                <div class="fw-semibold">${esc(semenSrc)}</div>
              `
                  : ""
              }

              ${
                notes
                  ? `
                <hr class="my-3"/>
                <div class="small text-muted">Notes</div>
                <div class="small">${esc(notes)}</div>
              `
                  : ""
              }
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderCyclePerformance(sowId, piglets) {
    const stats = repo.computeBreedingStatsForSow(sowId);

    const rows = piglets
      .map((p) => {
        const tag = p?.swine_id || p?.swine_tag || p?.tag || "N/A";
        const sex = sexLabel(p?.sex);
        const stage = p?.age_stage || p?.current_status || p?.current_stage || "N/A";
        const hs = p?.health_status || "N/A";
        const isDead = String(hs).toLowerCase().includes("deceased") || String(hs).toLowerCase().includes("dead");
        return `
          <div class="list-group-item d-flex align-items-center justify-content-between gap-2">
            <div class="min-w-0">
              <div class="fw-semibold text-truncate">${esc(tag)}</div>
              <div class="small text-muted text-truncate">${esc(sex)} • ${esc(stage)}</div>
            </div>
            <div>${isDead ? badge("Deceased", "danger") : badge("Alive", "success")}</div>
          </div>
        `;
      })
      .join("");

    return `
      <div class="row g-3">
        <div class="col-12">
          <!-- ✅ FIX: 2 columns on small screens -->
          <div class="row g-2">
            <div class="col-6 col-md-4">
              <div class="card repro-stat h-100 shadow-sm border-0">
                <div class="card-body">
                  <div class="small text-muted">Alive Male</div>
                  <div class="h4 mb-0">${stats.aliveMale}</div>
                </div>
              </div>
            </div>
            <div class="col-6 col-md-4">
              <div class="card repro-stat h-100 shadow-sm border-0">
                <div class="card-body">
                  <div class="small text-muted">Alive Female</div>
                  <div class="h4 mb-0">${stats.aliveFemale}</div>
                </div>
              </div>
            </div>
            <div class="col-6 col-md-4">
              <div class="card repro-stat-danger h-100 shadow-sm border-0">
                <div class="card-body">
                  <div class="small text-muted">Deceased</div>
                  <div class="h4 mb-0">${stats.deceased}</div>
                </div>
              </div>
            </div>
            <div class="col-6 d-md-none">
              <div class="card repro-stat h-100 shadow-sm border-0">
                <div class="card-body">
                  <div class="small text-muted">Total Piglets</div>
                  <div class="h4 mb-0">${stats.total}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="col-12">
          <div class="card repro-subcard shadow-sm border-0">
            <div class="card-body">
              <div class="fw-bold mb-2"><i class="bi bi-list-ul me-1"></i> Piglets</div>
              <div class="list-group list-group-flush repro-list">
                ${rows || `<div class="text-muted small">No piglets found for this sow.</div>`}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ✅ Piglet card redesign:
  // - Keep 1 card per row (parent uses vstack)
  // - Replace suggestion pill => Current Status chip
  // - Move action button to bottom-right
  function pigletCardHtml(p, ctx) {
    const tag = p?.swine_id || p?.swine_tag || p?.tag || "N/A";
    const sex = sexLabel(p?.sex);
    const stage = p?.age_stage || p?.current_status || p?.current_stage || "N/A";
    const hs = p?.health_status || "N/A";
    const isDead = String(hs).toLowerCase().includes("deceased") || String(hs).toLowerCase().includes("dead");
    const btnAct = ctx === "growth" ? "openPigletGrowth" : "openPigletSelection";

    const currentStatus = getPigletDisplayStatus(tag);
    const sug = computeSystemSuggestion(tag, p);

    const statusChip = statusChipHtml(currentStatus);

    const lifeBadge = isDead
      ? `<span class="badge bg-danger-subtle text-danger border border-danger-subtle"><i class="bi bi-x-circle me-1"></i>Deceased</span>`
      : `<span class="badge bg-success-subtle text-success border border-success-subtle"><i class="bi bi-check-circle me-1"></i>Alive</span>`;

    // Suggestion block (kept as supporting info, not the chip)
    const sugBlockClass =
      sug.badge.variant === "danger"
        ? "bg-danger-subtle border-danger-subtle text-danger"
        : sug.badge.variant === "success"
        ? "bg-success-subtle border-success-subtle text-success"
        : "bg-warning-subtle border-warning-subtle text-dark";

    return `
      <div class="card repro-subcard shadow-sm border-0">
        <div class="card-body d-flex flex-column gap-2">

          <!-- Header row -->
          <div class="d-flex align-items-start justify-content-between gap-2">
            <div class="min-w-0">
              <div class="d-flex align-items-center gap-2">
                <span class="repro-pill"><i class="bi bi-tag"></i></span>
                <div class="min-w-0">
                  <div class="fw-bold text-truncate">${esc(tag)}</div>
                  <div class="small text-muted text-truncate">${esc(sex)} • ${esc(stage)}</div>
                </div>
              </div>
            </div>
            <div class="text-end d-flex flex-column align-items-end gap-2">
              ${statusChip}
              ${lifeBadge}
            </div>
          </div>

          <!-- Support info -->
          <div class="px-3 py-2 rounded-3 border ${sugBlockClass}">
            <div class="fw-semibold small">
              <i class="bi bi-lightbulb me-1"></i>${esc(sug.text)}
            </div>
          </div>

          <!-- Footer actions: bottom-right -->
          <div class="d-flex justify-content-end pt-1">
            <button class="btn btn-success btn-sm" data-act="${btnAct}" data-piglet="${esc(tag)}">
              Open <i class="bi bi-chevron-right ms-1"></i>
            </button>
          </div>

        </div>
      </div>
    `;
  }

  function renderPagerHtml(which, meta) {
    return `
      <div class="d-flex align-items-center justify-content-between gap-2">
        <button class="btn btn-sm btn-outline-success" ${meta.page <= 1 ? "disabled" : ""} data-act="${which}Prev">
          <i class="bi bi-chevron-left"></i>
        </button>
        <div class="small text-muted">
          Page <b>${meta.page}</b> of <b>${meta.pages}</b> • <b>${meta.total}</b> items
        </div>
        <button class="btn btn-sm btn-outline-success" ${meta.page >= meta.pages ? "disabled" : ""} data-act="${which}Next">
          <i class="bi bi-chevron-right"></i>
        </button>
      </div>
    `;
  }

  function renderSexPills(active, actPrefix) {
    const opts = [
      { k: "all", label: "All" },
      { k: "male", label: "Male" },
      { k: "female", label: "Female" },
    ];
    return `
      <div class="d-flex gap-2 flex-wrap">
        ${opts
          .map(
            (o) => `
          <button
            type="button"
            class="btn btn-sm ${String(active) === o.k ? "btn-success" : "btn-outline-success"}"
            data-act="${actPrefix}"
            data-sex="${o.k}"
          >
            ${o.label}
          </button>
        `
          )
          .join("")}
      </div>
    `;
  }

  function renderCycleGrowth(sowId, piglets) {
    const bySex = filterPigletsBySex(piglets, state.growthSexFilter);
    const filtered = filterPiglets(bySex, state.pigletGrowthFilter);
    const meta = paginate(filtered, state.pigletPageGrowth, state.PAGE_SIZE);
    state.pigletPageGrowth = meta.page;

    const listHtml = meta.items.map((p) => pigletCardHtml(p, "growth")).join("");

    return `
      <div class="card repro-subcard shadow-sm border-0">
        <div class="card-body">

          ${
            state.growthView === "detail" && state.selectedPigletTagForGrowth
              ? `
                <div class="d-flex align-items-center justify-content-between gap-2 flex-wrap">
                  <div class="min-w-0">
                    <div class="fw-bold text-truncate"><i class="bi bi-activity me-1"></i> Weight Trend</div>
                    <div class="small text-muted text-truncate">Auto-updated based on recorded morphology entries</div>
                  </div>
                  <button type="button" class="btn btn-outline-success btn-sm" data-act="growthBack">
                    <i class="bi bi-arrow-left me-1"></i> Back
                  </button>
                </div>

                <div class="mt-3" id="growthDetailMount">
                  <div class="text-muted small">Loading...</div>
                </div>
              `
              : `
                <div class="d-flex align-items-start justify-content-between gap-2 flex-wrap">
                  <div class="min-w-0">
                    <div class="fw-bold mb-1"><i class="bi bi-graph-up-arrow me-1"></i> Growth Monitoring</div>
                    <div class="text-muted small">Filter piglets, then open one to view chart and deformities.</div>
                  </div>
                  <div class="text-end">
                    <div class="small text-muted">Sex Filter</div>
                    ${renderSexPills(state.growthSexFilter, "growthSexFilter")}
                  </div>
                </div>

                <div class="mt-3">
                  <input
                    class="form-control form-control-sm"
                    id="growthFilterInput"
                    placeholder="Filter piglets by tag or stage..."
                    value="${esc(state.pigletGrowthFilter)}"
                  />
                </div>

                <div class="vstack gap-3 mt-3" id="growthPigletCards">
                  ${listHtml || `<div class="text-muted small">No piglets match.</div>`}
                </div>

                <div class="mt-3" id="growthPager">
                  ${renderPagerHtml("growthPiglet", meta)}
                </div>
              `
          }

        </div>
      </div>
    `;
  }

  // ✅ Selection summary should reflect CURRENT sow's piglets
  // ✅ Uses decision-based counts (retain/sell/pending) when available
  function renderSelectionSummaryCards(piglets) {
    const list = Array.isArray(piglets) ? piglets : [];

    const tags = list
      .map((p) => p?.swine_tag || p?.swine_id || p?.tag || "")
      .filter((t) => String(t).trim());

    // decision-based (db selection row OR state.localSelectionLock OR default pending)
    const decisionSum = computeSelectionSummaryForPiglets(tags);

    // fallback to old behavior if no decision info exists at all
    const legacySum = computeSelectionStatsFromPiglets(list);
    const hasAnyDecision = (decisionSum.retain + decisionSum.sell) > 0;

    const sum = hasAnyDecision ? decisionSum : legacySum;

    return `
      <div class="row g-2 mt-2">
        <div class="col-6 col-md-3">
          <div class="card repro-stat h-100 shadow-sm border-0">
            <div class="card-body">
              <div class="small text-muted">Total</div>
              <div class="h4 mb-0" id="selectionStatTotal">${sum.total}</div>
            </div>
          </div>
        </div>

        <div class="col-6 col-md-3">
          <div class="card repro-stat h-100 shadow-sm border-0">
            <div class="card-body">
              <div class="small text-muted">Retain</div>
              <div class="h4 mb-0" id="selectionStatRetain">${sum.retain}</div>
            </div>
          </div>
        </div>

        <div class="col-6 col-md-3">
          <div class="card repro-stat-danger h-100 shadow-sm border-0">
            <div class="card-body">
              <div class="small text-muted">For Sale</div>
              <div class="h4 mb-0" id="selectionStatSell">${sum.sell}</div>
            </div>
          </div>
        </div>

        <div class="col-6 col-md-3">
          <div class="card repro-stat h-100 shadow-sm border-0">
            <div class="card-body">
              <div class="small text-muted">Pending</div>
              <div class="h4 mb-0" id="selectionStatPending">${sum.pending || 0}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderCycleSelection(sowId, piglets) {
    const bySex = filterPigletsBySex(piglets, state.selectionSexFilter);
    const filtered = filterPiglets(bySex, state.pigletSelectionFilter);
    const meta = paginate(filtered, state.pigletPageSelection, state.PAGE_SIZE);
    state.pigletPageSelection = meta.page;

    const listHtml = meta.items.map((p) => pigletCardHtml(p, "selection")).join("");

    return `
      <div class="card repro-subcard shadow-sm border-0">
        <div class="card-body">

          ${
            state.selectionView === "detail" && state.selectedPigletTagForSelection
              ? `
                <div class="d-flex align-items-center justify-content-between gap-2 flex-wrap">
                  <div class="min-w-0">
                    <div class="fw-bold text-truncate"><i class="bi bi-person-check me-1"></i> Selection Details</div>
                    <div class="small text-muted text-truncate">Status, suggestion, and actions</div>
                  </div>
                  <button type="button" class="btn btn-outline-success btn-sm" data-act="selectionBack">
                    <i class="bi bi-arrow-left me-1"></i> Back
                  </button>
                </div>

                <div class="mt-3" id="selectionDetailMount">
                  <div class="text-muted small">Loading...</div>
                </div>
              `
              : `
                <div class="d-flex align-items-start justify-content-between gap-2 flex-wrap">
                  <div class="min-w-0">
                    <div class="fw-bold mb-1"><i class="bi bi-check2-circle me-1"></i> Selection Process</div>
                    <div class="text-muted small">Filter piglets, then open one to view selection status and actions.</div>
                  </div>
                  <div class="text-end">
                    <div class="small text-muted">Sex Filter</div>
                    ${renderSexPills(state.selectionSexFilter, "selectionSexFilter")}
                  </div>
                </div>

                ${renderSelectionSummaryCards(piglets)}

                <div class="mt-3">
                  <input
                    class="form-control form-control-sm"
                    id="selectionFilterInput"
                    placeholder="Filter piglets by tag or stage..."
                    value="${esc(state.pigletSelectionFilter)}"
                  />
                </div>

                <div class="vstack gap-3 mt-3" id="selectionPigletCards">
                  ${listHtml || `<div class="text-muted small">No piglets match.</div>`}
                </div>

                <div class="mt-3" id="selectionPager">
                  ${renderPagerHtml("selectionPiglet", meta)}
                </div>
              `
          }

        </div>
      </div>
    `;
  }

  // Selection detail includes ACTIONS
  function renderPigletSelectionDetail(pigletTag) {
    const mount = document.getElementById("selectionDetailMount");
    if (!mount) return;

    const sel = repo.getSelectionForPiglet(pigletTag) || null;

    const recObj = sel
      ? normalizeRecommendation(sel?.recommendation || sel?.decision || sel?.status)
      : normalizeRecommendation(getPigletDisplayStatus(pigletTag)); // derive from real status

    // Fallback sources
    const fallbackObj =
      findSwineByTag(pigletTag) ||
      findMonitoringRow(pigletTag) ||
      null;

    const fallbackPerf = repo.getMorphHistoryForPiglet?.(pigletTag);
    const fallbackLatestPerf =
      Array.isArray(fallbackPerf) && fallbackPerf.length
        ? fallbackPerf[fallbackPerf.length - 1]
        : null;

    const stage =
      sel?.current_stage ||
      sel?.stage ||
      fallbackObj?.current_status ||
      fallbackObj?.age_stage ||
      getPigletDisplayStatus(pigletTag) ||
      "N/A";

    const date =
      sel?.updatedAt ||
      sel?.date ||
      sel?.createdAt ||
      fallbackLatestPerf?.date ||
      fallbackLatestPerf?.record_date ||
      fallbackObj?.updatedAt ||
      fallbackObj?.createdAt ||
      null;

    const swineId =
      toKey(sel?.id) ||
      toKey(sel?._id) ||
      toKey(sel?.swine_mongo_id) ||
      toKey(sel?.swineId) ||
      "";

    const mongoFromSwineList = repo.getMongoIdForSwineTag
      ? toKey(repo.getMongoIdForSwineTag(pigletTag))
      : "";

    const actionSwineId = /^[a-f\d]{24}$/i.test(String(swineId))
      ? swineId
      : mongoFromSwineList;

    const canAct = /^[a-f\d]{24}$/i.test(String(actionSwineId || ""));

    const dec = getPigletDecision(pigletTag);
    const currentDecision = dec.decision;      // pending/retain/sell
    const decisionLocked = dec.locked;         // true for retain/sell
    const decisionText = decisionLabel(currentDecision);

    const fallbackSug = computeSystemSuggestion(pigletTag, fallbackObj);

    mount.innerHTML = `
      <div class="d-flex align-items-start justify-content-between gap-2 flex-wrap">
        <div class="min-w-0">
          <div class="fw-bold text-truncate">
            <i class="bi bi-tag me-1"></i>${esc(pigletTag)}
          </div>
          <div class="small text-muted">
            Stage: <b>${esc(stage)}</b>
          </div>
          <div class="small text-muted">
            Last update: <b>${esc(fmtDate(date))}</b>
          </div>
        </div>

        <div class="d-flex flex-column align-items-end gap-2">
          ${selectionStatusChipHtml(currentDecision)}
          ${badge(recObj.label, recObj.variant)}
        </div>
      </div>

      <hr class="my-3"/>

      <div class="px-3 py-2 rounded-3 border ${
        fallbackSug.badge.variant === "danger"
          ? "bg-danger-subtle border-danger-subtle text-danger"
          : fallbackSug.badge.variant === "success"
          ? "bg-success-subtle border-success-subtle text-success"
          : "bg-warning-subtle border-warning-subtle text-dark"
      }">
        <div class="fw-semibold small">
          <i class="bi bi-lightbulb me-1"></i>${esc(fallbackSug.text)}
        </div>
      </div>

      <div class="d-flex justify-content-end mt-3">
        <div class="repro-action-row d-flex gap-2 flex-wrap">
          ${
            decisionLocked
              ? `
                <div class="px-3 py-2 rounded-3 border bg-light">
                  <div class="small text-muted d-flex align-items-center gap-2">
                    <i class="bi bi-lock-fill"></i>
                    <span>
                      Decision submitted${
                        decisionText ? `: <b>${esc(decisionText)}</b>` : ""
                      }.
                    </span>
                  </div>
                </div>
              `
              : `
                <button
                  type="button"
                  class="btn btn-success btn-sm"
                  ${!canAct ? "disabled" : ""}
                  onclick="processPigletAction('${esc(actionSwineId)}','breeding')"
                >
                  <i class="bi bi-check-circle me-1"></i> Retain
                </button>

                <button
                  type="button"
                  class="btn btn-outline-danger btn-sm"
                  ${!canAct ? "disabled" : ""}
                  onclick="processPigletAction('${esc(actionSwineId)}','sell')"
                >
                  <i class="bi bi-tag-fill me-1"></i> Sell
                </button>
              `
          }
        </div>
      </div>

      <div class="text-muted small mt-2">
        Actions update selection status for this piglet.
        ${
          !canAct
            ? `
            <div class="text-warning small mt-1">
              Note: Unable to resolve this piglet's Mongo ID.
              Ensure <code>/api/swine/all</code> returns <code>_id</code>
              and this piglet exists in Swine collection.
            </div>
          `
            : ""
        }
      </div>
    `;
  }

  function renderPigletGrowthDetail(pigletTag) {
    const mount = document.getElementById("growthDetailMount");
    if (!mount) return;

    const history = repo.getMorphHistoryForPiglet(pigletTag);
    const deformities = repo.getDeformitiesForPiglet(pigletTag);

    const points = history
      .map((h) => ({ x: h.date, y: Number(h.weight || 0) }))
      .filter((p) => p.x && Number.isFinite(p.y))
      .sort((a, b) => new Date(a.x) - new Date(b.x));

    const first = points[0];
    const last = points[points.length - 1];
    const delta = first && last ? (last.y - first.y).toFixed(1) : "0.0";

    mount.innerHTML = `
      <div class="d-flex align-items-start justify-content-between gap-2 flex-wrap">
        <div class="min-w-0">
          <div class="fw-bold text-truncate"><i class="bi bi-tag me-1"></i>${esc(pigletTag)}</div>
          <div class="small text-muted">Entries: <b>${points.length}</b></div>
        </div>
        ${
          first && last
            ? `<div class="text-end">
                 <div class="small text-muted">${esc(fmtShortDate(first.x))} → ${esc(fmtShortDate(last.x))}</div>
                 <div class="badge bg-success-subtle text-success border">Δ ${esc(delta)} kg</div>
               </div>`
            : `<div class="small text-muted">No weight summary.</div>`
        }
      </div>

      <div class="mt-3">
        <canvas id="growthChartCanvas" style="width:100%; height:240px;" height="240"></canvas>
      </div>

      <hr class="my-3"/>

      <div class="fw-bold mb-2"><i class="bi bi-exclamation-triangle me-1"></i> Deformities</div>
      ${
        deformities.length
          ? deformities
              .map(
                (d) => `
            <div class="repro-alert-item">
              <div class="fw-semibold">${esc(d.swine_tag)}</div>
              <div class="small text-muted">${esc(d.deformity_types || "N/A")}</div>
            </div>`
              )
              .join("")
          : `<div class="text-success small"><i class="bi bi-check-circle me-1"></i>No deformities found.</div>`
      }
    `;

    ui.drawAreaLineChart("growthChartCanvas", points);
  }

  function renderCyclePanel(sowId, cycleId, keepTabTarget = null) {
    const mount = document.getElementById("cyclePanelMount");
    if (!mount) return;

    const cycles = getCyclesForSowSafe(sowId);
    const cycle = cycles.find((c) => String(c.id) === String(cycleId));
    if (!cycle) {
      mount.innerHTML = `<div class="text-muted small">Cycle not found.</div>`;
      return;
    }

    const piglets = repo.getPigletsForSow(sowId);

    const target = keepTabTarget || getCurrentActiveCycleTabTarget();
    setCycleTabTarget(target);

    const isActive = (t) => String(target) === String(t);
    const tabBtnClass = (t) => `nav-link${isActive(t) ? " active" : ""}`;
    const tabPaneClass = (t) => `tab-pane fade${isActive(t) ? " show active" : ""}`;

    mount.innerHTML = `
      <div class="card repro-subcard shadow-sm border-0">
        <div class="card-body">
          <div class="fw-bold">
            <i class="bi bi-folder2-open me-1"></i> Cycle • ${esc(fmtDate(cycle.date))}
          </div>
          <div class="small text-muted">
            Boar: <b>${esc(cycle.boarCode || "N/A")}</b> • ${badge(cycle.status || "Recorded")}
          </div>

          <ul class="nav nav-tabs mt-3 repro-tabs" role="tablist">
            <li class="nav-item" role="presentation">
              <button class="${tabBtnClass("#cycleAI")}" data-bs-toggle="tab" data-bs-target="#cycleAI" type="button" role="tab">
                <i class="bi bi-journal-text me-1"></i> Artificial Insemination Record
              </button>
            </li>
            <li class="nav-item" role="presentation">
              <button class="${tabBtnClass("#cyclePerf")}" data-bs-toggle="tab" data-bs-target="#cyclePerf" type="button" role="tab">
                <i class="bi bi-bar-chart-line me-1"></i> Breeding Performance
              </button>
            </li>
            <li class="nav-item" role="presentation">
              <button class="${tabBtnClass("#cycleGrowth")}" data-bs-toggle="tab" data-bs-target="#cycleGrowth" type="button" role="tab">
                <i class="bi bi-graph-up-arrow me-1"></i> Growth Monitoring
              </button>
            </li>
            <li class="nav-item" role="presentation">
              <button class="${tabBtnClass("#cycleSelect")}" data-bs-toggle="tab" data-bs-target="#cycleSelect" type="button" role="tab">
                <i class="bi bi-check2-circle me-1"></i> Selection Process
              </button>
            </li>
          </ul>

          <div class="tab-content pt-3">
            <div class="${tabPaneClass("#cycleAI")}" id="cycleAI" role="tabpanel">
              ${renderCycleAIRecord(sowId, cycle)}
            </div>
            <div class="${tabPaneClass("#cyclePerf")}" id="cyclePerf" role="tabpanel">
              ${renderCyclePerformance(sowId, piglets)}
            </div>
            <div class="${tabPaneClass("#cycleGrowth")}" id="cycleGrowth" role="tabpanel">
              ${renderCycleGrowth(sowId, piglets)}
            </div>
            <div class="${tabPaneClass("#cycleSelect")}" id="cycleSelect" role="tabpanel">
              ${renderCycleSelection(sowId, piglets)}
            </div>
          </div>
        </div>
      </div>
    `;

    if (isActive("#cycleGrowth") && state.growthView === "detail" && state.selectedPigletTagForGrowth) {
      setTimeout(() => renderPigletGrowthDetail(state.selectedPigletTagForGrowth), 0);
    }
    if (isActive("#cycleSelect") && state.selectionView === "detail" && state.selectedPigletTagForSelection) {
      setTimeout(() => renderPigletSelectionDetail(state.selectedPigletTagForSelection), 0);
    }
  }

  // ---------------------------------------------------------
  // Main panel (sow modal content)
  // ---------------------------------------------------------
  function renderSowPanel(sowId, mountEl) {
    const mount = mountEl || state.getPanelMount();
    if (!mount) return;

    const s = repo.store.sowMap.get(sowId);
    if (!s) {
      mount.innerHTML = `<div class="text-muted small">Sow not found.</div>`;
      return;
    }

    const stage = s?.age_stage || s?.current_status || s?.current_stage || "N/A";
    const breed = s?.breed || "N/A";
    const dob = s?.birth_date ? fmtDate(s.birth_date) : "N/A";
    const stats = repo.computeBreedingStatsForSow(sowId);

    const sowObj = getSowByIdOrTag(sowId) || s;

    const hs = sowObj?.health_status || "N/A";
    const cs = sowObj?.current_status || sowObj?.current_stage || sowObj?.age_stage || stage || "N/A";
    const parity = Number.isFinite(Number(sowObj?.parity)) ? Number(sowObj.parity) : "N/A";
    const sex = sowObj?.sex ? sexLabel(sowObj.sex) : "N/A";

    const latestPerf = getLatestPerf(sowObj);
    const latestDate = latestPerf?.record_date || latestPerf?.date || latestPerf?.createdAt || null;

    const latestWeight = latestPerf?.weight ?? null;
    const latestBodyLength = latestPerf?.body_length ?? null;
    const latestHeartGirth = latestPerf?.heart_girth ?? null;
    const latestTeat = latestPerf?.teat_count ?? null;
    const latestTeeth = latestPerf?.teeth_count ?? latestPerf?.teeth ?? null;

    mount.innerHTML = `
      <div class="card shadow-sm repro-panel-card border-0">
        <div class="card-body">
          <div class="d-flex align-items-start justify-content-between gap-2 flex-wrap">
            <div class="min-w-0">
              <div class="d-flex align-items-center gap-2">
                <span class="repro-pill lg"><i class="bi bi-heart-pulse"></i></span>
                <div>
                  <h5 class="mb-0 text-truncate">${esc(sowId)}</h5>
                  <div class="small text-muted text-truncate">
                    Stage: <b>${esc(stage)}</b> • Breed: <b>${esc(breed)}</b> • DOB: ${esc(dob)}
                  </div>
                </div>
              </div>
            </div>
            <div class="d-flex gap-2">
              <span class="badge bg-success-subtle text-success border">Alive: <b>${stats.aliveMale + stats.aliveFemale}</b></span>
              <span class="badge bg-danger-subtle text-danger border">Dead: <b>${stats.deceased}</b></span>
            </div>
          </div>

          <hr class="my-3"/>

          <ul class="nav nav-pills repro-pills" role="tablist">
            <li class="nav-item" role="presentation">
              <button class="nav-link active" data-bs-toggle="pill" data-bs-target="#tabOverview" type="button" role="tab">
                <i class="bi bi-clipboard-data me-1"></i> Overview
              </button>
            </li>
            <li class="nav-item" role="presentation">
              <button class="nav-link" data-bs-toggle="pill" data-bs-target="#tabReproduction" type="button" role="tab">
                <i class="bi bi-diagram-3 me-1"></i> Reproduction
              </button>
            </li>
          </ul>

          <div class="tab-content mt-3">
            <div class="tab-pane fade show active" id="tabOverview" role="tabpanel">
              <div class="row g-3">

                <div class="col-12 col-lg-4">
                  <div class="card repro-subcard h-100 shadow-sm border-0">
                    <div class="card-body">
                      <div class="fw-bold mb-2"><i class="bi bi-clipboard-heart me-1"></i> Sow Information</div>

                      <div class="small text-muted">Current Status</div>
                      <div class="fw-semibold">${esc(cs)}</div>

                      <div class="small text-muted mt-2">Health</div>
                      <div class="fw-semibold">${esc(hs)}</div>

                      <div class="small text-muted mt-2">Sex</div>
                      <div class="fw-semibold">${esc(sex)}</div>

                      <div class="small text-muted mt-2">Parity</div>
                      <div class="fw-semibold">${esc(parity)}</div>
                    </div>
                  </div>
                </div>

                <div class="col-12 col-lg-8">
                  <div class="card repro-subcard h-100 shadow-sm border-0">
                    <div class="card-body">
                      <div class="fw-bold mb-2"><i class="bi bi-rulers me-1"></i> Latest Measurements</div>

                      <div class="small text-muted mb-2">
                        Last record: <b>${esc(fmtDate(latestDate))}</b>
                      </div>

                      <div class="row g-2">
                        <div class="col-6 col-md-4">
                          <div class="repro-mini-stat">
                            <div class="small text-muted">Weight</div>
                            <div class="fw-bold">${latestWeight != null ? esc(latestWeight) + " kg" : "N/A"}</div>
                          </div>
                        </div>

                        <div class="col-6 col-md-4">
                          <div class="repro-mini-stat">
                            <div class="small text-muted">Body Length</div>
                            <div class="fw-bold">${latestBodyLength != null ? esc(latestBodyLength) + " cm" : "N/A"}</div>
                          </div>
                        </div>

                        <div class="col-6 col-md-4">
                          <div class="repro-mini-stat">
                            <div class="small text-muted">Heart Girth</div>
                            <div class="fw-bold">${latestHeartGirth != null ? esc(latestHeartGirth) + " cm" : "N/A"}</div>
                          </div>
                        </div>

                        <div class="col-6 col-md-4">
                          <div class="repro-mini-stat">
                            <div class="small text-muted">Teat Count</div>
                            <div class="fw-bold">${latestTeat != null ? esc(latestTeat) : "N/A"}</div>
                          </div>
                        </div>

                        <div class="col-12 col-md-8">
                          <div class="repro-mini-stat">
                            <div class="small text-muted">Teeth</div>
                            <div class="fw-bold">${latestTeeth != null ? esc(latestTeeth) : "N/A"}</div>
                          </div>
                        </div>
                      </div>

                      <div class="text-muted small mt-3">
                        Measurements are pulled from the latest <code>performance_records</code> entry (if available).
                      </div>
                    </div>
                  </div>
                </div>

                <div class="col-12 col-lg-4">
                  <div class="card repro-subcard h-100 shadow-sm border-0">
                    <div class="card-body">
                      <div class="small text-muted mb-1">Piglet Summary</div>
                      <div class="d-flex gap-2 flex-wrap">
                        <span class="badge bg-success-subtle text-success border">Alive Male: <b>${stats.aliveMale}</b></span>
                        <span class="badge bg-success-subtle text-success border">Alive Female: <b>${stats.aliveFemale}</b></span>
                        <span class="badge bg-danger-subtle text-danger border">Dead: <b>${stats.deceased}</b></span>
                      </div>
                      <div class="small text-muted mt-2">
                        Total piglets recorded: <b>${stats.total}</b>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="col-12 col-lg-8">
                  <div class="card repro-subcard h-100 shadow-sm border-0">
                    <div class="card-body">
                      <div class="small text-muted mb-1">Quick Actions</div>
                      <div class="d-flex flex-wrap gap-2">
                        <button class="btn btn-outline-success btn-sm" data-act="jumpRepro">
                          <i class="bi bi-arrow-down-right-circle me-1"></i> View Cycles
                        </button>
                        <button class="btn btn-outline-success btn-sm" data-act="jumpSelection">
                          <i class="bi bi-check2-square me-1"></i> Selection Process
                        </button>
                      </div>
                      <div class="text-muted small mt-2">
                        Use the Reproduction tab to open a cycle and manage piglets.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="tab-pane fade" id="tabReproduction" role="tabpanel">
              <div id="reproReproMount"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    renderReproTabInto(mount);
  }

  return {
    renderListLoading,
    renderListError,
    renderListNoData,
    renderSowCards,

    getCyclesForSowSafe,
    renderReproTabInto,
    renderCyclePanel,

    renderSowPanel,

    renderPigletGrowthDetail,
    renderPigletSelectionDetail: renderPigletSelectionDetail, // keep export name
    renderPigletSelectionDetail,

    setCycleTabTarget,
  };
}