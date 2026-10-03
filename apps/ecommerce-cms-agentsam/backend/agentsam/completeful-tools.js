/**
 * Completeful AgentSam tool adapter.
 *
 * Curated business tools call the existing Completeful provider/catalog modules
 * directly so the AgentSam runtime and admin HTTP routes share one backend.
 */

import {
  completefulApiBase,
  completefulKeyMode,
  completefulLiveWritesAllowed,
  completefulRequest,
} from "../completeful/client.js";
import {
  getCompletefulCatalogProduct,
  getCompletefulCounts,
  getCompletefulSyncState,
  listCompletefulCatalogMirror,
  listMirroredShops,
  refreshCompletefulShops,
  selectPrimaryCompletefulShop,
  syncCompletefulCatalog,
} from "../completeful/catalog.js";

function buildCatalogUrl(params = {}) {
  const url = new URL("https://agentsam.invalid/api/admin/completeful/catalog");
  for (const key of ["limit", "offset", "search", "favorite", "hidden"]) {
    const value = params[key];
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function status(env) {
  const [sync, counts, shops] = await Promise.all([
    getCompletefulSyncState(env),
    getCompletefulCounts(env),
    listMirroredShops(env),
  ]);
  const primaryShop = shops.find((shop) => Number(shop.is_primary) === 1) || null;
  const mode = completefulKeyMode(env);
  return {
    ok: true,
    provider: "completeful",
    configured: mode !== "missing",
    api_base: await completefulApiBase(env),
    key_mode: mode,
    allow_live_writes: completefulLiveWritesAllowed(env),
    primary_shop: primaryShop,
    sync,
    counts,
  };
}

async function semanticCatalogSearch(env, params = {}) {
  const q = String(params.q || params.query || params.search || "").trim();
  if (!q) return { ok: false, error: "query_required" };

  const limit = Math.min(Math.max(1, Number(params.limit || 20)), 50);
  const include = params.include || "all";
  const { data, meta } = await completefulRequest(
    env,
    "GET",
    "/catalog/products/semantic",
    { query: { q, limit, include } },
  );

  return {
    ok: true,
    provider: "completeful",
    query: q,
    ...data,
    provider_meta: meta,
  };
}

async function listWebhookSubscriptions(env, params = {}) {
  const clauses = ["provider = 'completeful'"];
  const bindings = [];
  if (params.topic) {
    clauses.push("json_extract(events_json, '$[0]') = ?");
    bindings.push(String(params.topic));
  }
  if (params.status) {
    clauses.push("status = ?");
    bindings.push(String(params.status));
  }
  const where = `WHERE ${clauses.join(" AND ")}`;
  const { results } = await env.DB.prepare(
    `SELECT id,
            provider_webhook_id AS completeful_webhook_id,
            provider_resource_id AS completeful_shop_id,
            json_extract(events_json, '$[0]') AS topic,
            endpoint_url AS url,
            status,
            secret_ref,
            last_verified_at_unix AS last_verified_at,
            created_at_unix AS created_at,
            updated_at_unix AS updated_at
       FROM agentsam_webhooks
       ${where}
       ORDER BY topic, updated_at_unix DESC`,
  )
    .bind(...bindings)
    .all();

  return { ok: true, provider: "completeful", subscriptions: results || [] };
}

export async function executeCompletefulTool(env, tool, params = {}) {
  const operation = String(tool?.handler_config?.operation || "").toLowerCase();

  switch (operation) {
    case "status":
      return status(env);

    case "shops.list":
      return {
        ok: true,
        provider: "completeful",
        shops: await listMirroredShops(env),
      };

    case "shops.refresh": {
      const refreshed = await refreshCompletefulShops(env);
      return {
        ok: true,
        provider: "completeful",
        shops: await listMirroredShops(env),
        provider_meta: refreshed.meta,
      };
    }

    case "shops.select": {
      const shopId = String(params.shop_id || params.shopId || "").trim();
      if (!shopId) return { ok: false, error: "shop_id_required" };
      const selected = await selectPrimaryCompletefulShop(env, shopId);
      return selected
        ? {
            ok: true,
            provider: "completeful",
            primary_shop_id: shopId,
            shops: await listMirroredShops(env),
          }
        : { ok: false, error: "completeful_shop_not_found", shop_id: shopId };
    }

    case "catalog.list":
      return {
        ok: true,
        provider: "completeful",
        ...(await listCompletefulCatalogMirror(env, buildCatalogUrl(params))),
      };

    case "catalog.sync": {
      const result = await syncCompletefulCatalog(env, {
        reset: params.reset !== false,
        limit: params.limit,
        max_pages: params.max_pages ?? params.maxPages,
        include: params.include,
        search: params.search,
      });
      return {
        ...result,
        provider: "completeful",
        sync: await getCompletefulSyncState(env),
        counts: await getCompletefulCounts(env),
      };
    }

    case "catalog.get": {
      const productId = String(
        params.product_id || params.completeful_product_id || params.productId || "",
      ).trim();
      if (!productId) return { ok: false, error: "product_id_required" };
      const result = await getCompletefulCatalogProduct(env, productId);
      return result
        ? { ok: true, provider: "completeful", ...result }
        : { ok: false, error: "completeful_catalog_product_not_found", product_id: productId };
    }

    case "catalog.semantic":
      return semanticCatalogSearch(env, params);

    case "webhooks.list":
      return listWebhookSubscriptions(env, params);

    default:
      return {
        ok: false,
        error: "completeful_operation_not_implemented",
        tool_key: tool?.tool_key,
        operation,
      };
  }
}
