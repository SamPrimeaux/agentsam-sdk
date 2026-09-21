-- Retrieval lanes are provider-neutral. A lane may live in pgvector,
-- Vectorize, Hyperdrive, D1, or another store; the project row names the
-- actual database/resource used at runtime.
ALTER TABLE agentsam_pgvector_lane_registry ADD COLUMN account_id TEXT;
ALTER TABLE agentsam_pgvector_lane_registry ADD COLUMN repository_id TEXT;
ALTER TABLE agentsam_pgvector_lane_registry ADD COLUMN database_id TEXT;
ALTER TABLE agentsam_pgvector_lane_registry ADD COLUMN backend_kind TEXT NOT NULL DEFAULT 'pgvector';
ALTER TABLE agentsam_pgvector_lane_registry ADD COLUMN provider_key TEXT;
ALTER TABLE agentsam_pgvector_lane_registry ADD COLUMN resource_id TEXT;
ALTER TABLE agentsam_pgvector_lane_registry ADD COLUMN binding_name TEXT;
ALTER TABLE agentsam_pgvector_lane_registry ADD COLUMN index_name TEXT;
ALTER TABLE agentsam_pgvector_lane_registry ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';

ALTER TABLE agentsam_rag_intent_routes ADD COLUMN account_id TEXT;
ALTER TABLE agentsam_rag_intent_routes ADD COLUMN repository_id TEXT;
ALTER TABLE agentsam_rag_intent_routes ADD COLUMN database_id TEXT;
ALTER TABLE agentsam_rag_intent_routes ADD COLUMN resource_scope_json TEXT NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_agentsam_lane_project
  ON agentsam_pgvector_lane_registry(account_id, repository_id, is_active);
CREATE INDEX IF NOT EXISTS idx_agentsam_lane_database
  ON agentsam_pgvector_lane_registry(database_id, backend_kind, is_active);
CREATE INDEX IF NOT EXISTS idx_agentsam_rag_route_project
  ON agentsam_rag_intent_routes(account_id, repository_id, is_active);
