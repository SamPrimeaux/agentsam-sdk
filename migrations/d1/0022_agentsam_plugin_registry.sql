-- 0022: agentsam_plugins becomes the pure plugin registry (no owner, no host).
-- Per-account state moves to agentsam_plugin_installations.
-- D1 rejects DROP of a parent table without cascade side effects, so dependent
-- rows are stashed first and restored after the rebuild.
PRAGMA defer_foreign_keys = on;

CREATE TABLE _mig_old_plugins AS SELECT * FROM agentsam_plugins;
CREATE TABLE _mig_bk_health AS SELECT * FROM agentsam_plugin_health_checks;
CREATE TABLE _mig_bk_toolplug AS
  SELECT id,
         CASE plugin_id WHEN 'plg_completeful_acct_fuelnfreetime' THEN 'plg_completeful' ELSE plugin_id END AS plugin_id
  FROM agentsam_tools WHERE plugin_id IS NOT NULL;

CREATE TABLE agentsam_plugins_next (
  id TEXT PRIMARY KEY DEFAULT ('plg_' || lower(hex(randomblob(8)))),
  plugin_key TEXT NOT NULL UNIQUE,
  family_key TEXT NOT NULL
    CHECK (family_key IN ('core','connections','commerce','build','brand-campaign')),
  version TEXT NOT NULL DEFAULT '1.0.0',
  provider_key TEXT NOT NULL,
  plugin_kind TEXT NOT NULL
    CHECK (plugin_kind IN ('mcp','api','oauth','native','webhook','database','storage','ai')),
  category TEXT NOT NULL DEFAULT 'integration',
  display_name TEXT NOT NULL,
  short_name TEXT,
  description TEXT,
  mention_aliases_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(mention_aliases_json)),
  endpoint_url TEXT,
  transport TEXT NOT NULL
    CHECK (transport IN ('remote_jsonrpc','iam_mcp_catalog','http_rest','http_graphql','webhook','workers_binding','native','none')),
  auth_type TEXT NOT NULL DEFAULT 'none'
    CHECK (auth_type IN ('none','bridge','oauth','oauth_via_iam','bearer_secret','api_key_secret','workers_binding')),
  oauth_connect_url TEXT,
  capabilities_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(capabilities_json)),
  tool_lanes_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tool_lanes_json)),
  config_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(config_json)),
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
  icon_url TEXT,
  icon_alt TEXT,
  icon_fit TEXT NOT NULL DEFAULT 'contain' CHECK (icon_fit IN ('contain','cover')),
  composer_visible INTEGER NOT NULL DEFAULT 1 CHECK (composer_visible IN (0,1)),
  settings_visible INTEGER NOT NULL DEFAULT 1 CHECK (settings_visible IN (0,1)),
  sort_priority INTEGER NOT NULL DEFAULT 50,
  health_strategy TEXT NOT NULL DEFAULT 'adapter'
    CHECK (health_strategy IN ('none','adapter','mcp_ping','oauth_probe','provider_probe')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Existing platform plugins: connections family
INSERT INTO agentsam_plugins_next
  (id, plugin_key, family_key, version, provider_key, plugin_kind, category, display_name, short_name, description,
   mention_aliases_json, endpoint_url, transport, auth_type, oauth_connect_url, capabilities_json, tool_lanes_json,
   config_json, metadata_json, icon_url, icon_alt, icon_fit, composer_visible, settings_visible, sort_priority,
   health_strategy, created_at, updated_at)
SELECT id, plugin_key, 'connections', '1.0.0', provider_key, plugin_kind, category, display_name, short_name, description,
       mention_aliases_json, endpoint_url, transport, auth_type, oauth_connect_url, capabilities_json, tool_lanes_json,
       CASE id WHEN 'plg_b585c9b098db105c' THEN '{"bridge_only":true}' ELSE config_json END,
       metadata_json, icon_url, icon_alt, icon_fit, composer_visible, settings_visible, sort_priority,
       health_strategy, created_at, updated_at
FROM _mig_old_plugins
WHERE id IN ('plg_a13ac0e56815514d','plg_7e87811e8fc59e99','plg_b585c9b098db105c');

-- Catalog plugins: brand-campaign family
INSERT INTO agentsam_plugins_next
  (id, plugin_key, family_key, version, provider_key, plugin_kind, category, display_name, short_name, description,
   mention_aliases_json, endpoint_url, transport, auth_type, oauth_connect_url, capabilities_json, tool_lanes_json,
   config_json, metadata_json, icon_url, icon_alt, icon_fit, composer_visible, settings_visible, sort_priority,
   health_strategy, created_at, updated_at)
SELECT id, plugin_key, 'brand-campaign', COALESCE(json_extract(metadata_json,'$.version'),'1.0.0'), provider_key, plugin_kind,
       category, display_name, short_name, description, mention_aliases_json, endpoint_url, transport, auth_type,
       oauth_connect_url, capabilities_json, tool_lanes_json, config_json, metadata_json, icon_url, icon_alt, icon_fit,
       composer_visible, settings_visible, sort_priority, health_strategy, created_at, updated_at
FROM _mig_old_plugins
WHERE id IN ('plg_142893dc67204e30','plg_540bd4fde00e459a');

-- Completeful: platform-level commerce plugin, no account/repo/deployment
INSERT INTO agentsam_plugins_next
  (id, plugin_key, family_key, provider_key, plugin_kind, category, display_name, short_name, description,
   mention_aliases_json, endpoint_url, transport, auth_type, capabilities_json, tool_lanes_json, config_json,
   sort_priority, health_strategy)
VALUES
  ('plg_completeful','completeful','commerce','completeful','native','commerce','Completeful','Completeful',
   'Curated ecommerce catalog, design and fulfillment capabilities.',
   '["@completeful","completeful"]','https://vxapi.completeful.com/v1','native','api_key_secret',
   '["catalog.search","catalog.read","catalog.sync","design.create","product.publish","product.sync","order.quote","order.create"]',
   '["native","curated"]','{"credential_source":"user_secrets"}',40,'provider_probe');

-- CAD engines: host-agnostic, lane-agnostic definitions
INSERT INTO agentsam_plugins_next
  (id, plugin_key, family_key, provider_key, plugin_kind, category, display_name, description,
   endpoint_url, transport, auth_type, capabilities_json, tool_lanes_json, config_json, metadata_json,
   composer_visible, health_strategy)
VALUES
  ('plg_cad_engine_occt','cad-engine-occt','build','opencascade','native','cad-engine','OpenCascade',
   'Solid modeling engine for CAD projects.',NULL,'native','none',
   '["design.solid.create","design.solid.inspect","design.solid.export.step"]','["local","remote","cloud"]',
   '{}','{"contract":"cad.project.v1"}',0,'none'),
  ('plg_cad_engine_blender','cad-engine-blender','build','blender','native','cad-engine','Blender',
   'Headless mesh modeling, rendering and export for CAD projects.',NULL,'native','none',
   '["design.create","design.export"]','["local","remote","cloud"]',
   '{"detect":{"command":["blender","--version"],"version_pattern":"Blender (\\d+\\.\\d+\\.\\d+)"}}',
   '{"contract":"cad.project.v1"}',0,'none'),
  ('plg_cad_engine_openscad','cad-engine-openscad','build','openscad','native','cad-engine','OpenSCAD',
   'Parametric solid modeling for CAD projects.',NULL,'native','none',
   '["design.solid.create"]','["local","remote","cloud"]',
   '{"detect":{"command":["openscad","--version"],"version_pattern":"(\\d[\\d.]+)"}}',
   '{"contract":"cad.project.v1"}',0,'none');

DROP TABLE agentsam_plugins;
ALTER TABLE agentsam_plugins_next RENAME TO agentsam_plugins;

-- Restore rows that cascaded or were nulled by the drop
INSERT OR IGNORE INTO agentsam_plugin_health_checks SELECT * FROM _mig_bk_health;
UPDATE agentsam_tools
   SET plugin_id = (SELECT b.plugin_id FROM _mig_bk_toolplug b WHERE b.id = agentsam_tools.id)
 WHERE id IN (SELECT id FROM _mig_bk_toolplug);

CREATE TABLE agentsam_plugin_installations (
  id TEXT PRIMARY KEY DEFAULT ('pinst_' || lower(hex(randomblob(8)))),
  account_id TEXT NOT NULL,
  plugin_id TEXT NOT NULL REFERENCES agentsam_plugins(id) ON DELETE CASCADE,
  instance_key TEXT NOT NULL DEFAULT 'default',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  setup_status TEXT NOT NULL DEFAULT 'unconfigured'
    CHECK (setup_status IN ('unconfigured','configured','connected','disabled')),
  secret_ref TEXT,
  resource_scope_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(resource_scope_json)),
  config_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(config_json)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (account_id, plugin_id, instance_key)
);

