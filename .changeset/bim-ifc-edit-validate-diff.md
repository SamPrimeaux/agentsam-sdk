---
"@inneranimalmedia/agentsam-sdk": minor
---

Add real IFC authoring on the one IfcOpenShell adapter: `validate`, `diff` and `edit`. `edit` applies an allowlisted batch of changes by GlobalId (attribute, property set, placement move, extrusion depth, element removal with cascade) to a new copy of the source and writes nothing unless the copy adds no validation errors, keeps every GlobalId except explicit removals, and changes nothing outside the edited objects. `diff` compares two IFC files by GlobalId across attributes, property sets, placement, extrusion geometry, type and container, and states what it does not compare.

New SAM operations `cad.bim.ifc.inspect`, `cad.bim.ifc.validate`, `cad.bim.ifc.diff` (read-only) and `cad.bim.ifc.edit` (write), plus `agentsam cad ifc <status|inspect|validate|diff|edit>`. The local lane finds any Python with IfcOpenShell (PATH, a venv, or FreeCAD's bundled Python) and ships `services/cad/ifc` in the npm package.

Fix: the building IFC export wrote every wall dimension and position 1000 times too large (a 10 ft wall was a 3,048 m extrusion in a millimetre file) because millimetre values were passed to IfcOpenShell helpers that take metres. The proof's mesh-volume check misread the mesh scale in the opposite direction, so the two errors cancelled. The exporter now passes metres, the mesh check converts explicitly, and a new check reads wall height straight from the IFC entities.
