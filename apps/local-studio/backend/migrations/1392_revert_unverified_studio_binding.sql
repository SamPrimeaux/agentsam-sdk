-- Reverse only the unverified binding introduced by migration 1391.
-- Creative resource identity and payload references remain in studio_templates.
UPDATE r2_buckets
   SET binding_name = NULL, updated_at = unixepoch()
 WHERE id = 'r2_inneranimalmedia_assets'
   AND bucket_name = 'inneranimalmedia-assets'
   AND ownership_type = 'platform'
   AND owner_id = 'platform'
   AND binding_name = 'STUDIO_TEMPLATE_ASSETS';
