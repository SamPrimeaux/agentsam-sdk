/**
 * Render the one site-owned section/block source for preview and publication.
 * Portable catalog sections remain provenance-checked. Existing assembled
 * HTML/CSS/JS sections are a supported, page-scoped compatibility format;
 * they are never rewritten into a second CMS or silently discarded.
 */
import {listCmsComponentCatalog} from './definition-registry.mjs';
import {PORTABLE_SECTION_STYLES} from './portable-styles.compiled.mjs';
import {getCmsSectionRenderer,isThemeScenesRenderer,THEME_SCENES_CMS_STYLES} from './section-renderer-runtime.mjs';

const LEGACY_HTML_TYPES=new Set(['hero','story_chrome','feature_split','cta_banner']);
const sha256=async value=>new Uint8Array(await crypto.subtle.digest(
  'SHA-256',new TextEncoder().encode(value)));
const sha256Hex=async value=>Array.from(await sha256(value),byte=>byte.toString(16).padStart(2,'0')).join('');
const sha256Base64=async value=>{
 const bytes=await sha256(value);let binary='';
 for(const byte of bytes)binary+=String.fromCharCode(byte);
 return btoa(binary);
};
const json=raw=>{try{const value=JSON.parse(raw);if(value && typeof value==='object' &&
  !Array.isArray(value))return value;}catch{}throw new Error('cms_page_section_content_invalid');};
const fail=code=>{throw new Error(code);};
const sanitizedKey=key=>typeof key==='string' && /^[a-zA-Z0-9_-]{1,160}$/.test(key);
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
})[char]);

async function readCurrentSection(env,page,row,{verifyHash=true}={}){
 if(row.r2_bucket!=='cms')fail('cms_page_section_storage_unknown');
 const key=row.draft_r2_key||row.published_r2_key;
 if(!key)fail('cms_page_section_source_missing');
 const validPrefix='cms/sections/drafts/'+encodeURIComponent(page.id)+'/';
 const publishedPrefix='cms/sections/publications/'+encodeURIComponent(page.id)+'/';
 if(!key.startsWith(validPrefix)&&!key.startsWith(publishedPrefix))
   fail('cms_page_section_storage_outside_page');
 if(!env.CMS_CONTENT)fail('cms_page_section_storage_unavailable');
 const object=await env.CMS_CONTENT.get(key);
 if(!object)fail('cms_page_section_draft_missing');
 const raw=await object.text();
 const hash=await sha256Hex(raw);
 const expected=row.draft_r2_key?row.content_hash:row.published_hash;
 const hashMatches=!expected||expected===hash;
 if(verifyHash&&!hashMatches)fail('cms_page_section_draft_checksum_mismatch');
 return {content:json(raw),key,hash,hashMatches};
}

async function verifyEditorBlocks(env,accountId,row,content) {
 const declared=content.__editor?.blocks||[];
 if(!Array.isArray(declared))fail('cms_page_section_blocks_invalid');
 const {results:blocks=[]}=await env.DB.prepare(
   `SELECT block_key,block_type,status,content_json FROM cms_section_blocks
     WHERE account_id=? AND section_id=? AND status!='archived' ORDER BY sort_order,id`
 ).bind(accountId,row.id).all();
 if(blocks.length!==declared.length)fail('cms_page_section_blocks_out_of_sync');
 const byKey=new Map(blocks.map(block=>[block.block_key,block]));
 for(const block of declared){
   const stored=byKey.get(block.id);
   if(!stored||stored.block_type!==block.templateKey ||
      (stored.status==='active')!==(block.enabled!==false))
     fail('cms_page_section_block_identity_conflict');
   if(JSON.stringify(json(stored.content_json))!==JSON.stringify(content[block.id]||{}))
     fail('cms_page_section_block_data_out_of_sync');
 }
}

function renderLegacyAssembledSection(row,content,key){
 const type=String(row.section_type||'');
 if(content.html_source!=='assembled')return null;
 if(type==='page_css'&&content.role==='page_css'&&typeof content.css==='string'){
   if(content.css.length>100000||/<\/style/i.test(content.css))fail('cms_page_section_legacy_css_invalid');
   return {kind:'legacy-css',css:content.css};
 }
 if(type==='page_js'&&content.role==='page_js'&&typeof content.js==='string'){
   if(content.js.length>50000)fail('cms_page_section_legacy_js_too_large');
   if(/<\/script/i.test(content.js))fail('cms_page_section_legacy_js_invalid');
   return {kind:'legacy-js',js:content.js};
 }
 if(LEGACY_HTML_TYPES.has(type)&&typeof content.html==='string'){
   if(content.html.length>220000)fail('cms_page_section_legacy_html_too_large');
   // Keep original authored markup. Add a stable selection boundary only when
   // the fragment does not already carry its own CMS section identity.
   const markup=/\bdata-cms-section\s*=/.test(content.html)
     ? content.html
     : `<div class="cms-legacy-section" data-cms-section="${key}" data-section-type="${escapeHtml(type)}" style="display:contents">${content.html}</div>`;
   return {kind:'legacy-html',markup};
 }
 return null;
}

function renderLegacyDataSection(row,content,key){
 if(row.section_type!=='services-grid')return null;
 const fields=['eyebrow','title','description'];
 if(fields.some(field=>typeof content[field]!=='string'))return null;
 const eyebrow=content.eyebrow.trim().slice(0,160);
 const title=content.title.trim().slice(0,200);
 const description=content.description.trim().slice(0,1200);
 if(!title&&!description)return null;
 return {kind:'legacy-data',markup:`<section class="cms-legacy-content-section" data-cms-section="${key}" data-section-type="services-grid"><div class="cms-shell">${eyebrow?`<p class="cms-legacy-eyebrow">${escapeHtml(eyebrow)}</p>`:''}${title?`<h2>${escapeHtml(title)}</h2>`:''}${description?`<p>${escapeHtml(description)}</p>`:''}</div></section>`};
}

