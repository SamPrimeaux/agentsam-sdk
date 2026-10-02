-- Attribute remote AgentSam run attempts to the durable plan/TODO that caused them.
-- This mirrors migrations/runtime/0004_agent_run_plan_linkage.sql for local SQLite.
ALTER TABLE agentsam_agent_run
  ADD COLUMN plan_id TEXT REFERENCES agentsam_plans(id) ON DELETE SET NULL;

ALTER TABLE agentsam_agent_run
  ADD COLUMN todo_id TEXT REFERENCES agentsam_todo(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agentsam_agent_run_plan
  ON agentsam_agent_run(account_id, plan_id, created_at_unix DESC);

CREATE INDEX IF NOT EXISTS idx_agentsam_agent_run_todo
  ON agentsam_agent_run(account_id, todo_id, created_at_unix DESC);
