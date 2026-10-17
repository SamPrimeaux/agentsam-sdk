/**
 * Portable Brand workspace.
 *
 * Brand identity authority: D1 company.
 * Asset authority: D1 media_assets plus R2 keys.
 * Role assignments are stored in company metadata; this module never creates
 * a second brand-asset database.
 */

import { getCompany, updateCompany } from "../lib/company.js";
import { mediaPathForKey } from "../assets/product-optimize.js";

// Shared, brand-neutral identity fields. Stored under company.meta.brand_profile;
// no new tenant, CMS, or asset authority is introduced.
export const BRAND_PROFILE_FIELDS = Object.freeze({
  purpose: 1200,
  mission: 1200,
  vision: 1200,
  originStory: 3000,
  audience: 1200,
  positioning: 1200,
  promise: 1000,
  values: 1000,
  personality: 600,
  voice: 1000,
  voiceDo: 1200,
  voiceDont: 1200,
  keyMessage: 1000,
  shortDescription: 400,
  headlineFont: 160,
  bodyFont: 160,
  imageDirection: 1000,
  secondaryColor: 7,
  textColor: 7,
  instagramUrl: 300,
  facebookUrl: 300,
  tiktokUrl: 300,
  youtubeUrl: 300,
});

export function validateBrandProfile(input, current = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("invalid_brand_profile");
  const output = { ...current };
  for (const [key, value] of Object.entries(input)) {
    if (!Object.hasOwn(BRAND_PROFILE_FIELDS, key)) throw new Error("unsupported_brand_profile_field");
    if (value != null && typeof value !== "string") throw new Error("invalid_brand_profile_value");
    const cleaned = String(value || "").trim();
    if (key.endsWith("Color") && cleaned && !/^#[0-9a-f]{6}$/i.test(cleaned)) {
      throw new Error("invalid_brand_color");
    }
    if (cleaned.length > BRAND_PROFILE_FIELDS[key]) throw new Error("brand_profile_value_too_long");
    if (key.endsWith("Url") && cleaned) {
      try {
        const parsed = new URL(cleaned);
        if (!["https:", "http:"].includes(parsed.protocol)) throw new Error("invalid");
      } catch {
        throw new Error("invalid_brand_social_url");
      }
    }
    output[key] = cleaned;
  }
  return output;
}

const BRAND_ROLES = Object.freeze({
  logo: { label: "Primary logo", coreField: "logoUrl", metaKey: "logo_asset_key" },
  favicon: { label: "Favicon", coreField: "faviconUrl", metaKey: "favicon_asset_key" },
  social_image: { label: "Social image", metaKey: "social_image_asset_key" },
  wordmark: { label: "Wordmark" },
  mark: { label: "Brand mark" },
  logo_light: { label: "Light-background logo" },
  logo_dark: { label: "Dark-background logo" },
  brand_hero: { label: "Brand key visual" },
});

function json(data, init = {}) {
  return Response.json(data, init);
}

function cleanAsset(row) {
  if (!row) return null;
  const r2Key = String(row.r2_key || "").replace(/^\/+/, "");
  return {
    id: Number(row.id),
    r2_key: r2Key,
    url: mediaPathForKey(r2Key),
    filename: row.filename || r2Key.split("/").pop() || "asset",
    content_type: row.content_type || null,
    alt_text: row.alt_text || "",
    folder: row.folder || null,
  };
}

function currentRole(company, role) {
  const def = BRAND_ROLES[role];
  const stored = company?.meta?.brand_assets?.[role];
  if (stored && typeof stored === "object") {
    return {
      role,
      label: def.label,
      media_asset_id: stored.media_asset_id ?? null,
      r2_key: stored.r2_key || null,
      url: stored.r2_key ? mediaPathForKey(stored.r2_key) : stored.url || null,
    };
  }

  let url = null;
  if (role === "logo") url = company?.logoUrl || null;
  else if (role === "favicon") url = company?.faviconUrl || null;
  else if (role === "social_image") url = company?.meta?.social_image_url || null;

  return {
    role,
    label: def.label,
    media_asset_id: null,
    r2_key: company?.meta?.[def.metaKey] || null,
    url,
  };
}

