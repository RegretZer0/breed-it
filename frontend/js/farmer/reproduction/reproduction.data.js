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
    selectionSummary: { total: 0, retain: 0, sell: 0 },

    // derived
    sows: [], // filtered female breeders
    sowMap: new Map(), // key -> sow (keys include swine_id and swine_tag)
    pigletsBySow: new Map(), // key -> piglets[] (keys include dam_id and dam_tag)
    cyclesBySow: new Map(), // key -> cycles[] (keys include sow_code and sow_tag)

    // load flags
    loaded: {
      monitoring: false,
      ai: false,
      performance: false,
      selection: false,
      swine: false,
    },
  };

  const sortByDateDesc = (a, b) => new Date(b || 0) - new Date(a || 0);

  // Normalize map keys to strings (ObjectId -> string, etc.)
  const toKey = (v) => (v == null ? "" : String(v).trim());

  function getSowId(s) {
    // main “display id”
    return toKey(s?.swine_id || s?.swine_tag || s?.tag || "");
  }

  function getSowTag(s) {
    return toKey(s?.swine_tag || s?.tag || "");
  }

  // Try all likely dam identifiers (prefer tag-like)
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

    // unique preserve order
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

  // Build a map so any sow id/tag can resolve to the canonical sow
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

  function buildDerived() {
    // 1) sows
    const femaleBreeders = store.allSwineData.filter(isBreederSow);
    femaleBreeders.sort((a, b) => (getSowId(a) || "").localeCompare(getSowId(b) || ""));
    store.sows = femaleBreeders;

    // sowMap supports both id + tag keys
    store.sowMap = buildSowAliasMap(store.sows);

    // 2) piglets grouped by sow
    const piglets = store.allSwineData.filter((s) => {
      const stage = toKey(s?.age_stage || s?.current_status || s?.current_stage).toLowerCase();
      return ["piglet", "weaning", "day 1-30"].some((k) => stage.includes(k));
    });

    const pigletsBySow = new Map();

    for (const p of piglets) {
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

    // 3) cycles derived from AI records (each record = 1 cycle)
    const cyclesBySow = new Map();

    for (const r of store.rawAiData) {
      const sowCode = toKey(r?.swine_code || r?.sow_tag || r?.sow_code || r?.swine_tag || "");
      if (!sowCode) continue;

      const cycle = {
        id: toKey(r?._id || r?.id || `${sowCode}-${r?.insemination_date || r?.createdAt || Date.now()}`),
        sowCode,
        boarCode: toKey(r?.male_swine_id) || "N/A",
        date: r?.insemination_date || r?.createdAt || null,
        status: toKey(r?.status) || "Recorded",
        raw: r,
      };

      addToGroupMap(cyclesBySow, sowCode, cycle);

      const sow = store.sowMap.get(sowCode);
      if (sow) {
        addToGroupMap(cyclesBySow, getSowId(sow), cycle);
        addToGroupMap(cyclesBySow, getSowTag(sow), cycle);
      }
    }

    for (const [, list] of cyclesBySow.entries()) {
      list.sort((a, b) => sortByDateDesc(a.date, b.date));
    }
    store.cyclesBySow = cyclesBySow;

    debugLog("DERIVED_BUILT", {
      sowCount: store.sows.length,
      pigletGroups: store.pigletsBySow.size,
      cyclesGroups: store.cyclesBySow.size,
      selectionSummary: store.selectionSummary,
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
      store.rawAiData = rawList.filter(isMySwine);

      store.rawAiData.sort(
        (a, b) =>
          new Date(b?.insemination_date || b?.createdAt || 0) -
          new Date(a?.insemination_date || a?.createdAt || 0)
      );

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
          new Date(b?.morphology?.date || b?.createdAt || 0) -
          new Date(a?.morphology?.date || a?.createdAt || 0)
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

      // pull summary from backend if present
      const s = data.summary || {};
      store.selectionSummary = {
        total: Number(s.total || store.rawSelectionData.length || 0),
        retain: Number(s.retain || 0),
        sell: Number(s.sell || 0),
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

  // ---------- selectors for UI ----------
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

  // selector for stats card
  function getSelectionSummary() {
    return store.selectionSummary || { total: 0, retain: 0, sell: 0 };
  }

  return {
    store,
    loadAll,
    loadPigletMonitoring,
    getPigletsForSow,
    getCyclesForSow,
    getMorphHistoryForPiglet,
    getDeformitiesForPiglet,
    getSelectionForPiglet,
    computeBreedingStatsForSow,
    getSelectionSummary,
  };
}