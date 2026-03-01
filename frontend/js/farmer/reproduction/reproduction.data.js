// /js/reproduction/reproduction.data.js

import { authFetch, makeIsMySwine, debugLog } from "./reproduction.api.js";

export function createReproductionStore({ user, token, baseUrl }) {
  const isMySwine = makeIsMySwine(user);

  const store = {
    // raw
    rawAiData: [],
    rawPerformanceData: { morphology: [], deformities: [] },
    rawSelectionData: [],
    allSwineData: [],
    rawMonitoringData: [],

    // selection summary (for stats card)
    selectionSummary: { total: 0, retain: 0, sell: 0, pending: 0 },

    // derived
    sows: [],
    sowMap: new Map(),
    pigletsBySow: new Map(),
    cyclesBySow: new Map(),

    // ✅ NEW: tag/swine_id -> Mongo _id (ObjectId string)
    swineMongoIdByTag: new Map(),

    loaded: {
      monitoring: false,
      ai: false,
      performance: false,
      selection: false,
      swine: false,
    },
  };

  const sortByDateDesc = (a, b) => new Date(b || 0) - new Date(a || 0);
  const toKey = (v) => (v == null ? "" : String(v).trim());

  function getSowId(s) {
    return toKey(s?.swine_id || s?.swine_tag || s?.tag || "");
  }
  function getSowTag(s) {
    return toKey(s?.swine_tag || s?.tag || "");
  }

  function getPigletDamKeyCandidates(p) {
    const candidates = [
      p?.dam_tag,
      p?.mother_tag,
      p?.sow_tag,
      p?.dam_swine_tag,
      p?.mother_swine_tag,
      p?.dam_id,
      p?.mother_id,
      p?.sow_id,
      p?.dam_swine_id,
      p?.mother_swine_id,
    ]
      .map(toKey)
      .filter(Boolean);

    const seen = new Set();
    return candidates.filter((x) => (seen.has(x) ? false : (seen.add(x), true)));
  }

  function isBreederSow(s) {
    const stage = toKey(s?.age_stage || s?.current_status || s?.current_stage).toLowerCase();
    const isBreederStage = ["adult", "pregnant", "lactating", "farrowing", "sow", "breeder"].some((k) =>
      stage.includes(k)
    );
    return toKey(s?.sex).toLowerCase() === "female" && isBreederStage;
  }

  function buildSowAliasMap(sows) {
    const map = new Map();
    for (const s of sows) {
      const id = getSowId(s);
      const tag = getSowTag(s);
      if (id) map.set(id, s);
      if (tag) map.set(tag, s);
    }
    return map;
  }

  function addToGroupMap(map, key, item) {
    const k = toKey(key);
    if (!k) return;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }

  // ✅ NEW: prevents duplicate cycles per sow key
  function addToGroupMapUnique(map, key, item, getIdFn) {
    const k = toKey(key);
    if (!k) return;
    if (!map.has(k)) map.set(k, []);
    const list = map.get(k);

    if (typeof getIdFn === "function") {
      const id = String(getIdFn(item) ?? "");
      if (id) {
        const exists = list.some((x) => String(getIdFn(x) ?? "") === id);
        if (exists) return;
      }
    }
    list.push(item);
  }

  // ✅ NEW: build quick map swine_id/tag -> Mongo _id
  function rebuildSwineMongoMap() {
    const m = new Map();
    for (const s of store.allSwineData || []) {
      const mongoId = toKey(s?._id);
      if (!mongoId) continue;

      const swineId = toKey(s?.swine_id);
      const swineTag = toKey(s?.swine_tag);
      const tag = toKey(s?.tag);

      if (swineId) m.set(swineId, mongoId);
      if (swineTag) m.set(swineTag, mongoId);
      if (tag) m.set(tag, mongoId);
    }
    store.swineMongoIdByTag = m;
  }

  // ✅ NEW: public helper used by views when selection records have no Mongo _id
  function getMongoIdForSwineTag(swineTagOrId) {
    const k = toKey(swineTagOrId);
    if (!k) return "";
    return store.swineMongoIdByTag.get(k) || "";
  }

  // --------------------------
  // Cycle field normalization (IMPORTANT)
  // --------------------------
  function pickFirst(obj, keys) {
    for (const k of keys) {
      const v = obj?.[k];
      if (v == null) continue;
      const s = String(v).trim();
      if (s && s !== "null" && s !== "undefined") return v;
    }
    return null;
  }

  function normalizeCycleStatus(r) {
    const raw = pickFirst(r, ["cycle_status", "status", "pregnancy_status", "result", "ai_result"]) || "Recorded";
    const s = String(raw).trim();
    if (!s) return "Recorded";
    return s;
  }

  function normalizeCycleDate(r) {
    const d = pickFirst(r, ["insemination_date", "ai_service_date", "service_date", "date", "createdAt", "updatedAt"]);
    return d || null;
  }

  function normalizeBoarCode(r) {
    const b = pickFirst(r, [
      "male_swine_tag",
      "boar_tag",
      "male_swine_code",
      "boar_code",
      "male_swine_id",
      "boar_id",
      "boar",
    ]);
    return toKey(b) || "N/A";
  }

  function normalizeSowCode(r) {
    const s = pickFirst(r, ["swine_code", "sow_tag", "sow_code", "swine_tag", "swine_id", "sow_id"]);
    return toKey(s) || "";
  }

  function normalizeCycleId(r, sowCode, dateVal) {
    const id = pickFirst(r, ["_id", "id", "record_id", "ai_record_id"]);
    if (id) return toKey(id);
    const stamp = dateVal ? new Date(dateVal).getTime() : Date.now();
    return `${sowCode || "SOW"}-${stamp}`;
  }

  function computeSelectionSummary(list) {
    const sum = { total: list.length, retain: 0, sell: 0, pending: 0 };
    for (const row of list) {
      const rec = String(row?.recommendation || row?.decision || row?.status || "").toLowerCase();
      if (!rec) continue;

      if (rec.includes("retain") || rec.includes("breeding") || rec.includes("keep")) sum.retain += 1;
      else if (rec.includes("sell") || rec.includes("sale") || rec.includes("market")) sum.sell += 1;
      else if (rec.includes("pending")) sum.pending += 1;
    }
    return sum;
  }

  // ✅ NEW: offspring detection (matches your OLD JS behavior)
  // We consider a swine an "offspring record" if it has any dam/mother fields populated.
  // This prevents "retain -> age_stage adult" from removing it from the sow's offspring list.
  function isOffspringRecord(sw) {
    const cands = getPigletDamKeyCandidates(sw);
    return cands && cands.length > 0;
  }

  function buildDerived() {
    // 1) Sows (female breeders)
    const femaleBreeders = store.allSwineData.filter(isBreederSow);
    femaleBreeders.sort((a, b) => (getSowId(a) || "").localeCompare(getSowId(b) || ""));
    store.sows = femaleBreeders;

    store.sowMap = buildSowAliasMap(store.sows);

    // 2) Offspring grouping (IMPORTANT FIX)
    // OLD BEHAVIOR: offspring counted by dam_id/mother_id regardless of age_stage
    // NEW BUG: you filtered by piglet/weaning/day1-30, so "retain" (adult) disappeared.
    // ✅ FIX: group ALL offspring records (dam/mother fields present), regardless of stage.
    const offspring = store.allSwineData.filter((s) => isOffspringRecord(s));

    const pigletsBySow = new Map();

    for (const p of offspring) {
      const damCandidates = getPigletDamKeyCandidates(p);
      if (!damCandidates.length) continue;

      let matchedSow = null;
      for (const c of damCandidates) {
        const sow = store.sowMap.get(c);
        if (sow) {
          matchedSow = sow;
          break;
        }
      }

      if (matchedSow) {
        const sowId = getSowId(matchedSow);
        const sowTag = getSowTag(matchedSow);
        addToGroupMap(pigletsBySow, sowId, p);
        addToGroupMap(pigletsBySow, sowTag, p);
      } else {
        // fallback: group by raw candidate key if sow isn't in sowMap yet
        for (const c of damCandidates) addToGroupMap(pigletsBySow, c, p);
      }
    }

    store.pigletsBySow = pigletsBySow;

    // 3) cycles from AI records
    const cyclesBySow = new Map();
    const cycleKey = (x) => toKey(x?.id);

    for (const r of store.rawAiData) {
      const sowCode = normalizeSowCode(r);
      if (!sowCode) continue;

      const dateVal = normalizeCycleDate(r);
      const cycle = {
        id: normalizeCycleId(r, sowCode, dateVal),
        sowCode,
        boarCode: normalizeBoarCode(r),
        date: dateVal,
        status: normalizeCycleStatus(r),
        raw: r,
      };

      // ✅ Always add under sowCode
      addToGroupMapUnique(cyclesBySow, sowCode, cycle, cycleKey);

      // ✅ Add aliases only if they are DIFFERENT keys (prevents duplicates)
      const sow = store.sowMap.get(sowCode);
      if (sow) {
        const idKey = getSowId(sow);
        const tagKey = getSowTag(sow);

        if (idKey && idKey !== sowCode) addToGroupMapUnique(cyclesBySow, idKey, cycle, cycleKey);
        if (tagKey && tagKey !== sowCode && tagKey !== idKey)
          addToGroupMapUnique(cyclesBySow, tagKey, cycle, cycleKey);
      }
    }

    for (const [, list] of cyclesBySow.entries()) {
      list.sort((a, b) => sortByDateDesc(a.date, b.date));
    }
    store.cyclesBySow = cyclesBySow;

    // 4) selection summary derived too (farmer UI uses it)
    store.selectionSummary = computeSelectionSummary(store.rawSelectionData || []);

    debugLog("DERIVED_BUILT", {
      sowCount: store.sows.length,
      pigletGroups: store.pigletsBySow.size,
      cyclesGroups: store.cyclesBySow.size,
      selectionSummary: store.selectionSummary,
      mongoMapSize: store.swineMongoIdByTag.size,
    });
  }

  async function loadPigletMonitoring() {
    const data = await authFetch({ endpoint: "/piglet-monitoring", token, baseUrl });
    if (data?.authError) return data;

    if (data?.success) {
      store.rawMonitoringData = data.data || [];
      store.loaded.monitoring = true;
    }
    return data;
  }

  async function loadAIRecords() {
    const data = await authFetch({ endpoint: "/ai-history", token, baseUrl });
    if (data?.authError) return data;

    if (data?.success) {
      const rawList = data.data || data.records || [];
      let list = rawList.filter(isMySwine);

      // ✅ De-dupe by record id if backend returns duplicates
      const seen = new Set();
      list = list.filter((r) => {
        const id = toKey(r?._id || r?.id || r?.record_id || r?.ai_record_id);
        if (!id) return true;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });

      list.sort(
        (a, b) =>
          new Date(b?.insemination_date || b?.ai_service_date || b?.createdAt || 0) -
          new Date(a?.insemination_date || a?.ai_service_date || a?.createdAt || 0)
      );

      store.rawAiData = list;
      store.loaded.ai = true;
    }
    return data;
  }

  async function loadPerformance() {
    const data = await authFetch({ endpoint: "/performance-analytics", token, baseUrl });
    if (data?.authError) return data;

    if (data?.success) {
      store.rawPerformanceData.morphology = (data.morphology || []).filter(isMySwine);
      store.rawPerformanceData.deformities = (data.deformities || []).filter(isMySwine);

      store.rawPerformanceData.morphology.sort(
        (a, b) =>
          new Date(b?.morphology?.date || b?.createdAt || 0) - new Date(a?.morphology?.date || a?.createdAt || 0)
      );
      store.rawPerformanceData.deformities.sort(
        (a, b) => new Date(b?.date_detected || b?.createdAt || 0) - new Date(a?.date_detected || a?.createdAt || 0)
      );

      store.loaded.performance = true;
    }
    return data;
  }

  async function loadSelection() {
    const data = await authFetch({ endpoint: "/selection-candidates", token, baseUrl });
    if (data?.authError) return data;

    if (data?.success) {
      store.rawSelectionData = (data.data || []).filter(isMySwine);
      store.rawSelectionData.sort(
        (a, b) =>
          new Date(b?.updatedAt || b?.date || b?.createdAt || 0) -
          new Date(a?.updatedAt || a?.date || a?.createdAt || 0)
      );

      // backend summary if present
      const s = data.summary || {};
      const derived = computeSelectionSummary(store.rawSelectionData);

      store.selectionSummary = {
        total: Number(s.total || derived.total || 0),
        retain: Number(s.retain || derived.retain || 0),
        sell: Number(s.sell || derived.sell || 0),
        pending: Number(s.pending || derived.pending || 0),
      };

      store.loaded.selection = true;
    }
    return data;
  }

  async function loadSwine() {
    const data = await authFetch({ endpoint: "/api/swine/all", token, baseUrl });
    if (data?.authError) return data;

    if (data?.success) {
      const swineList = data.swine || data.data || [];
      store.allSwineData = swineList.filter(isMySwine);
      store.loaded.swine = true;

      // ✅ NEW: build lookup for Mongo _id resolving
      rebuildSwineMongoMap();
    }
    return data;
  }

  async function loadAll() {
    const steps = [loadPigletMonitoring, loadAIRecords, loadPerformance, loadSelection, loadSwine];

    for (const step of steps) {
      const res = await step();
      if (res?.authError) return res;
    }

    buildDerived();
    return store;
  }

  // selectors
  function getPigletsForSow(sowId) {
    return store.pigletsBySow.get(toKey(sowId)) || [];
  }

  function getCyclesForSow(sowId) {
    return store.cyclesBySow.get(toKey(sowId)) || [];
  }

  function getMorphHistoryForPiglet(pigletTag) {
    const tag = toKey(pigletTag);
    const rows = store.rawPerformanceData.morphology.filter((m) => toKey(m?.swine_tag) === tag);

    return rows
      .slice()
      .sort(
        (a, b) =>
          new Date(a?.morphology?.date || a?.createdAt || 0) - new Date(b?.morphology?.date || b?.createdAt || 0)
      )
      .map((r) => ({
        date: r?.morphology?.date || r?.createdAt || null,
        weight: Number(r?.morphology?.weight || 0),
        heart_girth: Number(r?.morphology?.heart_girth || 0),
        stage: r?.morphology?.stage || "N/A",
        teeth: r?.morphology?.teeth || "N/A",
      }));
  }

  function getDeformitiesForPiglet(pigletTag) {
    const tag = toKey(pigletTag);
    return store.rawPerformanceData.deformities.filter((d) => toKey(d?.swine_tag) === tag);
  }

  function getSelectionForPiglet(pigletTag) {
    const tag = toKey(pigletTag);
    return store.rawSelectionData.find((s) => toKey(s?.swine_tag) === tag) || null;
  }

  function computeBreedingStatsForSow(sowId) {
    const piglets = getPigletsForSow(sowId);
    let aliveMale = 0;
    let aliveFemale = 0;
    let deceased = 0;

    for (const p of piglets) {
      const sex = toKey(p?.sex).toLowerCase();
      const hs = toKey(p?.health_status).toLowerCase();

      const isDeceased = hs.includes("deceased") || hs.includes("dead");
      if (isDeceased) {
        deceased += 1;
        continue;
      }

      if (sex === "male") aliveMale += 1;
      else if (sex === "female") aliveFemale += 1;
    }

    return { aliveMale, aliveFemale, deceased, total: piglets.length };
  }

  function getSelectionSummary() {
    return store.selectionSummary || { total: 0, retain: 0, sell: 0, pending: 0 };
  }

  return {
    store,
    loadAll,
    loadPigletMonitoring,
    loadSelection,

    getPigletsForSow,
    getCyclesForSow,
    getMorphHistoryForPiglet,
    getDeformitiesForPiglet,
    getSelectionForPiglet,

    // NEW (used by reproduction.views.js action buttons)
    getMongoIdForSwineTag,

    computeBreedingStatsForSow,
    getSelectionSummary,
  };
}