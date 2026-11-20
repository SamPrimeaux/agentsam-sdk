/** Generate site-independent CMS section templates for the shared theme-scenes package. */
import { writeFile } from 'node:fs/promises';
import { ThemeScenesSections } from '../packages/theme-contract/runtime/theme-scenes-sections.mjs';

const entries = ThemeScenesSections.catalog();
if (entries.length !== 10) throw new Error(`Expected 10 theme-scenes renderers; found ${entries.length}`);
const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const json = (value) => quote(JSON.stringify(value));
const parts = [
  '-- theme-scenes — cross-product creative scene templates for existing CMS sites.',
  '-- These are site-independent section definitions, not storefront themes or site instances.',
  '-- The CMS remains authoritative for account/site scoping, D1/R2 persistence, revisions and publication.',
  'PRAGMA foreign_keys=ON;',
];

for (const [index, item] of entries.entries()) {
  const key = item.rendererKey;
  const schema = ThemeScenesSections.schema(key);
  const defaults = ThemeScenesSections.defaults(key);
  if (!schema || !defaults || !ThemeScenesSections.validate(key, defaults).ok) {
    throw new Error(`Unverified theme-scenes renderer: ${key}`);
  }
  const definitionId = item.definitionId;
  const componentId = 'cmp_' + item.definitionKey.replaceAll('-', '_');
  const description = `${item.label}. Portable ${item.sceneKind} scene section. Scene composition is reusable across sites; merchant content and installed instances remain site scoped.`;
  const compatibility = {
    allThemes: true,
    requiresThemePackage: false,
    requiresSiteInstall: false,
    portable: true,
    breakpoints: ['mobile', 'tablet', 'desktop'],
    themeEditor: true,
    storefront: true,
    cmsPageType: 'scene',
  };
  const capabilities = {
    edit: true, reorder: true, duplicate: true, remove: true,
    responsive: true, portable: true, repeatableBlocks: true,
  };
  const metadata = {
    rendererKey: key,
    implementationClass: 'native',
    source: 'SamPrimeaux/agentsam-sdk',
    sourcePackage: '@inneranimalmedia/theme-scenes',
    sourcePackageVersion: '2.6.17',
    builtIn: true,
    siteIndependent: true,
  };
  const verification = {
    status: 'verified',
    source: `packages/theme-scenes/src/cms/runtime.js#${key}`,
    test: 'packages/theme-scenes/test/cms.test.mjs',
    runtime: 'ThemeScenesSections',
    artifactType: 'scene',
    contentMode: 'scene',
    siteScope: 'cms_page_sections',
  };
  const fieldsAndBlocks = { fields: schema.fields, blocks: schema.blocks, settings: schema.settings || [] };
  const templateData = {
    rendererKey: key,
    implementationClass: 'native',
    default_content: defaults,
    sourcePack: 'theme-scenes',
    sourcePackage: '@inneranimalmedia/theme-scenes',
    siteIndependent: true,
  };
  const responsive = { fluid: true, breakpoints: { mobile: 760, tablet: 1024, desktop: 1025 } };
  const tags = ['theme-scenes', 'creative-scene', 'portable', 'site-independent', 'theme-agnostic', 'responsive'];
  const allowed = schema.blocks.map((block) => block.key);
  const maxBlocks = schema.guardrails?.maxBlocks || schema.blocks[0]?.max || null;
  parts.push(`-- ${key}`);
  parts.push(`INSERT INTO cms_definitions (id,account_id,definition_key,kind,label,description,category,origin,version,settings_schema_json,allowed_blocks_json,max_blocks,metadata_json,status)
VALUES (${quote(definitionId)},(SELECT account_id FROM cms_definitions WHERE origin='built_in' AND status='active' ORDER BY created_at LIMIT 1),${quote(item.definitionKey)},'section',${quote(item.label)},${quote(description)},'Creative Scenes','built_in',${quote(item.definitionVersion)},${json(fieldsAndBlocks)},${json(allowed)},${maxBlocks ?? 'NULL'},${json(metadata)},'active')
ON CONFLICT(id) DO UPDATE SET label=excluded.label,description=excluded.description,category=excluded.category,settings_schema_json=excluded.settings_schema_json,allowed_blocks_json=excluded.allowed_blocks_json,max_blocks=excluded.max_blocks,metadata_json=excluded.metadata_json,status=excluded.status,updated_at=datetime('now');`);
  parts.push(`INSERT INTO cms_components (id,definition_id,renderer_key,delivery_mode,source_ref,capabilities_json,compatibility_json,verification_json,implementation_status)
VALUES (${quote(componentId)},${quote(definitionId)},${quote(key)},'bundled',${quote(`packages/theme-scenes/src/cms/runtime.js#${key}`)},${json(capabilities)},${json(compatibility)},${json(verification)},'verified')
ON CONFLICT(definition_id) DO UPDATE SET renderer_key=excluded.renderer_key,delivery_mode=excluded.delivery_mode,source_ref=excluded.source_ref,capabilities_json=excluded.capabilities_json,compatibility_json=excluded.compatibility_json,verification_json=excluded.verification_json,implementation_status=excluded.implementation_status,updated_at=datetime('now');`);
  parts.push(`INSERT INTO cms_component_templates (id,sku,template_name,template_type,category,status,label,tags,template_data,is_system,slug,sort_order,is_featured,featured_collection,item_type,definition_id,definition_key,definition_version,editor_schema_json,compatibility_json,responsive_schema_json,data_bindings_json,preview_json)
VALUES (${quote(item.templateId)},${quote(item.sku)},${quote(item.label)},'section','Creative Scenes','active',${quote(item.label)},${json(tags)},${json(templateData)},1,${quote(item.definitionKey)},${1700 + index},0,'Creative Scenes','section',${quote(definitionId)},${quote(item.definitionKey)},${quote(item.definitionVersion)},${json(schema)},${json(compatibility)},${json(responsive)},'{}',${json({ type: 'portable-renderer', renderer: 'ThemeScenesSections', preset: key, status: 'available', scripts: ['/assets/js/theme-scenes-sections.js'], styles: ['/assets/css/theme-scenes-sections.css'] })})
ON CONFLICT(sku) DO UPDATE SET template_name=excluded.template_name,template_type=excluded.template_type,category=excluded.category,status=excluded.status,label=excluded.label,tags=excluded.tags,template_data=excluded.template_data,is_system=excluded.is_system,slug=excluded.slug,sort_order=excluded.sort_order,featured_collection=excluded.featured_collection,item_type=excluded.item_type,definition_id=excluded.definition_id,definition_key=excluded.definition_key,definition_version=excluded.definition_version,editor_schema_json=excluded.editor_schema_json,compatibility_json=excluded.compatibility_json,responsive_schema_json=excluded.responsive_schema_json,data_bindings_json=excluded.data_bindings_json,preview_json=excluded.preview_json,updated_at=datetime('now');`);
}

const output = new URL('../db/migrations/009_theme_scenes_portable_sections.sql', import.meta.url);
await writeFile(output, parts.join('\n\n') + '\n');
console.log(JSON.stringify({ ok: true, templates: entries.length, output: output.pathname }));
