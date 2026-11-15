-- agentsam-engine: d1
-- 1368: Connect existing platform Work integrations to the canonical plugin registry.
-- Registry rows advertise integrations; they do not independently authorize API calls.
-- OAuth credentials remain encrypted in user_oauth_tokens.
-- Existing installation disabled preferences must never be flipped by a backfill.

-- Resend is an API-key-backed provider, NOT a Google OAuth connection.
-- The platform Mail API already owns sending via its configured service credentials.
-- Do not create a connected installation without verifying that credential.
INSERT OR IGNORE INTO agentsam_plugins (
  plugin_key, family_key, provider_key, plugin_kind, category,
  display_name, short_name, description, endpoint_url,
  transport, auth_type, capabilities_json, tool_lanes_json,
  config_json, metadata_json, composer_visible, settings_visible,
  sort_priority, health_strategy
) VALUES (
  'resend', 'connections', 'resend', 'api', 'communication',
  'Resend', 'Resend', 'Transactional email provider used by the platform Mail service; sending requires a configured credential and authorization.',
  'https://api.resend.com', 'http_rest', 'bearer_secret',
  '["email.send"]', '[]',
  '{"credential_source":"platform_service","approval_required_for_send":true}',
  '{"source":"platform_mail","readiness":"definition_only","platform_api":"/api/mail/send"}',
  0, 1, 24, 'provider_probe'
);

-- Connect links belong to provider registry data, not Worker route switchboards.
-- These are the existing platform OAuth flows; installation status remains account-scoped.
UPDATE agentsam_plugins SET
  oauth_connect_url = 'https://inneranimalmedia.com/api/integrations/gmail/connect?return_to=%2Fdashboard%2Fmail',
  updated_at = unixepoch()
WHERE plugin_key = 'google-gmail' AND provider_key = 'google_gmail';

UPDATE agentsam_plugins SET
  oauth_connect_url = 'https://inneranimalmedia.com/api/integrations/google_drive/connect?connectDrive=1&return_to=%2Fdashboard%2Fartifacts',
  updated_at = unixepoch()
WHERE plugin_key = 'google-drive' AND provider_key = 'google_drive';

UPDATE agentsam_plugins SET
  oauth_connect_url = 'https://inneranimalmedia.com/api/integrations/google-calendar/connect?return_to=%2Fdashboard%2Fcollaborate',
  capabilities_json = '["calendar.read","calendar.write","calendar.sync"]',
  updated_at = unixepoch()
WHERE plugin_key = 'google-calendar' AND provider_key = 'google_calendar';

-- One installation per active provider/account connection. No secret material is
-- copied: secret_ref is just a lookup reference to user_oauth_tokens.
-- Preserve the account's existing disabled preference for any additional identities.
INSERT OR IGNORE INTO agentsam_plugin_installations (
  account_id, plugin_id, instance_key, enabled, setup_status, secret_ref,
  health_status, composer_visible, settings_visible
)
SELECT t.account_id, p.id,
  COALESCE(NULLIF(t.account_identifier, ''), 'default'),
  CASE WHEN EXISTS (
    SELECT 1 FROM agentsam_plugin_installations pref
    WHERE pref.account_id = t.account_id
      AND pref.plugin_id = p.id AND pref.enabled = 0
  ) THEN 0 ELSE 1 END,
  'connected', 'oauth:' || t.provider || ':' || COALESCE(t.account_identifier, ''),
  'unknown', p.composer_visible, p.settings_visible
FROM user_oauth_tokens t
JOIN agentsam_plugins p
  ON p.provider_key = t.provider AND p.plugin_kind = 'oauth'
WHERE p.plugin_key IN ('google-gmail', 'google-calendar', 'google-drive')
  AND t.is_active = 1 AND t.revoked_at IS NULL
  AND EXISTS (SELECT 1 FROM auth_users a WHERE a.id = t.account_id);
