-- Drop parked resource-rebuild tables after canonical consumers are confirmed.
-- Does NOT touch unrelated *_legacy tables (e.g. agentsam_skill_*_legacy).

DROP TABLE IF EXISTS studio_templates_legacy;
DROP TABLE IF EXISTS media_assets_legacy;
DROP TABLE IF EXISTS r2_objects_legacy;
DROP TABLE IF EXISTS r2_buckets_legacy;
