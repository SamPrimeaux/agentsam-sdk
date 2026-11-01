# CAD Creator — Creative Department Batch 1 (2026-11-01)

## Decision: gallery / resource-card SSOT

**Keep:** `CadResourceCard` + `CadPreviewTreatments` (`CadPreview2D` via `TemplateSchematic`, `CadPreview3DStatic`, `CadPreviewImage`) as the CAD-owned resource-card grammar.

**Converge onto it:**
- `CadProjectGallery` (hosted projects, local revisions, featured templates, BIM library entry)
- `TemplateStarterGrid`
- `BimStartersWorkspace` library grid
- `CloudProjectsModal` templates + revision snapshots

**Retire as competing card layouts:** ad-hoc bordered buttons / text-only revision rows in those surfaces (replaced, not deleted as separate packages).

**Do not:** mount a live Three.js / FreeCAD engine inside gallery cards. Live engines remain in `Viewport3D`, `CadWorldViewport`, and BIM starter open state.

**Templates (Batch 2):** keep hooks via gallery “Starters” filter; full Architecture / Mechanical / Technical Drawing starter packaging stays Batch 2.

## CI / Python path

`services/cad/pyproject.toml` adds `../../python` to `[tool.ty.environment].extra-paths` so `ty==0.0.88` resolves `agentsam_sdk.cad` from the sibling SDK source (same import `server.py` already uses).
