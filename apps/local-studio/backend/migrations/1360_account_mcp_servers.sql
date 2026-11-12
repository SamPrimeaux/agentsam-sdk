-- Preserve registered platform MCPs while enabling account-owned custom
-- server definitions in the same MCP registry (no parallel catalogs).
ALTER TABLE agentsam_mcp_servers ADD COLUMN account_id TEXT;
CREATE INDEX IF NOT EXISTS idx_agentsam_mcp_servers_account
  ON agentsam_mcp_servers(account_id, is_active);
