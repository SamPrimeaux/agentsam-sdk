import { completefulRequest } from "./client.js";

const DEFAULT_INCLUDE = "variants,print_locations,images,mockups,shipping";
const DEFAULT_PAGE_LIMIT = 3;
const MAX_PAGE_LIMIT = 3;
const DEFAULT_MAX_PAGES = 1;
const MAX_SYNC_PAGES = 1;
const BATCH_SIZE = 75;
const DETAIL_IMAGE_LIMIT = 24;

function jsonText(value) {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

function boolInt(value) {
  return value ? 1 : 0;
}

function toCents(value) {
  if (value === undefined || value === null || value === "") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * 100);
}

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function runBatches(env, statements, size = BATCH_SIZE) {
  for (let i = 0; i < statements.length; i += size) {
    await env.DB.batch(statements.slice(i, i + size));
  }
}

function normalizeShops(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.shops)) return data.shops;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function normalizeCatalogPage(data) {
  const items = Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.products)
      ? data.products
      : [];

  const pagination = data?.pagination || {};
  return {
    items,
    nextCursor: pagination.next_cursor ?? data?.next_cursor ?? null,
    hasMore: pagination.has_more ?? data?.has_more ?? Boolean(pagination.next_cursor ?? data?.next_cursor),
  };
}

export async function getCompletefulSyncState(env) {
  return env.DB.prepare(
    `SELECT id, status, api_version, include_set, next_cursor, page_count,
            product_count, variant_count, started_at, completed_at,
            last_request_id, last_error_code, last_error_message, updated_at
       FROM completeful_catalog_sync_state
      WHERE id = 1`,
  ).first();
}

