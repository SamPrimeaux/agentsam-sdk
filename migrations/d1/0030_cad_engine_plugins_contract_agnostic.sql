-- CAD engine plugin rows are contract-agnostic. The project schema version
-- (cad.project.v1 / cad.project.v2) lives on the project document, not on an
-- engine, tool or capability record. Idempotent: no-ops where already applied.
UPDATE agentsam_plugins
   SET metadata_json = json_remove(metadata_json, '$.contract'), updated_at = unixepoch()
 WHERE plugin_key IN ('cad-engine-occt', 'cad-engine-blender', 'cad-engine-openscad')
   AND json_extract(metadata_json, '$.contract') IS NOT NULL;

UPDATE agentsam_plugins
   SET metadata_json = json_set(metadata_json, '$.package', '@inneranimalmedia/agentsam-occt',
                                '$.adapters', json('["browser-wasm","native"]')),
       updated_at = unixepoch()
 WHERE plugin_key = 'cad-engine-occt';

INSERT OR IGNORE INTO agentsam_plugins
  (id, plugin_key, family_key, provider_key, plugin_kind, category, display_name, description,
   transport, auth_type, tool_lanes_json, composer_visible)
VALUES
  ('plg_cad_engine_freecad', 'cad-engine-freecad', 'build', 'freecad', 'native', 'creativity',
   'FreeCAD', 'Headless BIM and parametric modeling, IFC export for CAD projects.',
   'native', 'none', '["local","remote","cloud"]', 0);
