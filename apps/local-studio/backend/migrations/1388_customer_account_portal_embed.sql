-- agentsam-engine: d1
-- Generated from @inneranimalmedia/agentsam-embeds manifest and immutable release.
-- The definition is global built-in; merchant settings remain site-owned in cms_page_sections.
-- Apply only after both R2 objects are uploaded and verified.

INSERT INTO cms_definitions (
  account_id, definition_key, kind, label, description, category, origin, version,
  settings_schema_json, allowed_blocks_json, metadata_json, status
)
SELECT
  (SELECT account_id FROM cms_definitions WHERE origin='built_in' AND kind='block' AND status='active' ORDER BY created_at LIMIT 1),
  'customer_account_portal', 'component', 'Customer account portal', 'Storefront sign-in and account creation, powered by AgentSam Identity.', 'Customer accounts',
  'built_in', '1.0.1', '[{"key":"enabled","label":"Enable customer account links","type":"toggle","group":"Visibility"},{"key":"login_label","label":"Sign-in label","type":"text","group":"Labels"},{"key":"signup_label","label":"Create-account label","type":"text","group":"Labels"},{"key":"show_signup","label":"Show account creation","type":"toggle","group":"Visibility"},{"key":"style","label":"Style","type":"radio","group":"Appearance","options":["button","link"]},{"key":"alignment","label":"Alignment","type":"radio","group":"Appearance","options":["left","center","right"]},{"key":"accent","label":"Accent","type":"color","group":"Colors","theme_token":true},{"key":"background","label":"Background","type":"color","group":"Colors","theme_token":true},{"key":"font_color","label":"Font color","type":"color","group":"Colors","theme_token":true},{"key":"font_family","label":"Font","type":"select","group":"Typography and shape","options":["inherit","system","serif","rounded","mono"]},{"key":"font_size","label":"Font size","type":"range","group":"Typography and shape","min":12,"max":22,"unit":"px"},{"key":"border_radius","label":"Border radius","type":"range","group":"Typography and shape","min":0,"max":32,"unit":"px"},{"key":"inherit_typography","label":"Inherit theme typography","type":"toggle","group":"Typography and shape"}]', '[]', '{"sku":"SKU-EMB-CUSTOMER-ACCOUNT-PORTAL","embed_key":"customer_account_portal","element":"agentsam-customer-account-portal","package":"@inneranimalmedia/agentsam-embeds","manifest":"packages/agentsam-embeds/agentsam.embeds.json","owner_only_fields":[],"distribution":"locked-template-site-owned-settings"}', 'active'
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
  'SKU-EMB-CUSTOMER-ACCOUNT-PORTAL', 'Customer account portal', 'app_embed', 'Customer accounts', 'active', 'Customer account portal',
  '["app_embed","customer","account","identity"]', '{"enabled":false,"login_label":"Sign in","signup_label":"Create account","show_signup":true,"style":"button","alignment":"right","accent":"","background":"","font_color":"","inherit_typography":true,"font_family":"inherit","font_size":16,"border_radius":16}', 1, 'ui_component',
  d.id, 'customer_account_portal', '1.0.1', '{"fields":[{"key":"enabled","label":"Enable customer account links","type":"toggle","group":"Visibility"},{"key":"login_label","label":"Sign-in label","type":"text","group":"Labels"},{"key":"signup_label","label":"Create-account label","type":"text","group":"Labels"},{"key":"show_signup","label":"Show account creation","type":"toggle","group":"Visibility"},{"key":"style","label":"Style","type":"radio","group":"Appearance","options":["button","link"]},{"key":"alignment","label":"Alignment","type":"radio","group":"Appearance","options":["left","center","right"]},{"key":"accent","label":"Accent","type":"color","group":"Colors","theme_token":true},{"key":"background","label":"Background","type":"color","group":"Colors","theme_token":true},{"key":"font_color","label":"Font color","type":"color","group":"Colors","theme_token":true},{"key":"font_family","label":"Font","type":"select","group":"Typography and shape","options":["inherit","system","serif","rounded","mono"]},{"key":"font_size","label":"Font size","type":"range","group":"Typography and shape","min":12,"max":22,"unit":"px"},{"key":"border_radius","label":"Border radius","type":"range","group":"Typography and shape","min":0,"max":32,"unit":"px"},{"key":"inherit_typography","label":"Inherit theme typography","type":"toggle","group":"Typography and shape"}]}', '{"surfaces":["storefront_embed"]}',
  '{}', '{}', '{"manifest_key":"packages/platform/customer-account-portal/1.0.1/manifest.json","manifest_sha256":"9e286abea781c94c5490ab3a74a411477b13b38efe03105486542e38dd1e5ec7","element":"agentsam-customer-account-portal","entrypoint":"customer-account-portal.js"}'
FROM cms_definitions d
WHERE d.definition_key='customer_account_portal' AND d.kind='component' AND d.version='1.0.1' AND d.origin='built_in'
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
  d.id, 'agentsam-embeds:customer-account-portal', 'isolated_embed', 'cms-component:platform/customer-account-portal@1.0.1', 'packages/agentsam-embeds/src/customer-account-portal.js',
  'theme-store', 'packages/platform/customer-account-portal/1.0.1/manifest.json', '9e286abea781c94c5490ab3a74a411477b13b38efe03105486542e38dd1e5ec7',
  '{"provides":["identity.customer.login","identity.customer.signup","identity.customer.password_reset"],"surfaces":["storefront_embed"],"permissions":["Create and maintain customer sessions scoped to this storefront"]}', '{"surfaces":["storefront_embed"],"requiresThemePackage":false,"requiresSiteInstall":false,"portable":true,"themeEditor":true}', '{"status":"verified","source":"cms-component:platform/customer-account-portal@1.0.1","checks":["release-manifest-sha256","entrypoint-sha256","site-scoped-identity-adapter","local-auth-portal-routes"]}', 'verified'
FROM cms_definitions d
WHERE d.definition_key='customer_account_portal' AND d.kind='component' AND d.version='1.0.1' AND d.origin='built_in'
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
