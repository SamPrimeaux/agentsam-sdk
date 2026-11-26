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
