#!/usr/bin/env node
/**
 * Populate existing CMS component package_ref + artifact_* columns, without
 * changing the original source preview pointers or installed site instances.
 * Run only after all manifests and blobs have been uploaded and verified.
 * This is a data-only migration, generated from the source catalog.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createStockPackage} from '../../../apps/design-canvas/scripts/stock-package-v2.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const catalog=JSON.parse(readFileSync(resolve(root,'apps/design-canvas/public/sources/stock/catalog.json'),'utf8'));
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
const sql=[
 '-- agentsam-engine: d1',
 '-- Non-destructive v2 package metadata for existing component registry rows.',
 '-- Old source refs and template r2_key columns intentionally remain intact.',
 '-- This migration MUST follow verified R2 publishing of all package manifests.',
];
for(const item of catalog.items){
  const pkg=createStockPackage(item);
  const legacyEntry=item.files.find(f=>f.path===item.main_html);
  sql.push(
    'UPDATE cms_components SET',
    'package_ref='+quote(pkg.ref)+',',
    'artifact_r2_bucket='+quote('theme-store')+',',
    'artifact_r2_key='+quote(pkg.key)+',',
    'artifact_sha256='+quote(pkg.sha256)+',',
    'verification_json=json_set(verification_json,',
    " '$.package_schema',"+quote(pkg.manifest.schema)+",",
    " '$.manifest_sha256',"+quote(pkg.sha256)+")",
    'WHERE renderer_key='+quote(pkg.manifest.renderer_key),
    'AND source_ref='+quote('r2://theme-store/'+legacyEntry.r2_key)+';',
    'UPDATE cms_component_templates SET',
    'preview_json=json_set(preview_json,',
    " '$.package_ref',"+quote(pkg.ref)+",",
    " '$.manifest_key',"+quote(pkg.key)+",",
    " '$.manifest_sha256',"+quote(pkg.sha256)+")",
    'WHERE definition_key='+quote(pkg.manifest.renderer_key),
    'AND r2_bucket='+quote('theme-store')+
      ' AND source_html_r2_key='+quote(legacyEntry.r2_key)+';',
    ''
  );
}
const target=resolve(root,'apps/local-studio/backend/migrations/1364_cms_stock_package_manifests.sql');
writeFileSync(target,sql.join('\n'));
console.log(JSON.stringify({ok:true,packages:catalog.items.length,output:target}));
