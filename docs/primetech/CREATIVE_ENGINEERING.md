# PrimeTech — Creative Engineering Department

**Status:** Working product/brand architecture. Brand presentation does not rename internal package IDs or assert that unfinished execution capabilities have shipped.

## Position

PrimeTech is the creative engineering practice in the InnerAnimalMedia family: the place where software systems, spatial design, physical products and cinematic experiences are conceived, engineered, refined and delivered.

**Our mission is to redefine impossible.** This is not an AI slogan. It is a production standard: show the exact model, screen, source master, design revision, actual generated artifact and measured behavior behind each claim.

**Creative engineering** means original design paired with accountable technical execution. A finished experience includes purposeful aesthetics, editable sources, deterministic operations where appropriate, meaningful human control, responsive presentation and verifiable deliverables.

## Brand architecture and ownership

| Identity | Responsibility |
| --- | --- |
| InnerAnimalMedia | Parent company; identity, commerce, infrastructure, CMS and shared operation of the platform |
| PrimeTech Creative Engineering | Professional practice, services, product portfolio, case studies and workflow design |
| AgentSam | Assistant and SAM execution system; SDK API, capabilities, authorization, evidence and receipts |
| Meauxbility | Accessibility and inclusive-experience work |
| PrimeTech Studio (proposed public label) | Public-facing name for the existing CAD Creator workspace, preserving the `cad-creator` app ID, routes and package IDs |
| SamSketch, SamScene, SamSpeaks, SamSculpt, MovieMode/CoPro | Separately owned creative applications/capabilities; connected, not merged into one interchangeable editor |

**No second kernel, CMS, global shell, app identity, project database, permission path or model renderer.** PrimeTech can coordinate work through existing SDK contracts without owning those contracts.

## Five practice groups

### 01 — Architecture, BIM & Built Environments

From dimensions and site planning through editable spatial geometry, building semantics, technical review views, material studies and interactive walkthroughs.

Evidence: DreamHouse and Beyond the Blueprint. Preserve one continuous DreamHouse project identity across revisions. Native FreeCAD/IFC and source geometry remain authoritative; a GLB or film is a presentation derivative, not its replacement. Unreviewed documentation must not be described as professional-approved construction output.

### 02 — Mechanical, Product & Manufacturing Engineering

Mechanical and product forms, parametric parts and assemblies, OCCT, physical prototyping, artwork-to-production preparation, technical feasibility and manufacturing handoffs.

The manufacturing lane covers on-demand providers, local production, independent shops, vendor-independent specifications and designer/operator review. Completeful and Printify are provider adapters, not the merch domain model. Do not call a file ready for a particular manufacturing process without verified provider or operator requirements.

### 03 — Spatial Worlds & Real-Time Experiences

Procedural environments, scene composition, materials, lighting, camera paths, interactive installations, animations and game-like experiences.

`.iamscene.json` is the portable **scene presentation/authoring** interchange contract; it may reference external CAD, BIM, native project, simulation, and production sources. Never flatten those original editable domains into a lossy scene file. SamScene/SamSculpt experimentation graduates through explicit contracts, tests and source provenance.

### 04 — Motion, Film & Sound

Video and sound production, editorial composition, narration, voice direction, story beats, motion graphics, cinematic transitions and encoded deliverables.

MovieMode is the editing application. CoPro is the co-producer: an AgentSam-assisted layer for deliberate analysis, suggestions, edits, candidate alternatives, review and refinement. It uses the existing CoPro project/command/timeline engine and authorized provider adapters. Capability declarations are not proof of a functioning model, editor surface or export.

### 05 — Brands, Commerce & Digital Products

Identity systems, typography, web experiences, software products, CMS, commerce, merchandise, product visualization, fulfillment and marketing media.

Source masters are immutable design evidence. Manufacturing files, storefront images, thumbnails, mockups and social exports are **different derivatives** from the same owned master. The canonical commerce CMS and installed site remain the publishing authority, not PrimeTech's showcase prototype.

## How the practice works

