-- Local SQLite test/runtime mirror for the canonical shared-D1 spawn and approval records.
-- Hosted ACP writes these same logical contracts directly to the shared D1 database.
ALTER TABLE agentsam_agent_run ADD COLUMN routing_arm_id TEXT;

ALTER TABLE agentsam_approval_queue ADD COLUMN tool_call_id TEXT;
ALTER TABLE agentsam_approval_queue ADD COLUMN terminal_job_id TEXT;
ALTER TABLE agentsam_approval_queue ADD COLUMN workflow_run_id TEXT;
ALTER TABLE agentsam_approval_queue ADD COLUMN command_run_id TEXT;
ALTER TABLE agentsam_approval_queue ADD COLUMN execution_step_id TEXT;
ALTER TABLE agentsam_approval_queue ADD COLUMN tool_id TEXT;
ALTER TABLE agentsam_approval_queue ADD COLUMN tool_key TEXT;
ALTER TABLE agentsam_approval_queue ADD COLUMN handler_key TEXT;
ALTER TABLE agentsam_approval_queue ADD COLUMN route_key TEXT;
ALTER TABLE agentsam_approval_queue ADD COLUMN workflow_key TEXT;
ALTER TABLE agentsam_approval_queue ADD COLUMN notified_at INTEGER;
ALTER TABLE agentsam_approval_queue ADD COLUMN halted_at INTEGER;

CREATE TABLE IF NOT EXISTS agentsam_spawn_job (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  master_run_id TEXT NOT NULL REFERENCES agentsam_agent_run(id) ON DELETE CASCADE,
  initiated_by_type TEXT NOT NULL DEFAULT 'user'
    CHECK(initiated_by_type IN ('user','api_credential')),
  initiated_by_id TEXT NOT NULL,
  task_description TEXT NOT NULL,
  chunking_strategy TEXT NOT NULL DEFAULT 'manual'
    CHECK(chunking_strategy IN ('manual','by_file','by_function','by_token','by_row','by_section')),
  chunk_count INTEGER NOT NULL DEFAULT 0,
  merge_strategy TEXT NOT NULL DEFAULT 'concat'
    CHECK(merge_strategy IN ('concat','json_merge','vote','first_success','custom')),
  merge_instructions TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','awaiting_approval','running','merging','completed','failed','partial')),
  error_message TEXT,
  total_input_tokens INTEGER NOT NULL DEFAULT 0,
  total_output_tokens INTEGER NOT NULL DEFAULT 0,
  total_cost_usd REAL NOT NULL DEFAULT 0,
  total_latency_ms INTEGER NOT NULL DEFAULT 0,
  subagents_spawned INTEGER NOT NULL DEFAULT 0,
  subagents_succeeded INTEGER NOT NULL DEFAULT 0,
  subagents_failed INTEGER NOT NULL DEFAULT 0,
  cost_cap_usd REAL,
  merged_output TEXT,
  merge_quality_score REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_agentsam_spawn_job_master_status
  ON agentsam_spawn_job(master_run_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_agentsam_approval_run_pending
  ON agentsam_approval_queue(account_id, agent_run_id, status, created_at);
