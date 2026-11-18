/** Merchant Page Editor publication. `cms_pages` is the only canonical page record.
 * Write verified immutable R2 HTML before CAS advancing its published D1 pointer.
 * The preview and publisher use the exact same safe document renderer. */
import { parseFragment } from 'parse5';
import { selectOwnedPageSite, findSiteOwnedPage } from './site-owned-page-adapter.mjs';
import {renderSiteOwnedPageSections} from './site-owned-section-publication.mjs';

const error = (message, status = 400) => ({ ok: false, error: message, status });
const readObject = raw => { try { const v = typeof raw === 'string' ? JSON.parse(raw) : raw; return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; } };
const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
const safeSlug = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 80;
const allowedTags = new Set(['p','div','br','strong','b','em','i','u','s','h2','h3','h4','blockquote','ul','ol','li','a','img','table','thead','tbody','tr','td','th']);
const blockedTags = new Set(['script','style','iframe','object','embed','form','input','button','svg','math','meta','link','template','base']);
const isValidPath = value => /^\/(?:[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*)?$/i.test(value);
function safeResource(value, image = false) {
  if (typeof value !== 'string' || !value || value.length > 2048) return null;
  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && !/[\u0000-\u001f]/.test(value)) return value;
  try { const url = new URL(value); return url.protocol === 'https:' || (!image && url.protocol === 'mailto:') ? url.href : null; } catch { return null; }
}
/** Reject active/foreign HTML, event handlers, CSS, arbitrary URL schemes. */
export function sanitizeMerchantBody(html) {
  if (typeof html !== 'string' || new TextEncoder().encode(html).length > 120000) throw new Error('cms_page_body_too_large');
  function render(nodes) {
    return (nodes || []).map(node => {
      if (node.nodeName === '#text') return escape(node.value);
      if (node.nodeName === '#comment') return '';
      const tag = node.tagName || '';
      if (blockedTags.has(tag)) return '';
      const children = render(node.childNodes);
      if (!allowedTags.has(tag)) return children;
      const attrs = Object.fromEntries((node.attrs || []).map(a => [a.name.toLowerCase(),a.value]));
      if (tag === 'img') {
        const src = safeResource(attrs.src,true);
        if (!src) return '';
        return `<img src="${escape(src)}" alt="${escape((attrs.alt || '').slice(0,180))}" loading="lazy">`;
      }
      if (tag === 'br') return '<br>';
      if (tag === 'a') {
        const href = safeResource(attrs.href);
        return href ? `<a href="${escape(href)}" rel="noopener noreferrer">${children}</a>` : children;
      }
      return `<${tag}>${children}</${tag}>`;
    }).join('');
  }
  return render(parseFragment(html).childNodes);
}
const hex = input => /^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/.test(input || '') ? input : '#263a4b';
export function renderMerchantPage({ site, page, draft, navigation = [], sections = null }) {
  const title = String(draft.title || page.title || '').trim().slice(0,200);
  if (!title) throw new Error('cms_page_title_required');
  const metaTitle = String(draft.seo_title || title).slice(0,200);
  const description = String(draft.seo_description || '').slice(0,1000);
  const content = sanitizeMerchantBody(String(draft.body_html || ''));
  const settings = readObject(site.settings_json);
  const palette = readObject(settings.store);
  const brand = readObject(palette.brand);
  const primary = hex(brand.primary_color || palette.primaryColor || readObject(settings.legacy).primaryColor);
  const storeTitle = String(site.name || 'Store').slice(0,120);
  const noIndex = draft.visibility !== 'visible';
  const items = navigation.filter(item => isValidPath(item.route_path) && item.nav_visible !== 0)
    .slice(0,9).map(item => `<a href="${escape(item.route_path === '/' ? './' : item.route_path.slice(1))}">${escape(String(item.title || item.slug || 'Page').slice(0,70))}</a>`).join('');
  let html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="/"><title>${escape(metaTitle)}</title><meta name="description" content="${escape(description)}"><meta name="robots" content="${noIndex ? 'noindex,nofollow' : 'index,follow'}"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'self' https:; font-src 'self'; base-uri 'self'; form-action 'none'"><style>:root{color-scheme:light;--brand:${primary};--ink:#17212a;--bg:#fff;--sub:#66727b}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}a{color:var(--brand)}.cms-shell{max-width:1150px;margin:auto;padding:0 24px}.cms-header{border-bottom:1px solid #e4e9eb;background:var(--bg)}.cms-header>.cms-shell{min-height:75px;display:flex;justify-content:space-between;align-items:center;gap:20px}.cms-brand{font-weight:750;letter-spacing:-.02em;font-size:18px;text-decoration:none;color:var(--ink)}.cms-nav{display:flex;flex-wrap:wrap;gap:18px}.cms-nav a{text-decoration:none;font-size:13px;color:var(--ink)}.cms-nav a:hover{text-decoration:underline}.cms-content{max-width:880px;padding:48px 24px 100px;min-height:65vh}.cms-content h1{font-size:clamp(30px,4vw,48px);line-height:1.2;letter-spacing:-.03em;margin:0 0 32px}.cms-content h2{font-size:26px;line-height:1.25}.cms-content h3{font-size:21px}.cms-body img{max-width:100%;height:auto}.cms-body table{border-collapse:collapse;display:block;overflow-x:auto}.cms-body td,.cms-body th{padding:9px 13px;border:1px solid #d6dbde}.cms-body blockquote{border-left:3px solid var(--brand);margin:24px 0;padding:2px 20px;color:var(--sub)}.cms-footer{border-top:1px solid #e4e9eb;padding:22px 0;font-size:12px;color:var(--sub)}@media(max-width:650px){.cms-header>.cms-shell{align-items:flex-start;padding-top:16px;padding-bottom:16px;flex-direction:column;gap:9px}.cms-nav{gap:12px}.cms-content{padding-top:30px;}}</style></head><body><header class="cms-header"><div class="cms-shell"><a class="cms-brand" href="./">${escape(storeTitle)}</a><nav class="cms-nav" aria-label="Main navigation">${items}</nav></div></header><main class="cms-shell cms-content"><h1>${escape(title)}</h1><div class="cms-body">${content}</div></main><footer class="cms-footer"><div class="cms-shell">${escape(storeTitle)}</div></footer></body></html>`;
  // Verified native stock sections retain the exact scoped stylesheet and
  // current renderer markup. Never force them into the 880px rich-text body.
  if(sections?.markup){
    html=html.replace('</style></head>','</style><style>'+sections.css+'</style></head>');
    html=html.replace('</main><footer', '</main><div class="cms-native-sections">'+
      sections.markup+'</div><footer');
  }
  return html;
}
async function selectPageAndDraft(env,accountId,siteId,slug,pageId) {
  if (!accountId || !siteId) return {error:'cms_site_required',status:400};
  const site=await selectOwnedPageSite(env,accountId,siteId);
  const page=await findSiteOwnedPage(env,site,slug,pageId);
  if (!page || page.slug !== slug || page.status === 'archived') return {error:'cms_page_not_found',status:404};
  const row=await env.DB.prepare('SELECT draft_data FROM cms_page_drafts WHERE page_id=? AND user_id=? LIMIT 1').bind(page.id,accountId).first();
  if (!row) return {error:'cms_page_draft_not_saved',status:409};
  const draft=readObject(row.draft_data);
  if (!draft.title || !safeSlug(draft.url_handle) || draft.url_handle !== page.slug ||
      !['visible','hidden'].includes(draft.visibility)) return {error:'cms_page_draft_invalid',status:409};
  if (page.requires_auth) return {error:'cms_page_auth_renderer_required',status:409};
  const nav=await env.DB.prepare("SELECT title,slug,route_path,nav_visible FROM cms_pages WHERE site_id=? AND status='published' AND nav_visible=1 AND requires_auth=0 ORDER BY sort_order ASC LIMIT 10").bind(site.id).all();
  return {page,site,draft,rawDraft:row.draft_data,navigation:nav.results||[]};
}
export async function previewMerchantPage(env,accountId,siteId,slug,pageId,override=null) {
  try {
    let data=await selectPageAndDraft(env,accountId,siteId,slug,pageId);
    if (data.error && data.error !== 'cms_page_draft_not_saved') return data;
    if (data.error) {
      const site=await selectOwnedPageSite(env,accountId,siteId);
      const page=await findSiteOwnedPage(env,site,slug,pageId);
      if (!page || page.slug !== slug) return error('cms_page_not_found',404);
      data={site,page,draft:{},navigation:[]};
    }
    const sections=await renderSiteOwnedPageSections(env,accountId,data.site,data.page);
    return {ok:true,html:renderMerchantPage({...data,
      draft:override ? {...data.draft,...override} : data.draft,sections})};
  } catch(e) {return error(String(e.message||e),/too_large|invalid|title_required/.test(String(e.message))?422:500);}
}
const hashHtml=async html=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(html))),b=>b.toString(16).padStart(2,'0')).join('');
const objectPrefix=(site,page)=>`sites/${site.slug}/public/_cms-publications/${page.id}/`;
export async function publishMerchantPage(env,accountId,siteId,slug,pageId) {
  if (!env.WEBSITE_ASSETS || !env.DB) return error('cms_publication_storage_unavailable',503);
  let selected;
  try {selected=await selectPageAndDraft(env,accountId,siteId,slug,pageId);} catch(e){return error(String(e.message||e),403);}
  if (selected.error) return selected;
  const {site,page,draft,rawDraft,navigation}=selected;
  if (page.page_type === 'global' || page.route_path.startsWith('/__cms/')) return error('cms_system_page_cannot_publish',409);
  if (site.status !== 'active') return error('cms_site_not_active',409);
  if (!isValidPath(page.route_path)) return error('cms_page_route_invalid',409);
  let html;
  let sections;
  try{
    sections=await renderSiteOwnedPageSections(env,accountId,site,page);
    html=renderMerchantPage({site,page,draft,navigation,sections});
  }catch(e){return error(String(e.message||e),409);}
  if (new TextEncoder().encode(html).length > 600000) return error('cms_page_document_too_large',413);
  const version=Number(readObject(page.metadata_json).cms_page_publication_version||0)+1;
  const digest=await hashHtml(html);
  const key=objectPrefix(site,page)+`v${version}-${digest}.html`;
  const manifest={
    schema:'agentsam.cms-page-publication.v1',site_id:site.id,page_id:page.id,
    slug:page.slug,route_path:page.route_path,version,
    html:{key,sha256:digest},
    sections:sections.sources.map(source=>({
      section_id:source.section_id,template_sku:source.template_sku,
      definition_id:source.definition_id,sha256:source.source_sha256,
      rendered:source.rendered,
    })),
    previous_html_key:page.content_object_key||null,
    published_at:new Date().toISOString(),
  };
  const serializedManifest=JSON.stringify(manifest);
  const manifestHash=await hashHtml(serializedManifest);
  const manifestKey=objectPrefix(site,page)+`v${version}-${manifestHash}.manifest.json`;
  try {
    const existing=await env.WEBSITE_ASSETS.get(key);
    if (existing) {
      if (await hashHtml(await existing.text())!==digest) return error('cms_publication_immutable_key_collision',409);
    } else {
      await env.WEBSITE_ASSETS.put(key,html,{httpMetadata:{contentType:'text/html; charset=utf-8'},customMetadata:{kind:'cms-page-publication',sha256:digest}});
    }
    const verified=await env.WEBSITE_ASSETS.get(key);
    if (!verified || await hashHtml(await verified.text())!==digest) return error('cms_page_publication_r2_verification_failed',503);
    const previousManifest=await env.WEBSITE_ASSETS.get(manifestKey);
    if(previousManifest){
      if(await hashHtml(await previousManifest.text())!==manifestHash)
        return error('cms_manifest_immutable_key_collision',409);
    }else await env.WEBSITE_ASSETS.put(manifestKey,serializedManifest,{
      httpMetadata:{contentType:'application/json; charset=utf-8'},
      customMetadata:{kind:'cms-page-manifest',sha256:manifestHash},
    });
    const manifestProof=await env.WEBSITE_ASSETS.get(manifestKey);
    if(!manifestProof||await hashHtml(await manifestProof.text())!==manifestHash)
      return error('cms_publication_manifest_verification_failed',503);
  } catch(e) {return error('cms_page_publication_r2_error: '+String(e.message||e),503);}
  const meta=readObject(page.metadata_json);
  const nextMeta={...meta,cms_page_publication_version:version,
    cms_page_previous_key:page.content_object_key||null,cms_page_published_hash:digest,
    cms_page_published_manifest_hash:manifestHash,
    cms_page_published_sections_count:sections.sources.length,
    cms_page_published_source:'merchant-page-editor'};
  const seo={...readObject(page.seo_json),title:draft.seo_title||draft.title,description:draft.seo_description||'',noindex:draft.visibility==='hidden'};
  const nextTitle=String(draft.title).trim().slice(0,200);
  try {
    // A CMS publication is a site-monotonic durable receipt, not a preview
    // switch. The page CAS, receipt and stock-section provenance guards are
    // one D1 transaction. A concurrent block/section change rejects the CAS.
    const siteRelease=await env.DB.prepare(
      'SELECT COALESCE(MAX(release_number),0)+1 AS next FROM cms_publications WHERE site_id=?'
    ).bind(site.id).first();
    const release=Number(siteRelease?.next||1);
    const guard=sections.sources.map(()=>
      'AND EXISTS(SELECT 1 FROM cms_page_sections s WHERE s.id=? AND s.page_id=? '+
      'AND s.is_visible=1 AND s.draft_r2_key IS ? AND s.content_hash IS ?)').join('\n');
    const sql=`UPDATE cms_pages SET title=?,seo_json=?,metadata_json=?,template_sku=?,
      nav_visible=?,status='published',content_object_key=?,published_manifest_object_key=?,
      published_at=unixepoch(),updated_at=unixepoch()
      WHERE id=? AND site_id=? AND slug=? AND status=? AND content_object_key IS ?
        AND metadata_json=?
        AND EXISTS(SELECT 1 FROM cms_page_drafts WHERE page_id=? AND user_id=? AND draft_data=?)
        AND (SELECT COUNT(*) FROM cms_page_sections WHERE page_id=? AND is_visible=1)=?
        ${guard}`;
    const pageUpdate=env.DB.prepare(sql).bind(
      nextTitle,JSON.stringify(seo),JSON.stringify(nextMeta),draft.template_sku||null,
      draft.visibility==='visible'?1:0,key,manifestKey,
      page.id,site.id,page.slug,page.status,page.content_object_key,page.metadata_json,
      page.id,accountId,rawDraft,page.id,sections.sources.length,
      ...sections.sources.flatMap(source=>[
        source.section_id,page.id,source.draft_key,source.draft_hash,
      ]),
    );
    // cms_publications.release_number NOT NULL enforces the CAS result from
    // the immediately preceding UPDATE via changes(); D1 batch rolls back all
    // writes when another editor wins the race.
    const receipt=env.DB.prepare(`INSERT INTO cms_publications
      (account_id,site_id,release_number,status,manifest_object_key,manifest_hash,
       source_revision_hash,created_by,metadata_json,published_at)
       VALUES (?,?,CASE WHEN changes()=1 THEN ? ELSE NULL END,'published',
         ?,?,?,?,?,datetime('now'))`)
      .bind(accountId,site.id,release,manifestKey,manifestHash,
        digest,accountId,JSON.stringify({
          scope:'page',page_id:page.id,page_slug:page.slug,
          sections:sections.sources.length,
        }));
    // The same publication transaction advances each installed section's
    // published source pointer. Its content-addressed draft key is immutable;
    // the old published pointer stays intact until the whole transaction wins.
    const publishedSections=sections.sources.map(source=>env.DB.prepare(`
      UPDATE cms_page_sections SET published_r2_key=?,published_hash=?
      WHERE id=? AND page_id=? AND draft_r2_key IS ? AND content_hash IS ?`)
      .bind(source.source_key,source.source_sha256,source.section_id,page.id,
        source.draft_key,source.draft_hash));
    await env.DB.batch([pageUpdate,receipt,...publishedSections]);
    return {ok:true,page_id:page.id,slug:page.slug,route_path:page.route_path,
      status:'published',version,key,manifest_key:manifestKey,
      manifest_hash:manifestHash,release_number:release,
      rendered_sections:sections.sources.length,
      published_at:Math.floor(Date.now()/1000)};
  } catch(e) {
    const cause=String(e.message||e);
    if(/cms_publications\.(?:release_number|site_id)|UNIQUE constraint failed: cms_publications|cms_page_publication_conflict/i.test(cause))
      return error('cms_page_publication_conflict_reload',409);
    return error('cms_page_publish_database_error: '+cause,500);
  }
}
