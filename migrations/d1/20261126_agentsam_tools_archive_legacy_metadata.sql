-- Preserve only the small set of legacy identifiers/metadata being removed from the hot tool registry.
-- No usage baseline is created; usage remains in agentsam_tool_call_log.
CREATE TABLE IF NOT EXISTS agentsam_tool_legacy_metadata (
  tool_id TEXT PRIMARY KEY,
  tool_code TEXT,
  linked_mcp_tool_id TEXT,
  internal_seo TEXT,
  archived_at INTEGER NOT NULL DEFAULT (unixepoch())
);
INSERT INTO agentsam_tool_legacy_metadata (tool_id, tool_code, linked_mcp_tool_id, internal_seo, archived_at)
SELECT id, tool_code, linked_mcp_tool_id, internal_seo, unixepoch()
FROM agentsam_tools
WHERE tool_code IS NOT NULL
   OR linked_mcp_tool_id IS NOT NULL
   OR internal_seo IS NOT NULL
ON CONFLICT(tool_id) DO UPDATE SET
  tool_code=excluded.tool_code,
  linked_mcp_tool_id=excluded.linked_mcp_tool_id,
  internal_seo=excluded.internal_seo;
INSERT INTO d1_migrations (name) VALUES ('20261126_agentsam_tools_archive_legacy_metadata.sql');