export function buildBrandRolePatch(company, role, asset) {
  if (!BRAND_ROLES[role]) throw new Error("unsupported_brand_role");
  if (!asset?.r2_key) throw new Error("brand_asset_missing_r2_key");

  const clean = cleanAsset(asset);
  const currentMeta = company?.meta && typeof company.meta === "object" ? company.meta : {};
  const brandAssets =
    currentMeta.brand_assets && typeof currentMeta.brand_assets === "object"
      ? { ...currentMeta.brand_assets }
      : {};

  brandAssets[role] = {
    media_asset_id: clean.id,
    r2_key: clean.r2_key,
    url: clean.url,
  };

  const meta = { ...currentMeta, brand_assets: brandAssets };
  const def = BRAND_ROLES[role];
  if (def.metaKey) meta[def.metaKey] = clean.r2_key;
  if (role === "social_image") meta.social_image_url = clean.url;

  const patch = { meta };
  if (role === "logo") patch.logoUrl = clean.url;
  if (role === "favicon") patch.faviconUrl = clean.url;
  return patch;
}

export function buildClearBrandRolePatch(company, role) {
  if (!BRAND_ROLES[role]) throw new Error("unsupported_brand_role");

  const currentMeta = company?.meta && typeof company.meta === "object" ? company.meta : {};
  const brandAssets =
    currentMeta.brand_assets && typeof currentMeta.brand_assets === "object"
      ? { ...currentMeta.brand_assets }
      : {};
  delete brandAssets[role];

  const meta = { ...currentMeta, brand_assets: brandAssets };
  const def = BRAND_ROLES[role];
  if (def.metaKey) delete meta[def.metaKey];
  if (role === "social_image") delete meta.social_image_url;

  const patch = { meta };
  if (role === "logo") patch.logoUrl = null;
  if (role === "favicon") patch.faviconUrl = null;
  return patch;
}

async function listBrandCandidates(env) {
  if (!env?.DB) return [];
  const { results } = await env.DB.prepare(
    "SELECT id, r2_key, filename, content_type, alt_text, folder " +
      "FROM media_assets " +
      "WHERE lower(COALESCE(content_type, '')) LIKE 'image/%' " +
      "OR lower(filename) LIKE '%.svg' " +
      "OR lower(filename) LIKE '%.png' " +
      "OR lower(filename) LIKE '%.jpg' " +
      "OR lower(filename) LIKE '%.jpeg' " +
      "OR lower(filename) LIKE '%.webp' " +
      "OR lower(filename) LIKE '%.avif' " +
      "ORDER BY updated_at DESC, id DESC LIMIT 120"
  ).all();
  return (results || []).map(cleanAsset);
}

// Paged, server-side search over the existing media_assets authority. The first
// 120 recent files alone are insufficient to assign older logos and brand media.
export async function searchBrandAssets(request, env) {
  if (!env?.DB) return json({ ok: false, error: "media_unavailable" }, { status: 503 });
  const url = new URL(request.url);
  const search = String(url.searchParams.get("q") || "").trim().slice(0, 100).toLowerCase();
  const page = Math.max(1, Math.min(200, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1));
  const pageSize = 48;
  const images = "(lower(COALESCE(content_type,'')) LIKE 'image/%' OR lower(COALESCE(filename,'')) GLOB '*.svg' OR lower(COALESCE(filename,'')) GLOB '*.png' OR lower(COALESCE(filename,'')) GLOB '*.jpg' OR lower(COALESCE(filename,'')) GLOB '*.jpeg' OR lower(COALESCE(filename,'')) GLOB '*.webp' OR lower(COALESCE(filename,'')) GLOB '*.avif')";
  const filter = search
    ? " AND (instr(lower(COALESCE(filename,'')),?) > 0 OR instr(lower(COALESCE(alt_text,'')),?) > 0 OR instr(lower(COALESCE(r2_key,'')),?) > 0)"
    : "";
  const binds = search ? [search, search, search] : [];
  const countRow = await env.DB.prepare("SELECT COUNT(*) AS count FROM media_assets WHERE " + images + filter)
    .bind(...binds).first();
  const { results } = await env.DB.prepare(
    "SELECT id,r2_key,filename,content_type,alt_text,folder FROM media_assets WHERE " +
    images + filter + " ORDER BY id DESC LIMIT ? OFFSET ?"
  ).bind(...binds, pageSize, (page - 1) * pageSize).all();
  const count = Number(countRow?.count || 0);
  return json({
    ok: true,
    assets: (results || []).map(cleanAsset),
    page,
    page_size: pageSize,
    total: count,
    has_more: page * pageSize < count,
  });
}

