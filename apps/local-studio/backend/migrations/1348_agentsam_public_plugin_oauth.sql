-- agentsam-engine: d1
CREATE TABLE IF NOT EXISTS agentsam_plugin_oauth_states (
 state_hash TEXT PRIMARY KEY,
 account_id TEXT NOT NULL,
 plugin_id TEXT NOT NULL,
 client_id TEXT NOT NULL,
 verifier_ciphertext TEXT NOT NULL,
 scopes_json TEXT NOT NULL,
 resource_url TEXT NOT NULL,
 redirect_uri TEXT NOT NULL,
 source_client TEXT NOT NULL DEFAULT 'web',
 expires_at INTEGER NOT NULL,
 consumed_at INTEGER,
 created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_agentsam_plugin_oauth_states_account ON agentsam_plugin_oauth_states(account_id, plugin_id, expires_at);
CREATE TABLE IF NOT EXISTS agentsam_plugin_oauth_grants (
 account_id TEXT NOT NULL,
 plugin_id TEXT NOT NULL,
 client_id TEXT NOT NULL,
 resource_url TEXT NOT NULL,
 issuer_url TEXT NOT NULL,
 credentials_ciphertext TEXT NOT NULL,
 scopes_json TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 connected_at INTEGER NOT NULL DEFAULT (unixepoch()),
 updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
 PRIMARY KEY(account_id,plugin_id)
);
