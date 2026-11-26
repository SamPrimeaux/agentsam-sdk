-- Canonical AgentSam ACP persistence on inneranimalmedia-business D1.
-- The existing agentsam_agent_run table remains the run authority. These
-- tables add its append-only event journal, suspension/dependency projection,
-- and lease-aware durable queue. agentsam_request_queue remains the existing
-- stop-hook retry/background-drain queue; its consumer is separate and intact.

ALTER TABLE agentsam_agent_run
  ADD COLUMN event_seq INTEGER NOT NULL DEFAULT -1;

CREATE TABLE IF NOT EXISTS agentsam_agent_run_event (
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

CREATE INDEX IF NOT EXISTS idx_agentsam_agent_run_event_run_created
  ON agentsam_agent_run_event(run_id, created_at_unix, seq);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agentsam_agent_run_event_dedupe
  ON agentsam_agent_run_event(run_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS agentsam_agent_run_suspension (
  run_id TEXT PRIMARY KEY NOT NULL REFERENCES agentsam_agent_run(id) ON DELETE CASCADE,
  state TEXT NOT NULL
    CHECK (state IN (
      'waiting_external','waiting_child','awaiting_input','awaiting_approval','sleeping','retry_scheduled'
    )),
  reason TEXT NOT NULL
    CHECK (reason IN ('external','child_run','approval','input','retry','scheduled','rate_limit')),
  wake_at_unix INTEGER,
  wake_event TEXT,
  dependency_run_ids_json TEXT NOT NULL DEFAULT '[]',
  resume_step_id TEXT,
  checkpoint_ref TEXT,
  expires_at_unix INTEGER,
  attempt INTEGER NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at_unix INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at_unix INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_agentsam_agent_run_suspension_due
  ON agentsam_agent_run_suspension(state, wake_at_unix);
CREATE INDEX IF NOT EXISTS idx_agentsam_agent_run_suspension_event
  ON agentsam_agent_run_suspension(wake_event);

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

CREATE TABLE IF NOT EXISTS agentsam_queue_job (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  physical_queue TEXT NOT NULL,
  logical_queue TEXT,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK(status IN (
      'queued','claimed','running','waiting','batch_waiting','awaiting_input',
      'retry_scheduled','completed','failed','cancelled'
    )),
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_agentsam_queue_job_idempotency
  ON agentsam_queue_job(account_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_agentsam_queue_job_due
  ON agentsam_queue_job(physical_queue, status, available_at, lease_expires_at);
CREATE INDEX IF NOT EXISTS idx_agentsam_queue_job_run
  ON agentsam_queue_job(source_run_id, created_at_unix DESC);

-- Backfill the sequence cursor from any pre-existing journal rows.
UPDATE agentsam_agent_run
SET event_seq = MAX(
  event_seq,
  COALESCE((
    SELECT MAX(seq)
    FROM agentsam_agent_run_event
    WHERE run_id = agentsam_agent_run.id
  ), -1)
);