export async function getBrandWorkspace(env, options = {}) {
  const company = await getCompany(env);
  if (!company) return json({ ok: false, error: "company_not_configured" }, { status: 404 });

  return json({
    ok: true,
    company,
    profile: company.meta?.brand_profile || {},
    roles: Object.keys(BRAND_ROLES).map((role) => currentRole(company, role)),
    // Existing consumers receive media candidates by default. New mobile
    // workspaces request include_assets=0 and search on demand instead.
    assets: options.includeAssets === false ? [] : await listBrandCandidates(env),
    authority: {
      identity: "company",
      assets: "media_assets",
      assignments: "company.meta.brand_assets",
    },
  });
}

export async function patchBrandWorkspace(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const company = await getCompany(env);
  if (!company) return json({ ok: false, error: "company_not_configured" }, { status: 404 });

  if (body?.profile != null && (typeof body.profile !== "object" || Array.isArray(body.profile))) {
    return json({ ok: false, error: "invalid_brand_profile" }, { status: 400 });
  }
  if (body?.company || body?.profile) {
    const allowed = [
      "name", "legalName", "logoUrl", "faviconUrl", "primaryColor",
      "authBgColor", "supportEmail", "websiteUrl", "tagline",
    ];
    const patch = {};
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(body.company || {}, key)) {
        patch[key] = body.company[key];
      }
    }
    if (Object.hasOwn(patch, "name") && !String(patch.name || "").trim()) {
      return json({ ok: false, error: "brand_name_required" }, { status: 400 });
    }
    for (const key of ["primaryColor", "authBgColor"]) {
      if (patch[key] && !/^#[0-9a-f]{6}$/i.test(String(patch[key]))) {
        return json({ ok: false, error: "invalid_brand_color" }, { status: 400 });
      }
    }
    if (body.profile) {
      try {
        patch.meta = {
          ...(company.meta || {}),
          brand_profile: validateBrandProfile(body.profile, company.meta?.brand_profile || {}),
        };
      } catch (error) {
        return json({ ok: false, error: error.message }, { status: 400 });
      }
    }
    const result = await updateCompany(env, patch);
    if (!result.ok) return json(result, { status: 400 });
  }

  if (body?.assign) {
    const role = String(body.assign.role || "");
    if (!BRAND_ROLES[role]) {
      return json({ ok: false, error: "unsupported_brand_role" }, { status: 400 });
    }
    const assetId = Number(body.assign.media_asset_id);
    if (!Number.isFinite(assetId)) {
      return json({ ok: false, error: "media_asset_id_required" }, { status: 400 });
    }

    const asset = await env.DB.prepare(
      "SELECT id, r2_key, filename, content_type, alt_text, folder " +
        "FROM media_assets WHERE id = ? LIMIT 1"
    )
      .bind(assetId)
      .first();

    if (!asset) return json({ ok: false, error: "media_asset_not_found" }, { status: 404 });

    const contentType = String(asset.content_type || "").toLowerCase();
    if (contentType && !contentType.startsWith("image/")) {
      return json({ ok: false, error: "brand_role_requires_image" }, { status: 400 });
    }

    const fresh = await getCompany(env);
    await updateCompany(env, buildBrandRolePatch(fresh, role, asset));
  }

  if (body?.clear_role) {
    const role = String(body.clear_role || "");
    if (!BRAND_ROLES[role]) {
      return json({ ok: false, error: "unsupported_brand_role" }, { status: 400 });
    }
    const fresh = await getCompany(env);
    await updateCompany(env, buildClearBrandRolePatch(fresh, role));
  }

  return getBrandWorkspace(env);
}
