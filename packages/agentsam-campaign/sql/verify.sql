-- Generic, installation-neutral SQLite/D1 schema checks.
-- Output should contain no rows for foreign_key_check or orphan queries.
PRAGMA foreign_key_check;
SELECT version, installed_at FROM campaign_schema_versions ORDER BY version;
SELECT 'scopes' AS entity, COUNT(*) AS records FROM campaign_scopes
UNION ALL SELECT 'campaigns', COUNT(*) FROM campaigns
UNION ALL SELECT 'channels', COUNT(*) FROM campaign_channels
UNION ALL SELECT 'materials', COUNT(*) FROM campaign_materials
UNION ALL SELECT 'asset_references', COUNT(*) FROM campaign_asset_refs
UNION ALL SELECT 'approvals', COUNT(*) FROM campaign_approvals
UNION ALL SELECT 'publications', COUNT(*) FROM campaign_publications
UNION ALL SELECT 'metric_facts', COUNT(*) FROM campaign_metric_facts
UNION ALL SELECT 'source_links', COUNT(*) FROM campaign_source_links
UNION ALL SELECT 'activity', COUNT(*) FROM campaign_activity;
SELECT scope_id, kind, status, COUNT(*) AS record_count
FROM campaigns GROUP BY scope_id, kind, status;
SELECT ref.id, ref.campaign_id FROM campaign_asset_refs ref
LEFT JOIN campaigns c ON c.id = ref.campaign_id AND c.scope_id = ref.scope_id
WHERE c.id IS NULL;
