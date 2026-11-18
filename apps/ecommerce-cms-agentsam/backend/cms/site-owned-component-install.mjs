/**
 * Site-first stock-template installer for the EXISTING CMS catalog.
 * Catalog ownership: cms_component_templates. Configuration: cms_definitions.
 * Executable identity: cms_components. Tenant instances: cms_page_sections /
 * cms_section_blocks. No new tables, alternate CMS or copied catalog state.
 */
import { listCmsComponentCatalog } from './definition-registry.mjs';
import { selectOwnedPageSite, findSiteOwnedPage } from './site-owned-page-adapter.mjs';
import { resolveCatalogTemplate, buildCatalogInstanceContent } from './catalog-resource.mjs';
import '../../packages/theme-contract/runtime/platform-stock-sections.js';
import '../../packages/theme-contract/runtime/portable-sections.js';

const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const parse = value => { try { const o=typeof value==='string'?JSON.parse(value):value;return plain(o)?o:{}; } catch {return {};} };
const sha256 = async text => Array.from(new Uint8Array(await crypto.subtle.digest(
  'SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
const error = (code,status=400) => ({ok:false,error:code,status});
const ident = value => typeof value==='string' && /^[A-Za-z0-9_-]{1,100}$/.test(value) &&
  !['__proto__','constructor','prototype'].includes(value);

export async function listSiteOwnedStockCatalog(env,accountId) {
  // A catalog template remains discoverable when its runtime is unavailable:
  // availability and renderer installation readiness are separate contracts.
  const rows = await listCmsComponentCatalog(env,accountId);
  return rows.map(row=>({
    key:row.sku,sku:row.sku,name:row.name,category:row.category,
    item_type:row.itemType,source:'cms_component_templates',status:row.status,
    installable:row.installable,rendererReady:row.runtimeReady,
    unavailableReason:row.unavailableReason||null,rendererKey:row.rendererKey,
    definitionKey:row.definitionKey,definitionVersion:row.definitionVersion,
    preview:row.preview,editorSchema:row.editorSchema,
  }));
}

function prepareStockInstance(template,settings) {
  if (template.itemType!=='section' || !template.installable || !template.definition?.id ||
      !template.rendererKey) return {failure:error('cms_stock_renderer_unavailable',409)};
  const defaults=template.templateData?.default_content;
  if (!plain(defaults) || !plain(defaults.__editor)) return {failure:error('cms_stock_defaults_missing',409)};
  const runtime=globalThis.ThemePortableSections;
  if (!runtime?.get?.(template.rendererKey) || !runtime?.validate)
    return {failure:error('cms_stock_renderer_not_loaded',503)};
  const next=structuredClone(defaults);
  if (settings!==undefined && settings!==null) {
    if (!plain(settings) || Object.keys(settings).some(key=>key==='__editor' || key==='__proto__' ||
      key==='constructor' || key==='prototype'))
      return {failure:error('cms_stock_settings_invalid',422)};
    for(const [key,value] of Object.entries(settings)) {
      if (!(key in next)) return {failure:error('cms_stock_setting_unknown',422)};
      next[key]=plain(next[key])&&plain(value)?{...next[key],...structuredClone(value)}:structuredClone(value);
    }
  }
  next.__editor={...next.__editor,templateKey:'portable',
    themePreset:template.rendererKey,catalogSku:template.sku,definitionKey:template.definitionKey,
    definitionVersion:template.definitionVersion,source:'catalog-install'};
  const valid=runtime.validate(template.rendererKey,next);
  if (!valid?.ok) return {failure:error('cms_stock_settings_invalid:'+String(valid?.error||'validation'),422)};
  return {content:next,sectionType:'theme_section',
    definitionId:template.definition.id,templateSku:template.sku,
    sectionName:template.name,rendererKey:template.rendererKey};
}

function prepareEmbedInstance(template,settings) {
  if(!template) return {failure:error('cms_catalog_template_not_found',404)};
  return {content:buildCatalogInstanceContent(template,settings),sectionType:'storefront_embed',
    definitionId:null,templateSku:null,sectionName:template.name,rendererKey:null};
}

function blockSpecs(content) {
  const blocks=content.__editor?.blocks||[];
  if(!Array.isArray(blocks) || blocks.length>64) throw new Error('cms_blocks_invalid');
  const seen=new Set();
  return blocks.map((block,index)=>{
    if(!plain(block) || !ident(block.id) || !ident(block.templateKey) || seen.has(block.id))
      throw new Error('cms_block_identity_invalid');
    seen.add(block.id);
    const values=content[block.id]||{};
    if(!plain(values)) throw new Error('cms_block_content_invalid');
    if(block.parentBlockId) throw new Error('cms_nested_block_parent_install_requires_verified_adapter');
    return {key:block.id,type:block.templateKey,settings:JSON.stringify(values),
      status:block.enabled===false?'hidden':'active',order:index*10};
  });
}

export async function installSiteOwnedStockOrEmbed(env,accountId,slug,siteId,pageId,body={}) {
  if(!accountId) return error('cms_account_required',403);
  if(!siteId) return error('cms_site_required',400);
  if(!env.CMS_CONTENT || !env.DB) return error('cms_section_bucket_unavailable',503);
  const site=await selectOwnedPageSite(env,accountId,siteId);
  const page=await findSiteOwnedPage(env,site,slug,pageId);
  if(!page || page.slug!==slug || page.status==='archived' || page.slug==='site')
    return error('cms_page_not_found',404);
  const requested=body.catalogKey||body.catalog_key||body.key;
  if(typeof requested!=='string' || requested.length>160) return error('cms_catalog_key_invalid',400);
  let prepared,sourceKey=requested;
  // The packaged EMBED catalog is a separate application integration, not
  // cms_component_templates. Preserve its existing installation behavior.
  const embed=resolveCatalogTemplate(requested);
  if(embed) {
    prepared=prepareEmbedInstance(embed,body.settings||body.config||{});
  } else {
    const all=await listCmsComponentCatalog(env,accountId,{itemType:'section'});
    const template=all.find(row=>row.sku===requested);
    if(!template) return error('cms_catalog_template_not_found',404);
    prepared=prepareStockInstance(template,body.settings??body.config);
  }
  if(prepared.failure) return prepared.failure;
  const {content,sectionType,definitionId,templateSku,sectionName,rendererKey}=prepared;
  let blocks;
  try {blocks=blockSpecs(content);} catch(e){return error(String(e.message||e),422);}
  const serialized=JSON.stringify(content);
  if(new TextEncoder().encode(serialized).length>524288) return error('cms_section_content_too_large',413);
  const nonce=crypto.randomUUID().replaceAll('-','');
  const id='cmss_'+nonce.slice(0,20);
  const sectionKey=(templateSku?'stock-':'catalog-')+nonce.slice(0,16);
  const digest=await sha256(serialized);
  const key='cms/sections/drafts/'+encodeURIComponent(page.id)+'/'+id+
    '/revision-000001-'+digest.slice(0,16)+'.json';
  try {
    await env.CMS_CONTENT.put(key,serialized,{httpMetadata:{contentType:'application/json'}});
    const object=await env.CMS_CONTENT.get(key);
    if(!object || await sha256(await object.text())!==digest)
      return error('cms_section_r2_verification_failed',503);
  } catch {return error('cms_section_r2_unavailable',503);}
  const {results:existing=[]}=await env.DB.prepare(
    'SELECT id FROM cms_page_sections WHERE page_id=? ORDER BY sort_order,id'
  ).bind(page.id).all();
  const at=Number.isSafeInteger(body.toIndex)
    ?Math.max(0,Math.min(body.toIndex,existing.length)):existing.length;
  const ordered=existing.map(row=>row.id);
  ordered.splice(at,0,id);
  const metadata=JSON.stringify({source:'catalog-install',catalogKey:sourceKey,
    ...(templateSku?{catalogSku:templateSku,definitionKey:content.__editor.definitionKey}:{}),
    ...(rendererKey?{rendererKey}:{}),artifactBacked:true});
  const statements=[
    ...ordered.filter(other=>other!==id).map(other=>env.DB.prepare(
      'UPDATE cms_page_sections SET sort_order=?,updated_at=datetime(\'now\') WHERE id=? AND page_id=?'
    ).bind(ordered.indexOf(other)*10,other,page.id)),
    env.DB.prepare(`INSERT INTO cms_page_sections
      (id,page_id,section_key,section_type,section_name,section_data,sort_order,is_visible,
       r2_bucket,draft_r2_key,content_hash,definition_id,template_sku,metadata_json)
      VALUES (?,?,?,?,?,'{}',?,?,'cms',?,?,?,?,?)`)
      .bind(id,page.id,sectionKey,sectionType,sectionName,at*10,
        content.__editor.visibility?.enabled===false?0:1,key,digest,definitionId,templateSku,metadata),
    ...blocks.map(block=>env.DB.prepare(`INSERT INTO cms_section_blocks
      (id,account_id,section_id,block_key,block_type,sort_order,status,content_json,metadata_json)
      VALUES (?,?,?,?,?,?,?,?,'{"source":"theme-studio-v1"}')`)
      .bind('cmsb_'+crypto.randomUUID().replaceAll('-').slice(0,20),
        accountId,id,block.key,block.type,block.order,block.status,block.settings)),
    env.DB.prepare(`INSERT INTO cms_revisions
      (account_id,site_id,entity_type,entity_id,revision_number,revision_kind,
       content_object_key,content_hash,snapshot_json,metadata_json)
      VALUES (?,?,'section',?,1,'draft',?,?,?,?)`)
      .bind(accountId,site.id,id,key,digest,
        JSON.stringify({content,catalogKey:sourceKey}),
        JSON.stringify({source:'catalog-install',catalogKey:sourceKey})),
  ];
  try {await env.DB.batch(statements);}
  catch {return error('cms_catalog_install_transaction_failed',409);}
  return {ok:true,section_key:sectionKey,section_id:id,catalog_key:sourceKey,
    template_sku:templateSku,definition_id:definitionId,renderer_key:rendererKey,
    version:1,canonical:{status:'linked'},
    instance:{id,key:sectionKey,settings:content,blocks:blocks.map(b=>({
      key:b.key,type:b.type,status:b.status}))}};
}
