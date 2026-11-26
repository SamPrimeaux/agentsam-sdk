-- The sole runtime read model. Legacy endpoint/key aliases remain temporarily
-- until remote MCP definitions have all moved to plugin_id/endpoint_url.
DROP VIEW IF EXISTS v_agentsam_tools_runtime;
CREATE VIEW v_agentsam_tools_runtime AS
SELECT
  t.id,
  t.tool_name,
  t.tool_key,
  t.display_name,
  t.tool_category,
  t.domain,
  t.description,
  t.handler_type,
  t.handler_key,
  t.handler_config,
  t.input_schema,
  t.output_schema,
  t.capability_key,
  t.plugin_id,
  t.account_id,
  CASE WHEN t.account_id IS NULL THEN 1 ELSE 0 END AS is_global,
  t.intent_tags,
  t.modes_json,
  t.is_active,
  t.notes,
  t.created_at,
  t.updated_at,
  COALESCE(pl.plugin_key, t.plugin_key) AS plugin_key,
  pl.endpoint_url,
  pl.transport,
  pl.auth_type,
  t.mcp_service_url,
  p.risk_level,
  p.requires_approval,
  p.requires_confirmation,
  p.dispatch_target,
  p.oauth_visible,
  p.caller_policy,
  p.result_policy_json,
  p.sort_priority,
  p.connector_visible,
  p.connector_priority,
  p.connector_access_class,
  p.max_calls_per_session,
  h.is_degraded,
  h.last_health_check,
  h.failure_rate,
  h.avg_latency_ms,
  cp.cache_policy_json,
  COALESCE((
    SELECT json_group_array(json_object(
      'capability_key', c.capability_key,
      'requirement_type', c.requirement_type,
      'is_primary', c.is_primary,
      'operations_json', c.operations_json
    ))
    FROM agentsam_tool_capabilities c
    WHERE c.tool_id = t.id
  ), '[]') AS capabilities_json
FROM agentsam_tools t
LEFT JOIN agentsam_plugins pl ON pl.id = t.plugin_id
LEFT JOIN agentsam_tool_policy p ON p.tool_id = t.id
LEFT JOIN agentsam_tool_health h ON h.tool_id = t.id
LEFT JOIN agentsam_tool_cache_policy cp ON cp.tool_id = t.id;
INSERT INTO d1_migrations (name) VALUES ('20261126_agentsam_tools_runtime_view_compat.sql');
