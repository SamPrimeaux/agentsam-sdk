import { removeMediaBackground } from "./media-background.js";
import { editImageWithPrompt, resampleImage, listEditableImageModels } from "../media/image-operations.js";
import {
  hashPassword,
  verifyPassword,
  createSession,
  clearSessionCookie,
  getSessionUser,
  destroySession,
  findAuthUserByEmail,
} from "../lib/auth.js";
import {
  getMailSettings,
  postMailSettings,
  listMailMessages,
  hydrateInboundMessage,
  getMailMailboxes,
  sendMailPreview,
  getResendStatus,
  getMailPartial,
} from "./mail.js";
import {
  listTeamMembers,
  inviteTeamMember,
  createMailbox,
  updateAccountProfile,
  initialsFrom,
} from "./team.js";
import {
  getMailboxesForUser,
  getPrimaryMailboxForUser,
  mailboxSlug,
} from "../lib/mail-mailboxes.js";
import {
  uploadMedia,
  addMediaReviewComment,
  listMedia,
  getMediaAsset,
  listMediaAlbums,
  createMediaAlbum,
  updateMediaAlbum,
  deleteMediaAlbum,
  batchMedia,
  updateMedia,
  reorderMedia,
  syncMediaFromR2,
  platformBindings,
  deleteMedia,
  listProductImages,
  attachProductImage,
  detachProductImage,
  setPrimaryProductImage,
} from "./media.js";
import { planProductAssetOptimization } from "../assets/product-optimize.js";
import { groupProductInventory, resolveProductSource, validateInventoryAdjustment } from "../../packages/agentsam-merch/src/product-spine.js";
import { handleAdminCmsApi } from "../cms/api.js";
import { getFinanceAnalytics } from "./analytics-finance.js";
import { getHealthAnalytics } from "./analytics-health.js";
import { fetchCloudflareLiveLogs } from "./analytics-live-logs.js";
import {
  agentsamChat,
  agentsamAiModelsList,
  agentsamAnalyticsSummary,
  agentsamToolsCatalog,
  agentsamDrawerWorkflowsList,
  agentsamMcpStatus,
  agentsamSkillGet,
  agentsamSkillsList,
  agentsamStatus,
  agentsamTools,
  agentsamWorkflowsList,
  agentsamPromptsList,
  agentsamPromptCacheSummary,
  agentsamPromptCacheInvalidate,
  agentsamSemanticSearch,
  agentsamCompactionStatus,
  agentsamCompactionRun,
} from "./agentsam.js";
import {
  agentsamConversationCreate,
  agentsamConversationDelete,
  agentsamConversationGet,
  agentsamConversationPatch,
  agentsamConversationsList,
} from "../agentsam/conversations.js";
import { agentsamFileDelete, agentsamFileGet, agentsamFileUpload } from "../agentsam/files.js";
import { agentsamToolCallGet } from "../agentsam/tool-traces.js";
import {
  agentsamGithubOAuthCallback,
  agentsamGithubOAuthDisconnect,
  agentsamGithubOAuthStart,
  agentsamGithubOAuthStatus,
} from "./agentsam-github.js";
import { onlineStoreOverview, getStorePreferences, postStorePreferences } from "./store.js";
import { getStoreTheme, publishStoreTheme, setThemePublishReady, selectThemePreview } from "./themes.js";
// The second store_theme_pages editor is retired; Theme Studio uses CMS routes.
import { retryAssetJob, runAdminCompaction } from "./ops.js";
import { handleGrowthApi } from "./growth.js";
import { handleDiscountsApi } from "./discounts.js";
import { handleCompletefulAdminApi } from "./completeful.js";
import { handleProductStudioAdminApi } from "./product-studio.js";
import { readProductSupplierSelection } from "./product-selling-selection.js";
import { getBrandWorkspace, patchBrandWorkspace, searchBrandAssets } from "./brand.js";
import { getStoreSearchDiscovery } from "./search-discovery.js";
import { handleGenerateBlockRequest } from "./generate-block-stream.js";
import { handleWorkersAiCodeProvider } from "./code-provider-workers-ai.js";

function json(data, init = {}) {
  return Response.json(data, init);
}

