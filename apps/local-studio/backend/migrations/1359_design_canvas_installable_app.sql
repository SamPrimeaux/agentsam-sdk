-- agentsam-engine: d1
-- Register first-party app data, not an automatic account installation.
-- Only apply to production after the /design-canvas/ app assets are deployed.
INSERT OR IGNORE INTO agentsam_plugins (
  plugin_key, family_key, provider_key, plugin_kind, category,
  display_name, description, transport, auth_type, capabilities_json,
  metadata_json, sort_priority, composer_visible, settings_visible, health_strategy
) VALUES (
  'agentsam-design-canvas', 'build', 'agentsam', 'native', 'Design',
  'Design Canvas', 'Source-backed design artboards and editable UI library',
  'native', 'none', '["app","design","side_stage"]',
  json_object(
    'source','https://agentsam.inneranimalmedia.com/catalog/plugins',
    'app',json_object('surfaces',json_array('admin-nav','add-apps'),
      'nav',json_object('href','/design-canvas/','label','Design Canvas')),
    'side_stage',json_object('version',1,'id','design-canvas',
      'renderer','embed','href','https://agentsam.inneranimalmedia.com/design-canvas/',
      'icon','layout')
  ),
  66, 0, 1, 'none'
);
