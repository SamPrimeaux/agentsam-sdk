-- Retrieval + revision backfill after skill rows exist.

INSERT INTO agentsam_skill_retrieval (
  id, skill_id, provider, strategy, is_primary,
  index_name, connection_ref, config_json
)
SELECT
  'skillret_' || lower(hex(randomblob(8))),
  s.id,
  CASE
    WHEN lower(COALESCE(json_extract(s.metadata_json, '$.legacy.retrieval_strategy'), '')) IN ('r2', 'object_store')
      THEN 'cloudflare_r2'
    WHEN lower(COALESCE(json_extract(s.metadata_json, '$.legacy.retrieval_strategy'), '')) IN ('vectorize', 'vector')
      THEN 'cloudflare_vectorize'
    ELSE 'cloudflare_d1'
  END,
  CASE
    WHEN lower(COALESCE(json_extract(s.metadata_json, '$.legacy.retrieval_strategy'), '')) IN ('r2', 'object_store')
      THEN 'object_store'
    WHEN lower(COALESCE(json_extract(s.metadata_json, '$.legacy.retrieval_strategy'), '')) IN ('vectorize', 'vector')
      THEN 'vector_index'
    ELSE 'relational'
  END,
  1,
  NULLIF(TRIM(s.file_path), ''),
  CASE
    WHEN lower(COALESCE(json_extract(s.metadata_json, '$.legacy.retrieval_strategy'), '')) IN ('r2', 'object_store')
      THEN 'WEBSITE_ASSETS'
    ELSE 'DB'
  END,
  '{}'
FROM agentsam_skill s
WHERE NOT EXISTS (
  SELECT 1 FROM agentsam_skill_retrieval r WHERE r.skill_id = s.id
);

INSERT INTO agentsam_skill_revision (
  id, skill_id, content_markdown, version, changed_by, change_note, created_at
)
SELECT
  r.id,
  r.skill_id,
  r.content_markdown,
  r.version,
  COALESCE(NULLIF(TRIM(r.changed_by), ''), 'system'),
  r.change_note,
  COALESCE(r.created_at, datetime('now'))
FROM agentsam_skill_revision_legacy r
WHERE EXISTS (SELECT 1 FROM agentsam_skill s WHERE s.id = r.skill_id)
  AND NOT EXISTS (SELECT 1 FROM agentsam_skill_revision x WHERE x.id = r.id);