function slugify(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// ----- Auth -----

async function login(request, env) {
  const body = await readJson(request);
  if (!body || !body.email || !body.password) {
    return json({ error: "Email and password required" }, { status: 400 });
  }

  const user = await findAuthUserByEmail(env, body.email.trim().toLowerCase());
  if (!user) return json({ error: "Invalid credentials" }, { status: 401 });

  const ok = await verifyPassword(body.password, user.password_hash, user.salt);
  if (!ok) return json({ error: "Invalid credentials" }, { status: 401 });

  const cookie = await createSession(env, user.id, user.default_account_id || null);
  return json(
    { ok: true, email: user.email, role: user.role },
    { headers: { "set-cookie": cookie } }
  );
}

async function logout(request, env) {
  await destroySession(request, env);
  return json({ ok: true }, { headers: { "set-cookie": clearSessionCookie() } });
}

async function me(request, env, user) {
  let mailboxes = [];
  let primary = null;
  try {
    mailboxes = await getMailboxesForUser(env, user);
    primary = await getPrimaryMailboxForUser(env, user);
  } catch (err) {
    console.error("[admin/me] mailboxes", err?.message || err);
  }
  const displayName = user.display_name || user.name || user.email;
  return json({
    ok: true,
    id: user.id,
    email: user.email,
    role: user.role || "member",
    display_name: displayName,
    avatar_url: user.avatar_url || null,
    initials: initialsFrom(displayName, user.email),
    mailboxes: mailboxes.map((m) => ({
      id: m.id,
      address: m.address,
      label: m.label,
      kind: m.kind,
      slug: mailboxSlug(m),
    })),
    primary_mailbox: mailboxSlug(primary),
  });
}

async function changePassword(request, env, user) {
  const body = await readJson(request);
  if (!body || !body.current_password || !body.new_password) {
    return json({ error: "Current and new password required" }, { status: 400 });
  }
  if (body.new_password.length < 8) {
    return json({ error: "New password must be at least 8 characters" }, { status: 400 });
  }

  const row = await env.DB.prepare(`SELECT password_hash, salt FROM auth_users WHERE id = ?`)
    .bind(user.id)
    .first();

  if (!row) return json({ error: "User not found" }, { status: 404 });

  const ok = await verifyPassword(body.current_password, row.password_hash, row.salt);
  if (!ok) return json({ error: "Current password is incorrect" }, { status: 401 });

  const { hash, salt } = await hashPassword(body.new_password);
  await env.DB.prepare(
    `UPDATE auth_users SET password_hash = ?, salt = ?, updated_at = datetime('now') WHERE id = ?`
  )
    .bind(hash, salt, user.id)
    .run();

  return json({ ok: true });
}

// ----- Dashboard overview -----

async function overview(request, env) {
  const [productCount, inventorySum, lowStock, subscriberCount, recentSubs, orderCount] =
    await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) AS n FROM products`).first(),
      env.DB.prepare(`SELECT COALESCE(SUM(inventory_qty), 0) AS n FROM product_variants`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM product_variants WHERE inventory_qty <= 3`).first(),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM newsletter_subscribers`).first(),
      env.DB.prepare(
        `SELECT email, source_page, created_at FROM newsletter_subscribers ORDER BY id DESC LIMIT 5`
      ).all(),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM orders`).first(),
    ]);

  return json({
    ok: true,
    products: productCount.n,
    inventory_units: inventorySum.n,
    low_stock_variants: lowStock.n,
    subscribers: subscriberCount.n,
    recent_subscribers: recentSubs.results,
    orders: orderCount.n,
  });
}

// ----- Products -----

async function listProducts(request, env) {
  const { results } = await env.DB.prepare(
    `SELECT p.*,
            COUNT(v.id) AS variant_count,
            COALESCE(SUM(v.inventory_qty), 0) AS total_inventory
     FROM products p
     LEFT JOIN product_variants v ON v.product_id = p.id
     GROUP BY p.id
     ORDER BY p.updated_at DESC`
  ).all();
  return json({ ok: true, products: results });
}

// Admin merchandising uses the existing storefront collections and membership tables.
export async function listAdminCollections(request, env) {
  const { results } = await env.DB.prepare(
    "SELECT c.*, COUNT(cp.product_id) AS product_count FROM store_collections c " +
    "LEFT JOIN store_collection_products cp ON cp.collection_id = c.id " +
    "GROUP BY c.id ORDER BY c.sort_order ASC, lower(c.title) ASC"
  ).all();
  return json({ ok: true, collections: results || [] });
}

export async function createAdminCollection(request, env) {
  const body = await readJson(request);
  const title = String(body?.title || "").trim();
  if (!title || title.length > 120) return json({ error: "Collection name is required (maximum 120 characters)" }, { status: 400 });
  const slug = slugify(body?.slug || title);
  if (!slug || slug.length > 180) return json({ error: "Invalid collection URL handle" }, { status: 400 });
  const status = body?.status === "active" ? "active" : "draft";
  try {
    const result = await env.DB.prepare(
      "INSERT INTO store_collections(slug,title,description,image_url,seo_title,seo_description,status,updated_at) " +
      "VALUES (?,?,?,?,?,?,?,datetime('now'))"
    ).bind(slug, title, String(body.description || ""), body.image_url || null,
      body.seo_title || null, body.seo_description || null, status).run();
    const collection = await env.DB.prepare("SELECT * FROM store_collections WHERE id = ?")
      .bind(result.meta.last_row_id).first();
    return json({ ok: true, collection }, { status: 201 });
  } catch (error) {
    const message = /unique|constraint/i.test(String(error?.message || error))
      ? "A collection with that URL handle already exists" : "Could not create collection";
    return json({ error: message }, { status: 409 });
  }
}

