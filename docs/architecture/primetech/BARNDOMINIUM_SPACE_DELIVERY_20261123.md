# Barndominium Starter Kit — Space, artifact, and native BIM handoff

## Source classification (2026-11-23)

The owner's uploaded \`barndominium-starter-kit.zip\` contains a **single self-contained HTML Space** plus README, not a FreeCAD/IFC/STEP/DXF native CAD deliverable. The Space has 16 conceptual SVG-generated drawing sheets, original concept JPEG, room hotspots, doors/windows/materials, a 36-item construction sequence, and 17 allowance categories. The source itself clearly states that the documents are not stamped construction drawings. Do not register or advertise this as a native editable BIM file.

This kit's cover reconciles **72 × 32 ft living block (2,304 SF), 38 × 42 ft garage/shop (1,596 SF), 3,900 SF enclosed**, 60 × 8 ft porch and 24 × 10 ft patio. The 20 drawn spatial rectangles contain 17 interior non-garage spaces (three have no dimension label): the gross envelope is not the net sum of those schematic rectangles. Site parameters, window counts, MEP design, structural member sizes and code approval are provisional until the owner and qualified design team approve them.

## Existing ownership — do not add registries

| Responsibility | Existing authority |
| --- | --- |
| Reusable professional template definition | \`studio_templates\` in \`inneranimalmedia-business\` D1 |
| Platform stock payload and source manifest | private R2 bucket \`cad\`, registered as \`r2_cad\` |
| Private account-owned generated Space/ZIP | \`agentsam_artifacts\` + its account-authorized artifact R2 destination |
| Native CAD task execution and progress | \`agentsam_cad_jobs\`, linked to existing agent/workflow executions |
| BIM editing | Existing CAD Creator / FreeCAD (and IFC importer when validated) |
| Preview/viewing | Existing workbench/Side Stage/Artifacts viewers, not a new Space viewer |
| Project document media | Existing \`media_assets\`, only when an asset reference is needed |
| Standalone project ownership | Existing projects/workspace associations, not hardcoded DreamHouse |

Platform stock uses \`r2_storage_routes\` app-purpose routing; current first-party \`cad-creator\` stock-library route points to \`r2_cad\`. A row in D1 is not proof that the R2 bytes exist.

## Proposed lifecycle

1. Import the user-owned HTML Space as a private \`agentsam_artifacts\` deliverable and link it to the conversation/run. Preserve the original file and its provenance. Generated \`zip\` is a deliverable, not a canonical native BIM source.
2. Refine the existing Space into a design-development review: source/assumption ledger, area and room data, coordinated drawings, electrical/plumbing/HVAC device schedules, door/window hardware and procurement schedules, validation report, remaining RFIs and local approvals. Every unresolved spec remains \`TBD\` rather than fabricated.
3. After native project source and geometry are actually produced and validated, publish the reusable BIM starter as a **new** \`studio_templates\` entry: \`app_id='shared'\`, \`resource_kind='bim_starter'\`, \`category='bim-starters'\`, e.g. SKU \`SAM-BIM-BARNDOMINIUM-STARTER\`. Status remains \`draft\` until the R2 payload, checksum, thumbnail, FreeCAD source and GLB are verified.
4. Use the existing \`cad\` R2 bucket, immutable prefix \`library/bim-starters/barndominium/v1/\`. Publish \`manifest.json\` **last**. Recommended objects: \`source.FCStd\`, \`preview.glb\`, \`thumbnail.webp\`, \`drawings/\`, \`coordination/\`, and \`delivery.zip\`. Keep the account-specific review Space under private Artifacts, not public platform stock.
5. Use \`agentsam.cad.bim-starter.v1\` manifest conventions: original source SHA256, preview derived-from SHA256, object hierarchy, verified export relationships, source format, validation outputs. Instantiation must copy the source into an account-owned project and must never edit the shared stock source.
6. Chat → existing agent run status → verified artifact card → existing Side Stage open → authenticated ZIP download. The card should display real title/type/status/thumbnail, avoid overlays on mobile, and offer rename/move-to-Library and edit only when authorized.

## Integration gaps found

- \`work-cad-catalog.js\` historically derived \`ref\` only from \`/platform/<slug>/vN/\` R2 keys. BIM starters use \`library/bim-starters/...\`; consequently \`cadCanAct\` hides them from the project-template picker (whose scene callback accepts only legacy \`ref\`). This branch adds an authenticated payload resolver and typed \`payloadUrl\` field, without falsely enabling an unimplemented FreeCAD instantiation action.
- \`BimStartersWorkspace.tsx\` and local-only \`/api/cad/bim-starters\` read the local machine, while the platform template catalog is stored in D1/R2. Link the same viewer to the platform catalog via a proper native-format adapter; do not introduce an unrelated BIM gallery.
- The standalone Space does not sync checklist/budget state back to the platform. Browser-local storage is correctly labeled but must never be presented as account persistence.
- Existing \`agentsam-workbench/src/agent/ArtifactCard.tsx\` is only a text button. Reuse the packaged workbench, but upgrade its presentation/handlers in an explicitly integrated chat/artifact workflow; isolated cosmetic work on unused components is not sufficient.
- The catalog R2 inventory is explicitly partial, so publishing must verify actual object reads/checksums rather than relying on bucket totals.

## Acceptance criteria

- Old templates continue to display and launch; no new hardcoded DreamHouse preset.
- Hosted catalog supplies authenticated payload and preview references regardless of R2 key naming.
- BIM entries never advertise native edit until an importer instantiates source and passes geometry/IFC checks.
- Artifact card shows the actual finished output from a real completed job, not an optimistic status.
- One authoritative source asset; one current thumbnail per artifact, regenerated on content update; independently versioned source releases.
- Mobile 390 × 844 CSS px supports safe-area, no composer/dock overdraw, horizontal sheet navigation with visible selection, download/share, and focused document view.
- Owner review and licensed design/permit review remain explicit gates. No conceptual placeholder is described as a construction-ready plan.
