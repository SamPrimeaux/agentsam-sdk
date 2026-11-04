import { resolveCmsSite } from "./site-context.mjs";
import { normalizeSeo } from "./seo.mjs";

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
  "about", "services", "work", "case_study", "contact", "pricing",
  "privacy", "terms", "faq", "product", "collection", "blog", "post",
  "landing", "portal", "dashboard", "auth", "sitemap", "custom",
]);

function resolvePageType(value, slug, routePath) {
  const raw = String(value || "").trim().toLowerCase().replace(/[ -]+/g, "_");
  if (["standard", "scene", "interior", "home"].includes(raw)) {
    return routePath === "/" ? "landing" : "page";
  }
  if (raw === "blog_post") return "post";
  if (PAGE_TYPES.has(raw)) return raw;
  return routePath === "/" ? "landing" : "page";
}
const SYSTEM_TYPES = new Set(["auth", "portal", "dashboard", "sitemap"]);

async function selectedSite(env, accountId, siteId) {
  if (!accountId) throw new Error("cms_page_account_required");
  return resolveCmsSite(env.DB, { accountId, siteId, createDefault: !siteId });
}

async function findPage(env, site, slug, pageId = null) {
  const predicate = pageId ? "p.id = ?" : "p.slug = ?";
  return env.DB.prepare(`
    SELECT p.id, p.site_id, p.slug, p.route_path, p.page_type, p.title,
      p.status, p.template_sku, p.nav_visible, p.requires_auth, p.sort_order,
      p.seo_json, p.metadata_json, p.content_object_key,
      p.published_manifest_object_key, p.created_at, p.updated_at, p.published_at
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
      sort_order, is_visible, r2_bucket, draft_r2_key, published_r2_key, updated_at
    FROM cms_page_sections WHERE page_id=?
    ORDER BY sort_order ASC, id ASC
  `).bind(page.id).all();
  const versions = await env.DB.prepare(`
    SELECT entity_id, MAX(revision_number) AS n FROM cms_revisions
    WHERE account_id=? AND site_id=? AND entity_type='section'
    GROUP BY entity_id
  `).bind(accountId, site.id).all();
  const versionBySection = new Map((versions.results || []).map(row => [row.entity_id, Number(row.n || 0)]));
  const sections = await Promise.all(results.map(async section => {
    let content = parse(section.section_data);
    const pointer = section.draft_r2_key || section.published_r2_key;
    if (pointer) {
      const storage = section.r2_bucket === "cms" ? env.CMS_CONTENT
        : section.r2_bucket === "agentsam-os-blueprint-content" ? env.WEBSITE_ASSETS : null;
      if (!storage) throw new Error("cms_section_bucket_unavailable");
      const object = await storage.get(pointer);
      if (!object) throw new Error("cms_section_object_missing");
      try {
        const saved = JSON.parse(await object.text());
        if (!saved || typeof saved !== "object" || Array.isArray(saved)) throw new Error("invalid_section");
        content = saved;
      } catch { throw new Error("cms_section_content_invalid"); }
    }
    return {
      id: section.id, key: section.section_key || section.id,
      name: section.section_name || section.section_type,
      content, sort_order: section.sort_order,
      status: section.is_visible ? "active" : "hidden",
      source: pointer ? "cms-r2" : "cms-d1",
      version: versionBySection.get(section.id) || 0,
      updated_at: section.updated_at,
    };
  }));
  const seo = normalizeSeo(parse(page.seo_json));
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
      description: seo.description ?? null,
      page_type: page.page_type,
      template_key: page.template_sku,
      template_sku: page.template_sku,
      status: page.status,
      updated_at: asIso(page.updated_at),
      created_at: asIso(page.created_at),
      published_at: asIso(page.published_at),
      is_homepage: page.route_path === "/",
      is_system_page: SYSTEM_TYPES.has(page.page_type),
      nav_visible: asBoolean(page.nav_visible),
      requires_auth: asBoolean(page.requires_auth),
      sort_order: Number(page.sort_order || 0),
      // Derived views of seo_json for existing editor clients; seo_json is the only store.
      meta_description: seo.description ?? null,
      seo_title: seo.title ?? null,
      canonical_url: seo.canonical ?? null,
      robots: seo.noindex ? "noindex,follow" : "index,follow",
      og_image_asset_id: seo.og_image ?? null,
      seo,
      config: {},
      metadata: parse(page.metadata_json),
      content: {
        key: page.content_object_key,
        published_manifest_key: page.published_manifest_object_key,
      },
      site,
      sections,
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
  const seo = json(normalizeSeo({
    ...parse(body.seo_json ?? body.seo),
    ...(body.seo_title != null ? { title: body.seo_title } : {}),
    ...(body.meta_description != null ? { description: body.meta_description } : {}),
    ...(body.canonical_url != null ? { canonical: body.canonical_url } : {}),
    ...(body.robots != null ? { robots: body.robots } : {}),
    ...(body.og_image_asset_id != null ? { og_image: body.og_image_asset_id } : {}),
  }));
  const metadata = json(body.metadata_json ?? body.metadata);
  const templateSku = body.template_sku || body.template_key || body.templateKey || null;
  const sortOrder = Number.isFinite(Number(body.sort_order))
    ? Number(body.sort_order) : Number(maxOrder?.max_sort_order || 0) + 10;
  try {
    await env.DB.prepare(`
      INSERT INTO cms_pages (
        id, site_id, slug, route_path, page_type, title, status,
        template_sku, nav_visible, requires_auth, sort_order,
        seo_json, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, site.id, slug, routePath, pageType, title, templateSku,
      asBoolean(body.nav_visible === undefined ? true : body.nav_visible) ? 1 : 0,
      asBoolean(body.requires_auth) ? 1 : 0,
      sortOrder, seo, metadata, now, now,
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

  const seoPatch = {
    ...(body.seo_json !== undefined || body.seo !== undefined ? parse(body.seo_json ?? body.seo) : parse(existing.seo_json)),
    ...(body.seo_title !== undefined ? { title: body.seo_title } : {}),
    ...(body.meta_description !== undefined ? { description: body.meta_description } : {}),
    ...(body.canonical_url !== undefined ? { canonical: body.canonical_url } : {}),
    ...(body.robots !== undefined ? { robots: body.robots } : {}),
    ...(body.og_image_asset_id !== undefined ? { og_image: body.og_image_asset_id } : {}),
  };
  const seo = json(normalizeSeo(seoPatch));
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
      title=?, slug=?, route_path=?, page_type=?, template_sku=?,
      nav_visible=?, requires_auth=?, sort_order=?, seo_json=?,
      metadata_json=?, updated_at=?
    WHERE id=? AND site_id=? AND status='draft'
  `).bind(
    title, nextSlug, routePath, pageType, templateSku, navVisible,
    requiresAuth, sortOrder, seo, metadata,
    Math.floor(Date.now()/1000), existing.id, site.id,
  ).run();
  if (!updated.meta?.changes) return problem("Page changed during edit", 409);
  const result = await getSiteOwnedPage(env, accountId, nextSlug, site.id, existing.id);
  return result ? { ok: true, site, page: result.page } : problem("Page update could not be verified", 500);
}

/**
 * Write only a private R2 draft for an established site-owned page. The
 * published object and published page status remain unchanged.
 */
export async function saveSiteOwnedSectionDraft(env, accountId, slug, siteId, pageId, sectionKey, body = {}) {
  if (!accountId || !siteId) return problem("cms_site_required", 400);
  if (!env?.CMS_CONTENT) return problem("cms_section_bucket_unavailable", 503);
  let site;
  try { site = await selectedSite(env, accountId, siteId); }
  catch { return problem("site_not_found_or_unauthorized", 404); }
  const page = await findPage(env, site, slug, pageId);
  if (!page) return problem("cms_page_not_found", 404);
  const section = await env.DB.prepare(`
    SELECT id, section_key, draft_r2_key, r2_bucket FROM cms_page_sections
    WHERE page_id=? AND (section_key=? OR id=?) LIMIT 1
  `).bind(page.id, sectionKey, sectionKey).first();
  if (!section) return problem("cms_section_not_found", 404);
  if (section.r2_bucket !== "cms") return problem("cms_section_bucket_not_supported", 409);
  const content = body.content;
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    return problem("cms_section_content_invalid", 400);
  }
  const serialized = JSON.stringify(content);
  if (new TextEncoder().encode(serialized).length > 524288) return problem("cms_section_content_too_large", 413);
  const current = await env.DB.prepare(`
    SELECT COALESCE(MAX(revision_number),0) AS version FROM cms_revisions
    WHERE account_id=? AND site_id=? AND entity_type='section' AND entity_id=?
  `).bind(accountId, site.id, section.id).first();
  const version = Number(current?.version || 0);
  if (body.expected_version != null && Number(body.expected_version) !== version) {
    return problem("cms_section_revision_conflict", 409);
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(serialized));
  const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  const revision = version + 1;
  const key = "cms/sections/drafts/" + encodeURIComponent(page.id) + "/" +
    encodeURIComponent(section.id) + "/revision-" + String(revision).padStart(6, "0") +
    "-" + hash.slice(0, 16) + ".json";
  await env.CMS_CONTENT.put(key, serialized, { httpMetadata: { contentType: "application/json" } });
  const changed = await env.DB.prepare(`
    UPDATE cms_page_sections SET draft_r2_key=?, content_hash=?, updated_at=datetime('now')
    WHERE id=? AND page_id=? AND draft_r2_key IS ?
  `).bind(key, hash, section.id, page.id, section.draft_r2_key).run();
  if (Number(changed.meta?.changes || 0) !== 1) return problem("cms_section_revision_conflict", 409);
  await env.DB.prepare(`
    INSERT INTO cms_revisions(account_id, site_id, entity_type, entity_id, revision_number,
      revision_kind, content_object_key, content_hash, snapshot_json, metadata_json)
    VALUES (?,?,'section',?,?,'draft',?,?,?,?)
  `).bind(accountId, site.id, section.id, revision, key, hash,
    JSON.stringify({ content }), JSON.stringify({ source: "cms-site", published: false })).run();
  return { ok: true, version: revision, section_key: section.section_key || section.id,
    content_object_key: key, published: false, updated_at: new Date().toISOString() };
}