export async function getProduct(request, env, id) {
  const product = await env.DB.prepare(`SELECT * FROM products WHERE id = ?`).bind(id).first();
  if (!product) return json({ error: "Not found" }, { status: 404 });

  const { results: variants } = await env.DB.prepare(
    `SELECT * FROM product_variants WHERE product_id = ? ORDER BY id`
  )
    .bind(id)
    .all();

  const designDraft = await env.DB.prepare(
    "SELECT id, product_id, completeful_catalog_product_id, state, version, selected_variant_ids_json, original_media_asset_id, prepared_media_asset_id, preview_media_asset_id, completeful_design_id, completeful_render_status FROM product_studio_drafts WHERE product_id = ?"
  ).bind(id).first();
  const sellingSelection = designDraft ? await readProductSupplierSelection(env, designDraft) : null;
  let fulfillment = null;
  try {
    fulfillment = await env.DB.prepare(
      "SELECT completeful_store_product_id, completeful_catalog_product_id, sync_status FROM completeful_product_links WHERE product_id = ? ORDER BY id DESC LIMIT 1"
    ).bind(id).first();
  } catch {
    // Manual product editing still works without a connected provider table.
  }
  const { results: memberships } = await env.DB.prepare(
    "SELECT collection_id FROM store_collection_products WHERE product_id = ? ORDER BY sort_order, collection_id"
  ).bind(id).all();
  return json({ ok: true, product, variants, design_draft: designDraft || null,
    selling_selection: sellingSelection, fulfillment: fulfillment || null,
    source: resolveProductSource(product, fulfillment || (designDraft?.completeful_catalog_product_id
      ? { completeful_catalog_product_id: designDraft.completeful_catalog_product_id, sync_status: "not_connected" }
      : null)),
    collection_ids: (memberships || []).map((row) => Number(row.collection_id)) });
}

async function createProduct(request, env) {
  const body = await readJson(request);
  if (!body || !String(body.title || "").trim()) {
    return json({ error: "Title required" }, { status: 400 });
  }

  const slug = (body.slug && String(body.slug).trim()) || slugify(body.title);
  const priceCents = parsePriceCents(body.price_cents ?? body.price ?? 0);

  try {
    const result = await env.DB.prepare(
      `INSERT INTO products (slug, title, description, seo_title, seo_description, collection, price_cents, image_url, status, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    )
      .bind(
        slug,
        String(body.title).trim(),
        body.description || null,
        body.seo_title || null,
        body.seo_description || null,
        body.collection || null,
        priceCents,
        body.image_url || null,
        body.status || "draft"
      )
      .run();

    const productId = result.meta.last_row_id;

    try {
      await env.DB.prepare(
        `INSERT INTO product_variants (product_id, sku, size, color, price_cents, inventory_qty, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
      )
        .bind(productId, `${slug}-default`, "Default", null, priceCents, 0)
        .run();
    } catch (variantErr) {
      console.error("[products/create/default-variant]", variantErr?.message || variantErr);
    }

    let asset_plan = null;
    const r2Key =
      (body.r2_key && String(body.r2_key).replace(/^\/+/, "")) ||
      extractR2KeyFromMediaUrl(body.image_url);
    if (r2Key) {
      asset_plan = planProductAssetOptimization({
        r2Key,
        productSlug: slug,
        collection: body.collection || null,
        alt: body.title ? String(body.title) : null,
        bytes: body.image_bytes != null ? Number(body.image_bytes) : null,
        completeful: body.completeful_production
          ? { requiresProductionMaster: true }
          : null,
      });
    }

    return json({ ok: true, id: productId, asset_plan });
  } catch (err) {
    console.error("[products/create]", err?.message || err);
    return json({ error: productDbError(err, "Could not create product") }, { status: 400 });
  }
}

function extractR2KeyFromMediaUrl(url) {
  if (!url || typeof url !== "string") return null;
  const s = url.trim();
  if (!s) return null;
  const mediaIdx = s.indexOf("/media/");
  if (mediaIdx !== -1) return s.slice(mediaIdx + "/media/".length).replace(/^\/+/, "");
  const cdn = "https://assets.fuelnfreetime.com/";
  if (s.startsWith(cdn)) return s.slice(cdn.length);
  if (!s.includes("://") && !s.startsWith("/")) return s;
  return null;
}

function parsePriceCents(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.round(n));
}

function productDbError(err, fallback) {
  const msg = String(err?.message || err || "");
  if (/unique|UNIQUE constraint/i.test(msg)) {
    if (/product_variants\.sku|variants\.sku/i.test(msg)) {
      return "That SKU is already used by another variant.";
    }
    return "That URL handle is already used by another product.";
  }
  return fallback;
}

