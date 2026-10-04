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
  listMedia,
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
import { handleAdminCmsApi } from "../cms/api.js";
import { getFinanceAnalytics } from "./analytics-finance.js";
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
import { retryAssetJob, runAdminCompaction } from "./ops.js";
import { handleGrowthApi } from "./growth.js";
import { handleDiscountsApi } from "./discounts.js";
import { handleCompletefulAdminApi } from "./completeful.js";
import { handleProductStudioAdminApi } from "./product-studio.js";
import { getBrandWorkspace, patchBrandWorkspace } from "./brand.js";

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

async function getProduct(request, env, id) {
  const product = await env.DB.prepare(`SELECT * FROM products WHERE id = ?`).bind(id).first();
  if (!product) return json({ error: "Not found" }, { status: 404 });

  const { results: variants } = await env.DB.prepare(
    `SELECT * FROM product_variants WHERE product_id = ? ORDER BY id`
  )
    .bind(id)
    .all();

  return json({ ok: true, product, variants });
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
      `INSERT INTO products (slug, title, description, collection, price_cents, image_url, status, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    )
      .bind(
        slug,
        String(body.title).trim(),
        body.description || null,
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
  const cdn = "https://assets.ember.example/";
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

async function updateProduct(request, env, id) {
  const body = await readJson(request);
  if (!body) return json({ error: "Invalid body" }, { status: 400 });
  if (!String(body.title || "").trim()) {
    return json({ error: "Title required" }, { status: 400 });
  }

  const priceCents = parsePriceCents(body.price_cents ?? body.price ?? 0);
  const slug = body.slug?.trim();
  const title = String(body.title).trim();

  try {
    if (slug) {
      await env.DB.prepare(
        `UPDATE products
         SET slug = ?, title = ?, description = ?, collection = ?, price_cents = ?, image_url = ?, status = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
        .bind(
          slug,
          title,
          body.description || null,
          body.collection || null,
          priceCents,
          body.image_url || null,
          body.status || "draft",
          id
        )
        .run();
    } else {
      await env.DB.prepare(
        `UPDATE products
         SET title = ?, description = ?, collection = ?, price_cents = ?, image_url = ?, status = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
        .bind(
          title,
          body.description || null,
          body.collection || null,
          priceCents,
          body.image_url || null,
          body.status || "draft",
          id
        )
        .run();
    }

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

async function patchVariantInventory(request, env, id) {
  const body = await readJson(request);
  if (!body || body.inventory_qty == null) {
    return json({ error: "inventory_qty required" }, { status: 400 });
  }

  await env.DB.prepare(
    `UPDATE product_variants SET inventory_qty = ?, updated_at = datetime('now') WHERE id = ?`
  )
    .bind(Math.round(Number(body.inventory_qty)), id)
    .run();

  return json({ ok: true });
}

async function deleteVariant(request, env, id) {
  await env.DB.prepare(`DELETE FROM product_variants WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}

// ----- Inventory (flat view) -----

async function listInventory(request, env) {
  const { results } = await env.DB.prepare(
    `SELECT v.id, v.sku, v.size, v.color, v.inventory_qty, v.price_cents AS variant_price_cents,
            p.id AS product_id, p.title AS product_title, p.price_cents AS product_price_cents, p.status
     FROM product_variants v
     JOIN products p ON p.id = v.product_id
     ORDER BY v.inventory_qty ASC, p.title ASC`
  ).all();
  return json({ ok: true, inventory: results });
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
    return onlineStoreOverview(env);
  }
  if (path === "/api/admin/store/preferences" && method === "GET") {
    return getStorePreferences(env);
  }
  if (path === "/api/admin/store/preferences" && method === "POST") {
    return postStorePreferences(request, env);
  }

  if (path === "/api/admin/agentsam/maintenance/compact" && method === "POST") {
    return runAdminCompaction(request, env);
  }

  let m = path.match(/^\/api\/admin\/assets\/jobs\/([^/]+)\/retry$/);
  if (m && method === "POST") {
    return retryAssetJob(request, env, m[1], url);
  }

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

  if (path === "/api/admin/brand" && method === "GET") return getBrandWorkspace(env);
  if (path === "/api/admin/brand" && method === "PATCH") return patchBrandWorkspace(request, env);

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

  m = path.match(/^\/api\/admin\/media\/(\d+)$/);
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
  if (path === "/api/admin/mail/send" && method === "POST") return sendMailPreview(request, env);
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

  const cmsResponse = await handleAdminCmsApi(request, env, url);
  if (cmsResponse) return cmsResponse;

  return json({ error: "Not found" }, { status: 404 });
}
