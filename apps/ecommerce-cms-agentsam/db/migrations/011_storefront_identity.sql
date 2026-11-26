-- GENERATED FILE. Source of truth: @inneranimalmedia/agentsam-sdk/identity portable D1 migrations.

-- The host Ecommerce accounts table is merchant-owned; migration 008_identity_accounts.sql is intentionally excluded.

-- Customer identities are isolated by cms_sites.id through identity scope_id.

-- Source: packages/identity/migrations/sqlite/001_identity_core.sql
-- identity.core — portable local SQLite (no Cloudflare / IAM required)
-- Timestamps: INTEGER unixepoch seconds

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS identity_schema_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

INSERT OR REPLACE INTO identity_schema_meta (key, value)
VALUES ('schema_version', '1');

INSERT OR IGNORE INTO identity_schema_meta (key, value)
VALUES ('pack_core', '1');

CREATE TABLE IF NOT EXISTS identity_users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  display_name TEXT,
  password_hash TEXT,
  salt TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_users_email
  ON identity_users(email);

CREATE TABLE IF NOT EXISTS identity_external_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_subject TEXT NOT NULL,
  email TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES identity_users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_external_provider_subject
  ON identity_external_accounts(provider, provider_subject);

CREATE TABLE IF NOT EXISTS identity_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  email TEXT,
  provider TEXT,
  provider_subject TEXT,
  display_name TEXT,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL,
  last_active_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES identity_users(id)
);

CREATE INDEX IF NOT EXISTS idx_identity_sessions_user_expires
  ON identity_sessions(user_id, expires_at);

CREATE TABLE IF NOT EXISTS identity_auth_events (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok',
  provider TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  ip_hash TEXT,
  user_agent_hash TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_identity_auth_events_user_created
  ON identity_auth_events(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS identity_app_registry (
  id TEXT PRIMARY KEY NOT NULL,
  package_name TEXT,
  manifest_version TEXT,
  display_name TEXT,
  authenticated_route_id TEXT NOT NULL,
  login_route_id TEXT NOT NULL,
  recovery_route_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  installed_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS identity_route_registry (
  app_id TEXT NOT NULL,
  route_id TEXT NOT NULL,
  path_pattern TEXT NOT NULL,
  runtime TEXT,
  auth_policy TEXT,
  shell_ref TEXT,
  PRIMARY KEY (app_id, route_id),
  FOREIGN KEY (app_id) REFERENCES identity_app_registry(id)
);

-- Source: packages/identity/migrations/sqlite/002_identity_oauth_client.sql
-- identity.oauth-client — outbound OAuth (sign in with Google/CF/GitHub/IAM)
-- Secrets/tokens live in the local encrypted vault; this pack stores refs + metadata.

INSERT OR IGNORE INTO identity_schema_meta (key, value)
VALUES ('pack_oauth_client', '1');

CREATE TABLE IF NOT EXISTS identity_oauth_transactions (
  state TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  return_to TEXT,
  app_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  consumed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_identity_oauth_transactions_expires
  ON identity_oauth_transactions(expires_at);

CREATE INDEX IF NOT EXISTS idx_identity_oauth_transactions_app
  ON identity_oauth_transactions(app_id);

CREATE TABLE IF NOT EXISTS identity_provider_connections (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  granted_scopes_json TEXT NOT NULL DEFAULT '[]',
  credential_ref TEXT NOT NULL,
  expires_at INTEGER,
  refreshable INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES identity_users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_provider_connections_user_provider
  ON identity_provider_connections(user_id, provider);

-- Source: packages/identity/migrations/sqlite/005_identity_company_native.sql
-- identity.core extension — company / brand + native handoff parity
-- Portable identity_* names only. Does not create IAM `company` / `accounts`.
-- Does NOT include password-reset tables — recovery remains storage-agnostic
-- (createPasswordResetService + injected {get,put,delete} store).
-- Upgrades schema_version 1 → 2. Safe to re-run (IF NOT EXISTS / ignorable ALTERs).

INSERT OR REPLACE INTO identity_schema_meta (key, value)
VALUES ('schema_version', '2');

INSERT OR IGNORE INTO identity_schema_meta (key, value)
VALUES ('pack_company_native', '1');

CREATE TABLE IF NOT EXISTS identity_companies (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  legal_name TEXT,
  logo_url TEXT,
  favicon_url TEXT,
  primary_color TEXT,
  auth_bg_color TEXT,
  support_email TEXT,
  website_url TEXT,
  tagline TEXT,
  meta_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_companies_slug
  ON identity_companies(slug);

CREATE TABLE IF NOT EXISTS identity_native_handoffs (
  handoff_hash TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL,
  challenge TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  consumed_at INTEGER,
  FOREIGN KEY (session_id) REFERENCES identity_sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_identity_native_handoffs_expires
  ON identity_native_handoffs(expires_at);

-- Session type for browser vs desktop/native (default keeps existing rows as browser).
ALTER TABLE identity_sessions ADD COLUMN type TEXT NOT NULL DEFAULT 'browser';

-- Native OAuth transaction fields (optional on browser transactions).
ALTER TABLE identity_oauth_transactions ADD COLUMN client_type TEXT;
ALTER TABLE identity_oauth_transactions ADD COLUMN native_challenge TEXT;
ALTER TABLE identity_oauth_transactions ADD COLUMN native_redirect TEXT;

-- Source: packages/identity/migrations/sqlite/006_identity_account_security.sql
-- identity.account-security — self-service profile + backup (recovery) codes.
-- Portable identity_* names only. Additive; does not change schema_version, so
-- installs without this component keep working and the account API reports
-- `account_security_migration_required` instead of failing silently.
-- Safe to re-run.

INSERT OR IGNORE INTO identity_schema_meta (key, value)
VALUES ('pack_account_security', '1');

CREATE TABLE IF NOT EXISTS identity_user_profiles (
  user_id TEXT PRIMARY KEY NOT NULL,
  avatar_url TEXT,
  timezone TEXT,
  notification_email TEXT,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES identity_users(id)
);

-- Digests only (SHA-256 of the canonical code). Plaintext is shown once.
CREATE TABLE IF NOT EXISTS identity_backup_codes (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  used_at INTEGER,
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES identity_users(id)
);

CREATE INDEX IF NOT EXISTS idx_identity_backup_codes_user
  ON identity_backup_codes(user_id, used_at);

-- Source: packages/identity/migrations/sqlite/007_identity_session_revoke_reason.sql
-- Records why a session ended (logout, native_handoff_invalid, pkce_verification_failed, ...).
-- Re-run is safe: apply tooling treats "duplicate column" as ignorable.
ALTER TABLE identity_sessions ADD COLUMN revoke_reason TEXT;

-- Source: packages/identity/migrations/sqlite/009_identity_scope.sql
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

