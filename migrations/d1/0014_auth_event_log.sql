-- auth_event_log — append-only auth audit (identity package).
-- status remains outcome-only (ok|failed). Rich context lives in metadata_json.

CREATE TABLE IF NOT EXISTS auth_event_log (
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

CREATE INDEX IF NOT EXISTS idx_auth_event_log_user_created
  ON auth_event_log(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_event_log_type_created
  ON auth_event_log(event_type, created_at DESC);
