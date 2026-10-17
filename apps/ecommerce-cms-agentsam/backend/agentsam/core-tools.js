import { readOnlySql } from "./d1-sql.ts";
import { runD1Mutation } from "./d1-mutation.ts";
import { listCatalogModels } from "./model-catalog-tools.js";
import { MEDIA_EXECUTABLE_TOOL_KEYS, executeMediaTool } from "./media-tool-executors.js";

const D1_QUERY_MAX_ROWS = 200;

function boundedLimit(value, fallback = 20, max = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.max(1, Math.floor(parsed)), max);
}

function likeQuery(value) {
  const text = String(value || "").trim();
  return text ? `%${text.replaceAll("%", "\\%").replaceAll("_", "\\_")}%` : null;
}

export const CORE_EXECUTABLE_TOOL_KEYS = new Set([
  "fnf_store_orders_list",
  "fnf_store_products_list",
  "fnf_cms_pages_list",
  "fnf_media_library_list",
  ...MEDIA_EXECUTABLE_TOOL_KEYS,
  "fnf_r2_media_list",
  "fnf_agentsam_ai_models",
  "agentsam_ping",
  "agentsam_d1_query",
  "agentsam_d1_write",
  "agentsam_d1_delete",
]);

/** These run their own preview-and-confirm step, so the generic write gate must not pre-empt it. */
export const SELF_CONFIRMING_TOOL_KEYS = new Set(["agentsam_d1_write", "agentsam_d1_delete"]);

export async function executeCoreTool(env, tool, params = {}, options = {}) {
  if (MEDIA_EXECUTABLE_TOOL_KEYS.has(tool?.tool_key)) {
    return executeMediaTool(env, tool, params, options);
  }
  switch (tool?.tool_key) {
    case "fnf_store_orders_list": {
      const limit = boundedLimit(params.limit, 20, 100);
      const status = String(params.status || "").trim();
      const clauses = [];
      const binds = [];
      if (status) {
        clauses.push("status = ?");
        binds.push(status);
      }
      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
      const { results } = await env.DB.prepare(
        `SELECT id, customer_email, status, total_cents, subtotal_cents,
                discount_cents, campaign_id, created_at, paid_at
           FROM orders
           ${where}
           ORDER BY id DESC
           LIMIT ?`,
      )
        .bind(...binds, limit)
        .all();
      return { ok: true, orders: results || [] };
    }

    case "fnf_store_products_list": {
      const limit = boundedLimit(params.limit, 24, 100);
      const { results } = await env.DB.prepare(
        `SELECT p.id, p.slug, p.title, p.collection, p.price_cents, p.status,
                p.image_url,
                COUNT(v.id) AS variant_count,
                COALESCE(SUM(v.inventory_qty), 0) AS inventory_qty
           FROM products p
           LEFT JOIN product_variants v ON v.product_id = p.id
           GROUP BY p.id
           ORDER BY p.updated_at DESC, p.id DESC
           LIMIT ?`,
      )
        .bind(limit)
        .all();
      return { ok: true, products: results || [] };
    }

    case "fnf_cms_pages_list": {
      const limit = boundedLimit(params.limit, 20, 100);
      const { results } = await env.DB.prepare(
        `SELECT id, slug, title, status, updated_at
           FROM pages
           ORDER BY updated_at DESC, id DESC
           LIMIT ?`,
      )
        .bind(limit)
        .all();
      return { ok: true, pages: results || [] };
    }

    case "fnf_media_library_list": {
      const limit = boundedLimit(params.limit, 40, 100);
      const folder = String(params.folder || "").trim();
      const q = likeQuery(params.q);
      const clauses = [];
      const binds = [];
      if (folder) {
        clauses.push("folder = ?");
        binds.push(folder);
      }
      if (q) {
        clauses.push("(filename LIKE ? ESCAPE '\\' OR alt_text LIKE ? ESCAPE '\\')");
        binds.push(q, q);
      }
      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
      const { results } = await env.DB.prepare(
        `SELECT id, r2_key, url, filename, content_type, size_bytes,
                category, folder, alt_text, updated_at, created_at
           FROM media_assets
           ${where}
           ORDER BY id DESC
           LIMIT ?`,
      )
        .bind(...binds, limit)
        .all();
      return { ok: true, assets: results || [] };
    }

    case "fnf_r2_media_list": {
      if (!env.WEBSITE_ASSETS?.list) return { ok: false, error: "WEBSITE_ASSETS_not_bound" };
      const limit = boundedLimit(params.limit, 24, 100);
      const prefix = String(params.folder || params.prefix || "").replace(/^\/+/, "");
      const result = await env.WEBSITE_ASSETS.list({ prefix, limit });
      return {
        ok: true,
        prefix,
        objects: (result.objects || []).map((object) => ({
          key: object.key,
          size: object.size,
          uploaded: object.uploaded,
          etag: object.etag,
        })),
        truncated: Boolean(result.truncated),
        cursor: result.cursor || null,
      };
    }

    case "fnf_agentsam_ai_models":
      return listCatalogModels(env, params);

    case "agentsam_ping": {
      let db = "unbound";
      if (env.DB?.prepare) {
        try {
          await env.DB.prepare("SELECT 1").first();
          db = "ok";
        } catch {
          db = "error";
        }
      }
      const bridge = String(env.AGENTSAM_BRIDGE_KEY || "").trim() ? "configured" : "not_configured";
      return { ok: db === "ok", db, bridge };
    }

    case "agentsam_d1_query": {
      if (!env.DB?.prepare) return { ok: false, error: "DB_not_bound" };
      const checked = readOnlySql(params.sql);
      if (!checked.ok) return { ok: false, error: checked.error, ...(checked.detail ? { message: checked.detail } : {}) };
      const binds = Array.isArray(params.params) ? params.params : [];
      if (binds.length > 32 || binds.some((v) => v !== null && !["string", "number", "boolean"].includes(typeof v))) {
        return { ok: false, error: "invalid_params" };
      }
      const limit = boundedLimit(params.limit, 50, D1_QUERY_MAX_ROWS);
      try {
        const { results } = await env.DB.prepare("SELECT * FROM (\n" + checked.sql + "\n) LIMIT " + (limit + 1))
          .bind(...binds.map((v) => (typeof v === "boolean" ? Number(v) : v)))
          .all();
        const rows = results || [];
        return {
          ok: true,
          rows: rows.slice(0, limit),
          row_count: Math.min(rows.length, limit),
          truncated: rows.length > limit,
        };
      } catch (error) {
        return { ok: false, error: "sql_error", message: String(error?.message || error).slice(0, 300) };
      }
    }

    case "agentsam_d1_write":
      return runD1Mutation(env, "write", params, options);

    case "agentsam_d1_delete":
      return runD1Mutation(env, "delete", params, options);

    default:
      return { ok: false, error: "core_tool_not_implemented", tool_key: tool?.tool_key };
  }
}
