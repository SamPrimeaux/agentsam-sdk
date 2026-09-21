-- Add explicit account/repository ownership to pre-existing GOAP tickets.
-- Existing rows remain nullable because their historical owner cannot be
-- inferred safely; new AgentSam-created goals always populate both fields.
ALTER TABLE agentsam_tickets ADD COLUMN account_id TEXT;
ALTER TABLE agentsam_tickets ADD COLUMN repository_id TEXT;

CREATE INDEX IF NOT EXISTS idx_agentsam_tickets_account_repository
  ON agentsam_tickets(account_id, repository_id, updated_at DESC);
