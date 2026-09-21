-- 0005 exposed a pre-existing stale workspace column in the operations view.
-- Operations telemetry is account-owned now; retain the legacy output column
-- as an empty compatibility field rather than inventing a workspace mapping.
DROP VIEW IF EXISTS v_agentsam_ops_trail;
CREATE VIEW v_agentsam_ops_trail AS
SELECT 'agent_run' AS source_table,id AS event_id,created_at_unix AS ts_unix,COALESCE(status,'unknown') AS event_kind,'' AS workspace_id,COALESCE(account_id,'') AS user_id,COALESCE(conversation_id,'') AS conversation_id,COALESCE(model_key,'') AS detail,CAST(NULL AS TEXT) AS error_message FROM agentsam_agent_run WHERE created_at_unix IS NOT NULL
UNION ALL
SELECT 'tool_call_log',id,created_at_unix,COALESCE(status,'unknown'),'',COALESCE(account_id,''),COALESCE(conversation_id,''),COALESCE(tool_key,''),error_code FROM agentsam_tool_call_log WHERE created_at_unix IS NOT NULL
UNION ALL
SELECT 'error_log',id,created_at,COALESCE(error_type,'error'),'',COALESCE(account_id,''),COALESCE(session_id,''),COALESCE(source,''),error_message FROM agentsam_error_log WHERE created_at IS NOT NULL
UNION ALL
SELECT 'mcp_tool_execution',CAST(id AS TEXT),created_at_unix,CASE WHEN success=1 THEN 'success' ELSE 'error' END,'',COALESCE(user_id,''),'',COALESCE(tool_key,tool_name,''),error_message FROM agentsam_mcp_tool_execution WHERE created_at_unix IS NOT NULL
UNION ALL
SELECT 'deployment_health',id,COALESCE(checked_at_unix,last_checked_at),COALESCE(status,'health'),'',COALESCE(account_id,''),'',COALESCE(worker_name,''),error_message FROM agentsam_deployment_health WHERE COALESCE(checked_at_unix,last_checked_at) IS NOT NULL;
