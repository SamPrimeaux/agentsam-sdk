/** Generate source-derived portable CAD Beyond registry entries; no site/page rows. */
import {readFile,writeFile} from 'node:fs/promises';
import '../packages/theme-contract/runtime/portable-sections.js';
const P=globalThis.ThemePortableSections;
const pack=JSON.parse(await readFile(new URL('../presets/cad-beyond-blueprint/manifest.json',import.meta.url),'utf8'));
if(pack.schema!=='iam.cms.component-pack.v1'||pack.components.length!==8)throw Error('Unexpected CAD section pack');
const quote=x=>"'"+String(x).replaceAll("'","''")+"'";
const json=x=>quote(JSON.stringify(x));
const parts=[
 '-- CAD Beyond the Blueprint — eight universal CMS section definitions.',
 '-- No user sites, pages, customer-owned content or native CAD models are created.',
 '-- Reuse the same built-in definition account owner already used by the shared CMS catalog.',
 'PRAGMA foreign_keys=ON;'
];
for(const [index,item] of pack.components.entries()){
 const {renderer_key:key,definition_key:slug,definition_version:version,label,sku,category}=item;
 const d=P.get(key),schema=P.schema(key),defaults=P.defaults(key);
 if(!d||!schema||!P.validate(key,defaults).ok)throw Error('Unverified built-in CAD definition '+key);
 const defId='cmsd_'+slug.replaceAll('-','_'),cmpId='cmp_'+slug.replaceAll('-','_'),templateId='cmt_'+slug.replaceAll('-','_');
 const desc='Universal CAD Beyond the Blueprint section: '+label+'. Editable editorial and architectural evidence content; source geometry remains separately owned.';
 const compat={allThemes:true,requiresThemePackage:false,requiresSiteInstall:false,portable:true,breakpoints:['mobile','tablet','desktop'],themeEditor:true,storefront:true};
 const caps={edit:true,reorder:true,duplicate:true,remove:true,responsive:true,portable:true,repeatableBlocks:schema.blocks.length>0};
 const metadata={rendererKey:key,implementationClass:'native',source:'SamPrimeaux/agentsam-cad-machinery',builtIn:true,sourceEvidence:'presets/cad-beyond-blueprint/manifest.json'};
 const verification={status:'verified',source:'packages/theme-contract/runtime/portable-sections.js#'+key,test:'tests/cms-beyond-blueprint-sections.test.mjs',sourceModelPolicy:'not-bundled; CAD evidence supplied through site-owned media'};
 const fieldsAndBlocks={fields:schema.fields,blocks:schema.blocks,settings:schema.settings||[]};
 const templateData={rendererKey:key,implementationClass:'native',default_content:defaults,sourcePack:pack.pack_key,siteIndependent:true};
 const responsive={fluid:true,breakpoints:{mobile:760,tablet:1024,desktop:1025}};
 const tags=['cad','beyond-the-blueprint','portable','storytelling','source-evidence'];
 const allowed=schema.blocks.map(b=>b.key);
 const maxBlocks=schema.blocks.length?schema.guardrails?.maxBlocks||schema.blocks[0]?.max||null:null;
 parts.push(`-- ${key}`);
 parts.push(`INSERT INTO cms_definitions (id,account_id,definition_key,kind,label,description,category,origin,version,settings_schema_json,allowed_blocks_json,max_blocks,metadata_json,status)
VALUES (${quote(defId)},(SELECT account_id FROM cms_definitions WHERE origin='built_in' AND status='active' ORDER BY created_at LIMIT 1),${quote(slug)},'section',${quote(label)},${quote(desc)},${quote(category||'Architecture')},'built_in',${quote(version)},${json(fieldsAndBlocks)},${json(allowed)},${maxBlocks??'NULL'},${json(metadata)},'active')
ON CONFLICT(id) DO UPDATE SET label=excluded.label,description=excluded.description,category=excluded.category,settings_schema_json=excluded.settings_schema_json,allowed_blocks_json=excluded.allowed_blocks_json,max_blocks=excluded.max_blocks,metadata_json=excluded.metadata_json,status=excluded.status,updated_at=datetime('now');`);
 parts.push(`INSERT INTO cms_components (id,definition_id,renderer_key,delivery_mode,source_ref,capabilities_json,compatibility_json,verification_json,implementation_status)
VALUES (${quote(cmpId)},${quote(defId)},${quote(key)},'bundled',${quote('packages/theme-contract/runtime/portable-sections.js#'+key)},${json(caps)},${json(compat)},${json(verification)},'verified')
ON CONFLICT(definition_id) DO UPDATE SET renderer_key=excluded.renderer_key,delivery_mode=excluded.delivery_mode,source_ref=excluded.source_ref,capabilities_json=excluded.capabilities_json,compatibility_json=excluded.compatibility_json,verification_json=excluded.verification_json,implementation_status=excluded.implementation_status,updated_at=datetime('now');`);
 parts.push(`INSERT INTO cms_component_templates (id,sku,template_name,template_type,category,status,label,tags,template_data,is_system,slug,sort_order,is_featured,featured_collection,item_type,definition_id,definition_key,definition_version,editor_schema_json,compatibility_json,responsive_schema_json,data_bindings_json,preview_json)
VALUES (${quote(templateId)},${quote(sku)},${quote(label)},'section',${quote(category||'Storytelling')},'active',${quote(label)},${json(tags)},${json(templateData)},1,${quote(slug)},${1700+index},0,'Beyond the Blueprint','section',${quote(defId)},${quote(slug)},${quote(version)},${json(schema)},${json(compat)},${json(responsive)},'{}',${json({type:'portable-renderer',renderer:'ThemePortableSections',preset:key,status:'available'})})
ON CONFLICT(sku) DO UPDATE SET template_name=excluded.template_name,template_type=excluded.template_type,category=excluded.category,status=excluded.status,label=excluded.label,tags=excluded.tags,template_data=excluded.template_data,is_system=excluded.is_system,slug=excluded.slug,sort_order=excluded.sort_order,featured_collection=excluded.featured_collection,item_type=excluded.item_type,definition_id=excluded.definition_id,definition_key=excluded.definition_key,definition_version=excluded.definition_version,editor_schema_json=excluded.editor_schema_json,compatibility_json=excluded.compatibility_json,responsive_schema_json=excluded.responsive_schema_json,data_bindings_json=excluded.data_bindings_json,preview_json=excluded.preview_json,updated_at=datetime('now');`);
}
const output=new URL('../db/migrations/008_cad_beyond_portable_sections.sql',import.meta.url);
await writeFile(output,parts.join('\n\n')+'\n');
console.log('Prepared',pack.components.length,'universal CAD section rows, no site ownership');
