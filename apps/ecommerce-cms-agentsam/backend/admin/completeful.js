import {
  CompletefulApiError,
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
import { planProductAssetOptimization } from "../assets/product-optimize.js";

function json(data, init = {}) {
  return Response.json(data, init);
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function providerErrorResponse(error) {
  if (error instanceof CompletefulApiError) {
    return json(
      {
        ok: false,
        provider: "completeful",
        ...error.toJSON(),
      },
      { status: error.status || 502 },
    );
  }

  console.error("[completeful/admin]", error);
  return json(
    {
      ok: false,
      provider: "completeful",
      error: error?.message || "Completeful request failed",
      code: "completeful_internal_error",
    },
    { status: 500 },
  );
}


/**
 * Read through to the supplier for the currently opened product, not a bulk
 * database resync. The mirrored catalog can be weeks out of date and lacks
 * family-inherited side mockups; Completeful resolves those on its live GET.
 * Keep legacy D1 shape for the existing Product Studio UI.
 */
export async function liveCatalogDetail(env, catalogId, mirrored) {
  const { data } = await completefulRequest(env, "GET",
    `/catalog/products/${encodeURIComponent(catalogId)}`, {
      query: { include: "variants,print_locations,images,mockups,shipping" },
    });
  const provider = data?.product || data?.item || data?.data?.product || data;
  if (!provider || typeof provider !== "object" || Array.isArray(provider)) {
    throw new Error("Completeful returned no catalog product");
  }
  const normalVariant = (v) => ({
    ...v,
    completeful_variant_id: v.completeful_variant_id || v.catalog_variant_id || v.id,
    catalog_variant_id: v.catalog_variant_id || v.completeful_variant_id || v.id,
    variant_attributes_json: JSON.stringify(v.variant_attributes || v.attributes || {}),
    attributes_json: JSON.stringify(v.attributes || {}),
    fulfillment_cost_free_cents: v.fulfillment_cost_free_cents ?? mirrored?.variants?.find((old) =>
      old.completeful_variant_id === (v.id || v.catalog_variant_id))?.fulfillment_cost_free_cents ?? null,
  });
  const normalLocation = (l) => ({
    ...l, print_location_id: l.print_location_id || l.id,
    enabled: l.enabled === false ? 0 : 1,
  });
  const normalMockup = (m) => ({
    ...m, mockup_id: m.mockup_id || m.id,
    active: m.active === false ? 0 : 1,
    variant_scope_json: typeof m.variant_scope_json === "string" ? m.variant_scope_json
      : m.variant_scope ? JSON.stringify(m.variant_scope) : null,
  });
  const arrayOrMirror = (key, transform) =>
    Array.isArray(provider[key]) ? provider[key].map(transform) : mirrored[key];
  return {
    ...mirrored,
    product: {
      ...mirrored.product, ...provider,
      completeful_product_id: provider.completeful_product_id || provider.catalog_product_id || provider.id || catalogId,
      catalog_product_id: provider.catalog_product_id || provider.completeful_product_id || provider.id || catalogId,
    },
    variants: arrayOrMirror("variants", normalVariant),
    print_locations: arrayOrMirror("print_locations", normalLocation),
    images: arrayOrMirror("images", (img) => img),
    mockups: arrayOrMirror("mockups", normalMockup),
    catalog_source: "supplier_live",
  };
}

async function status(env) {
  const [sync, counts, shops] = await Promise.all([
    getCompletefulSyncState(env),
    getCompletefulCounts(env),
    listMirroredShops(env),
  ]);

  const primaryShop = shops.find((shop) => Number(shop.is_primary) === 1) || null;
  const mode = completefulKeyMode(env);

  return json({
    ok: true,
    configured: mode !== "missing",
    provider: "completeful",
    api_base: await completefulApiBase(env),
    key_mode: mode,
    credential_source: env.COMPLETEFUL_CREDENTIAL_SOURCE || (mode === "missing" ? null : "worker_secret"),
    setup_href: "/settings/keys?add=completeful",
    allow_live_writes: completefulLiveWritesAllowed(env),
    primary_shop: primaryShop,
    sync,
    counts,
  });
}

export async function handleCompletefulAdminApi(request, env, url) {
  const path = url.pathname;
  const method = request.method;

  if (!path.startsWith("/api/admin/completeful")) return null;

  try {
    if (path === "/api/admin/completeful/status" && method === "GET") {
      return status(env);
    }

    if (path === "/api/admin/completeful/shops" && method === "GET") {
      let refresh = null;
      if (url.searchParams.get("refresh") === "1") {
        refresh = await refreshCompletefulShops(env);
      }
      return json({
        ok: true,
        shops: await listMirroredShops(env),
        provider_meta: refresh?.meta || null,
      });
    }

    if (path === "/api/admin/completeful/shops/refresh" && method === "POST") {
      const refreshed = await refreshCompletefulShops(env);
      return json({
        ok: true,
        shops: await listMirroredShops(env),
        provider_meta: refreshed.meta,
      });
    }

    let match = path.match(/^\/api\/admin\/completeful\/shops\/([^/]+)\/select$/);
    if (match && method === "POST") {
      const shopId = decodeURIComponent(match[1]);
      const selected = await selectPrimaryCompletefulShop(env, shopId);
      if (!selected) {
        return json({ ok: false, error: "Completeful shop not found" }, { status: 404 });
      }
      return json({
        ok: true,
        primary_shop_id: shopId,
        shops: await listMirroredShops(env),
      });
    }

    if (path === "/api/admin/completeful/catalog" && method === "GET") {
      const result = await listCompletefulCatalogMirror(env, url);
      return json({ ok: true, ...result });
    }

    if (path === "/api/admin/completeful/catalog/sync" && method === "POST") {
      if (completefulKeyMode(env) === "missing") {
        return json({
          ok: false, error: "Connect your Completeful API key in AgentSam Keys & Secrets.",
          code: "completeful_not_configured",
          setup_href: "/settings/keys?add=completeful",
        }, { status: 503 });
      }
      const body = await readJson(request);
      const result = await syncCompletefulCatalog(env, {
        reset: body.reset !== false,
        limit: body.limit,
        max_pages: body.max_pages,
        include: body.include,
        search: body.search,
      });
      return json({
        ...result,
        sync: await getCompletefulSyncState(env),
        counts: await getCompletefulCounts(env),
      });
    }

    match = path.match(/^\/api\/admin\/completeful\/catalog\/([^/]+)$/);
    if (match && method === "GET") {
      const productId = decodeURIComponent(match[1]);
      const result = await getCompletefulCatalogProduct(env, productId);
      if (!result) {
        return json({ ok: false, error: "Completeful catalog product not found" }, { status: 404 });
      }
      if (url.searchParams.get("live") === "1") {
        try {
          return json({ ok: true, ...(await liveCatalogDetail(env,
            result.product.completeful_product_id || productId, result)) });
        } catch (error) {
          // Provider GET failures must not prevent opening an existing design.
          console.warn("[completeful/catalog/live]", error?.code || error?.message || "failed");
          return json({ ok: true, ...result, catalog_source: "mirror_fallback",
            catalog_warning: "Supplier catalog refresh failed. Showing saved catalog images; verify the selected print side before proceeding." });
        }
      }
      return json({ ok: true, ...result, catalog_source: "mirror" });
    }

    // Plan SEO/CF tags + staging keys for a product R2 image (optimize via apps/ecommerce-cms-agentsam/bin/assets.mjs).
    if (path === "/api/admin/completeful/assets/optimize-plan" && method === "POST") {
      const body = await readJson(request);
      const r2Key = String(body.r2_key || body.key || "").replace(/^\/+/, "");
      if (!r2Key) {
        return json({ ok: false, error: "r2_key required" }, { status: 400 });
      }
      const plan = planProductAssetOptimization({
        r2Key,
        productSlug: body.product_slug || body.productSlug || null,
        collection: body.collection || null,
        alt: body.alt || null,
        bytes: body.bytes != null ? Number(body.bytes) : null,
      });
      return json({
        ...plan,
        next: {
          cli: plan.execute_cli,
          note: "Worker plans tags/staging; run apps/ecommerce-cms-agentsam/bin/assets.mjs to execute sharp optimize against R2.",
        },
      });
    }

    return json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    return providerErrorResponse(error);
  }
}
