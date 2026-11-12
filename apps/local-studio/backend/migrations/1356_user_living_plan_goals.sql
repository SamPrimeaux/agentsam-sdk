-- agentsam-engine: d1
-- Evolve the existing user_goals domain; do not create another generic goals table.
-- Account ownership is the security boundary (never workspace_id/tenant_id).
ALTER TABLE user_goals ADD COLUMN account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE user_goals ADD COLUMN source_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS user_goals_account_source
  ON user_goals(account_id,source_key)
  WHERE account_id IS NOT NULL AND source_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS user_goals_account_status
  ON user_goals(account_id,status,goal_type);

CREATE TABLE IF NOT EXISTS user_goal_steps (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  goal_id TEXT NOT NULL REFERENCES user_goals(id) ON DELETE CASCADE,
  source_key TEXT,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'todo'
    CHECK(status IN ('todo','in_progress','blocked','done','skipped')),
  note TEXT,
  evidence_ref TEXT,
  completed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(goal_id,source_key)
);
CREATE INDEX IF NOT EXISTS user_goal_steps_account_goal
  ON user_goal_steps(account_id,goal_id,sort_order);

-- Evidence and completion history survive chat/session changes.
CREATE TABLE IF NOT EXISTS user_goal_activity (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  goal_id TEXT NOT NULL REFERENCES user_goals(id) ON DELETE CASCADE,
  step_id TEXT REFERENCES user_goal_steps(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  evidence_ref TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS user_goal_activity_account
  ON user_goal_activity(account_id,goal_id,created_at);
