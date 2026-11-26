-- Remove the obsolete per-tool workspace allowlist from the canonical tool registry.
-- Tool ownership remains represented by account_id; project/resource authorization
-- remains in execution context and actor policy.
DROP VIEW IF EXISTS v_mcp_tools;

CREATE VIEW v_mcp_tools AS
SELECT
  t.tool_key AS tool_name,
  COALESCE(NULLIF(trim(t.display_name), ''), t.tool_key) AS display_name,
  COALESCE(NULLIF(trim(t.tool_category), ''), 'agent') AS tool_category,
  COALESCE(t.mcp_service_url, 'https://mcp.inneranimalmedia.com/mcp') AS mcp_service_url,
  COALESCE(t.description, '') AS description,
  COALESCE(t.input_schema, '{}') AS input_schema,
  COALESCE(t.handler_type, 'mcp') AS handler_type,
  COALESCE(t.handler_config, '{}') AS handler_config,
  COALESCE(t.modes_json, '["auto","agent","debug"]') AS modes_json,
  COALESCE(t.risk_level, 'low') AS risk_level,
  COALESCE(t.requires_approval, 0) AS requires_approval,
  1 AS is_available,
  COALESCE(t.is_active, 1) AS is_active,
  CASE WHEN t.account_id IS NULL THEN 'platform' ELSE 'account' END AS scope_type,
  t.id AS agentsam_tools_id,
  unixepoch() AS synced_at
FROM agentsam_tools t
WHERE COALESCE(t.is_active, 1) = 1
  AND COALESCE(t.is_degraded, 0) = 0
  AND trim(COALESCE(t.tool_key, '')) != '';

ALTER TABLE agentsam_tools DROP COLUMN workspace_scope;
