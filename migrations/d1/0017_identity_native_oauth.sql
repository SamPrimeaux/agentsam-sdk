-- Native (desktop) OAuth handoff for the portable identity package.
-- Additive only: browser OAuth keeps working before and after this applies.
-- auth_sessions.type already exists in live D1 (DEFAULT 'browser').

ALTER TABLE identity_oauth_states ADD COLUMN client_type TEXT;
ALTER TABLE identity_oauth_states ADD COLUMN native_challenge TEXT;
ALTER TABLE identity_oauth_states ADD COLUMN native_redirect TEXT;

-- Single-use, PKCE-bound pickup of a desktop session. Only the sha256 of the
-- handoff code is stored; the session id never appears in a URL.
CREATE TABLE IF NOT EXISTS identity_native_handoffs (
  handoff_hash TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL,
  challenge    TEXT NOT NULL,
  expires_at   INTEGER NOT NULL,
  created_at   INTEGER NOT NULL,
  consumed_at  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_identity_native_handoffs_expires
  ON identity_native_handoffs(expires_at);
