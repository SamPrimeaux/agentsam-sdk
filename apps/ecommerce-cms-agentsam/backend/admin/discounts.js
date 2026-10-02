/**
 * Discounts admin API — /api/admin/discounts/*
 */

import { FNF_ACCOUNT_ID } from "../agentsam/constants.js";
import {
  discountTypeLabel,
  mapDiscount,
  normalizeCode,
  parseJson,
} from "../lib/discounts.js";

function json(data, init = {}) {
  return Response.json(data, init);
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function discountId() {
  return `disc_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function nowIso() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function resolveStatus(body, existing) {
  if (body.status) return body.status;
  const starts = body.starts_at ?? existing?.starts_at;
  const ends = body.ends_at ?? existing?.ends_at;
  const now = nowIso();
  if (starts && starts > now) return "scheduled";
  if (ends && ends < now) return "expired";
  return body.active === false ? "draft" : "active";
}

async function getOverview(env) {
  const [stats, recent, redemptionStats] = await Promise.all([
    env.DB.prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS drafts,
         COALESCE(SUM(uses_count), 0) AS total_uses
       FROM discounts WHERE account_id = ?`
    )
      .bind(FNF_ACCOUNT_ID)
      .first()
      .catch(() => ({ total: 0, active: 0, drafts: 0, total_uses: 0 })),
    env.DB.prepare(
      `SELECT * FROM discounts WHERE account_id = ? ORDER BY updated_at DESC LIMIT 8`
    )
      .bind(FNF_ACCOUNT_ID)
      .all()
      .catch(() => ({ results: [] })),
    env.DB.prepare(
      `SELECT COALESCE(SUM(amount_cents), 0) AS total_discounted, COUNT(*) AS redemptions
       FROM discount_redemptions`
    )
      .first()
      .catch(() => ({ total_discounted: 0, redemptions: 0 })),
  ]);

  return json({
    ok: true,
    overview: {
      total: stats?.total ?? 0,
      active: stats?.active ?? 0,
      drafts: stats?.drafts ?? 0,
      total_uses: stats?.total_uses ?? 0,
      total_discounted_cents: redemptionStats?.total_discounted ?? 0,
      redemptions: redemptionStats?.redemptions ?? 0,
    },
    discounts: (recent.results || []).map(mapDiscount),
  });
}

async function listDiscounts(env, url) {
  const status = url.searchParams.get("status");
  const q = (url.searchParams.get("q") || "").trim();
  let sql = `SELECT * FROM discounts WHERE account_id = ?`;
  const binds = [FNF_ACCOUNT_ID];

  if (status) {
    sql += ` AND status = ?`;
    binds.push(status);
  }
  if (q) {
    sql += ` AND (code LIKE ? COLLATE NOCASE OR title LIKE ? COLLATE NOCASE)`;
    binds.push(`%${q}%`, `%${q}%`);
  }
  sql += ` ORDER BY updated_at DESC LIMIT 200`;

  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return json({ ok: true, discounts: results.map(mapDiscount) });
}

