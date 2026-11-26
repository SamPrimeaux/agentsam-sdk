/** Generate the Local Studio D1 registry migration from the embed manifest and immutable release. */
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(packageRoot, '../..');
const releaseRoot = path.join(packageRoot, 'dist/releases/customer-account-portal');
const [requestedVersion = '1.0.1'] = process.argv.slice(2);
const manifestKey = `packages/platform/customer-account-portal/${requestedVersion}/manifest.json`;
const manifestPath = path.join(releaseRoot, manifestKey);
const registryPath = path.join(repositoryRoot, 'apps/local-studio/backend/migrations/1388_customer_account_portal_embed.sql');
const packageManifest = JSON.parse(await readFile(path.join(packageRoot, 'agentsam.embeds.json'), 'utf8'));
const embed = packageManifest.storefront_embeds.find((entry) => entry.key === 'customer_account_portal');
if (!embed) throw new Error('customer_account_portal_manifest_entry_missing');
const release = JSON.parse(await readFile(manifestPath, 'utf8'));
if (release.version !== requestedVersion || release.embed_key !== embed.key || release.element !== 'agentsam-customer-account-portal' || release.preview_only !== false) {
  throw new Error('customer_account_portal_release_manifest_mismatch');
}
const manifestBytes = await readFile(manifestPath);
const manifestSha256 = createHash('sha256').update(manifestBytes).digest('hex');
const sql = (value) => `'${String(value).replace(/'/g, "''")}'`;
const json = (value) => sql(JSON.stringify(value));
const sku = 'SKU-EMB-CUSTOMER-ACCOUNT-PORTAL';
const rendererKey = release.renderer_key;
const element = release.element;
const sourceRef = 'packages/agentsam-embeds/src/customer-account-portal.js';
const definitionKey = embed.key;
const version = release.version;
const packageRef = `cms-component:platform/customer-account-portal@${version}`;
const metadata = {
  sku,
  embed_key: definitionKey,
  element,
  package: '@inneranimalmedia/agentsam-embeds',
  manifest: 'packages/agentsam-embeds/agentsam.embeds.json',
  owner_only_fields: [],
  distribution: 'locked-template-site-owned-settings',
};
const editorSchema = { fields: embed.editor_fields };
const capabilities = {
  provides: embed.capabilities,
  surfaces: embed.surfaces,
  permissions: embed.permissions,
};
const compatibility = {
  surfaces: embed.surfaces,
  requiresThemePackage: false,
  requiresSiteInstall: false,
  portable: true,
  themeEditor: true,
};
const verification = {
  status: 'verified',
  source: packageRef,
  checks: ['release-manifest-sha256', 'entrypoint-sha256', 'site-scoped-identity-adapter', 'local-auth-portal-routes'],
};
const preview = { manifest_key: manifestKey, manifest_sha256: manifestSha256, element, entrypoint: release.entrypoint };

const migration = `-- agentsam-engine: d1
-- Generated from @inneranimalmedia/agentsam-embeds manifest and immutable release.
-- The definition is global built-in; merchant settings remain site-owned in cms_page_sections.
-- Apply only after both R2 objects are uploaded and verified.

INSERT INTO cms_definitions (
  account_id, definition_key, kind, label, description, category, origin, version,
  settings_schema_json, allowed_blocks_json, metadata_json, status
)
SELECT
  (SELECT account_id FROM cms_definitions WHERE origin='built_in' AND kind='block' AND status='active' ORDER BY created_at LIMIT 1),
  ${sql(definitionKey)}, 'component', ${sql(embed.name)}, ${sql(embed.tagline)}, ${sql(embed.category)},
  'built_in', ${sql(version)}, ${json(embed.editor_fields)}, '[]', ${json(metadata)}, 'active'
WHERE EXISTS (SELECT 1 FROM cms_definitions WHERE origin='built_in' AND kind='block' AND status='active')
ON CONFLICT(account_id, kind, definition_key, version) DO UPDATE SET
  label=excluded.label,
  description=excluded.description,
  category=excluded.category,
  origin='built_in',
  settings_schema_json=excluded.settings_schema_json,
  metadata_json=excluded.metadata_json,
  status='active',
  updated_at=datetime('now');

INSERT INTO cms_component_templates (
  sku, template_name, template_type, category, status, label, tags, template_data,
  is_system, item_type, definition_id, definition_key, definition_version,
  editor_schema_json, compatibility_json, responsive_schema_json, data_bindings_json, preview_json
)
SELECT
  ${sql(sku)}, ${sql(embed.name)}, 'app_embed', ${sql(embed.category)}, 'active', ${sql(embed.name)},
  ${json(['app_embed', 'customer', 'account', 'identity'])}, ${json(embed.default_config)}, 1, 'ui_component',
  d.id, ${sql(definitionKey)}, ${sql(version)}, ${json(editorSchema)}, ${json({ surfaces: embed.surfaces })},
  '{}', '{}', ${json(preview)}
FROM cms_definitions d
WHERE d.definition_key=${sql(definitionKey)} AND d.kind='component' AND d.version=${sql(version)} AND d.origin='built_in'
ON CONFLICT(sku) DO UPDATE SET
  template_name=excluded.template_name,
  template_type=excluded.template_type,
  category=excluded.category,
  status='active',
  label=excluded.label,
  tags=excluded.tags,
  template_data=excluded.template_data,
  is_system=1,
  item_type='ui_component',
  definition_id=excluded.definition_id,
  definition_key=excluded.definition_key,
  definition_version=excluded.definition_version,
  editor_schema_json=excluded.editor_schema_json,
  compatibility_json=excluded.compatibility_json,
  preview_json=excluded.preview_json,
  updated_at=datetime('now');

INSERT INTO cms_components (
  definition_id, renderer_key, delivery_mode, package_ref, source_ref,
  artifact_r2_bucket, artifact_r2_key, artifact_sha256,
  capabilities_json, compatibility_json, verification_json, implementation_status
)
SELECT
  d.id, ${sql(rendererKey)}, 'isolated_embed', ${sql(packageRef)}, ${sql(sourceRef)},
  'theme-store', ${sql(manifestKey)}, ${sql(manifestSha256)},
  ${json(capabilities)}, ${json(compatibility)}, ${json(verification)}, 'verified'
FROM cms_definitions d
WHERE d.definition_key=${sql(definitionKey)} AND d.kind='component' AND d.version=${sql(version)} AND d.origin='built_in'
ON CONFLICT(definition_id) DO UPDATE SET
  renderer_key=excluded.renderer_key,
  delivery_mode='isolated_embed',
  package_ref=excluded.package_ref,
  source_ref=excluded.source_ref,
  artifact_r2_bucket='theme-store',
  artifact_r2_key=excluded.artifact_r2_key,
  artifact_sha256=excluded.artifact_sha256,
  capabilities_json=excluded.capabilities_json,
  compatibility_json=excluded.compatibility_json,
  verification_json=excluded.verification_json,
  implementation_status='verified',
  updated_at=datetime('now');
`;
await mkdir(path.dirname(registryPath), { recursive: true });
await writeFile(registryPath, migration);
process.stdout.write(`${JSON.stringify({ registryPath, manifestKey, manifestSha256, rendererKey, sku, definitionKey, version })}\n`);
