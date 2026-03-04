// /js/reproduction/reproduction.views.js

export function createReproViews({ repo, state, ui }) {
  const { esc, fmtDate, fmtShortDate, badge, sexLabel, normSex } = ui;

  /* =========================================================
     MODULE: Internal Render Cache
     PURPOSE: Prevent unnecessary re-rendering when state keys
              have not changed (improves responsiveness).
  ========================================================= */
  const renderCache = (state._reproRenderCache ||= {
    sowShellKey: "",
    reproTabKey: "",
    cyclePanelKey: "",
    pigletCtxKey: "",
    pigletMaps: null,
  });

  /* =========================================================
     MODULE: Selection / Piglet Utility Helpers
     PURPOSE: Normalize and resolve identifiers and statuses.
  ========================================================= */
  function norm(v) {
    return String(v ?? "").trim();
  }
  function normLower(v) {
    return norm(v).toLowerCase();
  }
  function toKey(v) {
    return v == null ? "" : String(v).trim();
  }
  function isObjectId(v) {
    return /^[a-f\d]{24}$/i.test(String(v || ""));
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

  function pigletTagOf(p) {
    return toKey(p?.swine_tag || p?.swine_id || p?.tag || "");
  }

  function resolveMongoIdForTag(tag) {
    const t = toKey(tag);
    if (!t) return "";

    const fromRepo = toKey(repo.getMongoIdForSwineTag?.(t) || "");
    if (isObjectId(fromRepo)) return fromRepo;

    const sw = findSwineByTag(t);
    const fromSw = toKey(sw?._id || sw?.id || sw?.mongoId || "");
    if (isObjectId(fromSw)) return fromSw;

    const mon = findMonitoringRow(t);
    const fromMon = toKey(mon?._id || mon?.swine_mongo_id || mon?.swineId || "");
    if (isObjectId(fromMon)) return fromMon;

    return "";
  }

  function resolvePigletDecisionKeyFromTag(tag) {
    const t = toKey(tag);
    if (!t) return "";
    if (isObjectId(t)) return t;
    const mongoId = resolveMongoIdForTag(t);
    return mongoId || t;
  }

  function resolvePigletDecisionKeyFromPiglet(p) {
    const direct = toKey(p?._id || p?.id || p?.mongoId || "");
    if (isObjectId(direct)) return direct;
    const tag = pigletTagOf(p);
    return resolvePigletDecisionKeyFromTag(tag);
  }

  function getPigletDisplayStatus(tag) {
    const sw = findSwineByTag(tag);

    const swStatus = norm(sw?.current_status);
    const swStatusLower = normLower(swStatus);
    const swStageLower = normLower(sw?.age_stage);

    const isFinalDecision =
      swStageLower === "adult" ||
      swStatusLower === "active" ||
      swStatusLower.includes("culled") ||
      swStatusLower.includes("sold") ||
      swStatusLower.includes("inactive") ||
      swStatusLower.includes("marked for sale");

    if (isFinalDecision && swStatus) return swStatus;

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
    if (s.includes("final selection")) return "success";
    if (s.includes("retain") || s.includes("breeding") || s.includes("keep")) return "success";
    if (s.includes("sell") || s.includes("sale") || s.includes("market") || s.includes("cull") || s.includes("sold"))
      return "danger";
    if (s.includes("pending") || s.includes("review") || s.includes("monitor")) return "warning";
    return "light";
  }

  function statusChipHtml(statusText) {
    const st = norm(statusText) || "Monitoring (Day 1-30)";
    const v = statusVariant(st);

    if (v === "success")
      return `<span class="repro-chip bg-success-subtle text-success border border-success-subtle"><i class="bi bi-check-circle me-1"></i><b>${esc(
        st
      )}</b></span>`;
    if (v === "danger")
      return `<span class="repro-chip bg-danger-subtle text-danger border border-danger-subtle"><i class="bi bi-x-circle me-1"></i><b>${esc(
        st
      )}</b></span>`;
    if (v === "warning")
      return `<span class="repro-chip bg-warning-subtle text-dark border border-warning-subtle"><i class="bi bi-hourglass-split me-1"></i><b>${esc(
        st
      )}</b></span>`;
    return `<span class="repro-chip bg-light text-dark border"><i class="bi bi-info-circle me-1"></i><b>${esc(
      st
    )}</b></span>`;
  }

  function decisionFromSelectionRow(selRow) {
    const raw = String(selRow?.recommendation || selRow?.decision || selRow?.status || "").toLowerCase();
    if (!raw) return "";
    if (raw.includes("retain") || raw.includes("keep") || raw.includes("breeding")) return "retain";
    if (raw.includes("sell") || raw.includes("sale") || raw.includes("market")) return "sell";
    if (raw.includes("pending")) return "pending";
    return "";
  }

  function findSwineByMongoId(id) {
    const k = toKey(id);
    if (!k) return null;
    return (repo.store.allSwineData || []).find((s) => toKey(s?._id) === k || toKey(s?.id) === k) || null;
  }

  function decisionFromSwineStatus(sw) {
    const st = normLower(sw?.current_status || "");
    const stage = normLower(sw?.age_stage || "");

    if (st === "active" || st.includes("active breeder") || st.includes("breeding") || st.includes("breeder")) {
      return "retain";
    }

    if (
      st.includes("culled") ||
      st.includes("sold") ||
      st.includes("marked for sale") ||
      st.includes("sale") ||
      st.includes("market")
    ) {
      return "sell";
    }

    if (stage === "adult" && st) {
      if (!st.includes("sold") && !st.includes("culled") && !st.includes("marked for sale")) return "retain";
    }

    return "";
  }

  function getPigletDecision(pigletTagOrId) {
    const rawKey = toKey(pigletTagOrId);
    if (!rawKey) return { key: "", decision: "pending", locked: false, source: "default" };

    const isId = isObjectId(rawKey);

    if (isId) {
      const local = state.localSelectionLock?.get(rawKey) || null;
      if (local === "breeding") return { key: rawKey, decision: "retain", locked: true, source: "local" };
      if (local === "sell") return { key: rawKey, decision: "sell", locked: true, source: "local" };

      const sw = findSwineByMongoId(rawKey);
      const ds = sw ? decisionFromSwineStatus(sw) : "";
      if (ds) return { key: rawKey, decision: ds, locked: true, source: "swine" };
    }

    const tag = isId ? "" : rawKey;
    if (tag) {
      const sel = repo.getSelectionForPiglet?.(tag) || null;
      const d1 = sel ? decisionFromSelectionRow(sel) : "";
      if (d1) return { key: tag, decision: d1, locked: d1 !== "pending", source: "db" };

      const sw = findSwineByTag(tag);
      const ds = sw ? decisionFromSwineStatus(sw) : "";
      if (ds) return { key: tag, decision: ds, locked: true, source: "swine" };
    }

    const mongoId = isId ? rawKey : toKey(repo.getMongoIdForSwineTag?.(rawKey) || "");
    if (mongoId) {
      const local = state.localSelectionLock?.get(mongoId) || null;
      if (local === "breeding") return { key: mongoId, decision: "retain", locked: true, source: "local" };
      if (local === "sell") return { key: mongoId, decision: "sell", locked: true, source: "local" };

      const sw = findSwineByMongoId(mongoId);
      const ds = sw ? decisionFromSwineStatus(sw) : "";
      if (ds) return { key: mongoId, decision: ds, locked: true, source: "swine" };
    }

    return { key: mongoId || rawKey, decision: "pending", locked: false, source: "default" };
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

  function computeSelectionSummaryForPigletsFromList(piglets) {
    const sum = { total: 0, retain: 0, sell: 0, pending: 0 };
    const list = Array.isArray(piglets) ? piglets : [];
    for (const p of list) {
      const key = resolvePigletDecisionKeyFromPiglet(p);
      const d = getPigletDecision(key).decision;
      sum.total += 1;
      if (d === "retain") sum.retain += 1;
      else if (d === "sell") sum.sell += 1;
      else sum.pending += 1;
    }
    return sum;
  }

  /* =========================================================
     MODULE: Shared Small Helpers
     PURPOSE: Common utilities used across render functions.
  ========================================================= */
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

  /* =========================================================
     MODULE: Fast Piglet Maps
     PURPOSE: Speed up list rendering (deformity counts, latest morph).
  ========================================================= */
  function buildPigletMaps(piglets) {
    const list = Array.isArray(piglets) ? piglets : [];
    const tagSet = new Set(list.map((p) => pigletTagOf(p)).filter(Boolean));

    const defCount = new Map();
    const defs = repo.store?.rawPerformanceData?.deformities || [];
    for (const d of defs) {
      const tag = toKey(d?.swine_tag || d?.tag || "");
      if (!tag || !tagSet.has(tag)) continue;
      defCount.set(tag, (defCount.get(tag) || 0) + 1);
    }

    const latestMorph = new Map();
    const morphRows = repo.store?.rawPerformanceData?.morphology || [];
    for (const row of morphRows) {
      const tag = toKey(row?.swine_tag || "");
      if (!tag || !tagSet.has(tag)) continue;

      const date = row?.morphology?.date || row?.createdAt || null;
      const when = date ? new Date(date).getTime() : 0;
      const prev = latestMorph.get(tag);
      const prevWhen = prev?.__when || 0;

      if (!prev || when >= prevWhen) {
        latestMorph.set(tag, {
          __when: when,
          date,
          weight: Number(row?.morphology?.weight || 0),
          stage: row?.morphology?.stage || "N/A",
        });
      }
    }

    return { defCount, latestMorph };
  }

  function ensurePigletMapsForCycle(sowId, cycleId, piglets) {
    const key = `${String(sowId || "")}|${String(cycleId || "")}`;
    if (renderCache.pigletCtxKey === key && renderCache.pigletMaps) return renderCache.pigletMaps;
    const maps = buildPigletMaps(piglets);
    renderCache.pigletCtxKey = key;
    renderCache.pigletMaps = maps;
    return maps;
  }

  function quickSuggestionForList(tag, pigletObj, maps) {
    const hs = String(pigletObj?.health_status || "").toLowerCase();
    if (hs.includes("deceased") || hs.includes("dead")) {
      return { variant: "danger", text: "System Suggestion: No action (piglet is marked deceased)." };
    }
    const cnt = maps?.defCount?.get?.(toKey(tag)) || 0;
    if (cnt > 0) {
      return { variant: "danger", text: "System Suggestion: Mark for sale (deformity detected)." };
    }
    return { variant: "warning", text: "System Suggestion: Continue monitoring and record growth updates." };
  }

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

  function filterPigletsByDecision(piglets, decisionFilter) {
    const f = String(decisionFilter || "all").toLowerCase();
    if (f === "all") return piglets;
    const list = Array.isArray(piglets) ? piglets : [];
    return list.filter((p) => {
      const key = resolvePigletDecisionKeyFromPiglet(p);
      const d = getPigletDecision(key).decision;
      return d === f;
    });
  }

  /* =========================================================
     MODULE: Sow Helpers
     PURPOSE: Pull sow + latest performance safely.
  ========================================================= */
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

  /* =========================================================
     MODULE: Left List Rendering (Sow list)
     PURPOSE: List, pagination, and empty/error states.
  ========================================================= */
  function renderListLoading() {
    state.dom.sowCardsWrap.innerHTML = `
      <div class="vstack gap-3">
        <div class="card repro-subcard shadow-sm border-0 repro-skel-card">
          <div class="card-body">
            <div class="d-flex align-items-start justify-content-between gap-3">
              <div class="min-w-0 w-100">
                <div class="d-flex align-items-center gap-2">
                  <span class="repro-pill"><i class="bi bi-heart-pulse"></i></span>
                  <div class="min-w-0 w-100">
                    <div class="repro-skel-line skel-title"></div>
                    <div class="repro-skel-line skel-sub"></div>
                  </div>
                </div>
                <div class="d-flex flex-wrap gap-2 mt-2">
                  <span class="repro-skel-pill"></span>
                  <span class="repro-skel-pill w-25"></span>
                </div>
              </div>

              <div class="text-end flex-shrink-0" style="min-width: 90px;">
                <div class="repro-skel-line skel-mini"></div>
                <div class="repro-skel-line skel-num"></div>
                <div class="repro-skel-line skel-mini"></div>
              </div>
            </div>

            <div class="mt-2 d-flex justify-content-end">
              <div class="repro-skel-btn"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    state.dom.sowPager.innerHTML = `
      <div class="small text-muted text-center py-2">
        <span class="spinner-border spinner-border-sm text-success me-2" role="status" aria-hidden="true"></span>
        Loading sows...
      </div>
    `;
  }

  function renderListError(
    message = "Unable to load your swine data",
    sub = "Your session may have expired, or the server failed to respond."
  ) {
    state.dom.sowCardsWrap.innerHTML = `
      <div class="text-center text-muted py-4">
        <div class="mb-2"><i class="bi bi-wifi-off fs-3"></i></div>
        <div class="fw-bold">${esc(message)}</div>
        <div class="small">${esc(sub)}</div>
        <div class="d-flex justify-content-center gap-2 mt-3 flex-wrap">
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
    const status = String(state.sowStatus || "all").trim().toLowerCase();
    const list = repo.store.sows || [];

    function normStage(s) {
      // Combine fields because backend strings vary by endpoint/schema
      const parts = [
        s?.current_status,
        s?.current_stage,
        s?.age_stage,
        s?.reproductive_status,
        s?.pregnancy_status,
        s?.cycle_status,
        s?.status,
      ]
        .map((v) => String(v ?? "").trim())
        .filter(Boolean);

      return parts.join(" ").toLowerCase();
    }

    // Status matching for sow filters (value from #reproStatusFilter)
    function matchesStatus(stageText, statusKey) {
      if (statusKey === "all") return true;

      // Normalize both sides
      const st = String(stageText || "").toLowerCase();
      const key = String(statusKey || "").toLowerCase();

      // Open sows: accept explicit "open" plus adult/breeder-like stages,
      // but exclude pregnant/lactating/heat/farrow/wean/observation.
      if (key === "open_sows") {
        const isOpenish =
          st.includes("open") ||
          st.includes("adult") ||
          st.includes("sow") ||
          st.includes("breeder") ||
          st.includes("active");

        const excluded =
          st.includes("preg") ||
          st.includes("lact") ||
          st.includes("farrow") ||
          st.includes("wean") ||
          st.includes("heat") ||
          st.includes("estrus") ||
          st.includes("observation") ||
          st.includes("under_observation");

        return isOpenish && !excluded;
      }

      // In-heat
      if (key === "in_heat") {
        return st.includes("in-heat") || st.includes("in heat") || st.includes("heat") || st.includes("estrus");
      }

      // Under observation
      if (key === "under_observation") {
        return st.includes("under_observation") || st.includes("under observation") || st.includes("observation");
      }

      // Pregnant
      if (key === "pregnant") return st.includes("preg");

      // Farrowing
      if (key === "farrowing") return st.includes("farrow");

      // Lactating (your dropdown shows this)
      if (key === "lactating") return st.includes("lact");

      // Weaning
      if (key === "weaning") return st.includes("wean") || st.includes("weaning") || st.includes("weaned");

      // Fallback: try direct contains match for unexpected keys
      return st.includes(key);
    }

    return list.filter((s) => {
      const sowId = (s?.swine_id || s?.swine_tag || s?.tag || "").toLowerCase();
      const st = normStage(s);

      const termOk = !term || sowId.includes(term) || st.includes(term);
      const statusOk = matchesStatus(st, status);

      return termOk && statusOk;
    });
  }

  function renderSowPagination(meta) {
    state.dom.sowPager.innerHTML = `
      <div class="repro-pager-compact">
        <button class="btn btn-sm btn-outline-success" ${meta.page <= 1 ? "disabled" : ""} data-act="sowPrev">
          <i class="bi bi-chevron-left"></i><span class="ms-1">Prev</span>
        </button>

        <div class="small text-muted text-center">
          Page <b>${meta.page}</b> of <b>${meta.pages}</b>
          <span class="d-none d-sm-inline"> • <b>${meta.total}</b> sows</span>
        </div>

        <button class="btn btn-sm btn-outline-success" ${meta.page >= meta.pages ? "disabled" : ""} data-act="sowNext">
          <span class="me-1">Next</span><i class="bi bi-chevron-right"></i>
        </button>
      </div>
    `;
  }

  function sowCardHtml(s) {
    const sowId = s?.swine_id || s?.swine_tag || s?.tag || "N/A";

    const rawStatus = s?.current_status || s?.current_stage || s?.age_stage || "";
    const statusLower = String(rawStatus || "").toLowerCase();

    const breed = s?.breed || "N/A";

    const stats = repo.computeBreedingStatsForSow(sowId);
    const totalPiglets = Number(stats?.total || 0);
    const totalAlive = Number((stats?.aliveMale || 0) + (stats?.aliveFemale || 0));
    const totalDead = Number(stats?.deceased || 0);

    const cycles = repo.getCyclesForSow ? (repo.getCyclesForSow(sowId) || []) : [];
    const latestCycle = cycles.length ? cycles[0] : null;
    const lastAI = latestCycle?.date ? fmtDate(latestCycle.date) : "N/A";

    function phaseInfo() {
      if (statusLower.includes("preg")) return { label: "Pregnant", variant: "info", icon: "bi bi-heart-fill" };
      if (statusLower.includes("farrow")) return { label: "Farrowing", variant: "warning", icon: "bi bi-box2-heart" };
      if (statusLower.includes("lact")) return { label: "Lactating", variant: "success", icon: "bi bi-droplet-half" };
      if (statusLower.includes("wean")) return { label: "Weaning", variant: "warning", icon: "bi bi-arrow-down-circle" };
      if (statusLower.includes("under_observation") || statusLower.includes("observation"))
        return { label: "Under observation", variant: "warning", icon: "bi bi-eye" };
      if (statusLower.includes("heat") || statusLower.includes("estrus"))
        return { label: "In-heat", variant: "danger", icon: "bi bi-lightning-charge" };

      return { label: "Open", variant: "light", icon: "bi bi-check2-circle" };
    }

    const ph = phaseInfo();

    const phaseBadge =
      ph.variant === "info"
        ? "badge bg-info text-dark"
        : ph.variant === "warning"
        ? "badge bg-warning text-dark"
        : ph.variant === "danger"
        ? "badge bg-danger"
        : ph.variant === "success"
        ? "badge bg-success"
        : "badge bg-light text-dark border";

    const isActive = state.activeSowId && state.activeSowId === sowId;

    return `
      <div class="repro-card card border-0 ${isActive ? "repro-card-active" : ""}">
        <div class="card-body">
          <div class="d-flex align-items-start justify-content-between gap-3">
            <div class="min-w-0">
              <div class="d-flex align-items-center gap-2">
                <span class="repro-pill"><i class="bi bi-heart-pulse"></i></span>
                <div class="min-w-0">
                  <div class="fw-bold text-truncate">${esc(sowId)}</div>
                  <div class="small text-muted text-truncate">${esc(breed)}</div>
                </div>
              </div>

              <div class="d-flex flex-wrap gap-2 mt-2">
                <span class="${phaseBadge}">
                  <i class="${esc(ph.icon)} me-1"></i>${esc(ph.label)}
                </span>

                <span class="badge bg-light text-dark border">
                  <i class="bi bi-calendar-event me-1"></i>Last AI: <b>${esc(lastAI)}</b>
                </span>
              </div>
            </div>

            <div class="text-end flex-shrink-0">
              <div class="small text-muted">Piglets</div>
              <div class="fw-bold">${totalPiglets}</div>
              <div class="small text-muted">
                <span class="text-success fw-semibold">${totalAlive}</span> alive
                <span class="mx-1">•</span>
                <span class="text-danger fw-semibold">${totalDead}</span> dead
              </div>
            </div>
          </div>

          <div class="mt-2 d-flex justify-content-end">
            <button class="btn btn-success btn-sm" data-act="openSow" data-sow="${esc(sowId)}">
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

  /* =========================================================
     MODULE: Cycles (Single Source of Truth)
     PURPOSE: Render cycle filter card + cycle list consistently.
     IMPORTANT: This replaces the duplicated functions that were
                overriding your "card" version of the filter.
  ========================================================= */
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
    if (state.cycleFilterId !== "all" && !ids.has(String(state.cycleFilterId))) state.cycleFilterId = "all";
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
          return `<option value="${esc(val)}"${String(state.cycleFilterId) === val ? " selected" : ""}>${esc(
            label
          )}</option>`;
        })
        .join("");

    /* The filter is a card so the UI matches the theme consistently */
    return `
      <div class="card repro-subcard shadow-sm border-0 repro-cycle-headcard">
        <div class="card-body">
          <div class="repro-cycle-head">
            <div class="min-w-0">
              <div class="d-flex align-items-center gap-2">
                <span class="repro-pill"><i class="bi bi-diagram-3"></i></span>
                <div class="min-w-0">
                  <div class="fw-bold text-truncate">Cycles</div>
                  <div class="small text-muted text-truncate">Choose a cycle to view records.</div>
                </div>
              </div>
            </div>

            <div class="repro-cycle-filter">
              <label class="small text-muted mb-1 d-block" for="cycleFilterSelect">Cycle</label>
              <select class="form-select form-select-sm w-100" id="cycleFilterSelect">
                ${opts}
              </select>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderCyclePager(meta) {
    return `
      <div class="repro-pager-compact mt-3">
        <button class="btn btn-sm btn-outline-success" ${meta.page <= 1 ? "disabled" : ""} data-act="cyclePrev">
          <i class="bi bi-chevron-left"></i><span class="ms-1">Prev</span>
        </button>

        <div class="small text-muted text-center">
          Page <b>${meta.page}</b> of <b>${meta.pages}</b>
          <span class="d-none d-sm-inline"> • <b>${meta.total}</b> cycles</span>
        </div>

        <button class="btn btn-sm btn-outline-success" ${meta.page >= meta.pages ? "disabled" : ""} data-act="cycleNext">
          <span class="me-1">Next</span><i class="bi bi-chevron-right"></i>
        </button>
      </div>
    `;
  }

  function cycleCardHtml(cycle, cycleNo, sowId) {
    const dateLabel = cycle?.date ? fmtDate(cycle.date) : "N/A";
    const boar = cycle?.boarCode || "N/A";
    const status = cycle?.status || "Recorded";
    const sLow = String(status || "").toLowerCase();

    const statusPill =
      sLow.includes("preg")
        ? `<span class="badge bg-info text-dark"><i class="bi bi-heart-fill me-1"></i>Pregnant</span>`
        : sLow.includes("success")
        ? `<span class="badge bg-success"><i class="bi bi-check-circle me-1"></i>Success</span>`
        : sLow.includes("fail")
        ? `<span class="badge bg-danger"><i class="bi bi-x-circle me-1"></i>Failed</span>`
        : `<span class="badge bg-light text-dark border"><i class="bi bi-info-circle me-1"></i>${esc(status)}</span>`;

    return `
      <div class="card repro-subcard shadow-sm border-0 repro-cycle-card">
        <div class="card-body">
          <div class="d-flex align-items-start justify-content-between gap-3 flex-wrap">
            <div class="min-w-0">
              <div class="d-flex align-items-center gap-2">
                <span class="repro-pill"><i class="bi bi-calendar2-week"></i></span>
                <div class="min-w-0">
                  <div class="fw-bold text-truncate">Cycle ${cycleNo}</div>
                  <div class="small text-muted text-truncate">Service Date: <b>${esc(dateLabel)}</b></div>
                  <div class="small text-muted text-truncate">Boar: <b>${esc(boar)}</b></div>
                </div>
              </div>
            </div>

            <div class="d-flex align-items-center gap-2 ms-auto">
              ${statusPill}
            </div>
          </div>

          <div class="d-flex justify-content-end mt-3">
            <button
              class="btn btn-success btn-sm repro-cycle-open"
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

  function renderCycleList(sowId) {
    const cyclesAll = getCyclesForSowSafe(sowId);
    if (!cyclesAll.length) {
      return `
        <div class="card repro-subcard shadow-sm border-0">
          <div class="card-body">
            <div class="text-muted small">
              <i class="bi bi-info-circle me-1"></i> No cycle records yet for this sow.
            </div>
          </div>
        </div>
      `;
    }

    const filtered = getFilteredCyclesForSow(sowId);
    const meta = paginate(filtered, state.cyclePage, state.CYCLE_PAGE_SIZE);
    state.cyclePage = meta.page;

    const baseIndexOffset = meta.items.length ? Math.max(0, filtered.indexOf(meta.items[0])) : 0;

    return `
      <div class="card repro-subcard shadow-sm border-0">
        <div class="card-body">

          <div class="mb-3">
            ${renderCycleFilterDropdown(sowId)}
          </div>

          <div class="vstack gap-3" id="cycleCardsWrap">
            ${
              meta.items.length
                ? meta.items.map((c, idx) => cycleCardHtml(c, baseIndexOffset + idx + 1, sowId)).join("")
                : `<div class="text-muted small"><i class="bi bi-info-circle me-1"></i>No cycles match.</div>`
            }
          </div>

          ${renderCyclePager(meta)}
        </div>
      </div>
    `;
  }

  /* =========================================================
     MODULE: Reproduction Tab Mount
     PURPOSE: Render cycle list or cycle detail panel.
  ========================================================= */
  function getReproTabMount(mountRoot) {
    return mountRoot?.querySelector?.("#reproReproMount") || document.getElementById("reproReproMount");
  }

  function renderReproTabBodyHtml(sowId) {
    if (state.cycleView !== "detail" || !state.activeCycleId) return renderCycleList(sowId);

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
      <!-- CYCLE DETAILS HEADER CARD -->
      <div class="card repro-subcard shadow-sm border-0 repro-cycle-detail-headcard">
        <div class="card-body">
          <div class="d-flex align-items-center justify-content-between gap-2 flex-wrap">
            <div class="min-w-0">
              <div class="fw-bold text-truncate d-flex align-items-center gap-2">
                <span class="repro-pill"><i class="bi bi-folder2-open"></i></span>
                <span>Cycle Details</span>
              </div>
              <div class="small text-muted text-truncate">AI record • performance • growth • selection</div>
            </div>

            <div class="repro-cycle-backwrap">
              <button type="button" class="btn btn-outline-success btn-sm repro-cycle-backbtn" data-act="${backAct}">
                <i class="bi bi-arrow-left me-1"></i> ${backLabel}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="my-3"></div>

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

    const key = [
      String(state.activeSowId || ""),
      String(state.cycleView || ""),
      String(state.activeCycleId || ""),
      String(state.cycleFilterId || ""),
      String(state.cyclePage || 1),
    ].join("|");

    if (renderCache.reproTabKey !== key) {
      renderCache.reproTabKey = key;
      m.innerHTML = renderReproTabBodyHtml(state.activeSowId);
    }

    if (state.cycleView === "detail" && state.activeCycleId) {
      renderCyclePanel(state.activeSowId, state.activeCycleId);
    }
  }

  /* =========================================================
     MODULE: Cycle Panel Tabs
     PURPOSE: Tab selection and detail rendering.
  ========================================================= */
  function getCurrentActiveCycleTabTarget() {
    const activeBtn = document.querySelector(".repro-tabs .nav-link.active");
    const t = activeBtn?.getAttribute("data-bs-target");
    if (t && state.CYCLE_TABS.includes(t)) return t;
    return state.activeCycleTabTarget || "#cycleAI";
  }

  function setCycleTabTarget(nextTarget) {
    if (nextTarget && state.CYCLE_TABS.includes(nextTarget)) state.activeCycleTabTarget = nextTarget;
  }

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
              <div class="fw-bold mb-2 d-flex align-items-center gap-2">
                <span class="repro-pill"><i class="bi bi-journal-text"></i></span>
                <span>Artificial Insemination Record</span>
              </div>

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
              <div class="fw-bold mb-2 d-flex align-items-center gap-2">
                <span class="repro-pill"><i class="bi bi-clipboard2-check"></i></span>
                <span>Service Details</span>
              </div>

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

    const rows = (Array.isArray(piglets) ? piglets : [])
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
              <div class="fw-bold mb-2 d-flex align-items-center gap-2">
                <span class="repro-pill"><i class="bi bi-list-ul"></i></span>
                <span>Piglets</span>
              </div>
              <div class="list-group list-group-flush repro-list">
                ${rows || `<div class="text-muted small">No piglets found for this sow.</div>`}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /* =========================================================
     MODULE: Piglet Cards / Pagers / Filters (Growth & Selection)
     PURPOSE: Shared rendering utilities for piglet lists.
  ========================================================= */
  function pigletCardHtml(p, ctx, maps) {
    const tag = p?.swine_id || p?.swine_tag || p?.tag || "N/A";
    const sex = sexLabel(p?.sex);
    const stage = p?.age_stage || p?.current_status || p?.current_stage || "N/A";
    const hs = p?.health_status || "N/A";
    const isDead = String(hs).toLowerCase().includes("deceased") || String(hs).toLowerCase().includes("dead");
    const btnAct = ctx === "growth" ? "openPigletGrowth" : "openPigletSelection";

    let statusChip = "";
    if (ctx === "selection") {
      const decisionKey = resolvePigletDecisionKeyFromTag(tag);
      const dec = getPigletDecision(decisionKey);
      statusChip = selectionStatusChipHtml(dec.decision);
    }

    const lifeBadge = isDead
      ? `<span class="badge bg-danger-subtle text-danger border border-danger-subtle"><i class="bi bi-x-circle me-1"></i>Deceased</span>`
      : `<span class="badge bg-success-subtle text-success border border-success-subtle"><i class="bi bi-check-circle me-1"></i>Alive</span>`;

    let suggestionHtml = "";
    if (ctx === "selection") {
      const quick = quickSuggestionForList(tag, p, maps);
      const sugBlockClass =
        quick.variant === "danger"
          ? "bg-danger-subtle border-danger-subtle text-danger"
          : quick.variant === "success"
          ? "bg-success-subtle border-success-subtle text-success"
          : "bg-warning-subtle border-warning-subtle text-dark";

      suggestionHtml = `
        <div class="px-3 py-2 rounded-3 border ${sugBlockClass}">
          <div class="fw-semibold small">
            <i class="bi bi-lightbulb me-1"></i>${esc(quick.text)}
          </div>
        </div>
      `;
    }

    return `
      <div class="card repro-subcard shadow-sm border-0">
        <div class="card-body d-flex flex-column gap-2">

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

          ${suggestionHtml}

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
      <div class="repro-pager">
        <button class="btn btn-sm btn-outline-success" ${meta.page <= 1 ? "disabled" : ""} data-act="${which}Prev">
          <i class="bi bi-chevron-left"></i>
        </button>
        <div class="small text-muted text-center">
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
      <div class="d-flex gap-2 flex-wrap justify-content-start justify-content-sm-end">
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

  function renderDecisionTabs(active, actName = "selDecisionTab") {
    const f = String(active || "all");
    const opts = [
      { k: "all", label: "All" },
      { k: "pending", label: "Pending" },
      { k: "sell", label: "Mark as Culled/Sale" },
      { k: "retain", label: "Retain" },
    ];
    return `
      <div class="repro-pills nav nav-pills gap-2 flex-wrap" id="selectionDecisionTabs">
        ${opts
          .map(
            (o) => `
          <button
            type="button"
            class="nav-link ${f === o.k ? "active" : ""}"
            data-act="${actName}"
            data-filter="${o.k}"
          >
            ${o.label}
          </button>
        `
          )
          .join("")}
      </div>
    `;
  }

  function renderCycleGrowth(sowId, piglets, maps) {
    const bySex = filterPigletsBySex(piglets, state.growthSexFilter);
    const filtered = filterPiglets(bySex, state.pigletGrowthFilter);
    const meta = paginate(filtered, state.pigletPageGrowth, state.PAGE_SIZE);
    state.pigletPageGrowth = meta.page;

    const listHtml = meta.items.map((p) => pigletCardHtml(p, "growth", maps)).join("");

    return `
      <div class="card repro-subcard shadow-sm border-0">
        <div class="card-body">
          ${
            state.growthView === "detail" && state.selectedPigletTagForGrowth
              ? `
                <div class="d-flex align-items-center justify-content-between gap-2 flex-wrap">
                  <div class="min-w-0">
                    <div class="fw-bold text-truncate d-flex align-items-center gap-2">
                      <span class="repro-pill"><i class="bi bi-activity"></i></span>
                      <span>Weight Trend</span>
                    </div>
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
                    <div class="fw-bold mb-1 d-flex align-items-center gap-2">
                      <span class="repro-pill"><i class="bi bi-graph-up-arrow"></i></span>
                      <span>Growth Monitoring</span>
                    </div>
                    <div class="text-muted small">Filter piglets, then open one to view chart and deformities.</div>
                  </div>

                  <div class="w-100 w-sm-auto text-start text-sm-end">
                    <div class="small text-muted mb-1">Sex Filter</div>
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

  function renderSelectionSummaryCards(piglets) {
    const list = Array.isArray(piglets) ? piglets : [];
    const sum = computeSelectionSummaryForPigletsFromList(list);

    return `
      <div class="row g-2 mt-2">
        <div class="col-6 col-md-3">
          <div class="card repro-stat h-100 shadow-sm border-0">
            <div class="card-body">
              <div class="small text-muted d-flex align-items-center gap-2">
                <i class="bi bi-collection"></i><span>Total</span>
              </div>
              <div class="h4 mb-0" id="selectionStatTotal">${sum.total}</div>
            </div>
          </div>
        </div>

        <div class="col-6 col-md-3">
          <div class="card repro-stat h-100 shadow-sm border-0">
            <div class="card-body">
              <div class="small text-muted d-flex align-items-center gap-2">
                <i class="bi bi-check-circle"></i><span>Retain</span>
              </div>
              <div class="h4 mb-0" id="selectionStatRetain">${sum.retain}</div>
            </div>
          </div>
        </div>

        <div class="col-6 col-md-3">
          <div class="card repro-stat-danger h-100 shadow-sm border-0">
            <div class="card-body">
              <div class="small text-muted d-flex align-items-center gap-2">
                <i class="bi bi-tag"></i><span>For Sale</span>
              </div>
              <div class="h4 mb-0" id="selectionStatSell">${sum.sell}</div>
            </div>
          </div>
        </div>

        <div class="col-6 col-md-3">
          <div class="card repro-stat h-100 shadow-sm border-0">
            <div class="card-body">
              <div class="small text-muted d-flex align-items-center gap-2">
                <i class="bi bi-hourglass-split"></i><span>Pending</span>
              </div>
              <div class="h4 mb-0" id="selectionStatPending">${sum.pending || 0}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderCycleSelection(sowId, piglets, maps) {
    state.selectionDecisionFilter = state.selectionDecisionFilter || "all";

    const bySex = filterPigletsBySex(piglets, state.selectionSexFilter);
    const filtered = filterPigletsByDecision(bySex, state.selectionDecisionFilter);

    const meta = paginate(filtered, state.pigletPageSelection, state.PAGE_SIZE);
    state.pigletPageSelection = meta.page;

    const listHtml = meta.items.map((p) => pigletCardHtml(p, "selection", maps)).join("");

    return `
      <div class="card repro-subcard shadow-sm border-0">
        <div class="card-body">
          ${
            state.selectionView === "detail" && state.selectedPigletTagForSelection
              ? `
                <div class="d-flex align-items-center justify-content-between gap-2 flex-wrap">
                  <div class="min-w-0">
                    <div class="fw-bold text-truncate d-flex align-items-center gap-2">
                      <span class="repro-pill"><i class="bi bi-person-check"></i></span>
                      <span>Selection Details</span>
                    </div>
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
                    <div class="fw-bold mb-1 d-flex align-items-center gap-2">
                      <span class="repro-pill"><i class="bi bi-check2-circle"></i></span>
                      <span>Selection Process</span>
                    </div>
                    <div class="text-muted small">Filter piglets, then open one to view selection status and actions.</div>
                  </div>

                  <div class="w-100 w-sm-auto text-start text-sm-end">
                    <div class="small text-muted mb-1">Sex Filter</div>
                    ${renderSexPills(state.selectionSexFilter, "selectionSexFilter")}
                  </div>
                </div>

                ${renderSelectionSummaryCards(piglets)}

                <div class="mt-3">
                  <div class="small text-muted mb-1">Decision Filter</div>
                  ${renderDecisionTabs(state.selectionDecisionFilter, "selDecisionTab")}
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

  /* =========================================================
     MODULE: Piglet Details (Growth + Selection)
     PURPOSE: Detail view rendering for the selected piglet.
  ========================================================= */
  function renderPigletSelectionDetail(pigletTag) {
    const mount = document.getElementById("selectionDetailMount");
    if (!mount) return;

    const sel = repo.getSelectionForPiglet(pigletTag) || null;

    const recObj = sel
      ? normalizeRecommendation(sel?.recommendation || sel?.decision || sel?.status)
      : normalizeRecommendation(getPigletDisplayStatus(pigletTag));

    const fallbackObj = findSwineByTag(pigletTag) || findMonitoringRow(pigletTag) || null;

    const fallbackPerf = repo.getMorphHistoryForPiglet?.(pigletTag);
    const fallbackLatestPerf =
      Array.isArray(fallbackPerf) && fallbackPerf.length ? fallbackPerf[fallbackPerf.length - 1] : null;

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

    const mongoFromSwineList = repo.getMongoIdForSwineTag ? toKey(repo.getMongoIdForSwineTag(pigletTag)) : "";

    const actionSwineId = isObjectId(swineId) ? swineId : mongoFromSwineList;

    const hsLower = String(fallbackObj?.health_status || "").toLowerCase();
    const isDeceased = hsLower.includes("deceased") || hsLower.includes("dead");

    const stageLower = String(stage || "").toLowerCase();
    const isEligible =
      stageLower.includes("weaned") ||
      stageLower.includes("weaner") ||
      stageLower.includes("3 months") ||
      stageLower.includes("final selection") ||
      stageLower.includes("final");

    const canActBase = isObjectId(actionSwineId);
    const canAct = canActBase && isEligible && !isDeceased;

    const decisionKey = resolvePigletDecisionKeyFromTag(pigletTag);
    const dec = getPigletDecision(decisionKey);
    const currentDecision = dec.decision;
    const decisionLocked = dec.locked;
    const decisionText = decisionLabel(currentDecision);

    const fallbackSug = computeSystemSuggestion(pigletTag, fallbackObj);

    mount.innerHTML = `
      <div class="d-flex align-items-start justify-content-between gap-2 flex-wrap">
        <div class="min-w-0">
          <div class="fw-bold text-truncate d-flex align-items-center gap-2">
            <span class="repro-pill"><i class="bi bi-tag"></i></span>
            <span>${esc(pigletTag)}</span>
          </div>
          <div class="small text-muted">Stage: <b>${esc(stage)}</b></div>
          <div class="small text-muted">Last update: <b>${esc(fmtDate(date))}</b></div>
        </div>

        <div class="d-flex flex-column align-items-end gap-2">
          ${selectionStatusChipHtml(currentDecision)}
          ${badge(recObj.label, recObj.variant)}
        </div>
      </div>

      <hr class="my-3"/>

      ${
        !isEligible
          ? `
        <div class="px-3 py-2 rounded-3 border bg-warning-subtle border-warning-subtle text-dark mb-3">
          <div class="small fw-semibold">
            <i class="bi bi-info-circle me-1"></i>
            Final selection actions are only allowed after weaning / final selection stage.
          </div>
        </div>
      `
          : ""
      }

      ${
        isDeceased
          ? `
        <div class="px-3 py-2 rounded-3 border bg-danger-subtle border-danger-subtle text-danger mb-3">
          <div class="small fw-semibold">
            <i class="bi bi-x-circle me-1"></i>
            This piglet is marked deceased — actions are disabled.
          </div>
        </div>
      `
          : ""
      }

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
                    <span>Decision submitted${decisionText ? `: <b>${esc(decisionText)}</b>` : ""}.</span>
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
          !canActBase
            ? `
            <div class="text-warning small mt-1">
              Note: Unable to resolve this piglet's Mongo ID.
              Ensure <code>/api/swine/all</code> returns <code>_id</code>
              and this piglet exists in Swine collection.
            </div>
          `
            : ""
        }
        ${
          canActBase && !isEligible
            ? `
            <div class="text-warning small mt-1">
              Note: This piglet is not eligible yet (stage must be weaned / final selection).
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
          <div class="fw-bold text-truncate d-flex align-items-center gap-2">
            <span class="repro-pill"><i class="bi bi-tag"></i></span>
            <span>${esc(pigletTag)}</span>
          </div>
          <div class="small text-muted">Entries: <b>${points.length}</b></div>
        </div>
        ${
          first && last
            ? `<div class="text-end">
                 <div class="small text-muted">${esc(fmtShortDate(first.x))} → ${esc(fmtShortDate(last.x))}</div>
                 <div class="badge bg-success-subtle text-success border">
                   <i class="bi bi-arrow-up-right me-1"></i>Δ ${esc(delta)} kg
                 </div>
               </div>`
            : `<div class="small text-muted">No weight summary.</div>`
        }
      </div>

      <div class="mt-3">
        <canvas id="growthChartCanvas" style="width:100%; height:240px;" height="240"></canvas>
      </div>

      <hr class="my-3"/>

      <div class="fw-bold mb-2 d-flex align-items-center gap-2">
        <span class="repro-pill"><i class="bi bi-exclamation-triangle"></i></span>
        <span>Deformities</span>
      </div>

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

  /* =========================================================
     MODULE: Cycle Panel (Tabs Container)
     PURPOSE: Render the cycle details container with tabs.
  ========================================================= */
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

    const key = [
      String(sowId || ""),
      String(cycleId || ""),
      String(target || ""),
      String(state.growthView || ""),
      String(state.selectionView || ""),
      String(state.growthSexFilter || ""),
      String(state.selectionSexFilter || ""),
      String(state.pigletGrowthFilter || ""),
      String(state.pigletSelectionFilter || ""),
      String(state.selectionDecisionFilter || "all"),
      String(state.pigletPageGrowth || 1),
      String(state.pigletPageSelection || 1),
    ].join("|");

    const maps = ensurePigletMapsForCycle(sowId, cycleId, piglets);

    const needsFull = renderCache.cyclePanelKey !== key;
    renderCache.cyclePanelKey = key;

    const isActive = (t) => String(target) === String(t);
    const tabBtnClass = (t) => `nav-link${isActive(t) ? " active" : ""}`;
    const tabPaneClass = (t) => `tab-pane fade${isActive(t) ? " show active" : ""}`;

    if (needsFull) {
      mount.innerHTML = `
        <div class="card repro-subcard shadow-sm border-0">
          <div class="card-body">
            <div class="fw-bold d-flex align-items-center gap-2">
              <span class="repro-pill"><i class="bi bi-folder2-open"></i></span>
              <span>Cycle • ${esc(fmtDate(cycle.date))}</span>
            </div>
            <div class="small text-muted">
              Boar: <b>${esc(cycle.boarCode || "N/A")}</b> • ${badge(cycle.status || "Recorded")}
            </div>

            <ul class="nav nav-tabs mt-3 repro-tabs" role="tablist">
              <li class="nav-item" role="presentation">
                <button class="${tabBtnClass("#cycleAI")}" data-bs-toggle="tab" data-bs-target="#cycleAI" type="button" role="tab">
                  <i class="bi bi-journal-text me-1"></i>
                  <span class="d-none d-sm-inline">Artificial Insemination Record</span>
                  <span class="d-inline d-sm-none">AI</span>
                </button>
              </li>
              <li class="nav-item" role="presentation">
                <button class="${tabBtnClass("#cyclePerf")}" data-bs-toggle="tab" data-bs-target="#cyclePerf" type="button" role="tab">
                  <i class="bi bi-bar-chart-line me-1"></i>
                  <span class="d-none d-sm-inline">Breeding Performance</span>
                  <span class="d-inline d-sm-none">Perf</span>
                </button>
              </li>
              <li class="nav-item" role="presentation">
                <button class="${tabBtnClass("#cycleGrowth")}" data-bs-toggle="tab" data-bs-target="#cycleGrowth" type="button" role="tab">
                  <i class="bi bi-graph-up-arrow me-1"></i>
                  <span class="d-none d-sm-inline">Growth Monitoring</span>
                  <span class="d-inline d-sm-none">Growth</span>
                </button>
              </li>
              <li class="nav-item" role="presentation">
                <button class="${tabBtnClass("#cycleSelect")}" data-bs-toggle="tab" data-bs-target="#cycleSelect" type="button" role="tab">
                  <i class="bi bi-check2-circle me-1"></i>
                  <span class="d-none d-sm-inline">Selection Process</span>
                  <span class="d-inline d-sm-none">Select</span>
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
                ${renderCycleGrowth(sowId, piglets, maps)}
              </div>
              <div class="${tabPaneClass("#cycleSelect")}" id="cycleSelect" role="tabpanel">
                ${renderCycleSelection(sowId, piglets, maps)}
              </div>
            </div>
          </div>
        </div>
      `;
    } else {
      const activePane = mount.querySelector(target);
      if (activePane) {
        if (target === "#cycleGrowth") activePane.innerHTML = renderCycleGrowth(sowId, piglets, maps);
        else if (target === "#cycleSelect") activePane.innerHTML = renderCycleSelection(sowId, piglets, maps);
      }
    }

    if (isActive("#cycleGrowth") && state.growthView === "detail" && state.selectedPigletTagForGrowth) {
      setTimeout(() => renderPigletGrowthDetail(state.selectedPigletTagForGrowth), 0);
    }
    if (isActive("#cycleSelect") && state.selectionView === "detail" && state.selectedPigletTagForSelection) {
      setTimeout(() => renderPigletSelectionDetail(state.selectedPigletTagForSelection), 0);
    }
  }

  /* =========================================================
     MODULE: Sow Panel (Modal Content)
     PURPOSE: Render summary and tabs (Overview / Reproduction).
  ========================================================= */
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
    const sex = sowObj?.sex ? sexLabel(sowObj.sex) : "N/A";

    const latestPerf = getLatestPerf(sowObj);
    const latestDate = latestPerf?.record_date || latestPerf?.date || latestPerf?.createdAt || null;

    const latestWeight = latestPerf?.weight ?? null;
    const latestBodyLength = latestPerf?.body_length ?? null;
    const latestHeartGirth = latestPerf?.heart_girth ?? null;
    const latestTeat = latestPerf?.teat_count ?? null;
    const latestTeeth = latestPerf?.teeth_count ?? latestPerf?.teeth ?? null;

    const alive = Number((stats?.aliveMale || 0) + (stats?.aliveFemale || 0));
    const dead = Number(stats?.deceased || 0);
    const total = Number(stats?.total || 0);

    const csLower = String(cs || "").toLowerCase();
    const phase =
      csLower.includes("preg") ? { label: "Pregnant", cls: "bg-info text-dark", icon: "bi bi-heart-fill" } :
      csLower.includes("heat") || csLower.includes("estrus") ? { label: "In-heat", cls: "bg-danger", icon: "bi bi-lightning-charge" } :
      csLower.includes("under_observation") || csLower.includes("observation") ? { label: "Under observation", cls: "bg-warning text-dark", icon: "bi bi-eye" } :
      csLower.includes("farrow") ? { label: "Farrowing", cls: "bg-warning text-dark", icon: "bi bi-box2-heart" } :
      csLower.includes("wean") ? { label: "Weaning", cls: "bg-warning text-dark", icon: "bi bi-arrow-down-circle" } :
      { label: "Open", cls: "bg-light text-dark border", icon: "bi bi-check2-circle" };

    const shellKey = String(sowId || "");
    const shouldBuildShell = renderCache.sowShellKey !== shellKey || !mount.querySelector("#reproReproMount");

    if (shouldBuildShell) {
      renderCache.sowShellKey = shellKey;

      mount.innerHTML = `
        <div class="repro-sow-shell">
          <div class="card border-0 shadow-sm repro-sow-top">
            <div class="card-body">
              <div class="d-flex align-items-start justify-content-between gap-3 flex-wrap">
                <div class="d-flex align-items-start gap-3 min-w-0">
                  <div class="repro-sow-avatar">
                    <i class="bi bi-heart-pulse"></i>
                  </div>
                  <div class="min-w-0">
                    <div class="d-flex align-items-center gap-2 flex-wrap">
                      <h5 class="mb-0 text-truncate">${esc(sowId)}</h5>
                      <span class="badge ${phase.cls}">
                        <i class="${esc(phase.icon)} me-1"></i>${esc(phase.label)}
                      </span>
                    </div>
                    <div class="small text-muted mt-1 text-truncate">
                      Breed: <b>${esc(breed)}</b> • DOB: <b>${esc(dob)}</b>
                    </div>
                    <div class="d-flex flex-wrap gap-2 mt-2">
                      <span class="badge bg-success-subtle text-success border">
                        <i class="bi bi-people me-1"></i>Alive: <b>${alive}</b>
                      </span>
                      <span class="badge bg-danger-subtle text-danger border">
                        <i class="bi bi-x-circle me-1"></i>Dead: <b>${dead}</b>
                      </span>
                      <span class="badge bg-light text-dark border">
                        <i class="bi bi-collection me-1"></i>Total: <b>${total}</b>
                      </span>
                    </div>
                  </div>
                </div>

                <div class="repro-sow-meta ms-auto">
                  <div class="repro-sow-meta-item">
                    <div class="repro-sow-meta-k">Status</div>
                    <div class="repro-sow-meta-v text-truncate">${esc(cs)}</div>
                  </div>
                  <div class="repro-sow-meta-item">
                    <div class="repro-sow-meta-k">Health</div>
                    <div class="repro-sow-meta-v text-truncate">${esc(hs)}</div>
                  </div>
                  <div class="repro-sow-meta-item">
                    <div class="repro-sow-meta-k">Sex</div>
                    <div class="repro-sow-meta-v">${esc(sex)}</div>
                  </div>
                </div>
              </div>

              <hr class="my-3"/>

              <ul class="nav nav-pills repro-pills gap-2" role="tablist">
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
            </div>
          </div>

          <div class="tab-content mt-3">
            <div class="tab-pane fade show active" id="tabOverview" role="tabpanel">
              <div class="row g-3">
                <div class="col-12 col-lg-8">
                  <div class="card border-0 shadow-sm repro-subcard">
                    <div class="card-body">
                      <div class="d-flex align-items-start justify-content-between gap-2 flex-wrap mb-2">
                        <div class="min-w-0">
                          <div class="fw-bold"><i class="bi bi-rulers me-1"></i>Latest Measurements</div>
                          <div class="small text-muted">
                            Last record: <b>${esc(fmtDate(latestDate))}</b>
                          </div>
                        </div>
                      </div>

                      <div class="row g-2">
                        <div class="col-6 col-md-4">
                          <div class="repro-sow-statbox">
                            <div class="k">Weight</div>
                            <div class="v">${latestWeight != null ? esc(latestWeight) + " kg" : "N/A"}</div>
                          </div>
                        </div>
                        <div class="col-6 col-md-4">
                          <div class="repro-sow-statbox">
                            <div class="k">Body Length</div>
                            <div class="v">${latestBodyLength != null ? esc(latestBodyLength) + " cm" : "N/A"}</div>
                          </div>
                        </div>
                        <div class="col-6 col-md-4">
                          <div class="repro-sow-statbox">
                            <div class="k">Heart Girth</div>
                            <div class="v">${latestHeartGirth != null ? esc(latestHeartGirth) + " cm" : "N/A"}</div>
                          </div>
                        </div>
                        <div class="col-6 col-md-4">
                          <div class="repro-sow-statbox">
                            <div class="k">Teat Count</div>
                            <div class="v">${latestTeat != null ? esc(latestTeat) : "N/A"}</div>
                          </div>
                        </div>
                        <div class="col-12 col-md-8">
                          <div class="repro-sow-statbox">
                            <div class="k">Teeth</div>
                            <div class="v">${latestTeeth != null ? esc(latestTeeth) : "N/A"}</div>
                          </div>
                        </div>
                      </div>

                      <div class="small text-muted mt-3">
                        Measurements are pulled from the latest <code>performance_records</code> entry (if available).
                      </div>
                    </div>
                  </div>
                </div>

                <div class="col-12 col-lg-4">
                  <div class="card border-0 shadow-sm repro-subcard mb-3">
                    <div class="card-body">
                      <div class="fw-bold mb-2"><i class="bi bi-people me-1"></i>Piglet Summary</div>
                      <div class="d-flex flex-wrap gap-2">
                        <span class="badge bg-success-subtle text-success border">
                          <i class="bi bi-check-circle me-1"></i>Alive: <b>${alive}</b>
                        </span>
                        <span class="badge bg-danger-subtle text-danger border">
                          <i class="bi bi-x-circle me-1"></i>Dead: <b>${dead}</b>
                        </span>
                        <span class="badge bg-light text-dark border">
                          <i class="bi bi-collection me-1"></i>Total: <b>${total}</b>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div class="card border-0 shadow-sm repro-subcard">
                    <div class="card-body">
                      <div class="fw-bold mb-2"><i class="bi bi-lightning-charge me-1"></i>Quick Actions</div>
                      <div class="d-grid gap-2">
                        <button class="btn btn-outline-success btn-sm" data-act="jumpRepro">
                          <i class="bi bi-arrow-down-right-circle me-1"></i> View Cycles
                        </button>
                        <button class="btn btn-outline-success btn-sm" data-act="jumpSelection">
                          <i class="bi bi-check2-square me-1"></i> Selection Process
                        </button>
                      </div>
                      <div class="small text-muted mt-2">
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
      `;
    }

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
    renderPigletSelectionDetail,
    setCycleTabTarget,
  };
}