INSERT INTO agentsam_plugin_installations
  (account_id, plugin_id, instance_key, enabled, setup_status, secret_ref, resource_scope_json, config_json, created_at, updated_at)
SELECT account_id,
       CASE id WHEN 'plg_01feacb43b0744ce' THEN 'plg_7e87811e8fc59e99'
               WHEN 'plg_completeful_acct_fuelnfreetime' THEN 'plg_completeful'
               ELSE id END,
       'default', is_enabled, setup_status, secret_ref,
       CASE WHEN id = 'plg_completeful_acct_fuelnfreetime' THEN '{}' ELSE resource_scope_json END,
       CASE WHEN id = 'plg_b585c9b098db105c' THEN config_json ELSE '{}' END,
       created_at, updated_at
FROM _mig_old_plugins
WHERE id NOT LIKE 'plg_cad_%';

INSERT INTO agentsam_plugin_installations
  (account_id, plugin_id, instance_key, enabled, setup_status, config_json, created_at, updated_at)
SELECT account_id,
       CASE id WHEN 'plg_cad_occt_sams_imac' THEN 'plg_cad_engine_occt'
               WHEN 'plg_cad_blender_sams_imac' THEN 'plg_cad_engine_blender'
               ELSE 'plg_cad_engine_openscad' END,
       'default', 0, setup_status,
       json_object('observed', json_object(
         'version', json_extract(metadata_json,'$.installed_version'),
         'status',  json_extract(metadata_json,'$.observed_status'),
         'at',      json_extract(metadata_json,'$.observed_at'))),
       created_at, updated_at
