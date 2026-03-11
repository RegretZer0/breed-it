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

    // tag/swine_id -> Mongo _id (ObjectId string)
    swineMongoIdByTag: new Map(),

    // tag/swine_id set for "belongs to this farmer" matching in other datasets
    mySwineKeys: new Set(),

    loaded: {
      monitoring: false,
      ai: false,
      performance: false,
      selection: false,
      swine: false,
    },
  };

  // =========================================================
  // Small helpers
  // =========================================================
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

  // prevents duplicate cycles per sow key
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

  // =========================================================
  // Ownership / "belongs-to-me" matching for non-swine datasets
  // =========================================================
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

  function rebuildMySwineKeys() {
    const keys = new Set();
    for (const s of store.allSwineData || []) {
      const swineId = toKey(s?.swine_id);
      const swineTag = toKey(s?.swine_tag);
      const tag = toKey(s?.tag);

      if (swineId) keys.add(swineId);
      if (swineTag) keys.add(swineTag);
      if (tag) keys.add(tag);
      const mongoId = toKey(s?._id);
      if (mongoId) keys.add(mongoId);
    }
    store.mySwineKeys = keys;
  }

  // Used by views when selection records have no Mongo _id
  function getMongoIdForSwineTag(swineTagOrId) {
    const k = toKey(swineTagOrId);
    if (!k) return "";
    return store.swineMongoIdByTag.get(k) || "";
  }

  // Determine if a record references any of my swine tags/ids
  function recordMatchesMySwineKeys(row, keyFields) {
    if (!row || !store.mySwineKeys || store.mySwineKeys.size === 0) return false;

    for (const f of keyFields) {
      const v = toKey(row?.[f]);
      if (v && store.mySwineKeys.has(v)) return true;
    }
    return false;
  }

  // Filter helper: keep items if they are mine by owner OR by tag/id reference
  function filterMineWithFallback(list, opts) {
    const arr = Array.isArray(list) ? list : [];
    if (!arr.length) return [];

    const { label, keyFields = [] } = opts || {};

    const mine = arr.filter((row) => {
      if (isMySwine(row)) return true;
      if (keyFields.length && recordMatchesMySwineKeys(row, keyFields)) return true;
      return false;
    });

    // If nothing matched but we have no keys yet, log it (helps debug load order issues)
    if (mine.length === 0 && arr.length > 0) {
      debugLog(
        "OWNER_FILTER_EMPTY",
        {
          label,
          total: arr.length,
          mySwineKeysSize: store.mySwineKeys?.size || 0,
          hint:
            "If this is AI/performance/selection, the record may not carry owner fields. Ensure swine loaded first so mySwineKeys exists.",
        },
        true
      );
    }

    return mine;
  }

  // =========================================================
  // Cycle field normalization
  // =========================================================
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

  /* =========================================================
    MODULE: Cycle Identifier Normalizer
    PURPOSE: Prefer business-facing AI identifiers for display
              and cycle linking before falling back to Mongo _id.
  ========================================================= */
  function normalizeCycleId(r, sowCode, dateVal) {
    const id = pickFirst(r, [
      "insemination_id",
      "ai_record_id",
      "record_id",
      "id",
      "_id",
    ]);

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

  // Offspring detection: has dam/mother fields
  function isOffspringRecord(sw) {
    const cands = getPigletDamKeyCandidates(sw);
    return cands && cands.length > 0;
  }

  // =========================================================
  // Derived builder
  // =========================================================
  function buildDerived() {
    // 1) Sows (female breeders)
    const femaleBreeders = store.allSwineData.filter(isBreederSow);
    femaleBreeders.sort((a, b) => (getSowId(a) || "").localeCompare(getSowId(b) || ""));
    store.sows = femaleBreeders;

    store.sowMap = buildSowAliasMap(store.sows);

    // 2) Offspring grouping (group ALL offspring records regardless of stage)
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
        displayId: toKey(
          pickFirst(r, ["insemination_id", "ai_record_id", "record_id", "id", "_id"]) || ""
        ),
        sowCode,
        boarCode: normalizeBoarCode(r),
        date: dateVal,
        status: normalizeCycleStatus(r),
        raw: r,
      };

      addToGroupMapUnique(cyclesBySow, sowCode, cycle, cycleKey);

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

    // 4) selection summary
    store.selectionSummary = computeSelectionSummary(store.rawSelectionData || []);

    debugLog("DERIVED_BUILT", {
      sowCount: store.sows.length,
      pigletGroups: store.pigletsBySow.size,
      cyclesGroups: store.cyclesBySow.size,
      selectionSummary: store.selectionSummary,
      mongoMapSize: store.swineMongoIdByTag.size,
      mySwineKeysSize: store.mySwineKeys.size,
      aiCount: store.rawAiData.length,
    });
  }

  // =========================================================
  // Loaders
  // =========================================================
  async function loadSwine() {
    const data = await authFetch({ endpoint: "/api/swine/all", token, baseUrl });
    if (data?.authError) return data;

    if (data?.success) {
      const swineList = data.swine || data.data || data.swines || [];

      // strict filter
      let mine = Array.isArray(swineList) ? swineList.filter(isMySwine) : [];

      // fallback: keep backend list if filter removed everything
      if (mine.length === 0 && Array.isArray(swineList) && swineList.length > 0) {
        debugLog(
          "SWINE_OWNER_FILTER_FALLBACK",
          {
            reason: "isMySwine filtered all rows (likely user id mismatch or populated owner fields)",
            userKeys: {
              id: user?.id,
              _id: user?._id,
              farmerProfileId: user?.farmerProfileId,
              farmer_id: user?.farmer_id,
              farmer: user?.farmer,
            },
            backendCount: swineList.length,
          },
          true
        );
        mine = swineList;
      }

      store.allSwineData = mine;
      store.loaded.swine = true;

      rebuildSwineMongoMap();
      rebuildMySwineKeys();
    }

    return data;
  }

  async function loadPigletMonitoring() {
    const data = await authFetch({ endpoint: "/piglet-monitoring", token, baseUrl });
    if (data?.authError) return data;

    if (data?.success) {
      const raw = data.data || [];

      // monitoring may reference swine_tag / swine_id
      store.rawMonitoringData = filterMineWithFallback(raw, {
        label: "piglet-monitoring",
        keyFields: ["swine_tag", "swine_id", "tag", "piglet_tag"],
      });

      store.loaded.monitoring = true;
    }
    return data;
  }

  async function loadAIRecords() {
    const data = await authFetch({ endpoint: "/ai-history", token, baseUrl });
    if (data?.authError) return data;

    if (data?.success) {
      const rawList = data.data || data.records || data.aiRecords || [];

      // AI rows often do NOT contain farmer_id, so match by sow tag/code too
      let list = filterMineWithFallback(rawList, {
        label: "ai-history",
        keyFields: ["swine_code", "sow_tag", "sow_code", "swine_tag", "swine_id", "sow_id"],
      });

      // de-dupe by record id
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
      // performance rows usually have swine_tag
      store.rawPerformanceData.morphology = filterMineWithFallback(data.morphology || [], {
        label: "performance-morphology",
        keyFields: ["swine_tag", "swine_id", "tag"],
      });

      store.rawPerformanceData.deformities = filterMineWithFallback(data.deformities || [], {
        label: "performance-deformities",
        keyFields: ["swine_tag", "swine_id", "tag"],
      });

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
      const raw = data.data || [];

      store.rawSelectionData = filterMineWithFallback(raw, {
        label: "selection-candidates",
        keyFields: ["swine_tag", "swine_id", "tag"],
      });

      store.rawSelectionData.sort(
        (a, b) =>
          new Date(b?.updatedAt || b?.date || b?.createdAt || 0) - new Date(a?.updatedAt || a?.date || a?.createdAt || 0)
      );

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

  // =========================================================
  // Load All (IMPORTANT: swine first)
  // =========================================================
  async function loadAll() {
    // swine first so mySwineKeys exists for AI/performance/selection filters
    const steps = [loadSwine, loadPigletMonitoring, loadAIRecords, loadPerformance, loadSelection];

    for (const step of steps) {
      const res = await step();
      if (res?.authError) return res;
    }

    buildDerived();
    return store;
  }

  // =========================================================
  // Selectors
  // =========================================================
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
    let deadMale = 0;
    let deadFemale = 0;
    let deceased = 0;

    for (const p of piglets) {
      const sex = toKey(p?.sex).toLowerCase();
      const hs = toKey(p?.health_status).toLowerCase();

      const isDeceased = hs.includes("deceased") || hs.includes("dead");
      if (isDeceased) {
        deceased += 1;
        if (sex === "male") deadMale += 1;
        else if (sex === "female") deadFemale += 1;
        continue;
      }

      if (sex === "male") aliveMale += 1;
      else if (sex === "female") aliveFemale += 1;
    }

    return {
      aliveMale,
      aliveFemale,
      deadMale,
      deadFemale,
      deceased,
      total: piglets.length,
    };
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

    getMongoIdForSwineTag,

    computeBreedingStatsForSow,
    getSelectionSummary,
  };
}