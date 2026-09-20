-- AgentSam portable CLI/runtime state.
-- Compatible with Node SQLite and Cloudflare D1.
-- Identity is account_id when available; standalone installs may leave account_id NULL.
-- Derived from live IAM runtime tables on 2026-09-17, with tenant/workspace fields intentionally removed.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS agentsam_agent_run (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT,
  conversation_id TEXT,
  external_agent_id TEXT,
  external_run_id TEXT,
  parent_run_id TEXT REFERENCES agentsam_agent_run(id) ON DELETE SET NULL,
  source_client TEXT,
  surface TEXT,
  mode TEXT NOT NULL DEFAULT 'agent'
    CHECK (mode IN ('ask','plan','agent','debug','multitask')),
  model_key TEXT,
  reasoning_effort TEXT,
  requested_service_tier TEXT,
  actual_service_tier TEXT,
  selected_by TEXT CHECK (selected_by IS NULL OR selected_by IN ('manual','automatic','fallback')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','paused','completed','failed','partial','cancelled')),
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
  latency_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_agentsam_agent_run_account_updated
  ON agentsam_agent_run(account_id, updated_at_unix DESC);
CREATE INDEX IF NOT EXISTS idx_agentsam_agent_run_parent
  ON agentsam_agent_run(parent_run_id, created_at_unix);

CREATE TABLE IF NOT EXISTS agentsam_compaction_events (
  id TEXT PRIMARY KEY DEFAULT ('cmp_' || lower(hex(randomblob(8)))),
  account_id TEXT,
  agent_run_id TEXT REFERENCES agentsam_agent_run(id) ON DELETE SET NULL,
  conversation_id TEXT,
  compaction_type TEXT NOT NULL DEFAULT 'context_summary'
    CHECK (compaction_type IN (
      'context_summary','data_summary','run_summary','usage_summary',
      'memory_summary','rule_summary','audit_summary','performance_summary','routing_summary'
    )),
  compaction_scope TEXT NOT NULL DEFAULT 'agent_run'
    CHECK (compaction_scope IN ('rowset','table','agent_run','workflow','system')),
  compaction_strategy TEXT NOT NULL DEFAULT 'summarize'
    CHECK (compaction_strategy IN ('summarize','truncate','selective','full','rollup','audit')),
  source_kind TEXT NOT NULL DEFAULT 'api'
    CHECK (source_kind IN (
      'd1','sqlite','r2','supabase','vectorize','hyperdrive','github',
      'filesystem','worker_logs','api','browser','screenshot','mixed'
    )),
  source_table TEXT NOT NULL DEFAULT '',
  source_row_count INTEGER NOT NULL DEFAULT 0,
  source_min_epoch INTEGER,
  source_max_epoch INTEGER,
  source_filter_json TEXT NOT NULL DEFAULT '{}',
  source_snapshot_json TEXT NOT NULL DEFAULT '{}',
  source_query_hash TEXT NOT NULL DEFAULT '',
  content_hash TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT '',
  model_key TEXT NOT NULL DEFAULT '',
  tokens_before INTEGER NOT NULL DEFAULT 0,
  tokens_after INTEGER NOT NULL DEFAULT 0,
  tokens_saved INTEGER GENERATED ALWAYS AS (tokens_before - tokens_after) STORED,
  cost_before_usd REAL NOT NULL DEFAULT 0,
  cost_after_usd REAL NOT NULL DEFAULT 0,
  cost_saved_usd REAL GENERATED ALWAYS AS (cost_before_usd - cost_after_usd) STORED,
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK(status IN ('queued','running','completed','failed','cancelled','needs_review')),
  summary_text TEXT NOT NULL DEFAULT '',
  summary_json TEXT NOT NULL DEFAULT '{}',
  metrics_json TEXT NOT NULL DEFAULT '{}',
  findings_json TEXT NOT NULL DEFAULT '{}',
  recommended_actions_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  source_stored TEXT NOT NULL DEFAULT 'local:agentsam_compaction_events',
  source_url TEXT NOT NULL DEFAULT '',
  report_artifact_url TEXT NOT NULL DEFAULT '',
  expires_at_epoch INTEGER,
  compacted_at_epoch INTEGER NOT NULL DEFAULT (unixepoch()),
  created_at_epoch INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at_epoch INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_agentsam_compaction_run
  ON agentsam_compaction_events(agent_run_id, compacted_at_epoch DESC);
CREATE INDEX IF NOT EXISTS idx_agentsam_compaction_expiry
  ON agentsam_compaction_events(expires_at_epoch)
  WHERE expires_at_epoch IS NOT NULL;

CREATE TABLE IF NOT EXISTS agentsam_context_digest (
  id TEXT PRIMARY KEY,
  account_id TEXT,
  digest_type TEXT NOT NULL CHECK (
    digest_type IN (
      'schema','repo','docs','memory','tool_registry','route_map',
      'session','deployment','rag','conversation','handoff','project'
    )
  ),
  project_id TEXT,
  agent_run_id TEXT REFERENCES agentsam_agent_run(id) ON DELETE SET NULL,
  session_id TEXT,
  source_hash TEXT NOT NULL,
  digest_hash TEXT NOT NULL UNIQUE,
  raw_size_bytes INTEGER,
  reduced_size_bytes INTEGER,
  token_count INTEGER,
  digest_text TEXT NOT NULL,
  generation_model TEXT,
  namespace TEXT,
  hit_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at_unix INTEGER NOT NULL DEFAULT (unixepoch()),
  source_updated_at_unix INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at_unix INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at_unix INTEGER,
  embedding_model TEXT,
  embedding_dimensions INTEGER,
  compaction_event_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_agentsam_context_digest_session
  ON agentsam_context_digest(session_id, source_updated_at_unix DESC)
  WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agentsam_context_digest_run
  ON agentsam_context_digest(agent_run_id, source_updated_at_unix DESC)
  WHERE agent_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agentsam_context_digest_compaction
  ON agentsam_context_digest(compaction_event_id)
  WHERE compaction_event_id IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS context_digest_set_initial_expiry
AFTER INSERT ON agentsam_context_digest
WHEN NEW.expires_at_unix IS NULL
BEGIN
  UPDATE agentsam_context_digest
  SET expires_at_unix = CASE
    WHEN NEW.digest_type IN ('session','conversation','handoff')
      THEN unixepoch() + 2592000
    ELSE NULL
  END
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS context_digest_extend_on_hit
AFTER UPDATE OF hit_count ON agentsam_context_digest
WHEN NEW.hit_count > OLD.hit_count AND OLD.expires_at_unix IS NOT NULL
BEGIN
  UPDATE agentsam_context_digest
  SET expires_at_unix = unixepoch() + 2592000,
      updated_at_unix = unixepoch(),
      updated_at = datetime('now')
  WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS agentsam_plans (
  id TEXT PRIMARY KEY,
  account_id TEXT,
  session_id TEXT,
  agent_run_id TEXT REFERENCES agentsam_agent_run(id) ON DELETE SET NULL,
  plan_type TEXT NOT NULL DEFAULT 'feature'
    CHECK(plan_type IN ('daily','sprint','incident','feature','refactor','run')),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('draft','active','complete','abandoned')),
  summary_text TEXT NOT NULL DEFAULT '',
  token_budget INTEGER,
  tokens_used INTEGER NOT NULL DEFAULT 0 CHECK(tokens_used >= 0),
  cost_usd REAL NOT NULL DEFAULT 0 CHECK(cost_usd >= 0),
  tasks_total INTEGER NOT NULL DEFAULT 0 CHECK(tasks_total >= 0),
  tasks_done INTEGER NOT NULL DEFAULT 0 CHECK(tasks_done >= 0),
  tasks_blocked INTEGER NOT NULL DEFAULT 0 CHECK(tasks_blocked >= 0),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at_unix INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at_unix INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS agentsam_todo (
  id TEXT PRIMARY KEY,
  account_id TEXT,
  plan_id TEXT REFERENCES agentsam_plans(id) ON DELETE CASCADE,
  agent_run_id TEXT REFERENCES agentsam_agent_run(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK(status IN ('open','running','blocked','complete','cancelled')),
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK(priority IN ('low','medium','high','critical')),
  sort_order INTEGER NOT NULL DEFAULT 50,
  token_budget INTEGER,
  tokens_used INTEGER NOT NULL DEFAULT 0 CHECK(tokens_used >= 0),
  cost_usd REAL NOT NULL DEFAULT 0 CHECK(cost_usd >= 0),
  requires_approval INTEGER NOT NULL DEFAULT 0 CHECK(requires_approval IN (0,1)),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  started_at_unix INTEGER,
  completed_at_unix INTEGER,
  created_at_unix INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at_unix INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_agentsam_todo_plan
  ON agentsam_todo(plan_id, sort_order, created_at_unix);

CREATE TABLE IF NOT EXISTS agentsam_approval_queue (
  id TEXT PRIMARY KEY DEFAULT ('appr_' || lower(hex(randomblob(8)))),
  account_id TEXT,
  session_id TEXT,
  conversation_id TEXT,
  agent_run_id TEXT REFERENCES agentsam_agent_run(id) ON DELETE SET NULL,
  plan_id TEXT REFERENCES agentsam_plans(id) ON DELETE SET NULL,
  todo_id TEXT REFERENCES agentsam_todo(id) ON DELETE SET NULL,
  capability_key TEXT,
  tool_name TEXT,
  action_summary TEXT NOT NULL,
  sanitized_input_json TEXT NOT NULL DEFAULT '{}',
  response_json TEXT NOT NULL DEFAULT '{}',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  risk_level TEXT NOT NULL DEFAULT 'medium'
    CHECK (risk_level IN ('low','medium','high','critical')),
  approval_type TEXT NOT NULL DEFAULT 'tool'
    CHECK (approval_type IN (
      'tool','workflow','command','script','deploy','db_write','r2_write',
      'github_write','terminal','spawn','escalation','route_upgrade'
    )),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','denied','expired')),
  approved_by TEXT,
  decided_at INTEGER,
  expires_at INTEGER DEFAULT (unixepoch() + 300),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_agentsam_approval_pending
  ON agentsam_approval_queue(status, expires_at)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS active_timers (
  id TEXT PRIMARY KEY,
  account_id TEXT,
  label TEXT NOT NULL DEFAULT '',
  timer_kind TEXT NOT NULL CHECK (timer_kind IN ('stopwatch','countdown')),
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','paused','completed','cancelled','expired')),
  started_at_unix INTEGER NOT NULL,
  ends_at_unix INTEGER,
  paused_at_unix INTEGER,
  elapsed_seconds INTEGER NOT NULL DEFAULT 0,
  completed_at_unix INTEGER,
  agent_run_id TEXT REFERENCES agentsam_agent_run(id) ON DELETE CASCADE,
  approval_queue_id TEXT REFERENCES agentsam_approval_queue(id) ON DELETE CASCADE,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  updated_at_unix INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (
    timer_kind != 'countdown'
    OR (ends_at_unix IS NOT NULL AND ends_at_unix > started_at_unix)
  ),
  CHECK (agent_run_id IS NOT NULL OR approval_queue_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_active_timers_running
  ON active_timers(status, ends_at_unix)
  WHERE status = 'running';

CREATE TABLE IF NOT EXISTS agentsam_cron_runs (
  id TEXT PRIMARY KEY DEFAULT ('acr_' || lower(hex(randomblob(8)))),
  account_id TEXT,
  job_name TEXT NOT NULL,
  cron_expression TEXT,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK(status IN ('running','completed','failed','skipped')),
  started_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER,
  duration_ms INTEGER,
  rows_read INTEGER NOT NULL DEFAULT 0,
  rows_written INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_agentsam_cron_runs_job_started
  ON agentsam_cron_runs(job_name, started_at DESC);

CREATE TABLE IF NOT EXISTS agentsam_workspace_state (
  id                TEXT PRIMARY KEY DEFAULT ('wss_' || lower(hex(randomblob(8)))),
  repository_id     TEXT UNIQUE,
  workspace_id      TEXT,
  conversation_id   TEXT,
  workspace_type    TEXT NOT NULL DEFAULT 'ide',
  active_file       TEXT,
  files_open        TEXT NOT NULL DEFAULT '[]',
  state_json        TEXT NOT NULL DEFAULT '{}',
  locked_by         TEXT,
  lock_expires_at   INTEGER,
  lock_reason       TEXT,
  agent_session_id  TEXT,
  current_task_id   TEXT,
  last_agent_action TEXT,
  agent_id          TEXT,
  checkpoint_label  TEXT,
  checkpoint_sha    TEXT,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at        INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_agentsam_workspace_state_repo
  ON agentsam_workspace_state(repository_id);
