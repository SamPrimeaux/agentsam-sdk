-- Portable durable Queue Control storage for local SQLite / D1-shaped hosts.
-- Provider queues remain adapters; this is the local durable scheduler and
-- reference persistence contract.

CREATE TABLE IF NOT EXISTS agentsam_queue_job (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
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
  source_run_id TEXT,
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
