-- AutoRAG uses the existing knowledge lifecycle. This migration refines its
-- identity scope; it deliberately creates no parallel autorag run/chunk tables.
PRAGMA foreign_keys = OFF;

-- This pre-existing view is currently invalid because agentsam_agent_run was
-- already normalized to account authority. Drop/recreate it around the table
-- rebuild so D1 can revalidate schema atomically.
DROP VIEW IF EXISTS v_agentsam_ops_trail;

ALTER TABLE agentsam_knowledge_runs ADD COLUMN account_id TEXT;
ALTER TABLE agentsam_knowledge_runs ADD COLUMN repository_id TEXT;
ALTER TABLE agentsam_knowledge_runs ADD COLUMN project_key TEXT;
ALTER TABLE agentsam_knowledge_runs ADD COLUMN lane_id TEXT;

-- Legacy rows remain addressable through workspace_id, but new code must use
-- authenticated account + repository/project/lane ownership.
UPDATE agentsam_knowledge_runs
SET account_id = COALESCE(account_id, 'legacy:' || COALESCE(NULLIF(tenant_id, ''), NULLIF((SELECT tenant_id FROM agentsam_knowledge_generation WHERE workspace_id = agentsam_knowledge_runs.workspace_id), ''), 'unknown')),
    repository_id = COALESCE(repository_id, 'legacy:workspace:' || workspace_id),
    project_key = COALESCE(project_key, workspace_id),
    lane_id = COALESCE(lane_id, 'default');

CREATE INDEX IF NOT EXISTS idx_agentsam_knowledge_runs_portable_scope
  ON agentsam_knowledge_runs(account_id, repository_id, project_key, lane_id, updated_at);

-- The historical workspace primary key prevented one account from maintaining
-- independent repository/lane generations. Rebuild the same table safely and
-- retain a legacy_workspace_id read path for old callers.
ALTER TABLE agentsam_knowledge_generation RENAME TO agentsam_knowledge_generation_legacy;
CREATE TABLE agentsam_knowledge_generation (
  account_id TEXT NOT NULL,
  repository_id TEXT NOT NULL,
  project_key TEXT NOT NULL,
  lane_id TEXT NOT NULL,
  generation INTEGER NOT NULL DEFAULT 1,
  legacy_workspace_id TEXT UNIQUE,
  tenant_id TEXT,
  updated_at_unix INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (account_id, repository_id, project_key, lane_id)
);
INSERT INTO agentsam_knowledge_generation (
  account_id, repository_id, project_key, lane_id, generation,
  legacy_workspace_id, tenant_id, updated_at_unix
)
SELECT
  'legacy:' || COALESCE(NULLIF(tenant_id, ''), 'unknown'),
  'legacy:workspace:' || workspace_id,
  workspace_id,
  'default',
  generation,
  workspace_id,
  tenant_id,
  updated_at_unix
FROM agentsam_knowledge_generation_legacy;
DROP TABLE agentsam_knowledge_generation_legacy;
CREATE INDEX IF NOT EXISTS idx_agentsam_knowledge_generation_legacy_workspace
  ON agentsam_knowledge_generation(legacy_workspace_id);

-- intent_key was globally unique, which made a repository-specific override
-- impossible. Preserve all records while making the effective lookup order
-- repository -> account -> portable default possible.
ALTER TABLE agentsam_rag_intent_routes RENAME TO agentsam_rag_intent_routes_legacy;
CREATE TABLE agentsam_rag_intent_routes (
  id TEXT PRIMARY KEY,
  intent_key TEXT NOT NULL,
  lane_order_json TEXT NOT NULL,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  account_id TEXT,
  repository_id TEXT,
  database_id TEXT,
  resource_scope_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(account_id, repository_id, intent_key)
);
INSERT INTO agentsam_rag_intent_routes (
  id, intent_key, lane_order_json, description, is_active, updated_at,
  account_id, repository_id, database_id, resource_scope_json
)
SELECT id, intent_key, lane_order_json, description, is_active, updated_at,
  account_id, repository_id, database_id, resource_scope_json
FROM agentsam_rag_intent_routes_legacy;
DROP TABLE agentsam_rag_intent_routes_legacy;
CREATE INDEX IF NOT EXISTS idx_agentsam_rag_route_effective_lookup
  ON agentsam_rag_intent_routes(intent_key, account_id, repository_id, is_active);

-- The compatibility lane registry remains the single physical lane registry.
-- New writes must name backend/resource/binding/index explicitly in the host
-- adapter; legacy pgvector rows remain readable until their host is migrated.
CREATE INDEX IF NOT EXISTS idx_agentsam_lane_explicit_resource
  ON agentsam_pgvector_lane_registry(backend_kind, database_id, resource_id, binding_name, index_name, dimensions, is_active);

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

PRAGMA foreign_keys = ON;