1. **Discover:** Identify the owner, project, constraints, people, existing source files, provider requirements and prior revisions.
2. **Design:** Make the brief tangible through sketches, visual systems, samples, plans, scene or timeline direction and alternatives.
3. **Engineer:** Use the correct domain engine and reusable SDK operations: OCCT for geometry, CAD/BIM for spatial source, merch preflight for production, CoPro for media editing, IAMScene for scene presentation.
4. **Review:** Evaluate actual outputs, risks, accessibility, source fidelity, materials, render quality, performance and user experience; distinguish automated checks from human approval.
5. **Produce:** Save validated source and derivative artifacts with stable identifiers, hashes, formats and revision evidence.
6. **Present:** Publish a compelling editorial case study, demonstration, technical still or interactive experience through the existing CMS. Share the source-to-output relationship, not an unsupported marketing claim.
7. **Evolve:** Keep the same project identity across revisions, with backward-compatible migration and reproducible output evidence.

## Customer-facing experience

PrimeTech should lead with **Work**, then **Capabilities**, **Industries**, **Studio**, **Company** and **Contact**. Show what has been built before listing software abstractions.

Four starting industry lenses:
- Architecture, Engineering & Construction
- Product Design & Manufacturing
- Media, Entertainment & Interactive Experiences
- Brands, Commerce & Digital Products

A case study is an editorial narrative with production evidence, not just a product card:
- Hero: one excellent still, interaction or short scene; clear project name and discipline.
- Problem: a concrete design/engineering challenge and actual brief.
- Process: source sketches, design decisions, dimensional work, technical revisions.
- Outcomes: authoritative geometry, asset previews, working app, deliverables, measurable performance where available.
- Experience: a properly optimized interactive scene when it materially improves comprehension.
- Provenance: project ID, revision, assets, authority, visibility and verified status.
- Next work: contextual related projects; no unrelated app inventory dump.

Mix natural light/dark editorial zones, well-composed stills, controlled animation, typography and meaningful interactive moments. On mobile, preserve readable layouts and direct navigation before cinematic effects. Honor reduced motion.

## Initial launch projects and claim boundaries

| Project | Production material | Public claim boundary |
| --- | --- | --- |
| DreamHouse | Architectural model, published V1.5 schematic media, BIM/provenance evidence | Design-review materials only; no claim of permit-ready construction |
| Beyond the Blueprint | Independent cinematic chapter experience tied to DreamHouse | Not an embedded substitute for a native editable model |
| Aviation Scene Lab | Interactive Golden Gate flyover review prototype | Flyover prototype, not helicopter restoration documentation |
| Merchandise and product creation | Actual design workflow, source masters, provider-specific preflight and mockups | Provider and sampling readiness must be verified per item |
| MovieMode/CoPro | Editor workspaces, templates, media and timeline workflows | Only verified import/edit/export capabilities may be described as production features |
| PrimeTech clay world | Original responsive Three.js site prototype | A source-backed creative direction until installed in the canonical CMS |

## Systems and schema boundaries

| Domain | Source of truth | Other outputs |
| --- | --- | --- |
| Installable app | `agentsam.app.json` matching `agentsam.app.v1` | App-specific settings and save-state schemas; host installation records |
| CAD/BIM | `cad.project.v2`, native feature history, project revision | IFC/STEP/BREP, technical drawings, GLB, `.iamscene.json`, media |
| Scene | `.iamscene.json` (portable authored scene) | Rendered frames, GLB, films; external native sources referenced |
| CoPro timeline | CoPro project and integer-microsecond command model | Clips, sound, captions, encoded exports |
| Merchandise | Manufacturing profiles + product concept/selection + source asset | Provider-specific production handoffs, storefront derivatives |
| Procedure | Versioned PrimeTech manifest and existing SAM operation receipt | Validated native outputs and presentation evidence |

Never create a universal schema by stuffing every field into an untyped blob. Shared cross-domain references must include a source URI, revision, format, units where relevant, integrity, permission scope and responsible runtime.

## Acceptance

- Every product and procedure has a named source owner; no duplicate implementation replaces a proven one.
- Source, package, published schema and documentation agree; schema publication is hash-verified and migrated deliberately.
- App identity is stable and independent of marketing display names or host routes.
- A user can edit genuine source state and save/reopen their own projects.
- Every claimed export is produced and verified by its real domain engine.
- Published assets exist in the configured storage and are genuinely retrievable; hardcoded company buckets never leak into portable packages.
- The CoPro assistant operates through explicit project commands, review and undo—not untraceable timeline rewrites.
- Desktop and mobile visual QA, keyboard access, reduced motion and case-study performance pass before publication.
- Every release closes the loop: code → tests → package → storage/migration → deployed host → actual user acceptance.

**PrimeTech is the creative practice; AgentSam is the technology that helps it execute.**
