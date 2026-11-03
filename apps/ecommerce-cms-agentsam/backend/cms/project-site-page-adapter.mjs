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
      sort_order, is_visible, r2_bucket, draft_r2_key, published_r2_key, updated_at
    FROM cms_page_sections WHERE page_id=?
    ORDER BY sort_order ASC, id ASC
  `).bind(page.id).all();
  const versions=await env.DB.prepare(`
    SELECT entity_id,MAX(revision_number) AS n FROM cms_revisions
    WHERE account_id=? AND site_id=? AND entity_type='section'
    GROUP BY entity_id
  `).bind(accountId,site.id).all();
  const versionBySection=new Map((versions.results||[]).map(row=>[row.entity_id,Number(row.n||0)]));
  const sections=await Promise.all(results.map(async section=>{
    let content=parse(section.section_data);
    const pointer=section.draft_r2_key||section.published_r2_key;
    if(pointer){
      const storage=section.r2_bucket==='cms'?env.CMS_CONTENT
        :section.r2_bucket==='agentsam-os-blueprint-content'?env.WEBSITE_ASSETS
        :null;
      if(!storage)throw new Error('cms_project_section_bucket_unavailable');
      const object=await storage.get(pointer);
      if(!object)throw new Error('cms_project_section_object_missing');
      try {
        const saved=JSON.parse(await object.text());
        if(!saved||typeof saved!=='object'||Array.isArray(saved))
          throw new Error('invalid_section');
        content=saved;
      } catch { throw new Error('cms_project_section_content_invalid'); }
    }
    return {
      id:section.id,key:section.section_key||section.id,
      name:section.section_name||section.section_type,
      content,sort_order:section.sort_order,
      status:section.is_visible?'active':'hidden',
      source:pointer?'cms-r2':'cms-d1',
      version:versionBySection.get(section.id)||0,
      updated_at:section.updated_at,
    };
  }));
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
      sections,
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

  // On the deployed project-site schema, project_id is a real historical
  // identity and differs from cms_sites.id (for example, proj_agentsam_sdk).
  // New pages must join their site's established project rather than silently
  // creating a parallel project namespace that other project-owned APIs miss.
  const { results: mappings = [] } = await env.DB.prepare(`
    SELECT project_id, project_slug, COUNT(*) AS page_count,
      SUM(CASE WHEN is_homepage=1 THEN 1 ELSE 0 END) AS homepage_count
    FROM cms_pages WHERE site_id=?
    GROUP BY project_id, project_slug
    ORDER BY page_count DESC, homepage_count DESC, project_id ASC LIMIT 2
  `).bind(site.id).all();
  const project = mappings[0] || null;
  if (mappings.length > 1 &&
      mappings[0].page_count === mappings[1].page_count &&
      mappings[0].homepage_count === mappings[1].homepage_count) {
    return problem("This website has conflicting source projects; reconcile ownership before adding a page", 409);
  }
  const projectId = project?.project_id || site.id;
  const projectSlug = project?.project_slug || site.slug;
  const id = "cmsp_" + crypto.randomUUID().replaceAll("-", "").slice(0, 20);
  const now = Math.floor(Date.now() / 1000);
  try {
    await env.DB.prepare(`
      INSERT INTO cms_pages (id,project_id,project_slug,site_id,slug,path,
        route_path,page_type,title,status,created_at,updated_at,nav_visible,
        is_homepage,metadata_json)
      VALUES (?,?,?,?,?,?,?,? ,?,'draft',?,?,?,?,'{}')
    `).bind(id, projectId, projectSlug, site.id, slug, routePath, routePath,
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

/**
 * Write only a private R2 draft for an established project-owned page.
 * The published object and the published page status remain unchanged.
 * The section ID and site/account ownership are resolved on the server.
 */
export async function saveProjectSiteSectionDraft(env,accountId,slug,siteId,pageId,sectionKey,body={}) {
  if(!accountId||!siteId)return problem('cms_site_required',400);
  if(!env?.CMS_CONTENT)return problem('cms_project_section_bucket_unavailable',503);
  let site;
  try{site=await selectedSite(env,accountId,siteId);}
  catch{return problem('site_not_found_or_unauthorized',404);}
  const page=await findPage(env,site,slug,pageId);
  if(!page)return problem('cms_page_not_found',404);
  const section=await env.DB.prepare(`
    SELECT id,section_key,draft_r2_key,r2_bucket FROM cms_page_sections
    WHERE page_id=? AND (section_key=? OR id=?) LIMIT 1
  `).bind(page.id,sectionKey,sectionKey).first();
  if(!section)return problem('cms_section_not_found',404);
  if(section.r2_bucket!=='cms')return problem('cms_section_bucket_not_supported',409);
  const content=body.content;
  if(!content||typeof content!=='object'||Array.isArray(content))
    return problem('cms_section_content_invalid',400);
  const serialized=JSON.stringify(content);
  if(new TextEncoder().encode(serialized).length>524288)
    return problem('cms_section_content_too_large',413);
  const current=await env.DB.prepare(`
    SELECT COALESCE(MAX(revision_number),0) AS version FROM cms_revisions
    WHERE account_id=? AND site_id=? AND entity_type='section' AND entity_id=?
  `).bind(accountId,site.id,section.id).first();
  const version=Number(current?.version||0);
  if(body.expected_version!=null&&Number(body.expected_version)!==version)
    return problem('cms_section_revision_conflict',409);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(serialized));
  const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  const revision=version+1;
  const key='cms/sections/drafts/'+encodeURIComponent(page.id)+'/'+
    encodeURIComponent(section.id)+'/revision-'+String(revision).padStart(6,'0')+
    '-'+hash.slice(0,16)+'.json';
  await env.CMS_CONTENT.put(key,serialized,{httpMetadata:{contentType:'application/json'}});
  const changed=await env.DB.prepare(`
    UPDATE cms_page_sections SET draft_r2_key=?,content_hash=?,updated_at=datetime('now')
    WHERE id=? AND page_id=? AND draft_r2_key IS ?
  `).bind(key,hash,section.id,page.id,section.draft_r2_key).run();
  if(Number(changed.meta?.changes||0)!==1)return problem('cms_section_revision_conflict',409);
  await env.DB.prepare(`
    INSERT INTO cms_revisions(account_id,site_id,entity_type,entity_id,revision_number,
      revision_kind,content_object_key,content_hash,snapshot_json,metadata_json)
    VALUES (?,?,'section',?,?,'draft',?,?,?,?)
  `).bind(accountId,site.id,section.id,revision,key,hash,
    JSON.stringify({content}),JSON.stringify({source:'cms-project-site',published:false})).run();
  return {ok:true,version:revision,section_key:section.section_key||section.id,
    content_object_key:key,published:false,updated_at:new Date().toISOString()};
}
