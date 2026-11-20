/**
 * Native stock rendering from the ONE site-owned section/block draft.
 * No reconstructed screenshots or generic theme layout. This page-level
 * renderer is used identically by merchant preview and publication; the
 * immutable Theme Store project publisher remains independent.
 */
import {listCmsComponentCatalog} from './definition-registry.mjs';
import {PORTABLE_SECTION_STYLES} from './portable-styles.compiled.mjs';
import {getCmsSectionRenderer,isThemeScenesRenderer,THEME_SCENES_CMS_STYLES} from './section-renderer-runtime.mjs';

const sha256=async value=>Array.from(new Uint8Array(await crypto.subtle.digest(
  'SHA-256',new TextEncoder().encode(value))),byte=>byte.toString(16).padStart(2,'0')).join('');
const json=raw=>{try{const value=JSON.parse(raw);if(value && typeof value==='object' &&
  !Array.isArray(value))return value;}catch{}throw new Error('cms_page_section_content_invalid');};
const fail=code=>{throw new Error(code);};
const sanitizedKey=key=>typeof key==='string' && /^[a-zA-Z0-9_-]{1,160}$/.test(key);

async function readCurrentSection(env,page,row){
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
 const hash=await sha256(raw);
 const expected=row.draft_r2_key?row.content_hash:row.published_hash;
 if(expected && expected!==hash)fail('cms_page_section_draft_checksum_mismatch');
 return {content:json(raw),key,hash};
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

/** Returns a native fragment + section snapshots, not a new page or theme. */
export async function renderSiteOwnedPageSections(env,accountId,site,page){
 if(!site?.id||!page?.id||!accountId)fail('cms_page_section_scope_required');
 const {results:rows=[]}=await env.DB.prepare(`
   SELECT id,section_key,section_type,section_name,is_visible,sort_order,
     r2_bucket,draft_r2_key,published_r2_key,content_hash,published_hash,
     template_sku,definition_id
   FROM cms_page_sections WHERE page_id=? ORDER BY sort_order,id
 `).bind(page.id).all();
 if(!rows.length)return {markup:'',css:'',sources:[]};
 const stock=await listCmsComponentCatalog(env,accountId,{itemType:'section'});
 const available=new Map(stock.map(t=>[t.sku,t]));
 const fragments=[],sources=[];
 let usesThemeScenes=false,usesIamScene=false;
 for(const row of rows){
   if(row.is_visible===0)continue;
   if(!row.template_sku)fail('cms_page_section_renderer_unverified');
   const template=available.get(row.template_sku);
   if(!template?.installable||!template.definition?.id||
     template.definition.id!==row.definition_id||!template.rendererKey)
     fail('cms_page_section_renderer_unverified');
   if(!sanitizedKey(row.section_key||row.id))fail('cms_page_section_identity_invalid');
   const {content,key,hash}=await readCurrentSection(env,page,row);
   const hidden=content.__editor?.visibility?.enabled===false;
   if(content.__editor?.catalogSku!==template.sku ||
     content.__editor?.themePreset!==template.rendererKey ||
     content.__editor?.definitionKey!==template.definitionKey ||
     String(content.__editor?.definitionVersion)!==String(template.definitionVersion))
       fail('cms_page_section_definition_mismatch');
   await verifyEditorBlocks(env,accountId,row,content);
   const source=structuredClone(content);
   source.__editor={...source.__editor,templateKey:'portable',themePreset:template.rendererKey};
   const renderer=getCmsSectionRenderer(template.rendererKey);
   if(!renderer?.validate?.(template.rendererKey,source)?.ok)
     fail('cms_page_section_content_invalid');
   const markup=renderer.render?.({key:row.section_key||row.id,content:source});
   if(isThemeScenesRenderer(template.rendererKey)){
     usesThemeScenes=true;
     usesIamScene=usesIamScene || Boolean(source.sceneDocumentUrl || source.sceneDefinition?.sceneDocument?.ref);
   }
   if(typeof markup!=='string'||!markup.includes('data-cms-section='))
     fail('cms_page_section_renderer_unavailable');
   if(!hidden)fragments.push(markup);
   sources.push({section_id:row.id,template_sku:template.sku,definition_id:template.definition.id,
     source_key:key,source_sha256:hash,draft_key:row.draft_r2_key||null,
     draft_hash:row.content_hash||null,rendered:!hidden});
 }
 return {markup:fragments.join(''),css:fragments.length?PORTABLE_SECTION_STYLES+(usesThemeScenes?'\n'+THEME_SCENES_CMS_STYLES:''):'',
   scripts:usesIamScene?['/assets/js/iamscene-runtime.js']:[],sources};
}