export async function updateProduct(request, env, id) {
  const body = await readJson(request);
  if (!body) return json({ error: "Invalid body" }, { status: 400 });
  const title = String(body.title || "").trim();
  if (!title) return json({ error: "Title required" }, { status: 400 });

  const previous = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(id).first();
  if (!previous) return json({ error: "Product not found" }, { status: 404 });

  const priceCents = parsePriceCents(body.price_cents ?? body.price ?? 0);
  const slug = String(body.slug || previous.slug).trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 180) {
    return json({ error: "Use a URL handle with letters, numbers and hyphens" }, { status: 400 });
  }
  const seoTitle = String(body.seo_title ?? previous.seo_title ?? "").trim();
  const seoDescription = String(body.seo_description ?? previous.seo_description ?? "").trim();
  if (seoTitle.length > 180 || seoDescription.length > 320) {
    return json({ error: "SEO title must be under 180 characters and description under 320" }, { status: 400 });
  }
  const status = body.status || previous.status || "draft";

  try {
    if (status === "active") {
      const design = await env.DB.prepare(
        "SELECT id FROM product_studio_drafts WHERE product_id = ?"
      ).bind(id).first();
      if (design) {
        const link = await env.DB.prepare(
          "SELECT id FROM completeful_product_links WHERE product_id = ? AND completeful_store_product_id IS NOT NULL LIMIT 1"
        ).bind(id).first();
        const count = await env.DB.prepare(
          "SELECT COUNT(*) AS count FROM product_variants WHERE product_id = ?"
        ).bind(id).first();
        const issues = [];
        if (!link) issues.push("Create and map this product with Completeful before publishing");
        if (Number(count?.count || 0) < 1) issues.push("Product needs at least one mapped variant");
        if (!(previous.image_url || body.image_url)) issues.push("Attach an approved product image");
        if (priceCents <= 0) issues.push("Retail price must be above zero");
        if (issues.length) return json({
          error: "Cannot publish this design yet: " + issues.join("; "), problems: issues
        }, { status: 409 });
      }
    }

    const update = env.DB.prepare(
      `UPDATE products SET slug = ?, title = ?, description = ?, seo_title = ?, seo_description = ?,
       collection = ?, price_cents = ?, image_url = COALESCE(?, image_url),
       status = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(
      slug, title, body.description || null, seoTitle || null, seoDescription || null,
      body.collection || null, priceCents, body.image_url || null, status, id
    );
    const changesSlug = previous.status === "active" && previous.slug !== slug;
    const writes = [update];
    if (changesSlug) {
      // D1 batch is a transaction: never break a public URL without its redirect.
      const redirect = env.DB.prepare(
        `INSERT INTO product_slug_redirects (old_slug, product_id)
         VALUES (?, ?)
         ON CONFLICT(old_slug) DO UPDATE SET product_id = excluded.product_id`
      ).bind(previous.slug, id);
      writes.push(redirect);
    }
    if (Array.isArray(body.collection_ids)) {
      const ids = [...new Set(body.collection_ids.map(Number))];
      if (ids.length > 100 || ids.some((n) => !Number.isSafeInteger(n) || n <= 0)) {
        return json({ error: "Invalid collection selection" }, { status: 400 });
      }
      if (ids.length) {
        const placeholders = ids.map(() => "?").join(",");
        const { results: found } = await env.DB.prepare(
          "SELECT id FROM store_collections WHERE id IN (" + placeholders + ")"
        ).bind(...ids).all();
        if ((found || []).length !== ids.length) {
          return json({ error: "A selected collection no longer exists" }, { status: 400 });
        }
      }
      writes.push(env.DB.prepare("DELETE FROM store_collection_products WHERE product_id = ?").bind(id));
      ids.forEach((collectionId, index) => writes.push(
        env.DB.prepare(
          "INSERT INTO store_collection_products (collection_id, product_id, sort_order) VALUES (?, ?, ?)"
        ).bind(collectionId, id, index)
      ));
    }
    if (Array.isArray(body.variants)) {
      if (body.variants.length > 100) {
        return json({ error: "Too many variant changes" }, { status: 400 });
      }
      const seenVariants = new Set();
      for (const patch of body.variants) {
        const variantId = Number(patch?.id);
        if (!Number.isSafeInteger(variantId) || variantId <= 0 || seenVariants.has(variantId)) {
          return json({ error: "Invalid or duplicate variant ID" }, { status: 400 });
        }
        seenVariants.add(variantId);
        const row = await env.DB.prepare(
          "SELECT id FROM product_variants WHERE id = ? AND product_id = ?"
        ).bind(variantId, id).first();
        if (!row) return json({ error: "Variant does not belong to this product" }, { status: 400 });
        const updates = [];
        const values = [];
        for (const column of ["sku", "size", "color", "price_cents", "inventory_qty"]) {
          if (!Object.hasOwn(patch, column)) continue;
          let value = patch[column];
          if (column === "sku") {
            value = String(value || "").trim();
            if (!value || value.length > 160) {
              return json({ error: "Variant SKU is required (maximum 160 characters)" }, { status: 400 });
            }
          } else if (column === "size" || column === "color") {
            value = String(value || "").trim() || null;
            if (value && value.length > 120) {
              return json({ error: "Variant option is too long" }, { status: 400 });
            }
          } else if (column === "price_cents") {
            if (value != null && (!Number.isSafeInteger(Number(value)) || Number(value) < 0)) {
              return json({ error: "Variant price must be a valid nonnegative cent amount" }, { status: 400 });
            }
            value = value == null ? null : Number(value);
          } else if (column === "inventory_qty") {
            if (!Number.isSafeInteger(Number(value)) || Number(value) < 0) {
              return json({ error: "Inventory must be a nonnegative whole number" }, { status: 400 });
            }
            value = Number(value);
          }
          updates.push(column + " = ?");
          values.push(value);
        }
        if (updates.length) {
          writes.push(env.DB.prepare(
            "UPDATE product_variants SET " + updates.join(", ") +
            ", updated_at = datetime('now') WHERE id = ? AND product_id = ?"
          ).bind(...values, variantId, id));
        }
      }
    }
    // One D1 batch commits product, variants, redirects, and collections together.
    await env.DB.batch(writes);
    return json({ ok: true });
  } catch (err) {
    console.error("[products/update]", err?.message || err);
    return json({ error: productDbError(err, "Could not update product") }, { status: 400 });
  }
}

async function deleteProduct(request, env, id) {
  await env.DB.prepare(`DELETE FROM products WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}

// ----- Variants -----

async function createVariant(request, env, productId) {
  const body = await readJson(request);
  if (!body || !body.sku) return json({ error: "SKU required" }, { status: 400 });

  try {
    const result = await env.DB.prepare(
      `INSERT INTO product_variants (product_id, sku, size, color, price_cents, inventory_qty, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    )
      .bind(
        productId,
        body.sku.trim(),
        body.size || null,
        body.color || null,
        body.price_cents != null ? Math.round(Number(body.price_cents)) : null,
        Math.round(Number(body.inventory_qty || 0))
      )
      .run();

    return json({ ok: true, id: result.meta.last_row_id });
  } catch (err) {
    return json({ error: "Could not create variant (SKU may already exist)" }, { status: 400 });
  }
}

async function updateVariant(request, env, id) {
  const body = await readJson(request);
  if (!body) return json({ error: "Invalid body" }, { status: 400 });

  await env.DB.prepare(
    `UPDATE product_variants
     SET sku = ?, size = ?, color = ?, price_cents = ?, inventory_qty = ?, updated_at = datetime('now')
     WHERE id = ?`
  )
    .bind(
      body.sku,
      body.size || null,
      body.color || null,
      body.price_cents != null ? Math.round(Number(body.price_cents)) : null,
      Math.round(Number(body.inventory_qty || 0)),
      id
    )
    .run();

  return json({ ok: true });
}

export async function patchVariantInventory(request, env, id) {
  const body = await readJson(request);
  const variantId = Number(id);
  if (!Number.isSafeInteger(variantId) || variantId <= 0) {
    return json({ error: "Invalid variant" }, { status: 400 });
  }
  let adjustment;
  try {
    adjustment = validateInventoryAdjustment(body?.inventory_qty, body?.expected_inventory_qty);
  } catch (error) {
    return json({ error: error.message }, { status: 400 });
  }
  const { quantity: qty, expected } = adjustment;
  const sql = expected == null
    ? "UPDATE product_variants SET inventory_qty = ?, updated_at = datetime('now') WHERE id = ?"
    : "UPDATE product_variants SET inventory_qty = ?, updated_at = datetime('now') WHERE id = ? AND inventory_qty = ?";
  const args = expected == null ? [qty, variantId] : [qty, variantId, Number(expected)];
  const outcome = await env.DB.prepare(sql).bind(...args).run();
  if (Number(outcome.meta?.changes || 0) !== 1) {
    const actual = await env.DB.prepare("SELECT id, inventory_qty FROM product_variants WHERE id = ?")
      .bind(variantId).first();
    if (!actual) return json({ error: "Variant no longer exists" }, { status: 404 });
    return json({
      error: "Inventory changed since you opened this product. Reload the latest quantity before saving.",
      code: "stale_inventory", inventory_qty: actual.inventory_qty,
    }, { status: 409 });
  }
  return json({ ok: true, id: variantId, inventory_qty: qty });
}

async function deleteVariant(request, env, id) {
  await env.DB.prepare(`DELETE FROM product_variants WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}

// ----- Inventory (flat view) -----

export async function listInventory(request, env) {
  const { results } = await env.DB.prepare(
    `SELECT v.id, v.sku, v.size, v.color, v.inventory_qty, v.price_cents AS variant_price_cents,
            p.id AS product_id, p.title AS product_title, p.price_cents AS product_price_cents, p.status
     FROM product_variants v
     JOIN products p ON p.id = v.product_id
     ORDER BY p.title ASC, v.id ASC`
  ).all();
  // Existing provider linkage is optional; it never becomes product identity.
  // A local/wholesale product without a connector remains merchant-managed.
  let links = [];
  let providerLinksAvailable = true;
  try {
    const query = await env.DB.prepare(
      "SELECT product_id, completeful_store_product_id, completeful_catalog_product_id, sync_status FROM completeful_product_links ORDER BY id DESC"
    ).all();
    links = query.results || [];
  } catch {
    providerLinksAvailable = false;
  }
  return json({ ok: true, inventory: results || [],
    groups: groupProductInventory(results || [], links),
    provider_links_available: providerLinksAvailable });
}

// ----- Orders -----

async function listOrders(request, env) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM orders ORDER BY created_at DESC LIMIT 200`
  ).all();
  return json({ ok: true, orders: results });
}

async function getOrder(request, env, id) {
  const order = await env.DB.prepare(`SELECT * FROM orders WHERE id = ?`).bind(id).first();
  if (!order) return json({ error: "Not found" }, { status: 404 });
  const { results: items } = await env.DB.prepare(
    `SELECT id, variant_id, title, qty, price_cents FROM order_items WHERE order_id = ? ORDER BY id`
  ).bind(id).all();
  return json({ ok: true, order, items });
}

// ----- Subscribers -----

async function listSubscribers(request, env) {
  const { results } = await env.DB.prepare(
    `SELECT id, email, source_page, created_at FROM newsletter_subscribers ORDER BY id DESC LIMIT 500`
  ).all();
  return json({ ok: true, subscribers: results });
}

// ----- Router -----

export async function handleAdminApi(request, env, url, executionCtx = null) {
  const path = url.pathname;
  const method = request.method;

  // Public (no session required)
  if (path === "/api/admin/login" && method === "POST") {
    return login(request, env);
  }

  // Everything below requires a valid session
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });

  if (path === "/api/admin/logout" && method === "POST") return logout(request, env);
  if (path === "/api/admin/me" && method === "GET") return me(request, env, user);
  if (path === "/api/admin/account/password" && method === "POST") {
    return changePassword(request, env, user);
  }
  if (path === "/api/admin/overview" && method === "GET") return overview(request, env);
  if (path === "/api/admin/store/online" && method === "GET") {
    return onlineStoreOverview(env, user.account_id);
  }
  if (path === "/api/admin/store/preferences" && method === "GET") {
    return getStorePreferences(env);
  }
  if (path === "/api/admin/store/preferences" && method === "POST") {
    return postStorePreferences(request, env);
  }
  if (path === "/api/admin/store/crawler" && method === "GET") {
    return getStoreSearchDiscovery(env);
  }

  if (path === "/api/admin/store/theme-selection" && method === "PUT") {
    let body;
    try { body = await request.json(); }
    catch { return json({ error: "Invalid JSON" }, { status: 400 }); }
    const result = await selectThemePreview(env, body.slug, user.account_id,
      body.expected_version ?? null);
    return json(result, { status: result.status || 200 });
  }

  // Retired: the old package workspace depended on store_theme_pages, a
  // second and uninstalled CMS table family. Do not continue its write path.
  if (/^\/api\/admin\/store\/themes\/[^/]+\/(?:pages(?:\/[a-z0-9-]+)?|preview)$/.test(path)) {
    return json({ error: "Use the canonical CMS Theme Studio for page and theme editing.",
      edit_href: "/admin/theme-editor?slug=shop", code: "retired_theme_workspace" }, { status: 410 });
  }

  let themeMatch = path.match(/^\/api\/admin\/store\/themes\/([^/]+)$/);
  if (themeMatch && method === "GET") {
    const theme = await getStoreTheme(env, decodeURIComponent(themeMatch[1]), user.account_id);
    return theme ? json({ ok: true, theme }) : json({ error: "Theme not found" }, { status: 404 });
  }

  themeMatch = path.match(/^\/api\/admin\/store\/themes\/([^/]+)\/publish$/);
  if (themeMatch && method === "POST") {
    const result = await publishStoreTheme(env, decodeURIComponent(themeMatch[1]), user?.id || null, user.account_id);
    return result.ok ? json(result) : json(result, { status: result.status || 500 });
  }

  themeMatch = path.match(/^\/api\/admin\/store\/themes\/([^/]+)\/publish-ready$/);
  if (themeMatch && method === "POST") {
    let body = {};
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, { status: 400 }); }
    const result = await setThemePublishReady(
      env,
      decodeURIComponent(themeMatch[1]),
      body.ready === true,
      user?.id || null,
      user.account_id,
    );
    return result.ok ? json(result) : json(result, { status: result.status || 500 });
  }

  if (path === "/api/admin/agentsam/maintenance/compact" && method === "POST") {
    return runAdminCompaction(request, env);
  }

  let m = path.match(/^\/api\/admin\/assets\/jobs\/([^/]+)\/retry$/);
  if (m && method === "POST") {
    return retryAssetJob(request, env, m[1], url);
  }

  if (path === "/api/admin/collections" && method === "GET") return listAdminCollections(request, env);
  if (path === "/api/admin/collections" && method === "POST") return createAdminCollection(request, env);

  if (path === "/api/admin/products" && method === "GET") return listProducts(request, env);
  if (path === "/api/admin/products" && method === "POST") return createProduct(request, env);

  m = path.match(/^\/api\/admin\/products\/(\d+)$/);
  if (m && method === "GET") return getProduct(request, env, m[1]);
  if (m && method === "PUT") return updateProduct(request, env, m[1]);
  if (m && method === "DELETE") return deleteProduct(request, env, m[1]);

  m = path.match(/^\/api\/admin\/products\/(\d+)\/variants$/);
  if (m && method === "POST") return createVariant(request, env, m[1]);

  m = path.match(/^\/api\/admin\/variants\/(\d+)$/);
  if (m && method === "PUT") return updateVariant(request, env, m[1]);
  if (m && method === "DELETE") return deleteVariant(request, env, m[1]);

  m = path.match(/^\/api\/admin\/variants\/(\d+)\/inventory$/);
  if (m && method === "PATCH") return patchVariantInventory(request, env, m[1]);

  if (path === "/api/admin/inventory" && method === "GET") return listInventory(request, env);
  if (path === "/api/admin/orders" && method === "GET") return listOrders(request, env);
  let orderMatch = path.match(/^\/api\/admin\/orders\/(\d+)$/);
  if (orderMatch && method === "GET") return getOrder(request, env, orderMatch[1]);
  if (path === "/api/admin/subscribers" && method === "GET") return listSubscribers(request, env);

  if (path === "/api/admin/brand" && method === "GET") return getBrandWorkspace(env, { includeAssets: url.searchParams.get("include_assets") !== "0" });
  if (path === "/api/admin/brand/assets" && method === "GET") return searchBrandAssets(request, env);
  if (path === "/api/admin/brand" && method === "PATCH") return patchBrandWorkspace(request, env);

  if (path === "/api/admin/media/image-models" && method === "GET") {
    return json({ ok: true, models: await listEditableImageModels(env) });
  }
  if (path === "/api/admin/media" && method === "POST") return uploadMedia(request, env, executionCtx);
  if (path === "/api/admin/media" && method === "GET") return listMedia(request, env, url);
  if (path === "/api/admin/media/batch" && method === "POST") return batchMedia(request, env);
  if (path === "/api/admin/media/albums" && method === "GET") return listMediaAlbums(request, env);
  if (path === "/api/admin/media/albums" && method === "POST") return createMediaAlbum(request, env);
  if (path === "/api/admin/media/sync" && method === "POST") {
    return json(await syncMediaFromR2(env));
  }
  if (path === "/api/admin/media/reorder" && method === "POST") return reorderMedia(request, env);
  if (path === "/api/admin/platform/bindings" && method === "GET") return platformBindings(env);

  m = path.match(/^\/api\/admin\/media\/albums\/(\d+)$/);
  if (m && method === "PATCH") return updateMediaAlbum(request, env, m[1]);
  if (m && method === "DELETE") return deleteMediaAlbum(request, env, m[1]);

  m = path.match(/^\/api\/admin\/media\/(\d+)\/(ai-edit|resample)$/);
  if (m && method === "POST") {
    const input = await readJson(request);
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return json({ ok: false, error: "invalid_image_operation" }, { status: 400 });
    }
    try {
      const result = m[2] === "ai-edit"
        ? await editImageWithPrompt(env, {
            media_asset_id: Number(m[1]), prompt: input.prompt,
            model_id: input.model_id, actor_id: user.id,
          })
        : await resampleImage(env, {
            media_asset_id: Number(m[1]), scale: input.scale, actor_id: user.id,
          });
      return json(result, { status: 201 });
    } catch (error) {
      const code = String(error?.message || "image_operation_failed");
      const status = code.startsWith("openai_image_edit_http_") ? 502
        : code === "media_asset_not_found" || code === "media_source_object_not_found" ? 404
        : code === "media_storage_unavailable" ? 503 : 400;
      return json({ ok: false, error: code }, { status });
    }
  }

  m = path.match(/^\/api\/admin\/media\/(\d+)\/remove-background$/);
  if (m && method === "POST") return removeMediaBackground(request, env, m[1], user);

  m = path.match(/^\/api\/admin\/media\/(\d+)\/comments$/);
  if (m && method === "POST") return addMediaReviewComment(request, env, m[1], user);

  m = path.match(/^\/api\/admin\/media\/(\d+)$/);
  if (m && method === "GET") return getMediaAsset(request, env, m[1]);
  if (m && method === "PATCH") return updateMedia(request, env, m[1]);
  if (m && method === "DELETE") return deleteMedia(request, env, m[1]);

  m = path.match(/^\/api\/admin\/products\/(\d+)\/images$/);
  if (m && method === "GET") return listProductImages(request, env, m[1]);
  if (m && method === "POST") return attachProductImage(request, env, m[1]);

  m = path.match(/^\/api\/admin\/products\/(\d+)\/images\/(\d+)$/);
  if (m && method === "DELETE") return detachProductImage(request, env, m[1], m[2]);

  m = path.match(/^\/api\/admin\/products\/(\d+)\/images\/(\d+)\/primary$/);
  if (m && method === "POST") return setPrimaryProductImage(request, env, m[1], m[2]);

  if (path === "/api/admin/mail/settings" && method === "GET") return getMailSettings(env);
  if (path === "/api/admin/mail/settings" && method === "POST") return postMailSettings(request, env);
  if (path === "/api/admin/mail/partial" && method === "GET") return getMailPartial(request, env);
  if (path === "/api/admin/mail/messages" && method === "GET") {
    return listMailMessages(env, url, user);
  }
  let mailHydrateMatch = path.match(/^\/api\/admin\/mail\/messages\/([^/]+)\/hydrate$/);
  if (mailHydrateMatch && method === "POST") {
    return hydrateInboundMessage(env, user, decodeURIComponent(mailHydrateMatch[1]));
  }
  if (path === "/api/admin/account/profile" && method === "POST") {
    return updateAccountProfile(request, env, user);
  }
  if (path === "/api/admin/team/members" && method === "GET") {
    return listTeamMembers(env, user);
  }
  if (path === "/api/admin/team/invite" && method === "POST") {
    return inviteTeamMember(request, env, user);
  }
  if (path === "/api/admin/mail/mailboxes" && method === "GET") {
    return getMailMailboxes(env, user);
  }
  if (path === "/api/admin/mail/mailboxes" && method === "POST") {
    return createMailbox(request, env, user);
  }
  if (path === "/api/admin/mail/send" && method === "POST") return sendMailPreview(request, env, user);
  if (path === "/api/admin/mail/resend/status" && method === "GET") return getResendStatus(env);

  if (path.startsWith("/api/admin/growth/")) {
    return handleGrowthApi(request, env, url, user);
  }

  if (path.startsWith("/api/admin/discounts/") || path === "/api/admin/discounts") {
    return handleDiscountsApi(request, env, url, user);
  }

  if (path.startsWith("/api/admin/product-studio")) {
    return handleProductStudioAdminApi(request, env, url);
  }

  if (path.startsWith("/api/admin/completeful")) {
    return handleCompletefulAdminApi(request, env, url);
  }

  if (path === "/api/admin/agentsam/providers/workers-ai/code" && method === "POST") {
    return handleWorkersAiCodeProvider(request, env, user);
  }
  if (path === "/api/admin/agentsam/generate-block" && method === "POST") {
    return handleGenerateBlockRequest(request);
  }
  if (path === "/api/admin/agentsam/chat" && method === "POST") {
    return agentsamChat(request, env, executionCtx);
  }
  if (path === "/api/admin/agentsam/files/upload" && method === "POST") {
    return agentsamFileUpload(request, env);
  }
  let fileMatch = path.match(/^\/api\/admin\/agentsam\/files\/([a-z0-9_]+)$/);
  if (fileMatch && method === "GET") return agentsamFileGet(env, fileMatch[1]);
  if (fileMatch && method === "DELETE") return agentsamFileDelete(env, fileMatch[1]);
  if (path === "/api/admin/agentsam/conversations" && method === "GET") {
    return agentsamConversationsList(env);
  }
  if (path === "/api/admin/agentsam/conversations" && method === "POST") {
    return agentsamConversationCreate(request, env);
  }
  let convMatch = path.match(/^\/api\/admin\/agentsam\/conversations\/([a-z0-9_]+)$/);
  if (convMatch && method === "GET") return agentsamConversationGet(env, convMatch[1]);
  if (convMatch && method === "PATCH") return agentsamConversationPatch(request, env, convMatch[1]);
  if (convMatch && method === "DELETE") return agentsamConversationDelete(env, convMatch[1]);
  let toolCallMatch = path.match(/^\/api\/admin\/agentsam\/tool-calls\/([a-z0-9_]+)$/);
  if (toolCallMatch && method === "GET") return agentsamToolCallGet(env, toolCallMatch[1]);
  if (path === "/api/admin/agentsam/status" && method === "GET") {
    try {
      return await agentsamStatus(env, user?.id || null);
    } catch (err) {
      console.error("[agentsam/status]", err);
      return json({ ok: false, error: err?.message || "Status unavailable" }, { status: 500 });
    }
  }
  if (path === "/api/admin/agentsam/tools" && method === "GET") {
    try {
      return await agentsamTools(env);
    } catch (err) {
      console.error("[agentsam/tools]", err);
      return json({ ok: false, error: err?.message || "Tools unavailable" }, { status: 500 });
    }
  }
  if (path === "/api/admin/agentsam/prompts" && method === "GET") {
    return agentsamPromptsList(env);
  }
  if (path === "/api/admin/agentsam/prompts/cache/summary" && method === "GET") {
    return agentsamPromptCacheSummary(env, user?.account_id || null);
  }
  if (path === "/api/admin/agentsam/tools/semantic-search" && method === "POST") {
    return agentsamSemanticSearch(request, env);
  }
  if (path === "/api/admin/agentsam/prompts/cache/invalidate" && method === "POST") {
    return agentsamPromptCacheInvalidate(request, env);
  }
  if (path === "/api/admin/agentsam/ai/models" && method === "GET") {
    return agentsamAiModelsList(env);
  }
  if (path === "/api/admin/agentsam/tools/catalog" && method === "GET") {
    return agentsamToolsCatalog(env);
  }
  if (path === "/api/admin/agentsam/analytics/summary" && method === "GET") {
    return agentsamAnalyticsSummary(env, url);
  }
  if (path === "/api/admin/agentsam/compaction/status" && method === "GET") {
    return agentsamCompactionStatus(env);
  }
  if (path === "/api/admin/agentsam/compaction/run" && method === "POST") {
    return agentsamCompactionRun(request, env, executionCtx);
  }
  if (path === "/api/admin/analytics/logs/recent" && method === "GET") {
    // Production diagnostic traces contain privileged operational metadata.
    // The same admin session gate applies; restrict to administrator roles.
    if (!["admin","owner","super_admin"].includes(String(user.role||"").toLowerCase()))
      return json({error:"logs_admin_permission_required"},{status:403,headers:{"cache-control":"no-store"}});
    const result=await fetchCloudflareLiveLogs(env,{windowSeconds:url.searchParams.get("window")||180});
    return json(result,{status:result.ok?200:result.status,headers:{"cache-control":"no-store"}});
  }
  if (path === "/api/admin/analytics/health" && method === "GET") {
    return json(await getHealthAnalytics(env, url.searchParams.get("range") || "30d"));
  }
  if (path === "/api/admin/analytics/finance" && method === "GET") {
    const range = url.searchParams.get("range") || "30d";
    const data = await getFinanceAnalytics(env, range);
    return json(data);
  }
  if (path === "/api/admin/agentsam/mcp/status" && method === "GET") {
    const user = await getSessionUser(request, env);
    return agentsamMcpStatus(env, user?.id || null);
  }
  if (path === "/api/admin/agentsam/github/start" && method === "GET") {
    return agentsamGithubOAuthStart(request, env);
  }
  if (path === "/api/admin/agentsam/github/callback" && method === "GET") {
    return agentsamGithubOAuthCallback(request, env);
  }
  if (path === "/api/admin/agentsam/github/status" && method === "GET") {
    return agentsamGithubOAuthStatus(request, env);
  }
  if (path === "/api/admin/agentsam/github/disconnect" && method === "POST") {
    return agentsamGithubOAuthDisconnect(request, env);
  }
  if (path === "/api/admin/agentsam/workflows" && method === "GET") {
    return agentsamWorkflowsList(env);
  }
  if (path === "/api/admin/agentsam/workflows/drawer" && method === "GET") {
    return agentsamDrawerWorkflowsList(env);
  }
  if (path === "/api/admin/agentsam/skills" && method === "GET") {
    return agentsamSkillsList(env, url);
  }

  let skillMatch = path.match(/^\/api\/admin\/agentsam\/skills\/([a-z0-9-]+)$/);
  if (skillMatch && method === "GET") {
    return agentsamSkillGet(env, skillMatch[1], url);
  }

  const cmsResponse = await handleAdminCmsApi(request, env, url, { accountId: user.account_id });
  if (cmsResponse) return cmsResponse;

  return json({ error: "Not found" }, { status: 404 });
}
