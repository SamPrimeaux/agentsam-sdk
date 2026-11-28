PRAGMA foreign_keys = ON;

CREATE TABLE accounts (id TEXT PRIMARY KEY NOT NULL);
CREATE TABLE agentsam_model_catalog (model_key TEXT PRIMARY KEY NOT NULL);
CREATE TABLE agentsam_plans (id TEXT PRIMARY KEY NOT NULL);
CREATE TABLE agentsam_todo (id TEXT PRIMARY KEY NOT NULL);
CREATE TABLE agentsam_workflow_runs (id TEXT PRIMARY KEY NOT NULL);
CREATE TABLE agentsam_command_run (id TEXT PRIMARY KEY NOT NULL);
CREATE TABLE agentsam_execution_steps (id TEXT PRIMARY KEY NOT NULL);

CREATE TABLE agentsam_agent_run (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  conversation_id TEXT,
  external_agent_id TEXT,
  external_run_id TEXT,
  parent_run_id TEXT,
  source_client TEXT,
  surface TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('ask','plan','agent','debug','multitask')),
  model_key TEXT REFERENCES agentsam_model_catalog(model_key),
  reasoning_effort TEXT,
  requested_service_tier TEXT,
  actual_service_tier TEXT,
  selected_by TEXT CHECK (selected_by IS NULL OR selected_by IN ('manual','thompson','fallback')),
  routing_arm_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','completed','failed','partial','cancelled')),
  cancel_requested INTEGER NOT NULL DEFAULT 0 CHECK (cancel_requested IN (0,1)),
  error_code TEXT,
  error_message TEXT,
  model_call_count INTEGER NOT NULL DEFAULT 0 CHECK (model_call_count >= 0),
  tool_call_count INTEGER NOT NULL DEFAULT 0 CHECK (tool_call_count >= 0),
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  cached_input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (cached_input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  reasoning_tokens INTEGER NOT NULL DEFAULT 0 CHECK (reasoning_tokens >= 0),
  cost_usd REAL NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  created_at_unix INTEGER NOT NULL DEFAULT (unixepoch()),
  started_at_unix INTEGER,
  completed_at_unix INTEGER,
  updated_at_unix INTEGER NOT NULL DEFAULT (unixepoch()),
  latency_ms INTEGER,
  event_seq INTEGER NOT NULL DEFAULT -1,
  FOREIGN KEY(parent_run_id) REFERENCES agentsam_agent_run(id) ON DELETE SET NULL
);

CREATE TABLE agentsam_agent_run_event (
  event_id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL REFERENCES agentsam_agent_run(id) ON DELETE CASCADE,
  parent_run_id TEXT REFERENCES agentsam_agent_run(id) ON DELETE SET NULL,
  seq INTEGER NOT NULL CHECK (seq >= 0),
  event_type TEXT NOT NULL,
  phase TEXT,
  step_id TEXT,
  label TEXT NOT NULL DEFAULT '',
  detail TEXT,
  progress_current REAL,
  progress_total REAL,
  source_kind TEXT,
  source_name TEXT,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  dedupe_key TEXT,
  created_at_unix INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(run_id, seq)
);
CREATE INDEX idx_agentsam_agent_run_event_dedupe
  ON agentsam_agent_run_event(run_id, dedupe_key);

CREATE TABLE agentsam_spawn_job (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  master_run_id TEXT NOT NULL REFERENCES agentsam_agent_run(id),
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

CREATE TABLE agentsam_queue_job (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  physical_queue TEXT NOT NULL,
  logical_queue TEXT,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK(status IN ('queued','claimed','running','waiting','batch_waiting','awaiting_input','retry_scheduled','completed','failed','cancelled')),
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK(priority IN ('low','normal','high','urgent')),
  available_at INTEGER NOT NULL DEFAULT (unixepoch()),
  attempt INTEGER NOT NULL DEFAULT 0 CHECK(attempt >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK(max_attempts >= 1),
  idempotency_key TEXT NOT NULL,
  source_run_id TEXT REFERENCES agentsam_agent_run(id) ON DELETE CASCADE,
  step_id TEXT,
  lease_owner TEXT,
  lease_expires_at INTEGER,
  lease_generation INTEGER NOT NULL DEFAULT 0 CHECK(lease_generation >= 0),
  job_json TEXT NOT NULL CHECK(json_valid(job_json)),
  result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
  error_json TEXT CHECK(error_json IS NULL OR json_valid(error_json)),
  created_at_unix INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at_unix INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at_unix INTEGER
);
CREATE UNIQUE INDEX idx_agentsam_queue_job_idempotency
  ON agentsam_queue_job(account_id, idempotency_key);
CREATE INDEX idx_agentsam_queue_job_due
  ON agentsam_queue_job(physical_queue, status, available_at, lease_expires_at);
CREATE INDEX idx_agentsam_queue_job_run
  ON agentsam_queue_job(source_run_id, created_at_unix DESC);

CREATE TABLE agentsam_approval_queue (
  id TEXT PRIMARY KEY DEFAULT ('appr_' || lower(hex(randomblob(8)))),
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  session_id TEXT,
  conversation_id TEXT,
  agent_run_id TEXT REFERENCES agentsam_agent_run(id) ON DELETE SET NULL,
  tool_call_id TEXT,
  terminal_job_id TEXT,
  plan_id TEXT REFERENCES agentsam_plans(id) ON DELETE SET NULL,
  todo_id TEXT REFERENCES agentsam_todo(id) ON DELETE CASCADE,
  workflow_run_id TEXT REFERENCES agentsam_workflow_runs(id) ON DELETE SET NULL,
  command_run_id TEXT REFERENCES agentsam_command_run(id) ON DELETE SET NULL,
  execution_step_id TEXT REFERENCES agentsam_execution_steps(id) ON DELETE SET NULL,
  escalation_id TEXT,
  capability_key TEXT,
  workflow_key TEXT,
  tool_name TEXT,
  tool_id TEXT,
  tool_key TEXT,
  handler_key TEXT,
  route_key TEXT,
  action_summary TEXT NOT NULL,
  sanitized_input_json TEXT NOT NULL DEFAULT '{}',
  response_json TEXT NOT NULL DEFAULT '{}',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  risk_level TEXT NOT NULL DEFAULT 'medium'
    CHECK (risk_level IN ('low','medium','high','critical')),
  approval_type TEXT NOT NULL DEFAULT 'tool'
    CHECK (approval_type IN ('tool','workflow','command','script','deploy','db_write','r2_write','github_write','terminal','hook','spawn','escalation','route_upgrade')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','denied','expired')),
  approved_by TEXT,
  decided_at INTEGER,
  expires_at INTEGER DEFAULT (unixepoch() + 300),
  notified_at INTEGER,
  halted_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