export async function getCompletefulCounts(env) {
  return env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM completeful_shops) AS shops,
       (SELECT COUNT(*) FROM completeful_catalog_products) AS catalog_products,
       (SELECT COUNT(*) FROM completeful_catalog_variants) AS catalog_variants,
       (SELECT COUNT(*) FROM completeful_catalog_print_locations) AS print_locations,
       (SELECT COUNT(*) FROM completeful_catalog_images) AS catalog_images,
       (SELECT COUNT(*) FROM completeful_catalog_mockups) AS catalog_mockups,
       (SELECT COUNT(*) FROM completeful_product_links) AS product_links,
       (SELECT COUNT(*) FROM completeful_variant_links) AS variant_links,
       (SELECT COUNT(*) FROM completeful_order_links) AS order_links,
       (SELECT COUNT(*) FROM completeful_operations) AS operations,
       (SELECT COUNT(*) FROM agentsam_webhooks
         WHERE provider = 'completeful' AND status != 'retired') AS webhook_subscriptions,
       (SELECT COUNT(*) FROM agentsam_webhook_events
         WHERE provider = 'completeful') AS webhook_events`,
  ).first();
}

export async function refreshCompletefulShops(env) {
  const { data, meta } = await completefulRequest(env, "GET", "/shops");
  const shops = normalizeShops(data);
  const statements = shops.map((shop) =>
    env.DB.prepare(
      `INSERT INTO completeful_shops (
         completeful_shop_id, kind, name, display_name, domain, marketplace,
         currency, is_primary, is_active, marketplace_readiness_json, raw_json,
         last_request_id, last_synced_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(completeful_shop_id) DO UPDATE SET
         kind = excluded.kind,
         name = excluded.name,
         display_name = excluded.display_name,
         domain = excluded.domain,
         marketplace = excluded.marketplace,
         currency = excluded.currency,
         is_active = 1,
         marketplace_readiness_json = excluded.marketplace_readiness_json,
         raw_json = excluded.raw_json,
         last_request_id = excluded.last_request_id,
         last_synced_at = excluded.last_synced_at,
         updated_at = excluded.updated_at`,
    ).bind(
      shop.id,
      shop.kind ?? null,
      shop.name ?? "",
      shop.display_name ?? shop.name ?? "",
      shop.domain ?? null,
      shop.marketplace ?? null,
      shop.currency ?? null,
      shop.kind === "primary" ? 1 : 0,
      jsonText(shop.marketplace_readiness),
      jsonText(shop),
      meta.request_id,
    ),
  );

  if (statements.length) await runBatches(env, statements);
  return { shops, meta };
}

export async function listMirroredShops(env) {
  const { results } = await env.DB.prepare(
    `SELECT completeful_shop_id, kind, name, display_name, domain, marketplace,
            currency, is_primary, is_active, marketplace_readiness_json,
            last_request_id, last_synced_at, created_at, updated_at
       FROM completeful_shops
      ORDER BY is_primary DESC, display_name ASC`,
  ).all();

  return results || [];
}

export async function selectPrimaryCompletefulShop(env, shopId) {
  const exists = await env.DB.prepare(
    `SELECT completeful_shop_id FROM completeful_shops WHERE completeful_shop_id = ?`,
  )
    .bind(shopId)
    .first();

  if (!exists) return false;

  await env.DB.batch([
    env.DB.prepare(`UPDATE completeful_shops SET is_primary = 0, updated_at = datetime('now')`),
    env.DB.prepare(
      `UPDATE completeful_shops
          SET is_primary = 1, is_active = 1, updated_at = datetime('now')
        WHERE completeful_shop_id = ?`,
    ).bind(shopId),
  ]);

  return true;
}

async function statementsForCatalogProduct(env, product, syncToken, requestId) {
  const source = JSON.stringify(product);
  const sourceHash = await sha256Hex(source);
  const sourceKey = `completeful/catalog-source/${product.id}/${sourceHash}.json`;
  // Preserve the complete payload in object storage before committing the mirror.
  // Large mockup geometry must never occupy a D1 row.
  await env.WEBSITE_ASSETS.put(sourceKey, source, {
    httpMetadata: { contentType: "application/json" },
  });
  const raw = JSON.stringify({ r2_key: sourceKey, sha256: sourceHash });
  const boundedJson = (value) => {
    const encoded = jsonText(value);
    return encoded && new TextEncoder().encode(encoded).length > 65536
      ? JSON.stringify({ source: sourceKey, external: true })
      : encoded;
  };
  const pricing = product.pricing || {};
  const costs = pricing.fulfillment_cost || {};
  const productId = product.id;
  const statements = [];

  statements.push(
    env.DB.prepare(
      `INSERT INTO completeful_catalog_products (
         completeful_product_id, catalog_product_id, sku, name, product_type,
         print_type, material, variant_title, default_title, default_description,
         available, marketplace_eligible, pricing_currency,
         fulfillment_cost_free_cents, fulfillment_cost_growth_cents,
         fulfillment_cost_business_cents, shipping_profile_id,
         cover_image_url, main_icon_url, realistic_image_url,
         tags_json, dimensions_json, variant_attributes_json, shipping_json,
         raw_json, source_hash, last_seen_sync_token, last_request_id,
         last_synced_at, updated_at
       ) VALUES (
         ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
         ?, ?, ?, ?, datetime('now'), datetime('now')
       )
       ON CONFLICT(completeful_product_id) DO UPDATE SET
         catalog_product_id = excluded.catalog_product_id,
         sku = excluded.sku,
         name = excluded.name,
         product_type = excluded.product_type,
         print_type = excluded.print_type,
         material = excluded.material,
         variant_title = excluded.variant_title,
         default_title = excluded.default_title,
         default_description = excluded.default_description,
         available = excluded.available,
         marketplace_eligible = excluded.marketplace_eligible,
         pricing_currency = excluded.pricing_currency,
         fulfillment_cost_free_cents = excluded.fulfillment_cost_free_cents,
         fulfillment_cost_growth_cents = excluded.fulfillment_cost_growth_cents,
         fulfillment_cost_business_cents = excluded.fulfillment_cost_business_cents,
         shipping_profile_id = excluded.shipping_profile_id,
         cover_image_url = excluded.cover_image_url,
         main_icon_url = excluded.main_icon_url,
         realistic_image_url = excluded.realistic_image_url,
         tags_json = excluded.tags_json,
         dimensions_json = excluded.dimensions_json,
         variant_attributes_json = excluded.variant_attributes_json,
         shipping_json = excluded.shipping_json,
         raw_json = excluded.raw_json,
         source_hash = excluded.source_hash,
         last_seen_sync_token = excluded.last_seen_sync_token,
         last_request_id = excluded.last_request_id,
         last_synced_at = excluded.last_synced_at,
         updated_at = excluded.updated_at`,
    ).bind(
      productId,
      product.catalog_product_id || productId,
      product.sku ?? null,
      product.name || product.default_title || product.sku || productId,
      product.product_type ?? null,
      product.print_type ?? null,
      product.material ?? null,
      product.variant_title ?? null,
      product.default_title ?? null,
      product.default_description ?? null,
      boolInt(product.available),
      boolInt(product.marketplace_eligible),
      pricing.currency ?? null,
      toCents(costs.free),
      toCents(costs.growth),
      toCents(costs.business),
      product.shipping?.profile_id ?? null,
      product.cover_image_url ?? null,
      product.main_icon_url ?? null,
      product.realistic_image_url ?? null,
      boundedJson(product.tags || []),
      boundedJson(product.dimensions),
      boundedJson(product.variant_attributes || {}),
      boundedJson(product.shipping),
      raw,
      sourceHash,
      syncToken,
      requestId,
    ),
  );

  // Child resources are a mirror, not local authority. Rebuild these rows for
  // this product from the provider payload so removed provider children do not
  // linger indefinitely.
  statements.push(
    env.DB.prepare(
      `DELETE FROM completeful_catalog_variants WHERE completeful_product_id = ?`,
    ).bind(productId),
    env.DB.prepare(
      `DELETE FROM completeful_catalog_print_locations WHERE completeful_product_id = ?`,
    ).bind(productId),
    env.DB.prepare(
      `DELETE FROM completeful_catalog_images WHERE completeful_product_id = ?`,
    ).bind(productId),
    env.DB.prepare(
      `DELETE FROM completeful_catalog_mockups WHERE completeful_product_id = ?`,
    ).bind(productId),
  );

  for (const variant of product.variants || []) {
    const variantPricing = variant.pricing || {};
    const variantCosts = variantPricing.fulfillment_cost || {};
    statements.push(
      env.DB.prepare(
        `INSERT INTO completeful_catalog_variants (
           completeful_variant_id, completeful_product_id, sku, name, title,
           variant_title, variants_category, is_primary, is_lead,
           pricing_currency, fulfillment_cost_free_cents,
           fulfillment_cost_growth_cents, fulfillment_cost_business_cents,
           attributes_json, variant_attributes_json, cover_image_url,
           main_icon_url, realistic_image_url, raw_json, last_seen_sync_token,
           last_synced_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      ).bind(
        variant.id,
        productId,
        variant.sku ?? null,
        variant.name ?? null,
        variant.title ?? null,
        variant.variant_title ?? null,
        variant.variants_category ?? null,
        boolInt(variant.is_primary),
        boolInt(variant.is_lead),
        variantPricing.currency ?? pricing.currency ?? null,
        toCents(variantCosts.free),
        toCents(variantCosts.growth),
        toCents(variantCosts.business),
        boundedJson(variant.attributes || {}),
        boundedJson(variant.variant_attributes || {}),
        variant.cover_image_url ?? null,
        variant.main_icon_url ?? null,
        variant.realistic_image_url ?? null,
        boundedJson(variant),
        syncToken,
      ),
    );
  }

  for (const location of product.print_locations || []) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO completeful_catalog_print_locations (
           completeful_product_id, print_location_id, name, x, y, width, height,
           artboard_width, artboard_height, file_width, file_height, unit, dpi,
           enabled, shape_type, artboard_image_url, extra_cost_cents, raw_json,
           last_synced_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      ).bind(
        productId,
        location.id,
        location.name || location.id,
        location.x ?? null,
        location.y ?? null,
        location.width ?? null,
        location.height ?? null,
        location.artboard_width ?? null,
        location.artboard_height ?? null,
        location.file_width ?? null,
        location.file_height ?? null,
        location.unit ?? null,
        location.dpi ?? null,
        location.enabled === false ? 0 : 1,
        location.shape_type ?? null,
        location.artboard_image_url ?? null,
        toCents(location.extra_cost),
        boundedJson(location),
      ),
    );
  }

  for (const image of product.images || []) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO completeful_catalog_images (
           completeful_product_id, image_id, url, thumbnail_url, type, media_type,
           sort_order, is_primary, variant_title, raw_json, last_synced_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      ).bind(
        productId,
        image.id,
        image.url,
        image.thumbnail_url ?? null,
        image.type ?? null,
        image.media_type ?? null,
        image.sort_order ?? 0,
        boolInt(image.is_primary),
        image.variant_title ?? null,
        boundedJson(image),
      ),
    );
  }

  for (const mockup of product.mockups || []) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO completeful_catalog_mockups (
           completeful_product_id, mockup_id, name, preview_url,
           print_location_id, active, sort_order, variant_scope_json, raw_json,
           last_synced_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      ).bind(
        productId,
        mockup.id,
        mockup.name || mockup.id,
        mockup.preview_url ?? null,
        mockup.print_location_id ?? null,
        mockup.active === false ? 0 : 1,
        mockup.sort_order ?? 0,
        boundedJson(mockup.variant_scope),
        boundedJson(mockup),
      ),
    );
  }

  return {
    statements,
    variantCount: (product.variants || []).length,
  };
}

