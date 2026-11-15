-- agentsam-engine: d1
-- One canonical authenticated admin entry for the installed Design Canvas.
-- The /design-canvas/ bundle remains its asset distribution root; this changes
-- shortcuts, not installation state or the app's independently versioned files.
UPDATE agentsam_plugins SET
  metadata_json=json_set(
    metadata_json,
    '$.app.nav.href', '/admin/design-canvas/',
    '$.side_stage.href', 'https://agentsam.inneranimalmedia.com/admin/design-canvas/'
  ),
  updated_at=unixepoch()
WHERE plugin_key='agentsam-design-canvas' AND plugin_kind='native'
  AND json_valid(metadata_json)
  AND json_type(metadata_json, '$.app') IS NOT NULL
  AND json_type(metadata_json, '$.side_stage') IS NOT NULL;
