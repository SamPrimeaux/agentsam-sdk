-- agentsam-engine: d1
-- A narrow many-to-many relation to the EXISTING ticket authority.
-- Tickets remain in agentsam_tickets; no mirrored status or title snapshots.
CREATE TABLE IF NOT EXISTS user_goal_ticket_links (
  goal_id TEXT NOT NULL REFERENCES user_goals(id) ON DELETE CASCADE,
  ticket_id TEXT NOT NULL REFERENCES agentsam_tickets(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (goal_id, ticket_id)
);
CREATE INDEX IF NOT EXISTS user_goal_ticket_links_owner
  ON user_goal_ticket_links(account_id, goal_id);
CREATE INDEX IF NOT EXISTS user_goal_ticket_links_ticket
  ON user_goal_ticket_links(ticket_id);
