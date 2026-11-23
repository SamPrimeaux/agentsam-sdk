# Barndominium native structural concept V2

Authenticated source: R2 cad/library/bim-starters/barndominium/v1.1/owner-review/
Output: R2 cad/library/bim-starters/barndominium/v2/
D1 template: SAM-BIM-BARNDOMINIUM-STARTER (draft; not engineered).

To reproduce:
1. Extract the owner Space ZIP, retaining review/room-schedule.csv.
2. Configure PYTHONPATH to FreeCAD app Resources/lib and Python site-packages.
3. Run FreeCAD Python on build_structure.py with CSV path and output directory.
4. Render the generated OBJ with Blender render_preview.py; the third argument
   determines the PNG's output stem and creates the GLB.
5. Convert thumbnail.png to a single thumbnail.webp:
   cwebp -quiet -q 72 -m 6 -resize 960 600 thumbnail.png -o thumbnail.webp
6. Run prepare_release.py against the output directory and validate checksums.
7. For any changes, publish a NEW immutable R2 version, then update the
   existing studio_templates row and r2_objects references after readback.

Native FCStd solids have stable IDs, grouped elements and IFC class metadata;
the 688 IFC elements also include formally linked cut openings and 20 rooms.
This is a structural design concept, NOT engineered or approved for fabrication,
permitting or construction. See the architecture runbook for review gates.
