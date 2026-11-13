#!/usr/bin/env node
/**
 * Deterministic migration generated from the SAME six native renderer schemas,
 * original design-source content hashes and R2 catalog that power the editor.
 * No second hand-maintained CMS component registry.
 *
 * node apps/local-studio/scripts/seed-onboarding-stock-components.mjs
 */
import '../../../apps/ecommerce-cms-agentsam/packages/theme-contract/runtime/platform-stock-sections.js';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const asset=JSON.parse(readFileSync(resolve(root,'apps/design-canvas/public/sources/stock/catalog.json'),'utf8'));
const stock=globalThis.ThemePlatformStock;
const names=[
 ['choose-a-plan','SKU-STOCK-ONB-PLAN','Plan selection'],
 ['start-trial-checkout','SKU-STOCK-ONB-TRIAL','Trial / checkout preview'],
 ['setup-goals','SKU-STOCK-ONB-GOALS','Service goals'],
 ['workspace-setup','SKU-STOCK-ONB-SETUP','Workspace setup'],
 ['first-run-home','SKU-STOCK-ONB-WELCOME','First run welcome'],
 ['style-spec-bw','SKU-STOCK-ONB-STYLE','Clean company B/W style'],
];
const quote=x=>"'"+String(x).replaceAll("'","''")+"'";
const encoded=x=>quote(JSON.stringify(x));
const sql=[
  '-- agentsam-engine: d1',
  '-- Six source-backed, platform-provided CMS component records. R2 sources are',
  '-- immutable and renderer JS is bundled; NO payment providers are configured.',
  '-- Existing customer instances and authored page content are never overwritten.',
  '-- Catalog schemas are generated from the same native runtime the CMS runs.',
];
for(const [slug,sku,title] of names){
 const entry=asset.items.find(x=>x.slug===slug);
 if(!entry)throw Error('missing stock source '+slug);
 const id='platform/'+slug;
 const renderer=stock.get(id);
 if(!renderer)throw Error('missing native renderer '+id);
 const fields=stock.schema(id),content=stock.defaults(id);
 const validation=stock.validate(id,content);
 if(!validation.ok)throw Error('invalid stock defaults '+slug+':'+validation.error);
 const file=entry.files.find(f=>f.path===entry.main_html);
 const raw=readFileSync(resolve(root,'apps/design-canvas/public/sources/stock',slug,entry.main_html));
 if(!file||createHash('sha256').update(raw).digest('hex')!==file.sha256)throw Error('source hash mismatch '+slug);
 const accountExpr="(SELECT account_id FROM cms_definitions WHERE id='cmsd_store_global_header' LIMIT 1)";
 const definition='cmsd_stock_onb_'+slug.replaceAll('-','_');
 const component='cmp_stock_onb_'+slug.replaceAll('-','_');
 const metadata={stock_asset_id:entry.id,source:"platform-stock",source_preview:entry.preview_path,
   content_sha256:file.sha256,provider_required:false,checkout_simulated_only:slug==='start-trial-checkout'};
 const requirements={fields:fields.fields,blocks:fields.blocks,settings:fields.settings};
 sql.push(
  '',
  '-- '+title+' / '+id,
  'INSERT OR IGNORE INTO cms_definitions (id,account_id,definition_key,kind,label,description,category,origin,version,settings_schema_json,allowed_blocks_json,max_blocks,metadata_json,status)',
  'SELECT '+[
    quote(definition),accountExpr,quote(id),quote('section'),quote(title),
    quote('Platform stock onboarding component; editable native renderer and R2 source reference.'),
    quote('Onboarding & offers'),quote('built_in'),quote('1'),encoded(requirements),
    encoded(fields.blocks.map(b=>b.key)),String(fields.blocks[0]?.max??0),encoded(metadata),quote('active')
  ].join(',')+' WHERE EXISTS (SELECT 1 FROM cms_definitions WHERE id=\'cmsd_store_global_header\');',
  'INSERT OR IGNORE INTO cms_components (id,definition_id,renderer_key,delivery_mode,source_ref,preview_r2_bucket,preview_r2_key,capabilities_json,compatibility_json,verification_json,implementation_status)',
  'SELECT '+[
    quote(component),quote(definition),quote(id),quote('bundled'),
    quote('r2://theme-store/'+file.r2_key),quote('theme-store'),quote(file.r2_key),
    encoded({edit:true,blocks:fields.blocks.length>0,preview:true}),
    encoded({site_editor:true,theme_project:true,portable_renderer:'ThemePlatformStock'}),
    encoded({scope:'native-renderer',source_sha256:file.sha256,catalog_version:asset.version,
      no_payment_processing:true}),quote('verified')
  ].join(',')+' WHERE EXISTS (SELECT 1 FROM cms_definitions WHERE id='+quote(definition)+');',
  'INSERT OR IGNORE INTO cms_component_templates (sku,template_name,template_type,category,label,item_type,status,is_system,r2_bucket,r2_key,source_html_r2_key,slug,definition_id,definition_key,definition_version,template_data,editor_schema_json,compatibility_json,responsive_schema_json,data_bindings_json,preview_json,tags)',
  'SELECT '+[
    quote(sku),quote(title),quote('section'),quote('Onboarding & offers'),quote(title),quote('section'),
    quote('active'),1,quote('theme-store'),quote(file.r2_key),quote(file.r2_key),quote(slug),
    quote(definition),quote(id),quote('1'),encoded({renderer_key:id,default_content:content}),
    encoded(requirements),encoded({site_editor:true,theme_project:true,payment_provider:'none'}),
    encoded({mobile_first:true,breakpoints:[600,960]}),
    encoded({}),encoded({source_url:entry.preview_path,stock_asset_id:entry.id,source_sha256:file.sha256}),
    encoded(['platform-stock','onboarding',slug])
  ].join(',')+' WHERE EXISTS (SELECT 1 FROM cms_components WHERE definition_id='+quote(definition)+');'
 );
}
const out=resolve(root,'apps/local-studio/backend/migrations/1363_onboarding_stock_six.sql');
writeFileSync(out,sql.join('\n')+'\n');
console.log(JSON.stringify({ok:true,output:out,components:names.length,
  catalog_version:asset.version,sql_bytes:readFileSync(out).length}));
