-- Session-scoped provider continuation, separate from generic state and knowledge.
-- Replaced by each compaction and deleted after a successful provider continuation.
CREATE TABLE IF NOT EXISTS agentsam_provider_continuations (
  session_id TEXT PRIMARY KEY REFERENCES agentsam_project_sessions(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  output_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
