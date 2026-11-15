-- agentsam-engine: d1
-- Installable Docker integration. Its native Desktop bridge is host owned;
-- installing never grants Docker socket, SSH keys or container execution.
INSERT OR IGNORE INTO agentsam_plugins (
  plugin_key, family_key, provider_key, plugin_kind, category,
  display_name, short_name, description, transport, auth_type,
  capabilities_json, tool_lanes_json, metadata_json,
  sort_priority, composer_visible, settings_visible, health_strategy
) VALUES (
  'agentsam-docker-engine', 'connections', 'docker', 'native', 'developer-tools',
  'Docker', 'Docker',
  'Manage your own local or SSH/TLS Docker contexts and open authorized container files in AgentSam IDE.',
  'native', 'bridge',
  '["docker.discover","docker.containers.read","docker.files.read","docker.files.write","docker.lifecycle.manage"]',
  '["local","remote"]',
  '{"app":{"nav":{"label":"Docker","href":"/settings/runtime","icon":"container"},"surfaces":["side-stage"],"skills":[]},"side_stage":{"version":1,"id":"docker","renderer":"workspace","icon":"box","default_visible":false},"setup":{"requires":"authorized_host","credentials":"host_only","oauth":false}}',
  65, 0, 1, 'adapter'
);
-- No account-wide automatic installation or enabled status. A new customer
-- explicitly installs it; multiple engine contexts are choices inside that install.
