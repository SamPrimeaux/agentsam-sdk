-- Keep the archive limited to records that actually carry legacy metadata.
DELETE FROM agentsam_tool_legacy_metadata
WHERE NULLIF(trim(COALESCE(tool_code,'')),'') IS NULL
  AND NULLIF(trim(COALESCE(linked_mcp_tool_id,'')),'') IS NULL
  AND NULLIF(trim(COALESCE(internal_seo,'')),'') IS NULL;
INSERT INTO d1_migrations (name) VALUES ('20261126_agentsam_tool_legacy_metadata_compact.sql');