async function createDiscount(request, env, user) {
  const body = await readJson(request);
  if (!body?.title?.trim()) return json({ error: "Title required" }, { status: 400 });

  const method = body.method === "automatic" ? "automatic" : "code";
  let code = method === "code" ? normalizeCode(body.code || randomCode()) : null;
  if (method === "code" && !code) return json({ error: "Discount code required" }, { status: 400 });

  if (code) {
    const existing = await env.DB.prepare(
      `SELECT id FROM discounts WHERE account_id = ? AND code = ? COLLATE NOCASE LIMIT 1`
    )
      .bind(FNF_ACCOUNT_ID, code)
      .first();
    if (existing) return json({ error: "Discount code already exists" }, { status: 409 });
  }

  const id = discountId();
  const status = resolveStatus(body);

  await env.DB.prepare(
    `INSERT INTO discounts (
       id, account_id, title, code, method, discount_type, value_type, value,
       applies_to, applies_to_json, eligibility, min_requirement_type, min_requirement_value,
       max_uses_total, max_uses_per_customer, combine_product, combine_order, combine_shipping,
       starts_at, ends_at, status, metadata_json, created_by, updated_by
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      FNF_ACCOUNT_ID,
      body.title.trim(),
      code,
      method,
      body.discount_type || "product",
      body.value_type || "percent",
      Math.max(0, Math.round(Number(body.value || 0))),
      body.applies_to || "all",
      JSON.stringify(body.applies_to_ids || []),
      body.eligibility || "all",
      body.min_requirement_type || "none",
      Math.max(0, Math.round(Number(body.min_requirement_value || 0))),
      body.max_uses_total != null ? Math.max(1, Math.round(Number(body.max_uses_total))) : null,
      Math.max(0, Math.round(Number(body.max_uses_per_customer || 0))),
      body.combine_product ? 1 : 0,
      body.combine_order ? 1 : 0,
      body.combine_shipping ? 1 : 0,
      body.starts_at || null,
      body.ends_at || null,
      status,
      JSON.stringify(body.metadata || {}),
      user.id,
      user.id
    )
    .run();

  const row = await env.DB.prepare(`SELECT * FROM discounts WHERE id = ? LIMIT 1`).bind(id).first();
  return json({ ok: true, discount: mapDiscount(row) }, { status: 201 });
}

async function getDiscount(env, id) {
  const row = await env.DB.prepare(
    `SELECT * FROM discounts WHERE account_id = ? AND id = ? LIMIT 1`
  )
    .bind(FNF_ACCOUNT_ID, id)
    .first();
  if (!row) return json({ error: "Discount not found" }, { status: 404 });

  const redemptions = await env.DB.prepare(
    `SELECT COUNT(*) AS n, COALESCE(SUM(amount_cents), 0) AS total
     FROM discount_redemptions WHERE discount_id = ?`
  )
    .bind(id)
    .first();

  return json({
    ok: true,
    discount: mapDiscount(row),
    stats: {
      redemptions: redemptions?.n ?? 0,
      total_discounted_cents: redemptions?.total ?? 0,
      type_label: discountTypeLabel(row),
    },
  });
}

async function updateDiscount(request, env, user, id) {
  const existing = await env.DB.prepare(
    `SELECT * FROM discounts WHERE account_id = ? AND id = ? LIMIT 1`
  )
    .bind(FNF_ACCOUNT_ID, id)
    .first();
  if (!existing) return json({ error: "Discount not found" }, { status: 404 });

  const body = await readJson(request);
  if (!body) return json({ error: "Invalid body" }, { status: 400 });

  const method = body.method ?? existing.method;
  let code = method === "automatic" ? null : normalizeCode(body.code ?? existing.code);
  if (method === "code" && !code) return json({ error: "Discount code required" }, { status: 400 });

  if (code && code !== existing.code) {
    const dup = await env.DB.prepare(
      `SELECT id FROM discounts WHERE account_id = ? AND code = ? COLLATE NOCASE AND id != ? LIMIT 1`
    )
      .bind(FNF_ACCOUNT_ID, code, id)
      .first();
    if (dup) return json({ error: "Discount code already exists" }, { status: 409 });
  }

  const status = body.status ?? resolveStatus(body, existing);

  await env.DB.prepare(
    `UPDATE discounts SET
       title = ?, code = ?, method = ?, discount_type = ?, value_type = ?, value = ?,
       applies_to = ?, applies_to_json = ?, eligibility = ?,
       min_requirement_type = ?, min_requirement_value = ?,
       max_uses_total = ?, max_uses_per_customer = ?,
       combine_product = ?, combine_order = ?, combine_shipping = ?,
       starts_at = ?, ends_at = ?, status = ?, metadata_json = ?,
       updated_by = ?, updated_at = datetime('now')
     WHERE account_id = ? AND id = ?`
  )
    .bind(
      (body.title ?? existing.title).trim(),
      code,
      method,
      body.discount_type ?? existing.discount_type,
      body.value_type ?? existing.value_type,
      Math.max(0, Math.round(Number(body.value ?? existing.value ?? 0))),
      body.applies_to ?? existing.applies_to,
      JSON.stringify(body.applies_to_ids ?? parseJson(existing.applies_to_json, [])),
      body.eligibility ?? existing.eligibility,
      body.min_requirement_type ?? existing.min_requirement_type,
      Math.max(0, Math.round(Number(body.min_requirement_value ?? existing.min_requirement_value ?? 0))),
      body.max_uses_total !== undefined
        ? body.max_uses_total == null
          ? null
          : Math.max(1, Math.round(Number(body.max_uses_total)))
        : existing.max_uses_total,
      Math.max(0, Math.round(Number(body.max_uses_per_customer ?? existing.max_uses_per_customer ?? 0))),
      (body.combine_product ?? !!existing.combine_product) ? 1 : 0,
      (body.combine_order ?? !!existing.combine_order) ? 1 : 0,
      (body.combine_shipping ?? !!existing.combine_shipping) ? 1 : 0,
      body.starts_at !== undefined ? body.starts_at : existing.starts_at,
      body.ends_at !== undefined ? body.ends_at : existing.ends_at,
      status,
      JSON.stringify(body.metadata ?? parseJson(existing.metadata_json, {})),
      user.id,
      FNF_ACCOUNT_ID,
      id
    )
    .run();

  const row = await env.DB.prepare(`SELECT * FROM discounts WHERE id = ? LIMIT 1`).bind(id).first();
  return json({ ok: true, discount: mapDiscount(row) });
}

async function exportDiscounts(env) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM discounts WHERE account_id = ? ORDER BY updated_at DESC`
  )
    .bind(FNF_ACCOUNT_ID)
    .all();

  const header = [
    "id",
    "title",
    "code",
    "method",
    "discount_type",
    "value_type",
    "value",
    "status",
    "uses_count",
    "starts_at",
    "ends_at",
    "created_at",
  ];
  const rows = (results || []).map((r) =>
    [
      r.id,
      r.title,
      r.code || "",
      r.method,
      r.discount_type,
      r.value_type,
      r.value,
      r.status,
      r.uses_count,
      r.starts_at || "",
      r.ends_at || "",
      r.created_at,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );

  const csv = [header.join(","), ...rows].join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="fnf-discounts.csv"',
    },
  });
}

