import { buildBlockTree } from "./composition-contract.ts";
import { resolveCmsSite } from "./site-context.mjs";
import { cmsPageStorageMode } from "./page-inventory.mjs";
import { findSiteOwnedPage, getSiteOwnedPage } from "./site-owned-page-adapter.mjs";

/**
 * Read the installed D1 document without interpreting PAGE_REGISTRY fixture
 * defaults as authored content. Consumers must explicitly choose draft/live.
 */
export async function readCanonicalComposition(env, accountId, slug, siteId = null) {
  if (!accountId || !/^[a-z0-9-]{1,100}$/.test(String(slug))) {
    throw new Error("cms_composition_invalid_scope");
  }
  const site = await resolveCmsSite(env.DB, { accountId, siteId });
  const storageMode = await cmsPageStorageMode(env.DB);
  if (storageMode !== "site-first") {
    // Production pages inherit account ownership from cms_sites. Reuse the
    // existing site-owned adapter for the real draft content, including R2.
    // Passing the resolved page ID also prevents a read from seeding globals.
    const owned = await findSiteOwnedPage(env, site, slug);
    if (!owned) return null;
    const result = await getSiteOwnedPage(env, accountId, slug, site.id, owned.id);
    if (!result) return null;
    const { page } = result;
    const { results: blocks = [] } = await env.DB.prepare(`
      SELECT b.id,b.section_id,b.parent_block_id,b.block_key,b.block_type,
             b.sort_order,b.status,b.content_json
        FROM cms_section_blocks b
        JOIN cms_page_sections s ON s.id=b.section_id
        JOIN cms_pages p ON p.id=s.page_id
        JOIN cms_sites owner ON owner.id=p.site_id
       WHERE b.account_id=? AND owner.account_id=? AND p.site_id=? AND p.id=?
       ORDER BY b.sort_order,b.id
    `).bind(accountId,accountId,site.id,page.id).all();
    // Metadata belongs to the section row, not to a fixture or the renderer.
    const sectionColumns = await env.DB.prepare("PRAGMA table_info(cms_page_sections)").bind().all();
    const hasMetadata = (sectionColumns.results || []).some(c => c.name === "metadata_json");
    const { results: metadataRows = [] } = hasMetadata
      ? await env.DB.prepare("SELECT id,metadata_json FROM cms_page_sections WHERE page_id=?").bind(page.id).all()
      : { results: [] };
    const metadata = new Map(metadataRows.map(row => [row.id, JSON.parse(row.metadata_json || "{}") || {}]));
    return {
      authority: "cms_d1_installed", revision: "draft",
      page: { id:page.id, siteId:site.id, slug:page.slug, title:page.title,
        pageType:page.page_type, templateKey:page.template_sku, status:page.status, metadata:page.metadata },
      sections: page.sections.map(section => ({
        id:section.id, key:section.key, type:section.type, order:section.sort_order,
        status:section.status, settings:section.content, contentObjectKey:section.source_object_key,
        contentBucket:section.source_bucket,
        contentVersion:section.version, metadata:metadata.get(section.id) || {},
        ...(section.read_only ? {readOnly:true,sourceError:section.source_error} : {}),
        blocks:buildBlockTree(section.id,blocks.filter(b=>b.section_id===section.id)),
      })),
    };
  }
  const page = await env.DB.prepare(
    `SELECT id,site_id,slug,title,page_type,template_key,status,metadata_json
       FROM cms_pages WHERE account_id=? AND site_id=? AND slug=? LIMIT 1`
  ).bind(accountId,site.id,slug).first();
  if (!page) return null;
  const sections = await env.DB.prepare(
    `SELECT id,section_key,section_type,sort_order,status,inline_content_json,
            content_object_key,content_version,metadata_json
       FROM cms_page_sections WHERE account_id=? AND page_id=?
         AND status NOT IN ('archived','removed')
       ORDER BY sort_order,id`
  ).bind(accountId,page.id).all();
  const blocks = await env.DB.prepare(
    `SELECT b.id,b.section_id,b.parent_block_id,b.block_key,b.block_type,
            b.sort_order,b.status,b.content_json
       FROM cms_section_blocks b
       JOIN cms_page_sections s ON s.id=b.section_id
            AND s.account_id=b.account_id
       WHERE b.account_id=? AND s.page_id=?
       ORDER BY b.sort_order,b.id`
  ).bind(accountId,page.id).all();
  const blockRows = blocks.results || [];
  const decode = value => {
    try {
      const result = JSON.parse(value||"{}");
      return result && typeof result==="object" && !Array.isArray(result) ? result : {};
    } catch { throw new Error("cms_composition_invalid_content_json"); }
  };
  return {
    authority:"cms_d1_installed",
    revision:"draft",
    page:{id:page.id,siteId:page.site_id,slug:page.slug,title:page.title,
      pageType:page.page_type,templateKey:page.template_key,
      status:page.status,metadata:decode(page.metadata_json)},
    sections:(sections.results||[]).map(row=>({
      id:row.id,key:row.section_key,type:row.section_type,
      order:row.sort_order,status:row.status,
      settings:decode(row.inline_content_json),
      contentObjectKey:row.content_object_key,
      contentVersion:row.content_version,
      metadata:decode(row.metadata_json),
      blocks:buildBlockTree(row.id,blockRows.filter(b=>b.section_id===row.id)),
    })),
  };
}
