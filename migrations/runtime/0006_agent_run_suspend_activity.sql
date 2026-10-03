-- Durable AgentSam run suspension and append-only activity journal.
-- Keep agentsam_agent_run.status coarse/backward-compatible; waiting detail lives here.

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
