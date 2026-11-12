-- agentsam-engine: d1
-- Make the existing account app registry authoritative without losing
-- previously available host applications. No Theme Store or app database.
-- The existing Native Canvas is an editor route AND a Side Stage shortcut.
UPDATE agentsam_plugins SET
  metadata_json=json_set(metadata_json,'$.app',json_object(
    'nav',json_object('label','Canvas','href','/canvas','icon','canvas'),
    'surfaces',json_array('admin-nav','side-stage'),
    'skills',json_array()
  )),updated_at=unixepoch()
WHERE plugin_key='agentsam-stage-canvas' AND plugin_kind='native'
  AND json_valid(metadata_json);

-- AgentSam Campaign remains an MCP plugin; the real campaign admin surface
-- belongs to Growth in the existing ecommerce CMS SPA, not /campaigns.
UPDATE agentsam_plugins SET metadata_json=json_remove(metadata_json,'$.app'),
  updated_at=unixepoch()
WHERE plugin_key='agentsam-campaign' AND plugin_kind='mcp'
  AND json_valid(metadata_json) AND json_type(metadata_json,'$.app') IS NOT NULL;

-- Backfill only accounts existing when this migration first runs, preserving
-- the legacy built-in Apps menu. Future accounts choose which Apps to install.
-- Existing explicit disabled/install preferences are preserved by IGNORE.
INSERT OR IGNORE INTO agentsam_plugin_installations
(account_id,plugin_id,instance_key,enabled,setup_status,health_status,composer_visible,settings_visible)
SELECT a.id,p.id,'default',1,'configured','healthy',0,1
FROM accounts a CROSS JOIN agentsam_plugins p
WHERE p.plugin_kind='native' AND p.plugin_key IN
('agentsam-stage-cad','agentsam-stage-media','agentsam-app-samsketch','agentsam-app-growth','agentsam-stage-canvas');
