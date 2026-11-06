-- agentsam-engine: d1
-- Side Stage entries are catalog data. Host-owned native renderers are
-- selected by capability, not by hardcoded menu registration or .env flags.
-- Visibility belongs to account-scoped agentsam_plugin_installations.
-- This migration adds no tables.
WITH stage(key,label,description,tab_kind,icon,priority) AS (
  VALUES
   ('goal','Edit goal','Edit the current work goal','goal','target',10),
   ('coworker','Co-worker','Work with an additional agent','chat','users',20),
   ('browser','Browser','Focus a browser session','browser','globe',30),
   ('files','Files','Inspect authorized project files','files','file-code',40),
   ('artifacts','Artifacts','Browse generated artifacts','artifacts','box',50),
   ('cad','CAD Creator','Open the existing CAD editor','app','layers',60),
   ('canvas','Canvas','Create or edit source-backed designs','design','layout',65),
   ('media','MovieMode','Edit media compositions','media','film',70),
   ('database','Database','Inspect connected data sources','database','database',80),
   ('cli','CLI','Work in the authorized terminal','terminal','square-terminal',90)
)
INSERT OR IGNORE INTO agentsam_plugins (
  plugin_key, family_key, provider_key, plugin_kind, category,
  display_name, description, transport, auth_type, capabilities_json,
  metadata_json, sort_priority, composer_visible, settings_visible, health_strategy
)
SELECT
  'agentsam-stage-' || stage.key,
  'core', 'agentsam', 'native', 'workspace',
  stage.label, stage.description, 'native', 'none', '["side_stage"]',
  json_object('side_stage', json_object(
    'version', 1, 'id', stage.key, 'tab_kind', stage.tab_kind,
    'renderer', 'builtin', 'icon', stage.icon,
    'default_visible', json('true')
  )),
  stage.priority, 0, 1, 'none'
FROM stage;
