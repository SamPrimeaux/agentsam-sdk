-- Resumable local ProjectSession state shares the canonical project database.
-- Session JSON is bounded operational state, not a transcript or credential vault.
CREATE TABLE IF NOT EXISTS agentsam_project_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  project_root TEXT NOT NULL,
  cwd TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','paused','interrupted','completed')),
  title TEXT NOT NULL DEFAULT 'Agent Sam session',
  state_json TEXT NOT NULL,
  lifecycle TEXT NOT NULL DEFAULT 'session' CHECK (lifecycle = 'session'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agentsam_project_sessions_updated
  ON agentsam_project_sessions(updated_at DESC);
