-- identity.oauth-server — OPTIONAL pack for products that issue their own
-- client IDs, authorization codes, access tokens, and refresh tokens.
-- Do not apply unless the installed product is an OAuth authorization server.

INSERT OR IGNORE INTO identity_schema_meta (key, value)
VALUES ('pack_oauth_server', '1');

CREATE TABLE IF NOT EXISTS identity_oauth_clients (
  id TEXT PRIMARY KEY NOT NULL,
  client_id TEXT NOT NULL UNIQUE,
  client_secret_hash TEXT,
  name TEXT NOT NULL,
  redirect_uris_json TEXT NOT NULL DEFAULT '[]',
  grant_types_json TEXT NOT NULL DEFAULT '["authorization_code"]',
  token_endpoint_auth_method TEXT NOT NULL DEFAULT 'none',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS identity_oauth_authorization_codes (
  code_hash TEXT PRIMARY KEY NOT NULL,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  scopes_json TEXT NOT NULL DEFAULT '[]',
  code_challenge TEXT,
  code_challenge_method TEXT,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES identity_users(id)
);

CREATE TABLE IF NOT EXISTS identity_oauth_access_tokens (
  token_hash TEXT PRIMARY KEY NOT NULL,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  scopes_json TEXT NOT NULL DEFAULT '[]',
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES identity_users(id)
);

CREATE TABLE IF NOT EXISTS identity_oauth_refresh_tokens (
  token_hash TEXT PRIMARY KEY NOT NULL,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  scopes_json TEXT NOT NULL DEFAULT '[]',
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES identity_users(id)
);

CREATE TABLE IF NOT EXISTS identity_oauth_grants (
  id TEXT PRIMARY KEY NOT NULL,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  scopes_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  revoked_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES identity_users(id)
);
