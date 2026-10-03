-- Durable parent/child run dependency projection for AgentSam multi-agent orchestration.
-- WorkGraph remains the planning authority; this table records the execution linkage
-- needed to wake parents from child completion without model polling.

CREATE TABLE IF NOT EXISTS agentsam_agent_run_dependency (
  parent_run_id TEXT NOT NULL REFERENCES agentsam_agent_run(id) ON DELETE CASCADE,
  child_run_id TEXT NOT NULL REFERENCES agentsam_agent_run(id) ON DELETE CASCADE,
  relation TEXT NOT NULL DEFAULT 'blocks'
    CHECK (relation IN ('blocks','requires','observes')),
  work_item_id TEXT,
  step_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','satisfied','failed','cancelled')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at_unix INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at_unix INTEGER,
  updated_at_unix INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (parent_run_id, child_run_id, relation)
);

CREATE INDEX IF NOT EXISTS idx_agentsam_run_dependency_parent_status
  ON agentsam_agent_run_dependency(parent_run_id, status, created_at_unix);
CREATE INDEX IF NOT EXISTS idx_agentsam_run_dependency_child
  ON agentsam_agent_run_dependency(child_run_id, status);
