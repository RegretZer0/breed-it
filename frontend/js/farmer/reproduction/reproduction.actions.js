// /js/reproduction/reproduction.actions.js

import { authPost } from "./reproduction.api.js";

/**
 * Selection actions for piglets:
 * - breeding (retain)  -> should NOT set invalid enums like "Active Breeder"
 * - sell              -> should mark piglet as sold/culled
 * - pending           -> client-only (no server support)
 *
 * This module includes a fallback fix:
 * If backend piglet-action throws enum validation error (e.g. "Active Breeder" invalid),
 * we automatically PATCH the Swine using valid enum values via /api/swine/update/:swineId.
 */
export async function submitSelectionAction({ token, baseUrl, swineId, action }) {
  const normalized = String(action || "").toLowerCase().trim();

  // normalize aliases
  const act = normalized === "sale" ? "sell" : normalized;

  // -----------------------------
  // Pending is not persisted server-side
  // -----------------------------
  if (act === "pending") {
    const res = await authPost({
      endpoint: "/piglet-action",
      token,
      baseUrl,
      body: { swineId: String(swineId || "").trim(), action: "pending" },
    });

    if (res?.success) {
      return { ...res, refreshHints: ["monitoring", "selection", "swine"], decidedAction: "pending" };
    }

    // fallback = client-only decision (UI must store & lock)
    return {
      success: true,
      message: "Set to Pending (saved client-side).",
      clientOnly: true,
      decidedAction: "pending",
      refreshHints: ["selection"],
    };
  }

  // Backend route supports only "breeding" and "sell"
  if (act !== "breeding" && act !== "sell") {
    return { success: false, message: `Invalid action: ${act}` };
  }

  const idStr = String(swineId || "").trim();
  const isObjectId = /^[a-f\d]{24}$/i.test(idStr);

  if (!isObjectId) {
    return {
      success: false,
      message:
        "Missing valid swine ObjectId for this piglet. The action endpoint expects the Mongo _id. " +
        "Fix UI to pass selection-candidates.id (Mongo _id) / piglet-monitoring.id, not the tag.",
    };
  }

  // -----------------------------
  // 1) Try normal backend action first
  // -----------------------------
  const res = await authPost({
    endpoint: "/piglet-action",
    token,
    baseUrl,
    body: { swineId: idStr, action: act },
  });

  // If it worked, tell UI to refresh (so stats/details update)
  if (res?.success) {
    return {
      ...res,
      refreshHints: ["monitoring", "selection", "swine"],
    };
  }

  // -----------------------------
  // 2) Fallback: backend enum validation error
  //    Example: "current_status: `Active Breeder` is not a valid enum value"
  // -----------------------------
  const msg = String(res?.message || "");
  const isEnumError =
    /not a valid enum value/i.test(msg) ||
    /validation failed/i.test(msg) ||
    /current_status/i.test(msg);

  if (!isEnumError) return res;

  // Use VALID enum values from your Swine.js schema
  const fallbackStatus = act === "breeding" ? "Active" : "Culled/Sold";
  const fallbackAgeStage = act === "breeding" ? "adult" : undefined;

  try {
    // helper: authenticated JSON request
    async function authedJson(url, { method = "GET", body } = {}) {
      const r = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        return {
          success: false,
          status: r.status,
          message: data?.message || `Request failed (${r.status})`,
          data,
        };
      }
      return data;
    }

    // 2a) Resolve swine_id from mongo id
    const lookup = await authedJson(`${baseUrl}/api/swine/by-mongo-id/${idStr}`);
    if (!lookup?.success || !lookup?.swine?.swine_id) {
      return {
        success: false,
        message:
          "Selection action failed due to invalid backend enum, and fallback lookup failed. " +
          (lookup?.message || "Unable to resolve swine_id from mongo id."),
      };
    }

    const swineCode = String(lookup.swine.swine_id || "").trim();
    if (!swineCode) {
      return {
        success: false,
        message:
          "Selection action failed due to invalid backend enum, and fallback could not read swine_id.",
      };
    }

    // 2b) Update Swine using swine_id param (your swineRoutes.js uses swine_id in :swineId)
    const update = await authedJson(`${baseUrl}/api/swine/update/${encodeURIComponent(swineCode)}`, {
      method: "PUT",
      body: { current_status: fallbackStatus, ...(fallbackAgeStage ? { age_stage: fallbackAgeStage } : {}) },
    });

    if (update?.success) {
      return {
        success: true,
        message:
          `Backend action hit an invalid enum. Applied fallback update: ${swineCode} → "${fallbackStatus}".`,
        fallbackUsed: true,
        refreshHints: ["monitoring", "selection", "swine"],
        raw: { originalError: res, lookup, update },
      };
    }

    return {
      success: false,
      message:
        "Backend action hit an invalid enum, and fallback update failed: " +
        (update?.message || "Unknown error"),
      raw: { originalError: res, lookup, update },
    };
  } catch (e) {
    return {
      success: false,
      message:
        "Backend action hit an invalid enum, and fallback crashed: " + (e?.message || String(e)),
      raw: { originalError: res },
    };
  }
}