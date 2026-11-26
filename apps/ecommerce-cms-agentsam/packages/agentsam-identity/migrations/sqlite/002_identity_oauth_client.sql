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