/** Returns rendered fragments plus exact source snapshots for the publication receipt. */
export async function renderSiteOwnedPageSections(env,accountId,site,page){
 if(!site?.id||!page?.id||!accountId)fail('cms_page_section_scope_required');
 const {results:rows=[]}=await env.DB.prepare(`
   SELECT id,section_key,section_type,section_name,is_visible,sort_order,
     r2_bucket,draft_r2_key,published_r2_key,content_hash,published_hash,
     template_sku,definition_id
   FROM cms_page_sections WHERE page_id=? ORDER BY sort_order,id
 `).bind(page.id).all();
 if(!rows.length)return {markup:'',css:'',scripts:[],inlineScript:'',inlineScriptHash:null,legacyHtml:false,sources:[]};
 const needsCatalog=rows.some(row=>row.is_visible!==0&&row.template_sku);
 const stock=needsCatalog?await listCmsComponentCatalog(env,accountId,{itemType:'section'}):[];
 const available=new Map(stock.map(template=>[template.sku,template]));
 const fragments=[],legacyCss=[],legacyScripts=[],sources=[];
 let usesThemeScenes=false,usesIamScene=false,hasLegacyHtml=false,hasPortableMarkup=false;
 for(const row of rows){
   if(row.is_visible===0)continue;
   if(!sanitizedKey(row.section_key||row.id))fail('cms_page_section_identity_invalid');
   const key=row.section_key||row.id;
   const {content,key:sourceKey,hash,hashMatches}=await readCurrentSection(env,page,row,{verifyHash:Boolean(row.template_sku)});
   const hidden=content.__editor?.visibility?.enabled===false;
   if(hidden){
     sources.push({section_id:row.id,renderer_kind:row.template_sku?'portable':'legacy',
       template_sku:row.template_sku||null,definition_id:row.definition_id||null,
       source_key:sourceKey,source_sha256:hash,draft_key:row.draft_r2_key||null,
       draft_hash:row.content_hash||null,rendered:false});
     continue;
   }

   if(!row.template_sku){
     const legacy=renderLegacyAssembledSection(row,content,key)||renderLegacyDataSection(row,content,key);
     if(!legacy)fail('cms_page_section_renderer_unverified');
     if(!hashMatches)fail('cms_page_section_draft_checksum_mismatch');
     if(legacy.kind==='legacy-html'){
       fragments.push(legacy.markup);hasLegacyHtml=true;
     }else if(legacy.kind==='legacy-data'){
       fragments.push(legacy.markup);hasLegacyHtml=true;
     }else if(legacy.kind==='legacy-css')legacyCss.push(legacy.css);
     else if(legacy.kind==='legacy-js')legacyScripts.push(legacy.js);
     sources.push({section_id:row.id,renderer_kind:legacy.kind,
       template_sku:null,definition_id:null,source_key:sourceKey,
       source_sha256:hash,draft_key:row.draft_r2_key||null,
       draft_hash:row.content_hash||null,rendered:true});
     continue;
   }

   const template=available.get(row.template_sku);
   if(!template?.installable||!template.definition?.id||
     template.definition.id!==row.definition_id||!template.rendererKey)
     fail('cms_page_section_renderer_unverified');
   const editor=content.__editor||{};
   if(editor.catalogSku!==template.sku || editor.themePreset!==template.rendererKey ||
     editor.definitionKey!==template.definitionKey ||
     String(editor.definitionVersion)!==String(template.definitionVersion))
       fail('cms_page_section_definition_mismatch');
   await verifyEditorBlocks(env,accountId,row,content);
   const source=structuredClone(content);
   source.__editor={...source.__editor,templateKey:'portable',themePreset:template.rendererKey};
   const renderer=getCmsSectionRenderer(template.rendererKey);
   if(!renderer?.validate?.(template.rendererKey,source)?.ok)
     fail('cms_page_section_content_invalid');
   const markup=renderer.render?.({key,content:source});
   if(isThemeScenesRenderer(template.rendererKey)){
     usesThemeScenes=true;
     usesIamScene=usesIamScene || Boolean(source.sceneDocumentUrl || source.sceneDefinition?.sceneDocument?.ref);
   }
   if(typeof markup!=='string'||!markup.includes('data-cms-section='))
     fail('cms_page_section_renderer_unavailable');
   fragments.push(markup);hasPortableMarkup=true;
   sources.push({section_id:row.id,renderer_kind:'portable',template_sku:template.sku,
     definition_id:template.definition.id,source_key:sourceKey,source_sha256:hash,
     draft_key:row.draft_r2_key||null,draft_hash:row.content_hash||null,rendered:true});
 }
 const inlineScript=legacyScripts.join('\n;\n');
 const inlineScriptHash=inlineScript?await sha256Base64(inlineScript):null;
 const css=[...legacyCss,...(hasPortableMarkup?[PORTABLE_SECTION_STYLES,...(usesThemeScenes?[THEME_SCENES_CMS_STYLES]:[])]:[])].filter(Boolean).join('\n');
 const rootClassMatch=css.match(/(?:^|})\s*main\.([a-zA-Z][a-zA-Z0-9_-]{0,63})\s*\{/);
 const rootClass=rootClassMatch?.[1]||'cms-legacy-page';
 return {markup:fragments.join(''),css,rootClass,
   scripts:usesIamScene?['/assets/js/iamscene-runtime.js']:[],
   inlineScript,inlineScriptHash,legacyHtml:hasLegacyHtml,sources};
}