FROM _mig_old_plugins
WHERE id IN ('plg_cad_occt_sams_imac','plg_cad_blender_sams_imac','plg_cad_openscad_sams_imac');

UPDATE agentsam_plugins SET short_name = 'Inner Animal MCP' WHERE id = 'plg_b585c9b098db105c';
UPDATE agentsam_plugins SET short_name = 'Inner Animal Cloudflare' WHERE id = 'plg_a13ac0e56815514d';

-- capabilities come from the tools a plugin actually owns
UPDATE agentsam_plugins
   SET capabilities_json = (
     SELECT json_group_array(capability_key) FROM (
       SELECT DISTINCT tc.capability_key
         FROM agentsam_tool_capabilities tc JOIN agentsam_tools t ON t.id = tc.tool_id
        WHERE t.plugin_id = agentsam_plugins.id ORDER BY 1))
 WHERE EXISTS (
   SELECT 1 FROM agentsam_tool_capabilities tc JOIN agentsam_tools t ON t.id = tc.tool_id
    WHERE t.plugin_id = agentsam_plugins.id);

CREATE INDEX idx_agentsam_plugins_family ON agentsam_plugins(family_key, sort_priority);
CREATE INDEX idx_agentsam_plugin_installations_account ON agentsam_plugin_installations(account_id, enabled);

DROP TABLE _mig_bk_toolplug;
DROP TABLE _mig_bk_health;
DROP TABLE _mig_old_plugins;
