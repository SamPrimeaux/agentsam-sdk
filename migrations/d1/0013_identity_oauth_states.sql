-- identity_oauth_states — PKCE state for /api/oauth/{provider}/start (identity login).
-- Deliberately NOT named oauth_states (collides with Stripe Connect schema on this D1).
-- Required for Sign in with Cloudflare on agentsam.inneranimalmedia.com.

CREATE TABLE IF NOT EXISTS identity_oauth_states (
  state TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  redirect_to TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_identity_oauth_states_expires
  ON identity_oauth_states(expires_at);