export async function syncCompletefulCatalog(env, options = {}) {
  const reset = options.reset !== false;
  const limit = clampInt(options.limit, DEFAULT_PAGE_LIMIT, 1, MAX_PAGE_LIMIT);
  const maxPages = clampInt(options.max_pages ?? options.maxPages, DEFAULT_MAX_PAGES, 1, MAX_SYNC_PAGES);
  const include = options.include || DEFAULT_INCLUDE;
  const search = options.search || null;
  const lease = await env.DB.prepare(
    "UPDATE completeful_catalog_sync_state SET status = 'running', updated_at = datetime('now') WHERE id = 1 AND (status != 'running' OR updated_at < datetime('now', '-5 minutes'))"
  ).run();
  if (!lease.meta?.changes) {
    return { ok: false, status: "busy", has_more: true, retry_after: 3 };
  }
  const existing = await getCompletefulSyncState(env);
  let cursor = reset ? null : existing?.next_cursor || null;
  const syncToken = crypto.randomUUID();

  if (reset) {
    await env.DB.prepare(
      `UPDATE completeful_catalog_sync_state
          SET status = 'running',
              api_version = 'v1',
              include_set = ?,
              next_cursor = NULL,
              page_count = 0,
              product_count = 0,
              variant_count = 0,
              started_at = datetime('now'),
              completed_at = NULL,
              last_request_id = NULL,
              last_error_code = NULL,
              last_error_message = NULL,
              updated_at = datetime('now')
        WHERE id = 1`,
    )
      .bind(include)
      .run();
  } else {
    await env.DB.prepare(
      `UPDATE completeful_catalog_sync_state
          SET status = 'running',
              api_version = 'v1',
              include_set = ?,
              completed_at = NULL,
              last_error_code = NULL,
              last_error_message = NULL,
              updated_at = datetime('now')
        WHERE id = 1`,
    )
      .bind(include)
      .run();
  }

  let pages = 0;
  let productsSeen = 0;
  let variantsSeen = 0;
  let lastRequestId = null;
  let hasMore = false;

  try {
    while (pages < maxPages) {
      const { data, meta } = await completefulRequest(env, "GET", "/catalog/products", {
        query: {
          limit,
          cursor,
          include,
          search,
        },
      });

      lastRequestId = meta.request_id;
      const page = normalizeCatalogPage(data);


      for (const product of page.items) {
        if (!product?.id) continue;
        const built = await statementsForCatalogProduct(
          env,
          product,
          syncToken,
          meta.request_id,
        );
        // D1 batch is transactional: keep the prior complete product if any child fails.
        await env.DB.batch(built.statements);
        productsSeen += 1;
        variantsSeen += built.variantCount;
      }



      pages += 1;
      cursor = page.nextCursor;
      hasMore = Boolean(page.hasMore && cursor);

      await env.DB.prepare(
        `UPDATE completeful_catalog_sync_state
            SET status = ?,
                next_cursor = ?,
                page_count = page_count + 1,
                product_count = product_count + ?,
                variant_count = variant_count + ?,
                last_request_id = ?,
                completed_at = CASE WHEN ? = 0 THEN datetime('now') ELSE completed_at END,
                updated_at = datetime('now')
          WHERE id = 1`,
      )
        .bind(
          hasMore ? "running" : "complete",
          cursor,
          page.items.length,
          page.items.reduce((n, product) => n + (product?.variants?.length || 0), 0),
          meta.request_id,
          hasMore ? 1 : 0,
        )
        .run();

      if (!hasMore) break;
    }

    if (hasMore && pages >= maxPages) {
      await env.DB.prepare(
        `UPDATE completeful_catalog_sync_state
            SET status = 'partial', updated_at = datetime('now')
          WHERE id = 1`,
      ).run();
    }

    return {
      ok: true,
      status: hasMore ? "partial" : "complete",
      pages,
      products_seen: productsSeen,
      variants_seen: variantsSeen,
      next_cursor: cursor,
      has_more: hasMore,
      request_id: lastRequestId,
    };
  } catch (error) {
    await env.DB.prepare(
      `UPDATE completeful_catalog_sync_state
          SET status = 'error',
              last_error_code = ?,
              last_error_message = ?,
              last_request_id = COALESCE(?, last_request_id),
              updated_at = datetime('now')
        WHERE id = 1`,
    )
      .bind(
        error?.code || "catalog_sync_failed",
        String(error?.message || error).slice(0, 1000),
        error?.requestId || lastRequestId,
      )
      .run();
    return {
      ok: false, status: "error", has_more: true,
      error: "Catalog refresh paused. Existing products remain available.",
      code: error?.code || "catalog_sync_failed",
      detail: String(error?.message || error).slice(0, 500),
      retryable: error?.status === 429 || error?.status >= 500 || /timeout|network|temporarily/i.test(String(error?.message)),
      retry_after: 3,
    };
  }
}

