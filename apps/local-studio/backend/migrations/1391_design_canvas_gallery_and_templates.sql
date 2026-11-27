-- Keep the Design app menu on its authenticated editor gallery and expose the
-- already-registered studio_templates payload bucket to the existing catalog
-- transport. The bucket and its payloads already exist; this only binds them.
UPDATE agentsam_plugins
   SET metadata_json = json_set(metadata_json, '$.app.nav.href', '/admin/design-canvas/')
 WHERE plugin_key = 'agentsam-design-canvas'
   AND plugin_kind = 'native'
   AND json_valid(metadata_json)
   AND json_extract(metadata_json, '$.app.nav.href') <> '/admin/design-canvas/';

UPDATE r2_buckets
   SET binding_name = 'STUDIO_TEMPLATE_ASSETS',
       updated_at = unixepoch()
 WHERE provider = 'cloudflare_r2'
   AND bucket_name = 'inneranimalmedia-assets'
   AND ownership_type = 'platform'
   AND owner_id = 'platform'
   AND binding_name IS NULL;
