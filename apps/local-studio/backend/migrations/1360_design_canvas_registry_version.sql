-- agentsam-engine: d1
-- Align the account-installed first-party app with its independently versioned package.
-- Does not alter any installation, account, permissions, or existing plugin metadata.
UPDATE agentsam_plugins
SET version = '0.1.0', updated_at = unixepoch()
WHERE plugin_key = 'agentsam-design-canvas'
  AND version <> '0.1.0';