export async function handleDiscountsApi(request, env, url, user) {
  const path = url.pathname;
  const method = request.method;

  if (path === "/api/admin/discounts/overview" && method === "GET") {
    try {
      return await getOverview(env);
    } catch (err) {
      console.error("[discounts/overview]", err);
      return json({ error: err?.message || "Overview failed" }, { status: 500 });
    }
  }

  if (path === "/api/admin/discounts/export" && method === "GET") {
    try {
      return await exportDiscounts(env);
    } catch (err) {
      return json({ error: err?.message || "Export failed" }, { status: 500 });
    }
  }

  if (path === "/api/admin/discounts" && method === "GET") {
    try {
      return await listDiscounts(env, url);
    } catch (err) {
      return json({ error: err?.message || "List failed" }, { status: 500 });
    }
  }

  if (path === "/api/admin/discounts" && method === "POST") {
    try {
      return await createDiscount(request, env, user);
    } catch (err) {
      return json({ error: err?.message || "Create failed" }, { status: 500 });
    }
  }

  let m = path.match(/^\/api\/admin\/discounts\/([a-z0-9_]+)$/);
  if (m && method === "GET") return getDiscount(env, m[1]);
  if (m && method === "PATCH") {
    try {
      return await updateDiscount(request, env, user, m[1]);
    } catch (err) {
      return json({ error: err?.message || "Update failed" }, { status: 500 });
    }
  }

  return json({ error: "Not found" }, { status: 404 });
}
