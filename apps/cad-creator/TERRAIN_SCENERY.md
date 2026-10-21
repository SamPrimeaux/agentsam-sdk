# CAD Creator — Site, Landforms & Scenery

## Scope
Terrain is a separate, editable, **metric** site document (`agentsam.cad.terrain.v1`) projected into the same Three.js world as the imported FreeCAD/Blender building. It is not a native BIM wall/roof operation. The source `.FCStd`, IFC, and published visual GLB are not rewritten when terrain is shaped.

## Editing
Open DreamHouse's **3D Model** workspace, then **Terrain & Scenery**:
- Fit entire site, set site width/depth in metres, and protect a central architectural pad.
- Add mountains, hills, or valleys. Independently edit position (X/Z), two footprint radii, elevation, rotation and peak sharpness.
- Use Raise, Lower, Flatten, Smooth with a click/drag brush. Undo the most recent stroke.
- Change land cover and instance counts, sizes and deterministic seed for editable proxy trees and rocks.
- Import a rectangular CSV elevation grid of *relative* elevation samples in metres (no latitude/longitude implied).
- Export the complete `.terrain.json` document or import it to restore landforms, sculpt strokes, grid and scenery.

The viewer's original surveyed/staged ground is preserved in the imported GLB but hidden in favor of the derived editable surface. Default terrain relief is tapered to zero on the protected site, so the property's modeled BIM is not accidentally altered or translated.

## Persistence contract
`validateTerrainDocument()` accepts bounded, finite metric documents (max grid 1024×1024, 200 landforms, 5000 strokes, 2500 tree/rock instances each). No undocumented browser storage is treated as durable local file storage. **Export/import of real JSON files is implemented.** Cloud D1/R2 project revision persistence remains to be connected through the installation's asset binding; a Save revision button elsewhere in Studio must not be assumed to save terrain changes yet.

## Reality/provenance
Procedural mountains, ground colors, and proxy tree/rock meshes are generated content, not parcel surveys, DEM/AW3D/LiDAR data, aerial imagery or georeferenced terrain. Real-world terrain requires a user-approved site location/datum, licensed/source-attributed elevation data and validation against the building's finished-floor elevation. The current CSV importer supplies elevations only, not a geodetic coordinate transform. Better foliage assets, LOD/chunk streaming, physics collision and PBR lighting compatibility are follow-up engineering work.

## Verification — 2026-10-21
- Frontend `tsc --noEmit`: pass.
- `vitest run`: 35 tests passing across 9 suites, including six landform/heightfield/serialization/scenery tests.
- Vite production frontend bundle: pass.
- Chrome headless on compiled local Studio: loads the authorized public DreamHouse model, data-world-ready=true, opens Terrain & Scenery, adds mountain 4, fits site; click/drag sculpt creates 10 edits.
- Rendering smoke: the new 420 m scene has an editable colored relief surface, user-scalable mountains and instanced proxy trees/rocks. On the tested renderer, lit terrain shaders overexpose to white; the terrain currently uses baked directional color relief via vertex colors to keep the editing viewport readable.

The local browser test does **not** certify a newly deployed public CAD Worker or a packaged macOS app. Those require merge, an authorized public deployment and independent desktop verification.
