-- Backfill agentsam_skill v2 from agentsam_skill_legacy (run after 0011 DDL + rename).
-- Empty slash_trigger → derive from skill id (avoids /unnamed collisions).

INSERT INTO agentsam_skill (
  id, account_id, name, slash_trigger,
  description, content_markdown, file_path, content_checksum,
  globs, always_apply, task_types_json, route_keys_json,
  access_mode, icon, tags_json, metadata_json,
  invocation_count, last_invoked_at, version, is_active, sort_order,
  created_at, updated_at
)
SELECT
  l.id,
  CASE
    WHEN l.user_id GLOB 'au_*' THEN l.user_id
    WHEN l.user_id = 'sam_primeaux' THEN 'au_8a5b76b737a9f14c'
    WHEN l.user_id IN ('platform', 'system') THEN l.user_id
    WHEN l.person_uuid IS NOT NULL AND TRIM(l.person_uuid) != '' THEN 'person:' || l.person_uuid
    WHEN l.tenant_id IS NOT NULL AND TRIM(l.tenant_id) != '' THEN 'tenant:' || l.tenant_id
    ELSE 'account_orphan'
  END,
  COALESCE(NULLIF(TRIM(l.name), ''), l.id),
  CASE
    WHEN l.id = 'skill_agentsam_dual_vectorize_lanes' THEN '/vectorize-lanes-dual'
    WHEN l.slash_trigger IS NULL OR TRIM(l.slash_trigger) = ''
      THEN '/skill-' || lower(substr(replace(replace(l.id, 'skill_', ''), '_', '-'), 1, 40))
    WHEN lower(CASE
           WHEN l.slash_trigger GLOB '/*' THEN l.slash_trigger
           ELSE '/' || l.slash_trigger
         END) GLOB '/[a-z0-9][a-z0-9-]*'
      THEN lower(CASE
           WHEN l.slash_trigger GLOB '/*' THEN l.slash_trigger
           ELSE '/' || l.slash_trigger
         END)
    ELSE '/skill-' || lower(substr(replace(replace(l.id, 'skill_', ''), '_', '-'), 1, 40))
  END,
  COALESCE(l.description, ''),
  COALESCE(l.content_markdown, ''),
  COALESCE(l.file_path, ''),
  '',
  CASE
    WHEN l.globs IS NULL OR TRIM(l.globs) = '' THEN '[]'
    WHEN l.globs GLOB '[*' THEN l.globs
    ELSE json_array(l.globs)
  END,
  COALESCE(l.always_apply, 0),
  COALESCE(NULLIF(TRIM(l.task_types_json), ''), '[]'),
  COALESCE(NULLIF(TRIM(l.route_keys_json), ''), '[]'),
  CASE
    WHEN l.access_mode IN ('read_only', 'read_write') THEN l.access_mode
    ELSE 'read_write'
  END,
  COALESCE(l.icon, ''),
  COALESCE(NULLIF(TRIM(l.tags_json), ''), '[]'),
  json_object(
    'legacy', json_object(
      'tenant_id', l.tenant_id,
      'user_id', l.user_id,
      'person_uuid', l.person_uuid,
      'workspace_id', l.workspace_id,
      'scope', l.scope,
      'default_model_key', l.default_model_key,
      'model_constraints_json', l.model_constraints_json,
      'token_estimate', l.token_estimate,
      'retrieval_strategy', l.retrieval_strategy,
      'slash_trigger_raw', l.slash_trigger
    )
  ),
  COALESCE(l.invocation_count, 0),
  l.last_invoked_at,
  COALESCE(l.version, 1),
  COALESCE(l.is_active, 1),
  COALESCE(l.sort_order, 0),
  COALESCE(l.created_at, datetime('now')),
  COALESCE(l.updated_at, datetime('now'))
FROM agentsam_skill_legacy l;
