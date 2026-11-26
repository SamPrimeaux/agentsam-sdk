-- agentsam-engine: d1
-- The public static Design Canvas package is independently downloadable.
-- Preserve host screen bindings and account installations. No new registry.
UPDATE apps
SET config_json = json_set(config_json, '$.runtime.delivery',
  json_object('kind', 'npm-static', 'package', '@inneranimalmedia/agentsam-design-canvas'))
WHERE id = 'design-canvas' AND app_type = 'application'
  AND json_valid(config_json) AND json_extract(config_json, '$.runtime.manifest_id') = 'design-canvas';
