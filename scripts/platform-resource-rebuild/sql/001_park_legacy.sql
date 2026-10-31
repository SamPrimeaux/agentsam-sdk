-- Park live tables so the rebuilt schema can own the canonical names.
-- No `_v2` tables are created anywhere in this rebuild.
-- Prerequisite: 01_backup.py completed. Rollback = restore from that backup.

ALTER TABLE r2_buckets RENAME TO r2_buckets_legacy;
ALTER TABLE r2_objects RENAME TO r2_objects_legacy;
ALTER TABLE media_assets RENAME TO media_assets_legacy;
ALTER TABLE studio_templates RENAME TO studio_templates_legacy;