export async function listCompletefulCatalogMirror(env, url) {
  const limit = clampInt(url.searchParams.get("limit"), 50, 1, 200);
  const offset = clampInt(url.searchParams.get("offset"), 0, 0, 1000000);
  const search = (url.searchParams.get("search") || "").trim();
  const favorite = url.searchParams.get("favorite");

  const where = [];
  const params = [];

  if (search) {
    where.push(`(
      p.name LIKE ? OR p.sku LIKE ? OR p.product_type LIKE ? OR
      p.print_type LIKE ? OR p.material LIKE ?
    )`);
    const q = `%${search}%`;
    params.push(q, q, q, q, q);
  }

  if (favorite === "1" || favorite === "true") {
    where.push("COALESCE(c.is_favorite, 0) = 1");
  }

  if (url.searchParams.get("hidden") !== "1") {
    where.push("COALESCE(c.is_hidden, 0) = 0");
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const { results } = await env.DB.prepare(
    `SELECT
       p.completeful_product_id,
       p.catalog_product_id,
       p.sku,
       p.name,
       p.product_type,
       p.print_type,
       p.material,
       p.variant_title,
       p.available,
       p.marketplace_eligible,
       p.pricing_currency,
       p.fulfillment_cost_free_cents,
       p.fulfillment_cost_growth_cents,
       p.fulfillment_cost_business_cents,
       p.cover_image_url,
       p.main_icon_url,
       p.realistic_image_url,
       p.last_synced_at,
       COALESCE(c.is_favorite, 0) AS is_favorite,
       COALESCE(c.is_hidden, 0) AS is_hidden,
       COALESCE(c.priority, 0) AS priority,
       c.local_group,
       c.notes,
       (SELECT COUNT(*) FROM completeful_catalog_variants v
         WHERE v.completeful_product_id = p.completeful_product_id) AS variant_count,
       (SELECT COUNT(*) FROM completeful_catalog_print_locations l
         WHERE l.completeful_product_id = p.completeful_product_id AND l.enabled = 1) AS print_location_count,
       (SELECT COUNT(*) FROM completeful_catalog_mockups m
         WHERE m.completeful_product_id = p.completeful_product_id AND m.active = 1) AS mockup_count
     FROM completeful_catalog_products p
     LEFT JOIN completeful_catalog_curation c
       ON c.completeful_product_id = p.completeful_product_id
     ${clause}
     ORDER BY COALESCE(c.is_favorite, 0) DESC,
              COALESCE(c.priority, 0) DESC,
              p.name ASC
     LIMIT ? OFFSET ?`,
  )
    .bind(...params, limit, offset)
    .all();

  const countRow = await env.DB.prepare(
    `SELECT COUNT(*) AS n
       FROM completeful_catalog_products p
       LEFT JOIN completeful_catalog_curation c
         ON c.completeful_product_id = p.completeful_product_id
       ${clause}`,
  )
    .bind(...params)
    .first();

  return {
    items: results || [],
    pagination: {
      limit,
      offset,
      count: results?.length || 0,
      total: Number(countRow?.n || 0),
      has_more: offset + (results?.length || 0) < Number(countRow?.n || 0),
    },
  };
}

export async function getCompletefulCatalogProduct(env, productId) {
  const product = await env.DB.prepare(
    `SELECT p.*, COALESCE(c.is_favorite, 0) AS is_favorite,
               COALESCE(c.is_hidden, 0) AS is_hidden,
               COALESCE(c.priority, 0) AS priority,
               c.local_group, c.notes
       FROM completeful_catalog_products p
       LEFT JOIN completeful_catalog_curation c
         ON c.completeful_product_id = p.completeful_product_id
      WHERE p.completeful_product_id = ? OR p.catalog_product_id = ?`,
  )
    .bind(productId, productId)
    .first();

  if (!product) return null;

  // Always resolve relations through the provider/product id stored on the row.
  // The public catalog id is allowed to diverge from Completeful's id over time.
  const resolvedProductId = product.completeful_product_id;

  const [variants, locations, images, mockups, imageCount] = await Promise.all([
    env.DB.prepare(
      `SELECT * FROM completeful_catalog_variants
        WHERE completeful_product_id = ?
        ORDER BY is_lead DESC, is_primary DESC, variant_title ASC, sku ASC`,
    )
      .bind(resolvedProductId)
      .all(),
    env.DB.prepare(
      `SELECT * FROM completeful_catalog_print_locations
        WHERE completeful_product_id = ?
        ORDER BY enabled DESC, name ASC`,
    )
      .bind(resolvedProductId)
      .all(),
    env.DB.prepare(
      `SELECT * FROM completeful_catalog_images
        WHERE completeful_product_id = ?
        ORDER BY is_primary DESC, sort_order ASC, image_id ASC
        LIMIT ?`,
    )
      .bind(resolvedProductId, DETAIL_IMAGE_LIMIT)
      .all(),
    env.DB.prepare(
      `SELECT * FROM completeful_catalog_mockups
        WHERE completeful_product_id = ?
        ORDER BY active DESC, sort_order ASC, mockup_id ASC`,
    )
      .bind(resolvedProductId)
      .all(),
    env.DB.prepare(
      `SELECT COUNT(*) AS n
         FROM completeful_catalog_images
        WHERE completeful_product_id = ?`,
    )
      .bind(resolvedProductId)
      .first(),
  ]);

  const imageTotal = Number(imageCount?.n || 0);
  const imageRows = images.results || [];

  return {
    product: omitRaw(product),
    variants: (variants.results || []).map(omitRaw),
    print_locations: (locations.results || []).map(omitRaw),
    images: imageRows.map(omitRaw),
    image_pagination: {
      limit: DETAIL_IMAGE_LIMIT,
      count: imageRows.length,
      total: imageTotal,
      has_more: imageRows.length < imageTotal,
    },
    mockups: (mockups.results || []).map(omitRaw),
  };
}

function omitRaw({ raw_json, ...record }) { return record; }
