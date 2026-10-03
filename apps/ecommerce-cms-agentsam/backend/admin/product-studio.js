import {
  CompletefulApiError,
  assertCompletefulMutationAllowed,
  completefulRequest,
} from "../completeful/client.js";

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

function parseJson(value, fallback) {
  if (value == null || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function slugify(value) {
  return String(value || "product")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "product";
}

function normalizeIds(value, max = 100) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => String(id || "").trim()).filter(Boolean))].slice(0, max);
}

function draftFromRow(row) {
  if (!row) return null;
  return {
    ...row,
    selected_variant_ids: parseJson(row.selected_variant_ids_json, []),
    print_location_ids: parseJson(row.print_locations_json, []),
    placement: parseJson(row.placement_json, {}),
  };
}

function siteOrigin(env) {
  const domain = String(env.APP_DOMAIN || "fuelnfreetime.com").trim();
  if (/^https?:\/\//i.test(domain)) return domain.replace(/\/$/, "");
  return `https://${domain.replace(/^\/+|\/+$/g, "")}`;
}

function publicMediaUrl(env, row) {
  if (!row?.url) return null;
  if (/^https?:\/\//i.test(row.url)) return row.url;
  return `${siteOrigin(env)}${String(row.url).startsWith("/") ? "" : "/"}${row.url}`;
}

function providerErrorResponse(error) {
  if (error instanceof CompletefulApiError) {
    return json({ ok: false, provider: "completeful", ...error.toJSON() }, { status: error.status || 502 });
  }
  console.error("[product-studio]", error);
  return json(
    { ok: false, error: error?.message || "Product Studio request failed", code: "product_studio_error" },
    { status: 500 },
  );
}

async function primaryShop(env) {
  return env.DB.prepare(
    `SELECT * FROM completeful_shops
      WHERE is_primary = 1 AND is_active = 1
      ORDER BY id ASC LIMIT 1`,
  ).first();
}

async function mediaById(env, id) {
  if (!id) return null;
  return env.DB.prepare(`SELECT * FROM media_assets WHERE id = ?`).bind(Number(id)).first();
}

async function loadDraft(env, id) {
  return draftFromRow(
    await env.DB.prepare(`SELECT * FROM product_studio_drafts WHERE id = ?`).bind(id).first(),
  );
}

async function loadResumeDraft(env, catalogProductId) {
  return draftFromRow(
    await env.DB.prepare(
      `SELECT * FROM product_studio_drafts
        WHERE completeful_catalog_product_id = ? AND state != 'published'
        ORDER BY updated_at DESC LIMIT 1`,
    )
      .bind(catalogProductId)
      .first(),
  );
}

async function loadCatalogProduct(env, catalogProductId) {
  return env.DB.prepare(
    `SELECT * FROM completeful_catalog_products
      WHERE completeful_product_id = ? OR catalog_product_id = ?
      ORDER BY CASE WHEN completeful_product_id = ? THEN 0 ELSE 1 END
      LIMIT 1`,
  )
    .bind(catalogProductId, catalogProductId, catalogProductId)
    .first();
}

async function validateSelection(env, catalogProductId, variantIds, locationIds) {
  const product = await loadCatalogProduct(env, catalogProductId);
  if (!product) throw Object.assign(new Error("Catalog product not found"), { status: 404 });
  const resolvedProductId = product.completeful_product_id;

  if (!variantIds.length) throw Object.assign(new Error("Select at least one product variant"), { status: 400 });
  if (!locationIds.length) throw Object.assign(new Error("Select at least one print area"), { status: 400 });

  const variants = [];
  for (const id of variantIds) {
    const row = await env.DB.prepare(
      `SELECT * FROM completeful_catalog_variants
        WHERE completeful_product_id = ? AND completeful_variant_id = ?`,
    )
      .bind(resolvedProductId, id)
      .first();
    if (!row) throw Object.assign(new Error(`Variant ${id} does not belong to this product`), { status: 400 });
    variants.push(row);
  }

  const locations = [];
  for (const id of locationIds) {
    const row = await env.DB.prepare(
      `SELECT * FROM completeful_catalog_print_locations
        WHERE completeful_product_id = ? AND print_location_id = ? AND enabled = 1`,
    )
      .bind(resolvedProductId, id)
      .first();
    if (!row) throw Object.assign(new Error(`Print area ${id} is unavailable for this product`), { status: 400 });
    locations.push(row);
  }

  return { product, resolvedProductId, variants, locations };
}

function variantAttributes(row) {
  return {
    ...parseJson(row?.attributes_json, {}),
    ...parseJson(row?.variant_attributes_json, {}),
  };
}

function scopeMatches(scope, attrs) {
  const entries = Object.entries(scope || {});
  if (!entries.length) return true;
  return entries.every(([key, value]) => {
    const actual = Object.entries(attrs || {}).find(([candidate]) => candidate.toLowerCase() === key.toLowerCase())?.[1];
    return String(actual || "").toLowerCase() === String(value || "").toLowerCase();
  });
}

async function resolveMockup(env, draft, selection) {
  const locationId = draft.print_location_ids[0];
  if (!locationId) return null;
  const { results } = await env.DB.prepare(
    `SELECT * FROM completeful_catalog_mockups
      WHERE completeful_product_id = ? AND print_location_id = ? AND active = 1
      ORDER BY sort_order ASC, mockup_id ASC`,
  )
    .bind(selection.resolvedProductId, locationId)
    .all();
  const rows = results || [];
  if (!rows.length) return null;
  const attrs = variantAttributes(selection.variants[0]);
  return rows.find((row) => scopeMatches(parseJson(row.variant_scope_json, {}), attrs)) || rows[0];
}

async function beginOperation(env, { operationKey, operationType, draftId, shopId, idempotencyKey }) {
  const existing = await env.DB.prepare(
    `SELECT * FROM completeful_operations WHERE operation_key = ?`,
  )
    .bind(operationKey)
    .first();
  if (existing?.status === "succeeded") return { existing, reused: true };

  if (existing) {
    await env.DB.prepare(
      `UPDATE completeful_operations
        SET status = 'pending', attempt_count = attempt_count + 1,
            error_code = NULL, error_message = NULL, remediation = NULL,
            updated_at = datetime('now')
        WHERE operation_key = ?`,
    )
      .bind(operationKey)
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO completeful_operations
        (operation_key, operation_type, local_entity_type, local_entity_id,
         completeful_shop_id, idempotency_key, status, attempt_count)
       VALUES (?, ?, 'product_studio_draft', ?, ?, ?, 'pending', 1)`,
    )
      .bind(operationKey, operationType, draftId, shopId || null, idempotencyKey)
      .run();
  }
  return { existing: existing || null, reused: false };
}

async function finishOperation(env, operationKey, meta, resourceId) {
  await env.DB.prepare(
    `UPDATE completeful_operations
      SET status = 'succeeded', provider_resource_id = ?, provider_request_id = ?,
          response_status = ?, updated_at = datetime('now')
      WHERE operation_key = ?`,
  )
    .bind(resourceId || null, meta?.request_id || null, meta?.status || null, operationKey)
    .run();
}

async function failOperation(env, operationKey, error) {
  await env.DB.prepare(
    `UPDATE completeful_operations
      SET status = 'failed', response_status = ?, error_code = ?, error_message = ?, remediation = ?,
          provider_request_id = ?, updated_at = datetime('now')
      WHERE operation_key = ?`,
  )
    .bind(
      error?.status || null,
      error?.code || "completeful_request_failed",
      error?.message || String(error),
      error?.remediation || null,
      error?.requestId || null,
      operationKey,
    )
    .run();
}

async function ensureDraftProduct(env, body, catalogProduct) {
  if (body.product_id) {
    const existing = await env.DB.prepare(`SELECT * FROM products WHERE id = ?`).bind(Number(body.product_id)).first();
    if (existing) return existing;
  }

  const title = String(body.title || catalogProduct.default_title || catalogProduct.name || "Untitled product").trim();
  const token = crypto.randomUUID().slice(0, 8);
  const slug = `${slugify(title)}-${String(catalogProduct.completeful_product_id).slice(0, 8)}-${token}`;
  const result = await env.DB.prepare(
    `INSERT INTO products (slug, title, description, collection, price_cents, image_url, status, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, 'draft', datetime('now'))`,
  )
    .bind(
      slug,
      title,
      body.description ?? catalogProduct.default_description ?? null,
      body.collection || null,
      Math.max(0, Math.round(Number(body.retail_price_cents || 0))),
    )
    .run();
  return env.DB.prepare(`SELECT * FROM products WHERE id = ?`).bind(result.meta.last_row_id).first();
}

async function saveDraft(request, env) {
  const body = await readJson(request);
  const catalogProductId = String(body.catalog_product_id || "").trim();
  if (!catalogProductId) return json({ ok: false, error: "catalog_product_id required" }, { status: 400 });

  const variantIds = normalizeIds(body.selected_variant_ids || (body.variant_id ? [body.variant_id] : []));
  const locationIds = normalizeIds(body.print_location_ids || (body.print_location_id ? [body.print_location_id] : []), 10);
  let selection;
  try {
    selection = await validateSelection(env, catalogProductId, variantIds, locationIds);
  } catch (error) {
    return json({ ok: false, error: error.message }, { status: error.status || 400 });
  }

  let draft = body.id ? await loadDraft(env, String(body.id)) : await loadResumeDraft(env, selection.resolvedProductId);
  const product = draft
    ? await env.DB.prepare(`SELECT * FROM products WHERE id = ?`).bind(draft.product_id).first()
    : await ensureDraftProduct(env, body, selection.product);
  if (!product) return json({ ok: false, error: "Draft product could not be resolved" }, { status: 500 });

  const originalMediaId = body.original_media_asset_id ? Number(body.original_media_asset_id) : draft?.original_media_asset_id || null;
  const preparedMediaId = body.prepared_media_asset_id ? Number(body.prepared_media_asset_id) : draft?.prepared_media_asset_id || null;
  const previewMediaId = body.preview_media_asset_id ? Number(body.preview_media_asset_id) : draft?.preview_media_asset_id || null;
  if (originalMediaId && !(await mediaById(env, originalMediaId))) {
    return json({ ok: false, error: "Original artwork is no longer in the media library" }, { status: 400 });
  }
  if (preparedMediaId && !(await mediaById(env, preparedMediaId))) {
    return json({ ok: false, error: "Prepared artwork is no longer in the media library" }, { status: 400 });
  }
  if (previewMediaId && !(await mediaById(env, previewMediaId))) {
    return json({ ok: false, error: "Placement preview is no longer in the media library" }, { status: 400 });
  }

  const shop = await primaryShop(env);
  const id = draft?.id || `psd_${crypto.randomUUID()}`;
  const title = String(body.title ?? draft?.title ?? selection.product.default_title ?? selection.product.name).trim();
  const description = body.description ?? draft?.description ?? selection.product.default_description ?? null;
  const price = Math.max(0, Math.round(Number(body.retail_price_cents ?? draft?.retail_price_cents ?? product.price_cents ?? 0)));
  const placement = {
    x: Number(body.placement?.x ?? draft?.placement?.x ?? 50),
    y: Number(body.placement?.y ?? draft?.placement?.y ?? 50),
    scale: Number(body.placement?.scale ?? draft?.placement?.scale ?? 80),
    rotation: Number(body.placement?.rotation ?? draft?.placement?.rotation ?? 0),
    notes: String(body.notes ?? draft?.placement?.notes ?? "").slice(0, 10000),
  };
  const state = preparedMediaId ? "prepared" : "draft";
  const designSignature = (value) =>
    JSON.stringify({
      variants: value.variants,
      locations: value.locations,
      original: value.original,
      prepared: value.prepared,
      x: Number(value.placement?.x ?? 50),
      y: Number(value.placement?.y ?? 50),
      scale: Number(value.placement?.scale ?? 80),
      rotation: Number(value.placement?.rotation ?? 0),
    });
  const designChanged =
    !draft ||
    designSignature({
      variants: variantIds, locations: locationIds, original: originalMediaId, prepared: preparedMediaId, placement,
    }) !==
      designSignature({
        variants: draft.selected_variant_ids, locations: draft.print_location_ids,
        original: draft.original_media_asset_id, prepared: draft.prepared_media_asset_id, placement: draft.placement,
      });

  if (draft && designChanged) {
    await env.DB.prepare(
      `UPDATE product_studio_drafts
        SET completeful_shop_id = ?, selected_variant_ids_json = ?, print_locations_json = ?,
            placement_json = ?, original_media_asset_id = ?, prepared_media_asset_id = ?, preview_media_asset_id = ?,
            title = ?, description = ?, retail_price_cents = ?, state = ?, version = version + 1,
            completeful_design_id = NULL, completeful_render_id = NULL,
            completeful_render_status = NULL, completeful_render_url = NULL,
            last_error_code = NULL, last_error_message = NULL, updated_at = datetime('now')
        WHERE id = ?`,
    )
      .bind(
        shop?.completeful_shop_id || null, JSON.stringify(variantIds), JSON.stringify(locationIds),
        JSON.stringify(placement), originalMediaId, preparedMediaId, previewMediaId, title, description, price, state, id,
      )
      .run();
  } else if (draft) {
    await env.DB.prepare(
      `UPDATE product_studio_drafts
        SET completeful_shop_id = ?, placement_json = ?, preview_media_asset_id = ?, title = ?, description = ?, retail_price_cents = ?,
            last_error_code = NULL, last_error_message = NULL, updated_at = datetime('now')
        WHERE id = ?`,
    )
      .bind(shop?.completeful_shop_id || null, JSON.stringify(placement), previewMediaId, title, description, price, id)
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO product_studio_drafts
        (id, product_id, completeful_catalog_product_id, completeful_shop_id,
         selected_variant_ids_json, print_locations_json, placement_json,
         original_media_asset_id, prepared_media_asset_id, preview_media_asset_id, title, description,
         retail_price_cents, state)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        product.id,
        selection.resolvedProductId,
        shop?.completeful_shop_id || null,
        JSON.stringify(variantIds),
        JSON.stringify(locationIds),
        JSON.stringify(placement),
        originalMediaId,
        preparedMediaId,
        previewMediaId,
        title,
        description,
        price,
        state,
      )
      .run();
  }

  await env.DB.prepare(
    `UPDATE products SET title = ?, description = ?, price_cents = ?, updated_at = datetime('now') WHERE id = ?`,
  )
    .bind(title, description, price, product.id)
    .run();

  return json({ ok: true, draft: await loadDraft(env, id) });
}

async function getDraft(request, env, url, id = null) {
  const draft = id
    ? await loadDraft(env, id)
    : await loadResumeDraft(env, String(url.searchParams.get("catalog_product_id") || ""));
  if (!draft) return json({ ok: true, draft: null });
  return json({ ok: true, draft });
}

async function createDesign(env, draft) {
  const selection = await validateSelection(
    env,
    draft.completeful_catalog_product_id,
    draft.selected_variant_ids,
    draft.print_location_ids,
  );
  const art = await mediaById(env, draft.prepared_media_asset_id || draft.original_media_asset_id);
  const artUrl = publicMediaUrl(env, art);
  if (!artUrl) throw Object.assign(new Error("Add and prepare artwork before creating a Completeful design"), { status: 400 });
  const shop = draft.completeful_shop_id ? { completeful_shop_id: draft.completeful_shop_id } : await primaryShop(env);
  if (!shop?.completeful_shop_id) throw Object.assign(new Error("Select a Completeful shop first"), { status: 409 });

  if (draft.completeful_design_id) {
    return { designId: draft.completeful_design_id, selection, art, artUrl, shop, reused: true };
  }

  assertCompletefulMutationAllowed(env);
  const location = selection.locations[0];
  const operationKey = `product-studio:${draft.id}:v${draft.version}:design`;
  const idempotencyKey = operationKey;
  const operation = await beginOperation(env, {
    operationKey,
    operationType: "design_create",
    draftId: draft.id,
    shopId: shop.completeful_shop_id,
    idempotencyKey,
  });
  if (operation.reused && operation.existing?.provider_resource_id) {
    const designId = operation.existing.provider_resource_id;
    await env.DB.prepare(
      `UPDATE product_studio_drafts SET completeful_design_id = ?, updated_at = datetime('now') WHERE id = ?`,
    )
      .bind(designId, draft.id)
      .run();
    return { designId, selection, art, artUrl, shop, reused: true };
  }

  try {
    const { data, meta } = await completefulRequest(env, "POST", "/designs", {
      idempotencyKey,
      body: {
        name: `${draft.title} · ${location?.name || "Product artwork"}`,
        artfile_url: artUrl,
        width: Number(location?.file_width || 0) || undefined,
        height: Number(location?.file_height || 0) || undefined,
        shop_id: shop.completeful_shop_id,
        collection: "product-studio",
        tags: ["product-studio", draft.id],
      },
    });
    const designId = data?.design?.id || data?.id;
    if (!designId) throw new Error("Completeful design response did not include a design id");
    await finishOperation(env, operationKey, meta, designId);
    await env.DB.prepare(
      `UPDATE product_studio_drafts
        SET completeful_design_id = ?, state = CASE WHEN state = 'draft' THEN 'prepared' ELSE state END,
            updated_at = datetime('now') WHERE id = ?`,
    )
      .bind(designId, draft.id)
      .run();
    return { designId, selection, art, artUrl, shop, data, meta, reused: false };
  } catch (error) {
    await failOperation(env, operationKey, error);
    throw error;
  }
}

async function createDesignRoute(request, env, id) {
  const draft = await loadDraft(env, id);
  if (!draft) return json({ ok: false, error: "Draft not found" }, { status: 404 });
  try {
    const result = await createDesign(env, draft);
    return json({ ok: true, design_id: result.designId, reused: result.reused, draft: await loadDraft(env, id) });
  } catch (error) {
    if (error.status && !(error instanceof CompletefulApiError)) {
      return json({ ok: false, error: error.message }, { status: error.status });
    }
    return providerErrorResponse(error);
  }
}

async function renderDraft(request, env, id) {
  const draft = await loadDraft(env, id);
  if (!draft) return json({ ok: false, error: "Draft not found" }, { status: 404 });

  try {
    const selection = await validateSelection(
      env,
      draft.completeful_catalog_product_id,
      draft.selected_variant_ids,
      draft.print_location_ids,
    );
    const art = await mediaById(env, draft.prepared_media_asset_id || draft.original_media_asset_id);
    const artUrl = publicMediaUrl(env, art);
    if (!artUrl) return json({ ok: false, error: "Prepare artwork before rendering" }, { status: 400 });

    const mockup = await resolveMockup(env, draft, selection);
    if (!mockup) {
      await env.DB.prepare(
        `UPDATE product_studio_drafts
          SET completeful_render_status = 'placement_preview', completeful_render_id = NULL,
              completeful_render_url = NULL, state = CASE WHEN state = 'draft' THEN 'prepared' ELSE state END,
              updated_at = datetime('now') WHERE id = ?`,
      )
        .bind(id)
        .run();
      return json({
        ok: true,
        mode: "placement_preview",
        provider_render: false,
        reason: "no_provider_mockups",
        message: "Completeful supplies no mockup render target for this product. The Studio is showing a local placement preview only.",
        draft: await loadDraft(env, id),
      });
    }

    assertCompletefulMutationAllowed(env);
    const operationKey = `product-studio:${draft.id}:v${draft.version}:mockup:${mockup.mockup_id}:${art.id}`;
    const idempotencyKey = operationKey;
    const operation = await beginOperation(env, {
      operationKey,
      operationType: "mockup_render",
      draftId: draft.id,
      shopId: draft.completeful_shop_id,
      idempotencyKey,
    });
    if (operation.reused && draft.completeful_render_id) {
      return json({ ok: true, mode: "provider_render", provider_render: true, reused: true, draft });
    }

    try {
      const { data, meta } = await completefulRequest(env, "POST", "/mockups/renders", {
        idempotencyKey,
        body: {
          mockup_id: mockup.mockup_id,
          art_url: artUrl,
          output: { format: "png", max_size: 1800, clip_to_print_area: true },
        },
      });
      const renderId = data?.render_id;
      const renderUrl = data?.mockups?.[0]?.url || null;
      const status = data?.status || (meta?.status === 202 ? "queued" : "running");
      await finishOperation(env, operationKey, meta, renderId);
      await env.DB.prepare(
        `UPDATE product_studio_drafts
          SET completeful_render_id = ?, completeful_render_status = ?, completeful_render_url = ?,
              state = ?, updated_at = datetime('now') WHERE id = ?`,
      )
        .bind(renderId || null, status, renderUrl, status === "succeeded" ? "rendered" : "rendering", id)
        .run();
      return json({
        ok: true,
        mode: "provider_render",
        provider_render: true,
        status,
        render_id: renderId,
        mockup_id: mockup.mockup_id,
        render_url: renderUrl,
        provider_meta: meta,
        draft: await loadDraft(env, id),
      }, { status: meta?.status === 202 ? 202 : 200 });
    } catch (error) {
      await failOperation(env, operationKey, error);
      await env.DB.prepare(
        `UPDATE product_studio_drafts SET state = 'error', last_error_code = ?, last_error_message = ?, updated_at = datetime('now') WHERE id = ?`,
      )
        .bind(error?.code || "render_failed", error?.message || String(error), id)
        .run();
      throw error;
    }
  } catch (error) {
    if (error.status && !(error instanceof CompletefulApiError)) {
      return json({ ok: false, error: error.message }, { status: error.status });
    }
    return providerErrorResponse(error);
  }
}

async function pollRender(request, env, renderId, url) {
  try {
    const { data, meta } = await completefulRequest(env, "GET", `/mockups/renders/${encodeURIComponent(renderId)}`);
    const renderUrl = data?.mockups?.[0]?.url || null;
    const draftId = url.searchParams.get("draft_id");
    if (draftId) {
      await env.DB.prepare(
        `UPDATE product_studio_drafts
          SET completeful_render_status = ?, completeful_render_url = COALESCE(?, completeful_render_url),
              state = CASE WHEN ? = 'succeeded' THEN 'rendered' WHEN ? = 'failed' THEN 'error' ELSE 'rendering' END,
              last_error_message = CASE WHEN ? = 'failed' THEN ? ELSE NULL END,
              updated_at = datetime('now')
          WHERE id = ? AND completeful_render_id = ?`,
      )
        .bind(data?.status || null, renderUrl, data?.status, data?.status, data?.status, data?.error || null, draftId, renderId)
        .run();
    }
    return json({ ok: true, ...data, provider_meta: meta });
  } catch (error) {
    return providerErrorResponse(error);
  }
}

async function persistProviderRender(env, draft) {
  if (!draft.completeful_render_url) return null;
  const key = `products/${draft.product_id}/mockups/completeful-${draft.completeful_render_id || "render"}.png`;
  let row = await env.DB.prepare(`SELECT * FROM media_assets WHERE r2_key = ?`).bind(key).first();
  if (row) return row;

  const response = await fetch(draft.completeful_render_url);
  if (!response.ok) throw new Error(`Could not store Completeful mockup (${response.status})`);
  const bytes = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") || "image/png";
  await env.WEBSITE_ASSETS.put(key, bytes, { httpMetadata: { contentType } });
  const mediaUrl = `/media/${key}`;
  const result = await env.DB.prepare(
    `INSERT INTO media_assets
      (r2_key, url, filename, content_type, size_bytes, category, folder, display_order, meta_json, updated_at)
     VALUES (?, ?, ?, ?, ?, 'completeful_mockup', 'products', 0, ?, datetime('now'))`,
  )
    .bind(
      key,
      mediaUrl,
      key.split("/").pop(),
      contentType,
      bytes.byteLength,
      JSON.stringify({ source: "completeful_mockup_render", render_id: draft.completeful_render_id, lifecycle: "ready" }),
    )
    .run();
  row = await env.DB.prepare(`SELECT * FROM media_assets WHERE id = ?`).bind(result.meta.last_row_id).first();
  return row;
}

async function createLocalMappings(env, draft, selection, providerProductId, designId, requestId) {
  const product = await env.DB.prepare(`SELECT * FROM products WHERE id = ?`).bind(draft.product_id).first();
  if (!product) throw new Error("Draft product no longer exists");
  const shopId = draft.completeful_shop_id;
  const selectionJson = JSON.stringify({ include: "selected", variant_ids: draft.selected_variant_ids });

  await env.DB.prepare(
    `INSERT INTO completeful_product_links
      (product_id, completeful_shop_id, completeful_store_product_id, completeful_catalog_product_id,
       completeful_design_id, selection_json, sync_status, last_request_id, last_synced_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'linked', ?, datetime('now'), datetime('now'))
     ON CONFLICT(product_id, completeful_shop_id) DO UPDATE SET
       completeful_store_product_id = excluded.completeful_store_product_id,
       completeful_catalog_product_id = excluded.completeful_catalog_product_id,
       completeful_design_id = excluded.completeful_design_id,
       selection_json = excluded.selection_json,
       sync_status = 'linked', last_request_id = excluded.last_request_id,
       last_error_code = NULL, last_error_message = NULL,
       last_synced_at = datetime('now'), updated_at = datetime('now')`,
  )
    .bind(
      draft.product_id,
      shopId,
      providerProductId,
      selection.resolvedProductId,
      designId,
      selectionJson,
      requestId || null,
    )
    .run();
  const productLink = await env.DB.prepare(
    `SELECT * FROM completeful_product_links WHERE product_id = ? AND completeful_shop_id = ?`,
  )
    .bind(draft.product_id, shopId)
    .first();

  const mapped = [];
  for (const catalogVariant of selection.variants) {
    const attrs = variantAttributes(catalogVariant);
    const localSku = `${product.slug}-${catalogVariant.completeful_variant_id.slice(0, 8)}`;
    await env.DB.prepare(
      `INSERT INTO product_variants
        (product_id, sku, size, color, price_cents, inventory_qty, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, datetime('now'))
       ON CONFLICT(sku) DO UPDATE SET
         product_id = excluded.product_id, size = excluded.size, color = excluded.color,
         price_cents = excluded.price_cents, updated_at = datetime('now')`,
    )
      .bind(
        draft.product_id,
        localSku,
        attrs.Size || attrs.size || null,
        attrs.Color || attrs.color || null,
        draft.retail_price_cents,
      )
      .run();
    const localVariant = await env.DB.prepare(`SELECT * FROM product_variants WHERE sku = ?`).bind(localSku).first();
    await env.DB.prepare(
      `INSERT INTO completeful_variant_links
        (variant_id, product_link_id, completeful_catalog_product_id, completeful_catalog_variant_id,
         completeful_store_product_id, print_location_ids_json, selection_json, provider_sku,
         last_synced_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(variant_id) DO UPDATE SET
         product_link_id = excluded.product_link_id,
         completeful_catalog_product_id = excluded.completeful_catalog_product_id,
         completeful_catalog_variant_id = excluded.completeful_catalog_variant_id,
         completeful_store_product_id = excluded.completeful_store_product_id,
         print_location_ids_json = excluded.print_location_ids_json,
         selection_json = excluded.selection_json,
         provider_sku = excluded.provider_sku,
         last_synced_at = datetime('now'), updated_at = datetime('now')`,
    )
      .bind(
        localVariant.id,
        productLink.id,
        selection.resolvedProductId,
        catalogVariant.completeful_variant_id,
        providerProductId,
        JSON.stringify(draft.print_location_ids),
        JSON.stringify({ variant_id: catalogVariant.completeful_variant_id }),
        catalogVariant.sku || null,
      )
      .run();
    mapped.push(localVariant.id);
  }
  return { productLink, mapped };
}

async function createProductFromDraft(request, env, id) {
  let draft = await loadDraft(env, id);
  if (!draft) return json({ ok: false, error: "Draft not found" }, { status: 404 });
  if (Number(draft.retail_price_cents) <= 0) {
    return json({ ok: false, error: "Set a retail price above $0 before creating the product" }, { status: 400 });
  }
  if (!draft.prepared_media_asset_id && !draft.original_media_asset_id) {
    return json({ ok: false, error: "Add artwork before creating the product" }, { status: 400 });
  }

  try {
    const design = await createDesign(env, draft);
    draft = await loadDraft(env, id);
    const selection = design.selection;
    const allVariantRows = await env.DB.prepare(
      `SELECT completeful_variant_id FROM completeful_catalog_variants WHERE completeful_product_id = ?`,
    )
      .bind(selection.resolvedProductId)
      .all();
    const selected = new Set(draft.selected_variant_ids);
    const excluded = (allVariantRows.results || [])
      .map((row) => row.completeful_variant_id)
      .filter((variantId) => !selected.has(variantId));
    const providerSelection = { include: "all", exclude: excluded };
    const shopId = design.shop.completeful_shop_id;

    assertCompletefulMutationAllowed(env);
    const operationKey = `product-studio:${draft.id}:v${draft.version}:store-product`;
    const idempotencyKey = operationKey;
    const operation = await beginOperation(env, {
      operationKey,
      operationType: "store_product_create",
      draftId: draft.id,
      shopId,
      idempotencyKey,
    });

    let providerProductId = operation.existing?.provider_resource_id || null;
    let requestId = operation.existing?.provider_request_id || null;
    let providerData = null;
    if (!operation.reused || !providerProductId) {
      try {
        const { data, meta } = await completefulRequest(
          env,
          "POST",
          `/shops/${encodeURIComponent(shopId)}/products`,
          {
            idempotencyKey,
            body: {
              catalog_product_id: selection.resolvedProductId,
              title: draft.title,
              description: draft.description || null,
              retail_price: Number(draft.retail_price_cents) / 100,
              sku: `fnf-${draft.product_id}`,
              design_id: design.designId,
              preview_url: draft.completeful_render_url || null,
              variants: providerSelection,
            },
          },
        );
        providerData = data;
        providerProductId = data?.product?.id || data?.store_product?.id || data?.id;
        requestId = meta?.request_id || null;
        if (!providerProductId) throw new Error("Completeful product response did not include a product id");
        await finishOperation(env, operationKey, meta, providerProductId);
      } catch (error) {
        await failOperation(env, operationKey, error);
        throw error;
      }
    }

    const mappings = await createLocalMappings(env, draft, selection, providerProductId, design.designId, requestId);
    let image = null;
    if (draft.completeful_render_url && draft.completeful_render_status === "succeeded") {
      image = await persistProviderRender(env, draft);
    } else if (draft.preview_media_asset_id) {
      image = await mediaById(env, draft.preview_media_asset_id);
    }
    if (image) {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO product_images (product_id, media_asset_id, position, is_primary)
         VALUES (?, ?, 0, 1)`,
      )
        .bind(draft.product_id, image.id)
        .run();
      await env.DB.prepare(
        `UPDATE product_images SET is_primary = CASE WHEN media_asset_id = ? THEN 1 ELSE 0 END WHERE product_id = ?`,
      )
        .bind(image.id, draft.product_id)
        .run();
    }

    await env.DB.prepare(
      `UPDATE products
        SET title = ?, description = ?, price_cents = ?, image_url = COALESCE(?, image_url),
            status = 'draft', updated_at = datetime('now') WHERE id = ?`,
    )
      .bind(draft.title, draft.description, draft.retail_price_cents, image?.url || null, draft.product_id)
      .run();
    await env.DB.prepare(
      `UPDATE product_studio_drafts
        SET completeful_design_id = ?, state = 'created', last_error_code = NULL, last_error_message = NULL,
            updated_at = datetime('now') WHERE id = ?`,
    )
      .bind(design.designId, id)
      .run();

    return json({
      ok: true,
      product_id: draft.product_id,
      completeful_store_product_id: providerProductId,
      completeful_design_id: design.designId,
      mapped_variants: mappings.mapped.length,
      provider: providerData,
      draft: await loadDraft(env, id),
    });
  } catch (error) {
    await env.DB.prepare(
      `UPDATE product_studio_drafts SET state = 'error', last_error_code = ?, last_error_message = ?, updated_at = datetime('now') WHERE id = ?`,
    )
      .bind(error?.code || "create_product_failed", error?.message || String(error), id)
      .run();
    if (error.status && !(error instanceof CompletefulApiError)) {
      return json({ ok: false, error: error.message }, { status: error.status });
    }
    return providerErrorResponse(error);
  }
}

async function publishDraft(request, env, id) {
  const draft = await loadDraft(env, id);
  if (!draft) return json({ ok: false, error: "Draft not found" }, { status: 404 });
  if (draft.state !== "created") {
    return json({ ok: false, error: "Create and map the product before publishing" }, { status: 409 });
  }
  const product = await env.DB.prepare(`SELECT * FROM products WHERE id = ?`).bind(draft.product_id).first();
  const link = await env.DB.prepare(
    `SELECT * FROM completeful_product_links WHERE product_id = ? AND sync_status = 'linked'`,
  )
    .bind(draft.product_id)
    .first();
  const mapped = await env.DB.prepare(
    `SELECT COUNT(*) AS n
       FROM completeful_variant_links vl
       JOIN product_variants pv ON pv.id = vl.variant_id
      WHERE pv.product_id = ? AND vl.product_link_id = ?`,
  )
    .bind(draft.product_id, link?.id || -1)
    .first();
  const required = draft.selected_variant_ids.length;
  const problems = [];
  if (!link?.completeful_store_product_id) problems.push("Completeful product mapping is missing");
  if (Number(mapped?.n || 0) !== required) problems.push(`Only ${mapped?.n || 0} of ${required} selected variants are mapped`);
  if (!product?.image_url) problems.push("Approve or attach a storefront image before publishing");
  if (Number(product?.price_cents || 0) <= 0) problems.push("Retail price must be above $0");
  if (problems.length) return json({ ok: false, error: "Product is not ready to publish", problems }, { status: 409 });

  await env.DB.prepare(`UPDATE products SET status = 'active', updated_at = datetime('now') WHERE id = ?`)
    .bind(draft.product_id)
    .run();
  await env.DB.prepare(`UPDATE product_studio_drafts SET state = 'published', updated_at = datetime('now') WHERE id = ?`)
    .bind(id)
    .run();
  return json({ ok: true, product_id: draft.product_id, status: "active", draft: await loadDraft(env, id) });
}

export async function handleProductStudioAdminApi(request, env, url) {
  const path = url.pathname;
  const method = request.method;
  if (!path.startsWith("/api/admin/product-studio")) return null;

  try {
    if (path === "/api/admin/product-studio/drafts" && method === "GET") {
      return getDraft(request, env, url);
    }
    if (path === "/api/admin/product-studio/drafts" && method === "POST") {
      return saveDraft(request, env);
    }

    let match = path.match(/^\/api\/admin\/product-studio\/drafts\/([^/]+)$/);
    if (match && method === "GET") return getDraft(request, env, url, decodeURIComponent(match[1]));

    match = path.match(/^\/api\/admin\/product-studio\/drafts\/([^/]+)\/design$/);
    if (match && method === "POST") return createDesignRoute(request, env, decodeURIComponent(match[1]));

    match = path.match(/^\/api\/admin\/product-studio\/drafts\/([^/]+)\/render$/);
    if (match && method === "POST") return renderDraft(request, env, decodeURIComponent(match[1]));

    match = path.match(/^\/api\/admin\/product-studio\/renders\/([^/]+)$/);
    if (match && method === "GET") return pollRender(request, env, decodeURIComponent(match[1]), url);

    match = path.match(/^\/api\/admin\/product-studio\/drafts\/([^/]+)\/create-product$/);
    if (match && method === "POST") return createProductFromDraft(request, env, decodeURIComponent(match[1]));

    match = path.match(/^\/api\/admin\/product-studio\/drafts\/([^/]+)\/publish$/);
    if (match && method === "POST") return publishDraft(request, env, decodeURIComponent(match[1]));

    return json({ ok: false, error: "Not found" }, { status: 404 });
  } catch (error) {
    return providerErrorResponse(error);
  }
}
