-- Post-migration integrity: output should show zero bad foreign references,
-- and source_count should match linked_count when a source table exists.
PRAGMA foreign_key_check;
SELECT 'schema_v1' AS check_name, COUNT(*) AS n FROM campaign_schema_versions WHERE version=1
UNION ALL SELECT 'scopes', COUNT(*) FROM campaign_scopes
UNION ALL SELECT 'campaigns', COUNT(*) FROM campaigns
UNION ALL SELECT 'channels', COUNT(*) FROM campaign_channels
UNION ALL SELECT 'materials', COUNT(*) FROM campaign_materials
UNION ALL SELECT 'assets', COUNT(*) FROM campaign_asset_refs
UNION ALL SELECT 'source_links', COUNT(*) FROM campaign_source_links
UNION ALL SELECT 'publication_receipts', COUNT(*) FROM campaign_publications;
SELECT scope_id, kind, status, count(*) AS campaigns FROM campaigns
GROUP BY scope_id, kind, status ORDER BY scope_id, kind, status;
SELECT l.source_system, l.source_table, count(*) AS linked,
       count(DISTINCT l.campaign_id) AS distinct_campaigns
FROM campaign_source_links l GROUP BY l.source_system,l.source_table;
SELECT c.id, c.scope_id, c.status
FROM campaigns c LEFT JOIN campaign_source_links l ON l.campaign_id=c.id AND l.scope_id=c.scope_id
WHERE c.id LIKE 'growth:%' OR c.id LIKE 'fundraising:%' OR c.id LIKE 'email:%'
GROUP BY c.id HAVING COUNT(l.id)=0;
