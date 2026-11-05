-- 0024: user_oauth_tokens becomes the account-scoped provider-connection store.
-- accounts.id (au_*) is the only owner key; no tenant/workspace/person scoping; tokens are encrypted-only.
-- Provider connections are exposed as registry plugins (agentsam_plugins) and installed per account
-- (agentsam_plugin_installations.secret_ref -> 'oauth:<provider>:<account_identifier>').

-- 1. Preserve per-connection display data inside metadata_json before the columns go.
UPDATE user_oauth_tokens SET metadata_json = json_patch(
  CASE WHEN metadata_json IS NOT NULL AND json_valid(metadata_json) THEN metadata_json ELSE '{}' END,
  json_object('email', account_email, 'display', account_display, 'label', account_label));
UPDATE user_oauth_tokens SET scopes = scope WHERE scopes IS NULL AND scope IS NOT NULL;

-- 2. Indexes that reference columns being renamed/dropped.
DROP INDEX IF EXISTS idx_user_oauth_tokens_user_provider;
DROP INDEX IF EXISTS idx_user_oauth_tokens_active_lookup;
DROP INDEX IF EXISTS idx_user_oauth_tokens_active;

-- 3. Rename + drop (in place; no table rebuild).
ALTER TABLE user_oauth_tokens RENAME COLUMN user_id TO account_id;
ALTER TABLE user_oauth_tokens DROP COLUMN access_token;
ALTER TABLE user_oauth_tokens DROP COLUMN refresh_token;
ALTER TABLE user_oauth_tokens DROP COLUMN scope;
ALTER TABLE user_oauth_tokens DROP COLUMN account_email;
ALTER TABLE user_oauth_tokens DROP COLUMN account_display;
ALTER TABLE user_oauth_tokens DROP COLUMN account_label;
ALTER TABLE user_oauth_tokens DROP COLUMN tenant_id;
ALTER TABLE user_oauth_tokens DROP COLUMN person_uuid;
ALTER TABLE user_oauth_tokens DROP COLUMN workspace_id;
ALTER TABLE user_oauth_tokens DROP COLUMN vault_access_token_id;
ALTER TABLE user_oauth_tokens DROP COLUMN vault_refresh_token_id;
ALTER TABLE user_oauth_tokens DROP COLUMN revoked_by;

CREATE INDEX IF NOT EXISTS idx_user_oauth_tokens_account_provider ON user_oauth_tokens(account_id, provider);
CREATE INDEX IF NOT EXISTS idx_user_oauth_tokens_active_lookup
  ON user_oauth_tokens(account_id, provider, account_identifier, updated_at DESC)
  WHERE is_active = 1 AND revoked_at IS NULL;

-- 4. Unused short-lived CSRF table (superseded by oauth_state_nonces; no readers).
DROP TABLE IF EXISTS oauth_states;

-- 5. Provider-connection plugins (user opts in per account; nothing is forced).
INSERT OR IGNORE INTO agentsam_plugins
  (plugin_key, family_key, provider_key, plugin_kind, category, display_name, short_name, description,
   transport, auth_type, capabilities_json, tool_lanes_json, composer_visible, settings_visible, sort_priority, health_strategy)
VALUES
  ('google-gmail','connections','google_gmail','oauth','mail','Gmail','Gmail','Read, draft and send mail from a connected Google account.',
   'http_rest','oauth','["email.read","email.draft","email.send","email.modify"]','["typed"]',1,1,20,'oauth_probe'),
  ('google-drive','connections','google_drive','oauth','files','Google Drive','Drive','Read and write files in a connected Google Drive.',
   'http_rest','oauth','["drive.read","drive.write"]','["typed"]',1,1,21,'oauth_probe'),
  ('google-calendar','connections','google_calendar','oauth','calendar','Google Calendar','Calendar','Read and manage events on a connected Google calendar.',
   'http_rest','oauth','[]','["typed"]',1,1,22,'oauth_probe'),
  ('github','connections','github','oauth','code','GitHub','GitHub','Browse repositories, issues and pull requests on a connected GitHub account.',
   'http_rest','oauth','["github.read","github.write","git.read"]','["typed"]',1,1,23,'oauth_probe');

-- 6. Install a plugin for every live connection, one install per connected external account.
INSERT OR IGNORE INTO agentsam_plugin_installations
  (account_id, plugin_id, instance_key, enabled, setup_status, secret_ref, composer_visible, settings_visible)
SELECT t.account_id, p.id, CASE WHEN t.account_identifier = '' THEN 'default' ELSE t.account_identifier END,
       1, 'connected', 'oauth:' || t.provider || ':' || t.account_identifier, p.composer_visible, p.settings_visible
FROM user_oauth_tokens t
JOIN agentsam_plugins p ON p.provider_key = t.provider AND p.plugin_kind = 'oauth' AND p.plugin_key IN ('google-gmail','google-drive','google-calendar','github')
WHERE t.is_active = 1 AND t.revoked_at IS NULL AND t.account_id IN (SELECT id FROM accounts);
