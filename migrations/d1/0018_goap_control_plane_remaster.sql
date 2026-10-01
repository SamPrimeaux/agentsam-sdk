-- 0018_goap_control_plane_remaster.sql
-- Additive remaster only: no new GOAP table family.
-- Existing nouns remain authoritative; these columns freeze portable v1 contracts.

ALTER TABLE agentsam_workspace_state
  ADD COLUMN state_schema TEXT NOT NULL DEFAULT 'agentsam.blackboard.v1';

ALTER TABLE agentsam_workspace_state
  ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0);

ALTER TABLE agentsam_tickets
  ADD COLUMN goal_schema TEXT;

ALTER TABLE agentsam_tickets
  ADD COLUMN goal_spec_json TEXT
    CHECK (goal_spec_json IS NULL OR json_valid(goal_spec_json));

ALTER TABLE agentsam_ticket_events
  ADD COLUMN account_id TEXT;

ALTER TABLE agentsam_ticket_events
  ADD COLUMN repository_id TEXT;

ALTER TABLE agentsam_ticket_events
  ADD COLUMN payload_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(payload_json));

ALTER TABLE agentsam_ticket_events
  ADD COLUMN workflow_run_id TEXT;

ALTER TABLE agentsam_ticket_events
  ADD COLUMN execution_step_id TEXT;

ALTER TABLE agentsam_ticket_events
  ADD COLUMN schema_version TEXT NOT NULL DEFAULT 'agentsam.event.v1';

-- Legacy event rows inherit portable ownership from their ticket when available.
UPDATE agentsam_ticket_events
SET account_id = (
  SELECT t.account_id
  FROM agentsam_tickets t
  WHERE t.id = agentsam_ticket_events.ticket_id
)
WHERE account_id IS NULL;

UPDATE agentsam_ticket_events
SET repository_id = (
  SELECT t.repository_id
  FROM agentsam_tickets t
  WHERE t.id = agentsam_ticket_events.ticket_id
)
WHERE repository_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_agentsam_workspace_state_repo_revision
  ON agentsam_workspace_state(repository_id, revision);

CREATE INDEX IF NOT EXISTS idx_agentsam_ticket_events_account_repo_cursor
  ON agentsam_ticket_events(account_id, repository_id, created_at, ticket_id);

CREATE INDEX IF NOT EXISTS idx_agentsam_ticket_events_workflow_run
  ON agentsam_ticket_events(workflow_run_id, created_at)
  WHERE workflow_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agentsam_ticket_events_execution_step
  ON agentsam_ticket_events(execution_step_id, created_at)
  WHERE execution_step_id IS NOT NULL;
