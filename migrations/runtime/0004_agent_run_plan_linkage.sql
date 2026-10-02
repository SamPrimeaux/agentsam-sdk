-- Attribute every runtime attempt to the durable plan/TODO that caused it.
ALTER TABLE agentsam_agent_run ADD COLUMN plan_id TEXT REFERENCES agentsam_plans(id) ON DELETE SET NULL;
ALTER TABLE agentsam_agent_run ADD COLUMN todo_id TEXT REFERENCES agentsam_todo(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agentsam_agent_run_plan
  ON agentsam_agent_run(plan_id, created_at_unix DESC);
CREATE INDEX IF NOT EXISTS idx_agentsam_agent_run_todo
  ON agentsam_agent_run(todo_id, created_at_unix DESC);
