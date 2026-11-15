-- agentsam-engine: d1
-- The installed app now opens the single owner-backed native Canvas editor.
-- Existing per-account installations and the distribution source files remain intact.
UPDATE agentsam_plugins SET
 metadata_json=json_remove(json_set(metadata_json,
   '$.app.nav.href', '/canvas?library=sources',
   '$.side_stage.renderer', 'builtin',
   '$.side_stage.tab_kind', 'design'), '$.side_stage.href'),
 description='Account-owned editable Canvas with imported source artboards, save history and CMS handoff',
 updated_at=unixepoch()
WHERE plugin_key='agentsam-design-canvas' AND plugin_kind='native' AND family_key='build'
 AND json_valid(metadata_json) AND json_type(metadata_json,'$.app') IS NOT NULL
 AND json_type(metadata_json,'$.side_stage') IS NOT NULL;
