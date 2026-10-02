-- 0018_goap_control_plane_remaster.sql
-- Additive ticket/event contract remaster only: no new GOAP table family.
--
-- This migration intentionally targets tables owned by the portable D1/SQLite
-- control-plane baseline (0010) and equivalent legacy host tables.
-- Blackboard/workspace state is a runtime concern and is evolved separately by
-- migrations/runtime/0002_goap_blackboard_v1.sql.
--
-- NOTE: account_id/repository_id are intentionally NOT added to ticket_events here.
-- Portable 0010 already has them, while the legacy platform table does not.
-- The GOAP adapter supports eventOwnership=ticket_join for that host shape until a
-- dedicated platform-only ownership repair is intentionally applied.

ALTER TABLE agentsam_tickets
  ADD COLUMN goal_schema TEXT;

ALTER TABLE agentsam_tickets
  ADD COLUMN goal_spec_json TEXT
    CHECK (goal_spec_json IS NULL OR json_valid(goal_spec_json));

ALTER TABLE agentsam_ticket_events
  ADD COLUMN payload_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(payload_json));

ALTER TABLE agentsam_ticket_events
  ADD COLUMN workflow_run_id TEXT;

ALTER TABLE agentsam_ticket_events
  ADD COLUMN execution_step_id TEXT;

ALTER TABLE agentsam_ticket_events
  ADD COLUMN schema_version TEXT NOT NULL DEFAULT 'agentsam.event.v1';

CREATE INDEX IF NOT EXISTS idx_agentsam_ticket_events_workflow_run
  ON agentsam_ticket_events(workflow_run_id, created_at)
  WHERE workflow_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agentsam_ticket_events_execution_step
  ON agentsam_ticket_events(execution_step_id, created_at)
  WHERE execution_step_id IS NOT NULL;
