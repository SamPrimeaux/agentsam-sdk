-- Normalize policy, health, and plugin resolution into their existing owner tables.
-- No usage-baseline table is created; usage remains derived from agentsam_tool_call_log.

ALTER TABLE agentsam_tool_policy
ADD COLUMN connector_visible INTEGER NOT NULL DEFAULT 0 CHECK (connector_visible IN (0, 1));
ALTER TABLE agentsam_tool_policy
ADD COLUMN connector_priority INTEGER;
ALTER TABLE agentsam_tool_policy
ADD COLUMN connector_access_class TEXT NOT NULL DEFAULT 'read' CHECK (connector_access_class IN ('read', 'write'));
ALTER TABLE agentsam_tool_policy
ADD COLUMN max_calls_per_session INTEGER;

UPDATE agentsam_tool_policy
SET
  connector_visible = COALESCE((SELECT connector_visible FROM agentsam_tools WHERE agentsam_tools.id = agentsam_tool_policy.tool_id), 0),
  connector_priority = (SELECT connector_priority FROM agentsam_tools WHERE agentsam_tools.id = agentsam_tool_policy.tool_id),
  connector_access_class = COALESCE((SELECT connector_access_class FROM agentsam_tools WHERE agentsam_tools.id = agentsam_tool_policy.tool_id), 'read'),
  max_calls_per_session = (SELECT max_calls_per_session FROM agentsam_tools WHERE agentsam_tools.id = agentsam_tool_policy.tool_id);

ALTER TABLE agentsam_tool_health
ADD COLUMN failure_rate REAL NOT NULL DEFAULT 0.0;
ALTER TABLE agentsam_tool_health
ADD COLUMN avg_latency_ms REAL;

UPDATE agentsam_tool_health
SET
  failure_rate = COALESCE((SELECT failure_rate FROM agentsam_tools WHERE agentsam_tools.id = agentsam_tool_health.tool_id), 0.0),
  avg_latency_ms = (SELECT avg_latency_ms FROM agentsam_tools WHERE agentsam_tools.id = agentsam_tool_health.tool_id);

UPDATE agentsam_tools
SET plugin_id = (
  SELECT p.id FROM agentsam_plugins p WHERE p.plugin_key = agentsam_tools.plugin_key
)
WHERE plugin_id IS NULL
  AND plugin_key IS NOT NULL
  AND EXISTS (SELECT 1 FROM agentsam_plugins p WHERE p.plugin_key = agentsam_tools.plugin_key);

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
  t.intent_tags,
  t.modes_json,
  t.is_active,
  t.notes,
  t.created_at,
  t.updated_at,
  pl.plugin_key,
  pl.endpoint_url,
  pl.transport,
  pl.auth_type,
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
  cp.cache_policy_json
FROM agentsam_tools t
LEFT JOIN agentsam_plugins pl ON pl.id = t.plugin_id
LEFT JOIN agentsam_tool_policy p ON p.tool_id = t.id
LEFT JOIN agentsam_tool_health h ON h.tool_id = t.id
LEFT JOIN agentsam_tool_cache_policy cp ON cp.tool_id = t.id;

INSERT INTO d1_migrations (name) VALUES ('20261126_agentsam_tools_normalize_policy_health.sql');
