import { D1BrandRegistryAdapter } from "@inneranimalmedia/agentsam-brand/registry";

const json = (body, status = 200) => Response.json(body, {
  status,
  headers: { "cache-control": "private, no-store" },
});

async function requireActiveAccount(db, accountId) {
  if (!/^au_[a-z0-9]+$/i.test(String(accountId || ""))) throw new Error("authenticated_account_required");
  const row = await db.prepare("SELECT id,status FROM accounts WHERE id = ? LIMIT 1").bind(accountId).first();
  if (!row || row.status !== "active") throw new Error("authenticated_account_required");
}

async function requireBrandAdmin(db, userId, accountId) {
  const user = await db.prepare(
    "SELECT id,role,is_superadmin,default_account_id,status FROM auth_users WHERE id = ? LIMIT 1"
  ).bind(userId).first();
  // The brands table is globally shared, not tenant-owned. Account admin
  // status alone cannot grant platform-wide brand identity writes.
  if (!user || user.status !== "active" ||
      Number(user.is_superadmin) !== 1 ||
      (user.default_account_id && String(user.default_account_id) !== String(accountId))) {
    throw new Error("brand_registry_admin_required");
  }
}

function allowedBody(body, fields) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  return Object.keys(body).every((key) => fields.includes(key));
}

export async function handleBrandRegistryRequest(request, env, {
  accountId,
  userId,
  slug = null,
} = {}) {
  if (!env.DB?.prepare) return json({ ok: false, error: "brand_registry_unavailable" }, 503);
  try {
    await requireActiveAccount(env.DB, accountId);
    const registry = new D1BrandRegistryAdapter({ db: env.DB, accountId });

    if (request.method === "GET") {
      if (slug) {
        const brand = await registry.find({ slug, accountId, includeAssets: true, assetLimit: 500 });
        if (!brand) return json({ ok: false, error: "brand_not_found" }, 404);
        return json({ ok: true, brand, source: "brands" });
      }
      const [brands, unmatchedAssetSlugs] = await Promise.all([
        registry.list({ accountId, includeArchived: false, limit: 500 }),
        registry.listUnmatchedAssetSlugs({ accountId }),
      ]);
      return json({ ok: true, brands, unmatchedAssetSlugs, count: brands.length, source: "brands" });
    }

    if (!["POST", "PATCH"].includes(request.method)) {
      return json({ ok: false, error: "method_not_allowed" }, 405);
    }
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) {
      return json({ ok: false, error: "origin_not_allowed" }, 403);
    }
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return json({ ok: false, error: "json_content_type_required" }, 415);
    }
    const raw = await request.text();
    if (raw.length > 16000) return json({ ok: false, error: "brand_registry_input_too_large" }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return json({ ok: false, error: "brand_registry_input_invalid" }, 400); }

    await requireBrandAdmin(env.DB, userId, accountId);
    const writable = new D1BrandRegistryAdapter({ db: env.DB, accountId, allowWrites: true });

    if (request.method === "POST") {
      const fields = [
        "name", "slug", "displayName", "display_name", "tagline", "description",
        "mission", "parentBrandId", "parent_brand_id", "architectureModel",
        "architecture_model", "status", "priority", "tags", "domain",
        "alternateDomains", "alternate_domains", "subdomain", "metaTitle",
        "meta_title", "metaDescription", "meta_description", "metaKeywords",
        "meta_keywords", "ogImageUrl", "og_image_url", "twitterHandle",
        "twitter_handle", "canonicalBaseUrl", "canonical_base_url", "theme",
        "theme_json", "settings", "settings_json", "timezone", "serviceTier",
        "service_tier", "is_public", "requires_oauth", "notes", "usageNotes",
        "usage_notes", "projectId", "project_id", "metadata", "metadata_json",
      ];
      if (!allowedBody(body, fields)) return json({ ok: false, error: "brand_registry_fields_invalid" }, 400);
      const result = await writable.register(body);
      return json({ ok: true, ...result }, 201);
    }

    if (!slug) return json({ ok: false, error: "brand_slug_required" }, 400);
    const fields = [
      "name", "displayName", "display_name", "tagline", "description", "mission",
      "parentBrandId", "parent_brand_id", "architectureModel", "architecture_model",
      "status", "priority", "tags", "domain", "alternateDomains", "alternate_domains",
      "subdomain", "metaTitle", "meta_title", "metaDescription", "meta_description",
      "metaKeywords", "meta_keywords", "ogImageUrl", "og_image_url", "twitterHandle",
      "twitter_handle", "canonicalBaseUrl", "canonical_base_url", "theme", "theme_json",
      "settings", "settings_json", "timezone", "serviceTier", "service_tier", "is_public",
      "requires_oauth", "notes", "usageNotes", "usage_notes", "projectId", "project_id",
      "metadata", "metadata_json",
    ];
    if (!allowedBody(body, fields)) return json({ ok: false, error: "brand_registry_fields_invalid" }, 400);
    const existing = await registry.find({ slug, accountId });
    if (!existing) return json({ ok: false, error: "brand_not_found" }, 404);
    const result = await writable.update(existing.id, body);
    return json({ ok: true, ...result });
  } catch (error) {
    const code = String(error?.message || "brand_registry_unavailable");
    const status = code === "authenticated_account_required" ? 401
      : code === "brand_registry_admin_required" ? 403
      : code === "brand_not_found" ? 404
      : code === "brand_slug_conflict" ? 409
      : code.includes("unavailable") ? 503 : 400;
    return json({ ok: false, error: code.slice(0, 120) }, status);
  }
}
