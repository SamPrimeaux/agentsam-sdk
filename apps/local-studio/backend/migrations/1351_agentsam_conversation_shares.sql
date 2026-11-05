-- agentsam-engine: d1

-- Public links are capability URLs. Only an authenticated owner can list or revoke them.
CREATE TABLE agentsam_conversation_shares (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  revoked_at INTEGER
);

CREATE INDEX idx_agentsam_conversation_shares_owner
  ON agentsam_conversation_shares(owner_id, conversation_id, revoked_at, created_at);
