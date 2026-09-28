-- Native desktop OAuth handoff.
-- Provider callbacks stay on the Worker; only a short-lived, one-time code is
-- placed in the agentsamstudio:// callback. Desktop refresh secrets are stored
-- only as SHA-256 hashes.

CREATE TABLE IF NOT EXISTS identity_desktop_oauth_intents (
  oauth_state TEXT PRIMARY KEY NOT NULL,
  desktop_state TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_identity_desktop_oauth_intents_expires
  ON identity_desktop_oauth_intents(expires_at);

CREATE TABLE IF NOT EXISTS identity_desktop_handoffs (
  code_hash TEXT PRIMARY KEY NOT NULL,
  state_hash TEXT NOT NULL,
  session_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_identity_desktop_handoffs_expires
  ON identity_desktop_handoffs(expires_at);

CREATE TABLE IF NOT EXISTS identity_desktop_refresh_tokens (
  token_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  client_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  replaced_by_hash TEXT,
  last_used_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_identity_desktop_refresh_user
  ON identity_desktop_refresh_tokens(user_id, expires_at);
