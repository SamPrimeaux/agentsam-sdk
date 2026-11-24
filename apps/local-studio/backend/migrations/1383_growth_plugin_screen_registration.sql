-- agentsam-engine: d1
-- Growth is a package-declared Audience child screen. Its existing plugin
-- installation is the account binding; do not invent a second apps row.

UPDATE agentsam_plugins
SET metadata_json = json_patch(
  CASE WHEN json_valid(metadata_json) AND json_type(metadata_json) = 'object' THEN metadata_json ELSE '{}' END,
  json_object('app', json_object('surfaces', json_array('channels')))
)
WHERE plugin_key = 'agentsam-app-growth';

UPDATE agentsam_plugin_installations
SET config_json = json_patch(
  CASE WHEN json_valid(config_json) AND json_type(config_json) = 'object' THEN config_json ELSE '{}' END,
  json_object('runtime', json_object(
    'manifest_id', 'ecommerce-cms-agentsam',
    'screen_ids', json_array('growth.workspace')
  ))
), updated_at = unixepoch()
WHERE plugin_id IN (SELECT id FROM agentsam_plugins WHERE plugin_key = 'agentsam-app-growth');
