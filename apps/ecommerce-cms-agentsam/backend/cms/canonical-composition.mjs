import { buildBlockTree } from "./composition-contract.ts";

/**
 * Read the installed D1 document without interpreting PAGE_REGISTRY fixture
 * defaults as authored content. Consumers must explicitly choose draft/live.
 */
export async function readCanonicalComposition(env, accountId, slug) {
  if (!accountId || !/^[a-z0-9-]{1,100}$/.test(String(slug))) {
    throw new Error("cms_composition_invalid_scope");
  }
  const page = await env.DB.prepare(
    `SELECT id,slug,title,page_type,template_key,status,metadata_json
       FROM cms_pages WHERE account_id=? AND slug=? LIMIT 1`
  ).bind(accountId,slug).first();
  if (!page) return null;
  const sections = await env.DB.prepare(
    `SELECT id,section_key,section_type,sort_order,status,inline_content_json,
            content_r2_key,content_version,metadata_json
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
    page:{id:page.id,slug:page.slug,title:page.title,
      pageType:page.page_type,templateKey:page.template_key,
      status:page.status,metadata:decode(page.metadata_json)},
    sections:(sections.results||[]).map(row=>({
      id:row.id,key:row.section_key,type:row.section_type,
      order:row.sort_order,status:row.status,
      settings:decode(row.inline_content_json),
      contentR2Key:row.content_r2_key,
      contentVersion:row.content_version,
      metadata:decode(row.metadata_json),
      blocks:buildBlockTree(row.id,blockRows.filter(b=>b.section_id===row.id)),
    })),
  };
}
