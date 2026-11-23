# Canonical file-format spine: AgentSam CAD, PrimeTech, CMS, and media

**State:** source contract implemented; engine coverage still requires verified host adapters and output receipts. **Not** an npm release or a declaration that every recognized file is editable.

## One owner

- The **only canonical format-identity catalog** is `@inneranimalmedia/agentsam-contracts/source-types/catalog` (`agentsam.source-types.v2`, currently 429 records). It defines IDs, extensions, MIME types, ambiguity metadata, variants, signatures, and source families.
- The **CAD application profile** is `@inneranimalmedia/agentsam-contracts/source-types/cad` (`src/cad-source-formats.ts` in the package). It consumes the catalog and classifies CAD-relevant entries as native BIM, parametric, exchange, presentation or verification. It does **not** duplicate extension definitions.
- The SDK's existing `@inneranimalmedia/agentsam-sdk/cad` format-policy module is now a compatibility **re-export**, not a second registry. CAD Creator's backend imports the package directly, not `../../../../../src/lib/cad/...`.
- Other consumers (SamSketch, IAMScene, Ecommerce CMS, Design Canvas, MovieMode) should use the same source-format identities when importing or exporting, while their host-specific parsers and execution engines remain independent, explicit adapters.
- **Private CAD Creator backend:** its source checkout uses a lockfile link to the canonical Contracts workspace. It builds/contracts-checks locally without requiring an unpublished npm tarball. For independent external consumers, an **approved targeted Contracts publish** is still necessary before depending on the new public export. Do **not** publish the entire SDK fleet.

## Accepted CAD source categories

The CAD profile currently exposes 178 catalog-derived identities, including:

| Source group | Examples | Classification meaning |
|---|---|---|
| Native geometry / CAD | `.step`, `.stp`, `.iges`, `.brep`, `.fcstd`, `.scad`, `.dwg`, `.dxf` | Recognized engineering source; actual editing is engine-dependent |
| BIM | `.ifc`, `.ifczip`, `.ifcxml`, `.rvt`, `.rfa` | Recognized BIM source; no claim of universal round-trip editing |
| 3D scene / mesh | `.iamscene`, `.iamgeometry`, `.glb`, `.gltf`, `.stl`, `.3mf`, `.obj`, `.ply`, `.usd`, `.usdz`, `.blend` | Exchange or review depending on profile; valid bytes and editing require separate adapters |
| Drawings / imagery | `.svg`, `.png`, `.jpg`, `.webp`, `.tif`, `.exr`, `.gif`, `.bmp` | Source, annotation, presentation or exchange as indicated by consuming operation |
| Architecture documentation | `.pdf`, `.doc`, `.docx`, `.odt`, `.rtf`, `.md`, `.html` | Verification/reference, not silently interpreted as 3D geometry |
| Schedules and presentations | `.csv`, `.json`, `.xls`, `.xlsx`, `.ods`, `.ppt`, `.pptx`, `.odp` | Source or verification; table/content parsing needs its own engine |
| Media / project evidence | `.mov`, `.mp4`, `.mkv`, `.wav`, `.otio` | Review/evidence or exchange, not automatically a native CAD deliverable |
| Scans and CAM | `.e57`, `.las`, `.laz`, `.xyz`, `.gcode` | Scan/source or machine program; content must be verified by the actual host |

This is intentionally **not** a claim that all formats are implemented for import/edit/export. The 429-entry catalog remains the complete identification authority; the 178 CAD profile is a scoped classification of relevant formats.

## Format identity is not an engine capability

`identifyCadFileFormat(filename)` returns an **extension hint**; no codec validation or content verification occurs. `cadFormatCandidates(filename)` exposes ambiguity (e.g., `.obj` could mean Wavefront mesh or COFF object, while `.ptx` has point-cloud and texture identities). The default CAD source-inventory route retains its documented priority for compatibility.

`runCadFormatOperation({ filename, operation, source, options, resolvedFormatId? }, adapters)` supports exactly:

- `inspect`
- `import`
- `preview`
- `edit`
- `convert`
- `export`
- `round-trip`

The method has **no built-in success fallback**. It requires an explicit installed adapter that names the canonical format ID, names the operation, exposes a real `execute` method and passes any provided readiness check. Unknown formats, ambiguous formats without explicit resolution, unsupported operations, and unavailable adapters return explicit errors. The adapter's actual output is returned; the caller must verify artifacts/receipts before marking a delivery complete.

**Important:** Choosing an ambiguous format identity is not proof of validity. The operation adapter must inspect and validate the bytes, scope and source before editing, conversion or publication.

## Existing real engines to adapt rather than replace

- **OCCT / FreeCAD**: existing native solid execution and STEP testing are valuable, but need explicit scope and versioned receipts for each supported operation.
- **OpenSCAD**: an existing test executes the native program and verifies SHA-256 of generated artifacts.
- **GLB preview**: the source-browser test verifies a GLB preview response and exact downloaded bytes, not 3D editability.
- **IAMScene / IAMGeometry**: keep their portable document/geometry authoring contracts. Scene or section renderers should consume the canonical source format reference and an actual IAMScene parser.
- **IFC**: semantic inspection and fidelity/round-trip are separate capabilities. Do not present recognition as guaranteed editing.
- **SVG / PNG / PDF / office files**: references, schematics and evidence are first-class source documents. Rendering or converting them must be independently proven; importing a PDF is not an instruction to fabricate geometry.

## Source inventory safeguards

- Local CAD source discovery preserves the bytes, SHA-256, source revision, canonical format reference and a source-only/review-only/verification-only classification.
- HTML, Markdown and incidental plaintext files can be identified when chosen explicitly but are excluded from broad automatic scans. Generic JSON is excluded unless it matches known receipt rules; `.iamscene.json` remains recognized as its own format.
- Ambiguous extensions carry candidate IDs in the source metadata. The browser does not automatically claim one content type has been verified.
- Disallow filesystem traversal and out-of-root symbolic links in source browsing, and continue hashing in bounded chunks instead of buffering massive IFC models or video footage.

## Required next engine-integration work

1. Register real per-host operation adapters through the canonical Contracts format reference, using actual CAD/OCCT/FreeCAD/Blender/Three.js/file conversion capabilities and health checks. Do not turn format metadata into fake editor controls.
2. Make CAD Creator's Import, Preview, Edit, Convert, Export and Product/Delivery panels ask which **installed adapter** can perform the requested operation. Surface unsupported or unavailable states honestly.
3. Preserve source and derived artifacts as revisioned resources through the existing filesystem/media/R2 authorities. Record input hashes, output hashes, adapter, version, conversions, loss report, principal/site/project scope and verification receipts.
4. Build a tested preservation matrix per format and per operation. CAD modeling, BIM semantics, SVG paths, raster images, PDFs, documents and media do **not** share the same editable internal representation.
5. Verify fresh **external** consumers after a targeted Contracts-only publish is authorized. No package train alignment should occur automatically.

## Tests performed for the implementation

- Contracts build and all package tests.
- Original SDK CAD format-policy and delivery-profile tests.
- CAD backend source-browser integration (including IFC, STEP, OBJ/STL/GLB, SVG/PNG, PDF, DOCX, XLSX, PPTX), native engine tests and source hashing.
- CAD backend TypeScript check and backend clean-install lockfile dry run.
- Source-boundary verification and package tarball export verification.
- A separate fresh-consumer npm test is **not** considered complete until the new Contracts export is published to npm under an approved individual version.
