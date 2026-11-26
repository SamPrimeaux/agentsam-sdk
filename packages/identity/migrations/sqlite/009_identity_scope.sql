-- identity.scope — isolate portable customer identities by host-owned tenant/site.
-- Existing users remain in the global scope; new adapters can bind a site-specific scope_id.

ALTER TABLE identity_users ADD COLUMN scope_id TEXT NOT NULL DEFAULT 'global';
DROP INDEX IF EXISTS idx_identity_users_email;
CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_users_scope_email
  ON identity_users(scope_id, email COLLATE NOCASE);

ALTER TABLE identity_external_accounts ADD COLUMN scope_id TEXT NOT NULL DEFAULT 'global';
DROP INDEX IF EXISTS idx_identity_external_provider_subject;
CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_external_scope_provider_subject
  ON identity_external_accounts(scope_id, provider, provider_subject);

ALTER TABLE identity_sessions ADD COLUMN scope_id TEXT NOT NULL DEFAULT 'global';
CREATE INDEX IF NOT EXISTS idx_identity_sessions_scope_user_expires
  ON identity_sessions(scope_id, user_id, expires_at);

ALTER TABLE identity_auth_events ADD COLUMN scope_id TEXT NOT NULL DEFAULT 'global';
CREATE INDEX IF NOT EXISTS idx_identity_auth_events_scope_user_created
  ON identity_auth_events(scope_id, user_id, created_at DESC);

ALTER TABLE identity_oauth_transactions ADD COLUMN scope_id TEXT NOT NULL DEFAULT 'global';
CREATE INDEX IF NOT EXISTS idx_identity_oauth_transactions_scope_expires
  ON identity_oauth_transactions(scope_id, expires_at);

ALTER TABLE identity_native_handoffs ADD COLUMN scope_id TEXT NOT NULL DEFAULT 'global';
CREATE INDEX IF NOT EXISTS idx_identity_native_handoffs_scope_expires
  ON identity_native_handoffs(scope_id, expires_at);

UPDATE identity_schema_meta SET value = '3' WHERE key = 'schema_version';
