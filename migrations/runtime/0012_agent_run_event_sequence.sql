-- Keep the per-run event sequence atomic across SQLite tests and Cloudflare D1.
-- D1 is the production authority; this migration keeps the local test adapter
-- compatible with the same append-only journal contract.

ALTER TABLE agentsam_agent_run
  ADD COLUMN event_seq INTEGER NOT NULL DEFAULT -1;

UPDATE agentsam_agent_run
SET event_seq = MAX(
  event_seq,
  COALESCE((
    SELECT MAX(seq)
    FROM agentsam_agent_run_event
    WHERE run_id = agentsam_agent_run.id
  ), -1)
);

-- Suspension detail belongs in agentsam_agent_run_suspension. Keep the coarse
-- persisted lifecycle state compatible with the canonical D1 CHECK constraint.
UPDATE agentsam_agent_run
SET status = 'running'
WHERE status = 'paused';

-- New writes use the canonical routing selector vocabulary.
UPDATE agentsam_agent_run
SET selected_by = 'fallback'
WHERE selected_by = 'automatic';
