import { resolveCmsSite } from "./site-context.mjs";

/**
 * Adapter for the shared-D1 site-owned cms_pages schema. cms_sites.id is the
 * page identity boundary; page rows do not duplicate project/workspace/worker
 * ownership fields. The account+legacy-pointer schema is handled separately
 * by the compatibility branch in api.js.
 */
const parse = raw => {
  try {
    const value = typeof raw === "string" ? JSON.parse(raw || "{}") : raw;
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch { return {}; }
};
const json = value => JSON.stringify(parse(value));
const problem = (error, status) => ({ error, status });
const cmsSlug = value => String(value || "").trim().toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const asBoolean = value => value === true || value === 1 || value === "1";
const asIso = value => {
  if (typeof value === "string" && !/^\d+(?:\.\d+)?$/.test(value)) return value;
  const timestamp = Number(value);
  return Number.isFinite(timestamp) ? new Date(timestamp * 1000).toISOString() : null;
};

const PAGE_TYPES = new Set([
  "home", "about", "services", "work", "case_study", "contact", "pricing",
  "privacy", "terms", "faq", "product", "collection", "blog", "post",
  "landing", "portal", "dashboard", "auth", "sitemap", "custom",
]);

function resolvePageType(value, slug, routePath) {
  const raw = String(value || "").trim().toLowerCase().replace(/[ -]+/g, "_");
  if (["standard", "scene", "interior"].includes(raw)) {
    return routePath === "/" || slug === "home" ? "home" : "custom";
  }
  if (raw === "blog_post") return "post";
  if (PAGE_TYPES.has(raw)) return raw;
  return routePath === "/" || slug === "home" ? "home" : "custom";
}

async function selectedSite(env, accountId, siteId) {
  if (!accountId) throw new Error("cms_page_account_required");
  return resolveCmsSite(env.DB, { accountId, siteId, createDefault: !siteId });
}

async function findPage(env, site, slug, pageId = null) {
  const predicate = pageId ? "p.id = ?" : "p.slug = ?";
  return env.DB.prepare(`
    SELECT p.id, p.site_id, p.slug, p.route_path, p.page_type, p.title,
      p.meta_description, p.description, p.status, p.seo_title, p.canonical_url,
      p.robots, p.og_image_asset_id, p.template_sku, p.nav_visible,
      p.requires_auth, p.is_system_page, p.sort_order, p.seo_json,
      p.config_json, p.metadata_json, p.r2_bucket, p.r2_key, p.r2_url,
      p.content_type, p.content_size_bytes, p.published_manifest_r2_key,
      p.created_at, p.updated_at, p.published_at, p.archived_at
    FROM cms_pages p
    JOIN cms_sites owner ON owner.id=p.site_id
    WHERE owner.account_id=? AND p.site_id=? AND ${predicate} LIMIT 1
  `).bind(site.account_id, site.id, pageId || slug).first();
}

export async function getSiteOwnedPage(env, accountId, slug, siteId, pageId = null) {
  const site = await selectedSite(env, accountId, siteId);
  const page = await findPage(env, site, slug, pageId);
  if (!page) return null;
  const { results = [] } = await env.DB.prepare(`
    SELECT id, section_key, section_type, section_name, section_data,
      sort_order, is_visible
    FROM cms_page_sections WHERE page_id=?
    ORDER BY sort_order ASC, id ASC
  `).bind(page.id).all();
  return {
    ok: true,
    source: "cms-site",
    seeded: true,
    page: {
      id: page.id,
      site_id: site.id,
      slug: page.slug,
      route_path: page.route_path,
      title: page.title,
      description: page.description,
      page_type: page.page_type,
      template_key: page.template_sku,
      template_sku: page.template_sku,
      status: page.status,
      updated_at: asIso(page.updated_at),
      created_at: asIso(page.created_at),
      published_at: asIso(page.published_at),
      archived_at: asIso(page.archived_at),
      is_homepage: page.route_path === "/",
      is_system_page: asBoolean(page.is_system_page),
      nav_visible: asBoolean(page.nav_visible),
      requires_auth: asBoolean(page.requires_auth),
      sort_order: Number(page.sort_order || 0),
      meta_description: page.meta_description,
      seo_title: page.seo_title,
      canonical_url: page.canonical_url,
      robots: page.robots,
      og_image_asset_id: page.og_image_asset_id,
      seo: parse(page.seo_json),
      config: parse(page.config_json),
      metadata: parse(page.metadata_json),
      content: {
        bucket: page.r2_bucket,
        key: page.r2_key,
        url: page.r2_url,
        type: page.content_type,
        size_bytes: Number(page.content_size_bytes || 0),
        published_manifest_key: page.published_manifest_r2_key,
      },
      site,
      sections: results.map(section => ({
        id: section.id,
        key: section.section_key || section.id,
        name: section.section_name || section.section_type,
        content: parse(section.section_data),
        sort_order: section.sort_order,
        status: section.is_visible ? "active" : "hidden",
        source: "cms-d1",
      })),
      missing_source_sections: [],
      content_authority: page.status === "published" ? "cms-published" : "cms-draft-only",
    },
  };
}

export async function createSiteOwnedPage(env, accountId, siteId, body = {}) {
  if (!accountId) return problem("Account required", 403);
  const title = String(body.title || "").trim();
  const slug = cmsSlug(body.slug || title);
  if (!title || title.length > 200) return problem("Page title is required", 400);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80 || slug === "site") {
    return problem("Page URL handle is invalid or reserved", 400);
  }
  const site = await selectedSite(env, accountId, siteId);
  const routePath = String(body.route_path || body.routePath || (slug === "home" ? "/" : "/" + slug));
  if (!/^\/(?:[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*)?\/?$/.test(routePath)) {
    return problem("Page route is invalid", 400);
  }
  const pageType = resolvePageType(body.page_type || body.pageType, slug, routePath);
  const conflict = await env.DB.prepare(
    "SELECT id FROM cms_pages WHERE site_id=? AND (slug=? OR route_path=?) LIMIT 1"
  ).bind(site.id, slug, routePath).first();
  if (conflict) return problem("A page with this URL already exists on this site", 409);

  const maxOrder = await env.DB.prepare(
    "SELECT COALESCE(MAX(sort_order),-10) AS max_sort_order FROM cms_pages WHERE site_id=?"
  ).bind(site.id).first();
  const id = "cmsp_" + crypto.randomUUID().replaceAll("-", "").slice(0, 20);
  const now = Math.floor(Date.now() / 1000);
  const seo = json(body.seo_json ?? body.seo);
  const config = json(body.config_json ?? body.config);
  const metadata = json(body.metadata_json ?? body.metadata);
  const templateSku = body.template_sku || body.template_key || body.templateKey || null;
  const sortOrder = Number.isFinite(Number(body.sort_order))
    ? Number(body.sort_order) : Number(maxOrder?.max_sort_order || 0) + 10;
  try {
    await env.DB.prepare(`
      INSERT INTO cms_pages (
        id, site_id, slug, route_path, page_type, title, description,
        status, seo_title, meta_description, canonical_url, robots,
        og_image_asset_id, template_sku, nav_visible, requires_auth, sort_order,
        seo_json, config_json, metadata_json, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `).bind(
      id, site.id, slug, routePath, pageType, title, body.description ?? null,
      body.seo_title ?? null, body.meta_description ?? null, body.canonical_url ?? null,
      body.robots ?? "index,follow", body.og_image_asset_id ?? null, templateSku,
      asBoolean(body.nav_visible === undefined ? true : body.nav_visible) ? 1 : 0,
      asBoolean(body.requires_auth) ? 1 : 0,
      sortOrder, seo, config, metadata, now, now,
    ).run();
  } catch (error) {
    const message = String(error?.message || error);
    return problem(/unique|constraint/i.test(message)
      ? "A page with this URL already exists" : "Page could not be created",
    /unique|constraint/i.test(message) ? 409 : 500);
  }
  const created = await getSiteOwnedPage(env, accountId, slug, site.id, id);
  return created ? { ok: true, site, page: created.page } : problem("Page creation could not be verified", 500);
}

export async function updateSiteOwnedPage(env, accountId, slug, siteId, pageId, body = {}) {
  const site = await selectedSite(env, accountId, siteId);
  const existing = await findPage(env, site, slug, pageId);
  if (!existing) return problem("Page not found in selected site", 404);
  if (existing.status !== "draft") {
    return problem("This published page needs a versioned draft before editing", 409);
  }
  if (body.status && body.status !== "draft") return problem("Use the publish workflow", 409);
  const title = body.title == null ? existing.title : String(body.title).trim();
  const nextSlug = body.slug == null ? existing.slug : cmsSlug(body.slug);
  if (!title || title.length > 200) return problem("Invalid page title", 400);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(nextSlug) || nextSlug.length > 80) {
    return problem("Invalid page URL handle", 400);
  }
  const routePath = String(body.route_path || body.routePath ||
    (nextSlug !== existing.slug && existing.route_path === "/" + existing.slug ?
      "/" + nextSlug : existing.route_path));
  if (!/^\/(?:[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*)?\/?$/.test(routePath)) {
    return problem("Invalid route path", 400);
  }
  const pageType = body.page_type !== undefined || body.pageType !== undefined
    ? resolvePageType(body.page_type ?? body.pageType, nextSlug, routePath)
    : existing.page_type;
  const conflict = await env.DB.prepare(
    "SELECT id FROM cms_pages WHERE site_id=? AND id!=? AND (slug=? OR route_path=?) LIMIT 1"
  ).bind(site.id, existing.id, nextSlug, routePath).first();
  if (conflict) return problem("A page with this URL already exists", 409);

  const seo = body.seo_json !== undefined || body.seo !== undefined
    ? json(body.seo_json ?? body.seo) : json(existing.seo_json);
  const config = body.config_json !== undefined || body.config !== undefined
    ? json(body.config_json ?? body.config) : json(existing.config_json);
  const metadata = body.metadata_json !== undefined || body.metadata !== undefined
    ? json(body.metadata_json ?? body.metadata) : json(existing.metadata_json);
  const value = (key, alias, fallback) => body[key] !== undefined
    ? body[key] : alias && body[alias] !== undefined ? body[alias] : fallback;
  const templateSku = value("template_sku", "template_key", existing.template_sku) || null;
  const navVisible = body.nav_visible === undefined
    ? Number(existing.nav_visible || 0) : asBoolean(body.nav_visible) ? 1 : 0;
  const requiresAuth = body.requires_auth === undefined
    ? Number(existing.requires_auth || 0) : asBoolean(body.requires_auth) ? 1 : 0;
  const sortOrder = body.sort_order === undefined
    ? Number(existing.sort_order || 0) : Number(body.sort_order);
  if (!Number.isFinite(sortOrder)) return problem("Invalid page sort order", 400);

  const updated = await env.DB.prepare(`
    UPDATE cms_pages SET
      title=?, slug=?, route_path=?, page_type=?, description=?,
      seo_title=?, meta_description=?, canonical_url=?, robots=?,
      og_image_asset_id=?, template_sku=?, nav_visible=?, requires_auth=?,
      sort_order=?, seo_json=?, config_json=?, metadata_json=?, updated_at=?
    WHERE id=? AND site_id=? AND status='draft'
  `).bind(
    title, nextSlug, routePath, pageType,
    value("description", null, existing.description),
    value("seo_title", null, existing.seo_title),
    value("meta_description", null, existing.meta_description),
    value("canonical_url", null, existing.canonical_url),
    value("robots", null, existing.robots),
    value("og_image_asset_id", null, existing.og_image_asset_id),
    templateSku, navVisible, requiresAuth, sortOrder, seo, config, metadata,
    Math.floor(Date.now()/1000), existing.id, site.id,
  ).run();
  if (!updated.meta?.changes) return problem("Page changed during edit", 409);
  const result = await getSiteOwnedPage(env, accountId, nextSlug, site.id, existing.id);
  return result ? { ok: true, site, page: result.page } : problem("Page update could not be verified", 500);
}
