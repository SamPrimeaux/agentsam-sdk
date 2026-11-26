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
const brandColor = value => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : 'var(--theme-color-primary, currentColor)';
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
  const primary = brandColor(brand.primary_color || palette.primaryColor || readObject(settings.legacy).primaryColor);
  const storeTitle = String(site.name || 'Store').slice(0,120);
  const noIndex = draft.visibility !== 'visible';
  const sceneRuntimeEnabled = Array.isArray(sections?.scripts) && sections.scripts.includes('/assets/js/iamscene-runtime.js');
  const inlineScript = typeof sections?.inlineScript === 'string' ? sections.inlineScript : '';
  const inlineScriptHash = typeof sections?.inlineScriptHash === 'string' ? sections.inlineScriptHash : null;
  const scriptSources = [
    ...(sceneRuntimeEnabled ? ["'self'"] : []),
    ...(inlineScript && inlineScriptHash ? [`'sha256-${inlineScriptHash}'`] : []),
  ];
  const contentSecurityPolicy = [
    "default-src 'none'",
    ...(scriptSources.length ? [`script-src ${scriptSources.join(' ')}`] : []),
    ...(sceneRuntimeEnabled ? ["connect-src 'self' https:", "worker-src 'self' blob:"] : []),
    "style-src 'unsafe-inline' https:",
    "img-src 'self' https: data:",
    "font-src 'self' https:",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ');
  const items = navigation.filter(item => isValidPath(item.route_path) && item.nav_visible !== 0)
    .slice(0,9).map(item => `<a href="${escape(item.route_path === '/' ? './' : item.route_path.slice(1))}">${escape(String(item.title || item.slug || 'Page').slice(0,70))}</a>`).join('');
  const legacyRootClass = /^[a-z][a-z0-9_-]{0,63}$/i.test(String(sections?.rootClass || '')) ? sections.rootClass : 'cms-legacy-page';
  const main = sections?.legacyHtml
    ? `<main class="${escape(legacyRootClass)} cms-native-sections">${content ? `<div class="cms-body">${content}</div>` : ''}${sections.markup || ''}</main>`
    : `<main class="cms-shell cms-content"><h1>${escape(title)}</h1><div class="cms-body">${content}</div></main>`;
  const portableSections = sections?.markup && !sections?.legacyHtml
    ? `<div class="cms-native-sections">${sections.markup}</div>` : '';
  const extraStyles = typeof sections?.css === 'string' && sections.css
    ? `<style>${sections.css}</style>` : '';
  const safeInlineScript = inlineScript;
  const inlineScriptTag = safeInlineScript ? `<script>${safeInlineScript}</script>` : '';
  let html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="/"><title>${escape(metaTitle)}</title><meta name="description" content="${escape(description)}"><meta name="robots" content="${noIndex ? 'noindex,nofollow' : 'index,follow'}"><meta http-equiv="Content-Security-Policy" content="${escape(contentSecurityPolicy)}"><style>:root{color-scheme:light;--brand:${primary};--ink:#17212a;--bg:#fff;--sub:#66727b}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}a{color:var(--brand)}.cms-shell{max-width:1150px;margin:auto;padding:0 24px}.cms-header{border-bottom:1px solid #e4e9eb;background:var(--bg)}.cms-header>.cms-shell{min-height:75px;display:flex;justify-content:space-between;align-items:center;gap:20px}.cms-brand{font-weight:750;letter-spacing:-.02em;font-size:18px;text-decoration:none;color:var(--ink)}.cms-nav{display:flex;flex-wrap:wrap;gap:18px}.cms-nav a{text-decoration:none;font-size:13px;color:var(--ink)}.cms-nav a:hover{text-decoration:underline}.cms-content{max-width:880px;padding:48px 24px 100px;min-height:65vh}.cms-content h1{font-size:clamp(30px,4vw,48px);line-height:1.2;letter-spacing:-.03em;margin:0 0 32px}.cms-content h2{font-size:26px;line-height:1.25}.cms-content h3{font-size:21px}.cms-body img{max-width:100%;height:auto}.cms-body table{border-collapse:collapse;display:block;overflow-x:auto}.cms-body td,.cms-body th{padding:9px 13px;border:1px solid #d6dbde}.cms-body blockquote{border-left:3px solid var(--brand);margin:24px 0;padding:2px 20px;color:var(--sub)}.cms-footer{border-top:1px solid #e4e9eb;padding:22px 0;font-size:12px;color:var(--sub)}@media(max-width:650px){.cms-header>.cms-shell{align-items:flex-start;padding-top:16px;padding-bottom:16px;flex-direction:column;gap:9px}.cms-nav{gap:12px}.cms-content{padding-top:30px;}}</style>${extraStyles}</head><body><header class="cms-header"><div class="cms-shell"><a class="cms-brand" href="./">${escape(storeTitle)}</a><nav class="cms-nav" aria-label="Main navigation">${items}</nav></div></header>${main}${portableSections}<footer class="cms-footer"><div class="cms-shell">${escape(storeTitle)}</div></footer>${sceneRuntimeEnabled ? '<script src="/assets/js/iamscene-runtime.js" defer></script>' : ''}${inlineScriptTag}</body></html>`;
  return html;
}
async function selectPageAndDraft(env,accountId,siteId,slug,pageId) {
  if (!accountId || !siteId) return {error:'cms_site_required',status:400};
  const site=await selectOwnedPageSite(env,accountId,siteId);
  const page=await findSiteOwnedPage(env,site,slug,pageId);
  if (!page || page.slug !== slug || page.status === 'archived') return {error:'cms_page_not_found',status:404};
  if (page.requires_auth) return {error:'cms_page_auth_renderer_required',status:409};

  // cms_pages + cms_page_sections are the canonical site-owned page model.
  // cms_page_drafts is read only as an optional compatibility source for older
  // body/SEO fields; newer rows may contain only {page_id, sections, updated_at}.
  // Such rows are valid and must never block preview or publication.
  const row=await env.DB.prepare('SELECT draft_data FROM cms_page_drafts WHERE page_id=? AND user_id=? LIMIT 1').bind(page.id,accountId).first();
  const persisted=readObject(row?.draft_data);
  const seo=readObject(page.seo_json);
  const title=typeof persisted.title==='string'&&persisted.title.trim()
    ? persisted.title : String(page.title||'').trim();
  const draft={
    title,
    body_html:typeof persisted.body_html==='string'?persisted.body_html:'',
    visibility:['visible','hidden'].includes(persisted.visibility)
      ? persisted.visibility
      : (page.status==='published'&&page.nav_visible!==0?'visible':'hidden'),
    ...(typeof persisted.url_handle==='string'&&persisted.url_handle.trim()
      ? {url_handle:persisted.url_handle.trim()} : {}),
    seo_title:typeof persisted.seo_title==='string'&&persisted.seo_title.trim()
      ? persisted.seo_title : (typeof seo.title==='string'&&seo.title.trim()?seo.title:title),
    seo_description:typeof persisted.seo_description==='string'
      ? persisted.seo_description : (typeof seo.description==='string'?seo.description:''),
    template_sku:typeof persisted.template_sku==='string'&&persisted.template_sku.trim()
      ? persisted.template_sku : (page.template_sku||''),
  };
  const nav=await env.DB.prepare("SELECT title,slug,route_path,nav_visible FROM cms_pages WHERE site_id=? AND status='published' AND nav_visible=1 AND requires_auth=0 ORDER BY sort_order ASC LIMIT 10").bind(site.id).all();
  return {page,site,draft,rawDraft:row?.draft_data??null,navigation:nav.results||[]};
}
export async function previewMerchantPage(env,accountId,siteId,slug,pageId,override=null) {
  try {
    const data=await selectPageAndDraft(env,accountId,siteId,slug,pageId);
    if (data.error) return data;
    const sections=await renderSiteOwnedPageSections(env,accountId,data.site,data.page);
    const draft=override ? {...data.draft,...override} : data.draft;
    if (!['visible','hidden'].includes(draft.visibility)) draft.visibility=data.draft.visibility;
    if (typeof draft.title!=='string'||!draft.title.trim()) draft.title=data.draft.title;
    return {ok:true,html:renderMerchantPage({...data,draft,sections})};
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

  // cms_pages owns the canonical route. Only a valid legacy URL-handle
  // draft may request a route change; absent legacy fields preserve nested
  // site-owned slugs such as work/fuelnfreetime exactly as stored.
  const requestedHandle=typeof draft.url_handle==='string'&&draft.url_handle.trim()
    ? draft.url_handle.trim().toLowerCase() : null;
  if(requestedHandle&&(!safeSlug(requestedHandle)||requestedHandle==='site'))
    return error('cms_page_route_invalid',409);
  const currentSlug=String(page.slug||'');
  const routePrefix=page.route_path==='/'?'/':page.route_path.slice(0,page.route_path.lastIndexOf('/')+1);
  const slugPrefix=currentSlug.includes('/')?currentSlug.slice(0,currentSlug.lastIndexOf('/')+1):'';
  const nextSlug=page.route_path==='/'||!requestedHandle
    ? currentSlug : slugPrefix+requestedHandle;
  const nextRoute=page.route_path==='/'||!requestedHandle
    ? page.route_path : routePrefix+requestedHandle;
  if(!isValidPath(nextRoute)||
    (requestedHandle&&routePrefix==='/'&&/^(admin|api|auth|checkout|media|settings)$/i.test(requestedHandle)))
    return error('cms_page_route_invalid',409);
  if(nextSlug!==page.slug||nextRoute!==page.route_path){
    const collision=await env.DB.prepare(`
      SELECT id FROM cms_pages WHERE site_id=? AND id<>? AND
       (slug=? OR route_path=? OR EXISTS(
         SELECT 1 FROM json_each(COALESCE(json_extract(metadata_json,'$.route_redirects'),'[]')) alias
         WHERE CAST(alias.value AS TEXT)=?
       )) LIMIT 1
    `).bind(site.id,page.id,nextSlug,nextRoute,nextRoute).first();
    if(collision)return error('cms_page_route_conflict',409);
  }

  const publishedPage={...page,slug:nextSlug,route_path:nextRoute};
  let html;
  let sections;
  try{
    sections=await renderSiteOwnedPageSections(env,accountId,site,publishedPage);
    html=renderMerchantPage({site,page:publishedPage,draft,navigation,sections});
  }catch(e){return error(String(e.message||e),409);}
  if (new TextEncoder().encode(html).length > 600000) return error('cms_page_document_too_large',413);
  const version=Number(readObject(page.metadata_json).cms_page_publication_version||0)+1;
  const digest=await hashHtml(html);
  const key=objectPrefix(site,publishedPage)+`v${version}-${digest}.html`;
  const manifest={
    schema:'agentsam.cms-page-publication.v1',site_id:site.id,page_id:page.id,
    slug:nextSlug,route_path:nextRoute,version,
    html:{key,sha256:digest},
    sections:sections.sources.map(source=>({
      section_id:source.section_id,renderer_kind:source.renderer_kind||'portable',
      template_sku:source.template_sku,definition_id:source.definition_id,
      sha256:source.source_sha256,rendered:source.rendered,
    })),
    previous_html_key:page.content_object_key||null,
    published_at:new Date().toISOString(),
  };
  const serializedManifest=JSON.stringify(manifest);
  const manifestHash=await hashHtml(serializedManifest);
  const manifestKey=objectPrefix(site,publishedPage)+`v${version}-${manifestHash}.manifest.json`;
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
  const aliases=Array.isArray(meta.route_redirects)?meta.route_redirects
    .filter(value=>typeof value==='string'&&/^\/[a-z0-9/\-]+$/i.test(value)):[];
  if(page.status==='published'&&nextRoute!==page.route_path)aliases.push(page.route_path);
  const nextMeta={...meta,route_redirects:[...new Set(aliases.filter(value=>value!==nextRoute))].slice(-12),
    cms_page_publication_version:version,
    cms_page_previous_key:page.content_object_key||null,cms_page_published_hash:digest,
    cms_page_published_manifest_hash:manifestHash,
    cms_page_published_sections_count:sections.sources.length,
    cms_page_published_source:'merchant-page-editor'};
  const seo={...readObject(page.seo_json),title:draft.seo_title||draft.title,description:draft.seo_description||'',noindex:draft.visibility==='hidden'};
  const nextTitle=String(draft.title).trim().slice(0,200);
  try {
    // The route, published pointers, receipt and section provenance advance
    // atomically. A URL can never redirect to a page without a verified HTML
    // object at its new canonical route.
    const siteRelease=await env.DB.prepare(
      'SELECT COALESCE(MAX(release_number),0)+1 AS next FROM cms_publications WHERE site_id=?'
    ).bind(site.id).first();
    const release=Number(siteRelease?.next||1);
    const guard=sections.sources.map(()=>
      'AND EXISTS(SELECT 1 FROM cms_page_sections s WHERE s.id=? AND s.page_id=? '+
      'AND s.is_visible=1 AND s.draft_r2_key IS ? AND s.content_hash IS ?)').join('\n');
    const sql=`UPDATE cms_pages SET slug=?,route_path=?,title=?,seo_json=?,metadata_json=?,template_sku=?,
      nav_visible=?,status='published',content_object_key=?,published_manifest_object_key=?,
      published_at=unixepoch(),updated_at=unixepoch()
      WHERE id=? AND site_id=? AND slug=? AND route_path=? AND status=? AND content_object_key IS ?
        AND metadata_json=?
        AND EXISTS(SELECT 1 FROM cms_page_drafts WHERE page_id=? AND user_id=? AND draft_data=?)
        AND (SELECT COUNT(*) FROM cms_page_sections WHERE page_id=? AND is_visible=1)=?
        ${guard}`;
    const pageUpdate=env.DB.prepare(sql).bind(
      nextSlug,nextRoute,nextTitle,JSON.stringify(seo),JSON.stringify(nextMeta),draft.template_sku||null,
      draft.visibility==='visible'?1:0,key,manifestKey,
      page.id,site.id,page.slug,page.route_path,page.status,page.content_object_key,page.metadata_json,
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
          scope:'page',page_id:page.id,page_slug:nextSlug,
          previous_route:page.route_path!==nextRoute?page.route_path:null,
          sections:sections.sources.length,
        }));
    const publishedSections=sections.sources.map(source=>env.DB.prepare(`
      UPDATE cms_page_sections SET published_r2_key=?,published_hash=?
      WHERE id=? AND page_id=? AND draft_r2_key IS ? AND content_hash IS ?`)
      .bind(source.source_key,source.source_sha256,source.section_id,page.id,
        source.draft_key,source.draft_hash));
    await env.DB.batch([pageUpdate,receipt,...publishedSections]);
    return {ok:true,page_id:page.id,slug:nextSlug,route_path:nextRoute,
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
