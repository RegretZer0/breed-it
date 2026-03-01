// /js/reproduction/reproduction.suggestions.js

import { PerformanceHelper } from "/js/performance_helper.js"; // adjust path if different

const toKey = (v) => (v == null ? "" : String(v).trim());

function latestMorph(store, pigletTag) {
  const history = store.getMorphHistoryForPiglet(pigletTag) || [];
  return history.length ? history[history.length - 1] : null;
}

export function getSystemSuggestion({ store, piglet }) {
  const tag = toKey(piglet?.swine_tag || piglet?.swine_id || piglet?.tag);
  if (!tag) {
    return { suggestion: "No Data", color: "#757575", bg: "#f3f4f6", reason: "Missing piglet tag" };
  }

  const deformities = store.getDeformitiesForPiglet(tag) || [];
  const last = latestMorph(store, tag);

  // Build a "swine-like" object compatible with your PerformanceHelper
  const swineLike = {
    swine_tag: tag,
    swine_id: tag,
    sex: piglet?.sex || piglet?.swine_sex || piglet?.gender,
    current_status: piglet?.age_stage || piglet?.current_status || piglet?.current_stage,
    age_stage: piglet?.age_stage || piglet?.current_status || piglet?.current_stage,
    performance_records: last
      ? [
          {
            weight: Number(last.weight || 0),
            stage: last.stage || piglet?.age_stage || "N/A",
            deformities: [], // helper already checks global deformity list too
          },
        ]
      : [],
  };

  // IMPORTANT: helper expects deformities list with swine_tag
  const globalDefs = deformities.map((d) => ({
    swine_tag: toKey(d?.swine_tag || d?.tag || tag),
  }));

  const res = PerformanceHelper.getSelectionStatus(swineLike, globalDefs);

  // canPromote = allowed to move/act
  const updateAllowed = PerformanceHelper.isUpdateAllowed(
    String(piglet?.age_stage || piglet?.current_status || piglet?.current_stage || "")
  );

  return {
    ...res,
    canAct: Boolean(res?.canPromote && updateAllowed),
  };
}