import { resolveCmsSite } from "./site-context.mjs";

/**
 * Translation boundary for the already-deployed project-oriented cms_pages
 * table. This table remains the one owner of existing pages; no mirrored
 * data, synthetic legacy IDs, or new registry are created here.
 */
const parse = raw => {
  try {
    const value = JSON.parse(raw || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch { return {}; }
};
const problem = (error, status) => ({ error, status });
const cmsSlug = value => String(value || "").trim().toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

async function selectedSite(env, accountId, siteId) {
  if (!accountId) throw new Error("cms_page_account_required");
  return resolveCmsSite(env.DB, { accountId, siteId, createDefault: !siteId });
}

async function findPage(env, site, slug, pageId = null) {
  const predicate = pageId ? "p.id = ?" : "p.slug = ?";
  return env.DB.prepare(`
    SELECT p.id, p.site_id, p.project_id, p.project_slug, p.slug,
      p.route_path, p.title, p.page_type, p.template_sku, p.status,
      p.updated_at, p.is_homepage, p.nav_visible, p.metadata_json
    FROM cms_pages p
    JOIN cms_sites owner ON owner.id=p.site_id
    WHERE owner.account_id=? AND p.site_id=? AND ${predicate} LIMIT 1
  `).bind(site.account_id, site.id, pageId || slug).first();
}

export async function getProjectSitePage(env, accountId, slug, siteId, pageId = null) {
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
    source: "cms-project-site",
    seeded: true,
    page: {
      id: page.id, site_id: site.id, slug: page.slug,
      route_path: page.route_path, title: page.title,
      page_type: page.page_type, template_key: page.template_sku,
      status: page.status, updated_at: new Date(Number(page.updated_at) * 1000).toISOString(),
      is_homepage: Boolean(page.is_homepage),
      metadata: parse(page.metadata_json), site,
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
      // Never imply an existing published page is safe to mutate in place.
      content_authority: page.status === "published" ? "cms-published" : "cms-draft-only",
    },
  };
}

export async function createProjectSitePage(env, accountId, siteId, body = {}) {
  if (!accountId) return problem("Account required", 403);
  const title = String(body.title || "").trim();
  const slug = cmsSlug(body.slug || title);
  if (!title || title.length > 200) return problem("Page title is required", 400);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80 || slug === "site") {
    return problem("Page URL handle is invalid or reserved", 400);
  }
  const requestedType = String(body.page_type || body.pageType || "standard");
  if (!["standard","scene"].includes(requestedType)) return problem("Unsupported page type", 400);
  const site = await selectedSite(env, accountId, siteId);
  const routePath = String(body.route_path || body.routePath || (slug === "home" ? "/" : "/" + slug));
  if (!/^\/(?:[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*)?\/?$/.test(routePath)) {
    return problem("Page route is invalid", 400);
  }
  const conflict = await env.DB.prepare(
    "SELECT id FROM cms_pages WHERE site_id=? AND (slug=? OR route_path=?) LIMIT 1"
  ).bind(site.id, slug, routePath).first();
  if (conflict) return problem("A page with this URL already exists on this site", 409);

  const id = "cmsp_" + crypto.randomUUID().replaceAll("-", "").slice(0, 20);
  const now = Math.floor(Date.now() / 1000);
  try {
    await env.DB.prepare(`
      INSERT INTO cms_pages (id,project_id,project_slug,site_id,slug,path,
        route_path,page_type,title,status,created_at,updated_at,nav_visible,
        is_homepage,metadata_json)
      VALUES (?,?,?,?,?,?,?,? ,?,'draft',?,?,?,?,'{}')
    `).bind(id, site.id, site.slug, site.id, slug, routePath, routePath,
      "custom", title, now, now, body.nav_visible === false ? 0 : 1,
      routePath === "/" ? 1 : 0).run();
  } catch (error) {
    return problem(/unique|constraint/i.test(String(error?.message)) ?
      "A page with this URL already exists" : "Page could not be created", 409);
  }
  const created = await getProjectSitePage(env, accountId, slug, site.id, id);
  return { ok: true, site, page: created.page };
}

export async function updateProjectSitePage(env, accountId, slug, siteId, pageId, body = {}) {
  const site = await selectedSite(env, accountId, siteId);
  const existing = await findPage(env, site, slug, pageId);
  if (!existing) return problem("Page not found in selected site", 404);
  // A published page must be edited through an actual draft/revision flow,
  // never silently modified in place by a generic metadata form.
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
  const conflict = await env.DB.prepare(
    "SELECT id FROM cms_pages WHERE site_id=? AND id!=? AND (slug=? OR route_path=?) LIMIT 1"
  ).bind(site.id, existing.id, nextSlug, routePath).first();
  if (conflict) return problem("A page with this URL already exists", 409);
  const updated = await env.DB.prepare(`
    UPDATE cms_pages SET title=?,slug=?,path=?,route_path=?,updated_at=?
    WHERE id=? AND site_id=? AND status='draft'
  `).bind(title,nextSlug,routePath,routePath,Math.floor(Date.now()/1000),
      existing.id,site.id).run();
  if (!updated.meta?.changes) return problem("Page changed during edit", 409);
  const result = await getProjectSitePage(env, accountId, nextSlug, site.id, existing.id);
  return { ok: true, site, page: result.page };
}
