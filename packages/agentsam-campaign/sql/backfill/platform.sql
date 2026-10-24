-- Platform/InnerAnimalMedia install:
-- Apply sql/0001_campaign_core.sql, but do not synthesize scope rows from
-- cms_sites without establishing an authorized account/site installation owner.
-- The platform's CMS owns public pages; specialized customer D1 databases own
-- their own campaigns. This file intentionally makes NO data changes.
SELECT version, installed_at FROM campaign_schema_versions ORDER BY version;
