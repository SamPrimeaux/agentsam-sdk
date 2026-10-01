-- 0002_goap_blackboard_v1.sql
-- Runtime blackboard contract evolution for D1/SQLite-compatible stores.
-- agentsam_workspace_state is created by 0001_cli_runtime.sql.
--
-- The revision is the portable optimistic-concurrency/CAS fence.
-- state_schema freezes the logical payload contract independently from storage.

ALTER TABLE agentsam_workspace_state
  ADD COLUMN state_schema TEXT NOT NULL DEFAULT 'agentsam.blackboard.v1';

ALTER TABLE agentsam_workspace_state
  ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0);

CREATE INDEX IF NOT EXISTS idx_agentsam_workspace_state_repo_revision
  ON agentsam_workspace_state(repository_id, revision);
