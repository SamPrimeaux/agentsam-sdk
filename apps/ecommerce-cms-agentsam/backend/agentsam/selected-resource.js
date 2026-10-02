import { mediaSourceFromRow } from "../media/provider-contract.js";
import { slugForStorefrontPath } from "../cms/html-rewriter.js";

function parseMeta(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function mediaResourceFromRow(row) {
  const meta = parseMeta(row.meta_json);
  return {
    id: row.id,
    source: mediaSourceFromRow(row),
    filename: row.filename,
    r2_key: row.r2_key,
    content_type: row.content_type,
    size_bytes: row.size_bytes,
    folder: row.folder,
    category: row.category || null,
    alt_text: row.alt_text || "",
    tags: Array.isArray(meta.tags) ? meta.tags.slice(0, 20) : [],
    optimization: meta.optimization
      ? {
          status: meta.optimization.status || null,
          width: meta.optimization.width || null,
          height: meta.optimization.height || null,
          savings_pct: meta.optimization.savings_pct ?? null,
        }
      : null,
  };
}

async function loadMediaRows(env, ids) {
  const placeholders = ids.map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    "SELECT id,filename,r2_key,url,content_type,size_bytes,folder,alt_text,category,meta_json " +
      "FROM media_assets WHERE id IN (" + placeholders + ") ORDER BY id"
  ).bind(...ids).all();
  return results || [];
}

async function resolveMediaAsset(env, resource) {
  const id = Number(resource.id);
  if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid media asset");
  const rows = await loadMediaRows(env, [id]);
  if (rows.length !== 1) throw new Error("Selected media asset does not belong to this store");
  return {
    type: "media_asset",
    surface: "content-library",
    ...mediaResourceFromRow(rows[0]),
  };
}

async function resolveMediaSelection(env, resource) {
  const ids = Array.isArray(resource.ids)
    ? [...new Set(resource.ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))].slice(0, 100)
    : [];
  if (!ids.length) throw new Error("Media selection is empty");

  const rows = await loadMediaRows(env, ids);
  if (rows.length !== ids.length) {
    throw new Error("One or more selected media assets do not belong to this store");
  }

  return {
    type: "media_selection",
    surface: "content-library",
    count: rows.length,
    ids: rows.map((row) => row.id),
    assets: rows.map(mediaResourceFromRow),
  };
}

/** Store-local session authorization precedes this lookup in the admin router. */
export async function resolveSelectedResource(env, resource) {
  if (!resource || typeof resource !== "object") {
    throw new Error("Unsupported editable resource");
  }

  if (resource.surface === "content-library" && resource.type === "media_asset") {
    return resolveMediaAsset(env, resource);
  }

  if (resource.type === "media_selection" && resource.surface === "content-library") {
    return resolveMediaSelection(env, resource);
  }

  if (resource.type !== "section" || resource.surface !== "theme-studio") {
    throw new Error("Unsupported editable resource");
  }

  const slug = slugForStorefrontPath(String(resource.page || ""));
  if (!slug || typeof resource.id !== "string" || resource.id.length > 100) {
    throw new Error("Invalid store selection");
  }

  const section = await env.DB.prepare(
    "SELECT s.id,s.section_key,p.slug FROM page_sections s " +
      "JOIN pages p ON p.id=s.page_id WHERE p.slug=? AND s.section_key=?"
  ).bind(slug, resource.id).first();

  if (!section) throw new Error("Selected section does not belong to this store");

  return {
    type: "section",
    id: section.id,
    key: section.section_key,
    page: section.slug,
    surface: "theme-studio",
    label: String(resource.label || "").slice(0, 160),
  };
}
