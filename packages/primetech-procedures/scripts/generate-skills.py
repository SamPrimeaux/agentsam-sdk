import json
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "skills"
skills = [
{
"id":"primetech-brand-kit","name":"PrimeTech · Brand kit development","description":"Lead a complete, approval-led brand identity project from a focused brief through concepts, systems, production checks and usable deliverables.","icon":"palette","domain":"brand",
"tasks":["brand_identity","brand_refresh","brand_kit","creative_direction"],"routes":["primetech_brand_kit","brand_identity","brand_refresh"],
"tools":["imgx_generate_image","illustration_create","agentsam_excalidraw","excalidraw_export","agentsam_terminal_local","browser_screenshot","browser_navigate"],
"ops":["primetech.production-board.manage","primetech.icon-family.build","primetech.typeface.package","primetech.design-system.package","primetech.assets.package","primetech.visuals.compare"],
"caps":["media.generate","design.write","media.export","workflow.execute","terminal.execute","browser.capture","browser.navigate"],
"body":"""## Trigger conditions
Use for a new brand identity, meaningful identity refresh, or complete brand kit. Do not trigger merely because a logo or brand is mentioned in an unrelated task.

## Inputs
Establish audience, purpose, positioning, personality, use contexts, required deliverables, constraints, and what success should feel like. Ask only for missing information that materially changes the direction. Supplied assets and history are optional evidence, not mandatory research.

## Prerequisites
Confirm the brief and scope. Separate facts, user preferences, creative hypotheses, and approved decisions. Do not invent brand history, audience, values, competitors, or existing assets. Do not bulk-load archives unless the request depends on them.

## Workflow
1. Translate the brief into a concise creative thesis and 2–4 genuinely distinct directions.
2. Explain strategic and visual trade-offs before asking the user to choose or combine a direction.
3. Generate concept explorations with imgx_generate_image or illustration_create; keep exploration distinct from approved production masters.
4. Iterate against explicit feedback. Change meaningful design variables, not just superficial details.
5. Produce the approved mark, icon family, typography, color system, design tokens, supporting graphics, and usage examples as required.
6. Use the PrimeTech production board to record stages, generation IDs, decisions, artifact references, revisions and quality evidence.
7. Run the relevant packaging operations, then inspect rendered outputs in their intended contexts.

## Artifact contract
Deliver a concise rationale, approved identity assets, editable source files, icon and logo variants, typeface source and font exports when commissioned, color and design tokens, usage guidance, application examples, a machine-readable manifest, and checksums. Omit out-of-scope deliverables and identify anything not produced.

## Quality gates
Check distinctiveness, real-size legibility, monochrome and reversed use, clear space, contrast, typography coverage, licensing, editable sources, and exports. A generated image is a concept, not automatically a vector master or complete brand system.

## Persistence
Keep outputs under the project workspace and preserve original inputs. Use the approved asset storage path for remote handoff; do not invent bucket names or silently switch storage providers. Record source lineage and checksums.

## Iteration
Keep a decision log: approved, rejected, deferred, unresolved. Do not reintroduce rejected directions. Compare against the accepted brief and latest approved revision, not irrelevant historical material.

## Handoff
Present actual files and previews, explain contents, list formats and source files, identify licensing or production limitations, and state exact save/publish status.

## Failure handling
Do not claim completion if a master is missing, font export failed, source files are absent, a required variant was not generated, or the package did not validate. Preserve successful outputs and resume from the last verified artifact."""
},
{
"id":"primetech-iconography","name":"PrimeTech · Icon and mark families","description":"Develop, refine, remaster and compare logo marks, product icons and coherent icon families with vector masters and production-ready variants.","icon":"shapes","domain":"brand",
"tasks":["icon_design","logo_design","icon_family","brand_mark"],"routes":["primetech_iconography","icon_design","logo_design"],
"tools":["imgx_generate_image","illustration_create"],
"ops":["primetech.icon-family.build","primetech.visuals.compare","primetech.assets.package"],
"caps":["media.generate","design.write","media.export","terminal.execute"],
"body":"""## Trigger conditions
Use for a logo, symbol, app icon, product mark, pictogram set, or related family of visual marks. Do not assume an existing asset must be used as the starting point.

## Inputs
Capture meaning, audience, placement, visual character, required sizes, background contexts, color constraints, and whether the user wants exploration, refinement, remastering, or production exports.

## Prerequisites
If no approved vector master exists, develop concepts first. Use an existing logo only when supplied or when revision is explicitly requested. Never silently trace, replace, or overwrite the source.

## Workflow
1. Translate the brief into visual principles: silhouette, geometry, rhythm, negative space, weight and recognition distance.
2. Explore distinct directions with imgx_generate_image or illustration_create; label raster outputs as concepts.
3. Select and refine a direction with the user. Establish a clean SVG master before family production.
4. Define colorways and usage contexts. Keep all eight PrimeTech colorway identifiers exact when using the family builder.
5. Run primetech.icon-family.build for bare, circle and squircle variants, requested raster sizes and a manifest.
6. Inspect transparent edges, silhouette clarity, optical balance and real-size legibility. Use primetech.visuals.compare when a reference is available.
7. Package the approved master and derivatives with primetech.assets.package.

## Artifact contract
Provide editable SVG master, generated SVG variants, requested PNG sizes, colorway and shape metadata, source checksum, family manifest and comparison evidence when requested.

## Quality gates
Check transparent corners, unintended matte, clipped contours, consistent weight, small-size recognition, negative space, contrast and foreground/background mapping. Crops must not damage the mark.

## Persistence
Write derivatives to a project-relative directory. Preserve the approved source SVG and record its hash. A raster preview is not the editable master.

## Iteration
Compare meaningful design attributes, not just color. Keep rejected directions out of the final family unless asked to retain alternates.

## Handoff
List produced colorways, shapes, sizes, source files and manifest location. Identify missing formats or unapproved variants.

## Failure handling
Stop if the source SVG is malformed, the required colorway set is incomplete, or transparency checks fail. Keep the original master untouched and report the failing variant."""
},
{
"id":"primetech-type-design","name":"PrimeTech · Custom type and letterform design","description":"Develop custom lettering and type systems, then turn approved Typeface Studio glyph geometry into verified static font packages.","icon":"type","domain":"brand",
"tasks":["typeface_design","letterform_design","wordmark_typography","font_production"],"routes":["primetech_type_design","typeface_design","letterform_design"],
"tools":["imgx_generate_image","illustration_create","agentsam_terminal_local"],
"ops":["primetech.typeface.package","primetech.visuals.compare","primetech.assets.package"],
"caps":["media.generate","design.write","media.export"],
"body":"""## Trigger conditions
Use for a custom typeface, display lettering, wordmark letterforms, typographic identity, or production of a font from designed glyphs.

## Inputs
Clarify intended role, character, language and glyph coverage, reference context, desired contrast and construction, target platforms, formats and licensing requirements.

## Prerequisites
Separate single-word lettering from a reusable font family. Establish glyph inventory and metrics before promising broad language support. The current exporter produces static TTF, not variable fonts.

## Workflow
1. Define proportions, terminals, counters, stroke logic, spacing, rhythm and distinctive letterform rules.
2. Explore concepts with image or illustration tools, then move approved shapes into editable glyph contours.
3. Build a Typeface Studio source document with family/style metadata, units per em, metrics, glyph names, Unicode values, advance widths and contours.
4. Inspect glyph consistency, spacing, counters, overshoots and representative words.
5. Run primetech.typeface.package to validate source, compile the TTF, reparse it and verify the glyph map.
6. Inspect specimen and package, then compare representative rendered samples.
7. Package font, source, specimen and supplied license text.

## Artifact contract
Deliver editable typeface source JSON, verified static TTF, specimen HTML, package archive and manifest. State glyph count and coverage. Include licensing text only when supplied or confirmed.

## Quality gates
Verify unique Unicode mappings, valid contours, expected glyph count, readable counters, consistent metrics, reasonable advance widths, working cmap entries and a parseable TTF. Test representative words and sizes. Do not infer broad script coverage from a small Latin sample.

## Persistence
Preserve editable source and prior font releases. Write a new versioned package rather than silently replacing an approved font.

## Iteration
Use proof strings and targeted glyph comparisons to refine spacing and shape. Record changed glyphs and rerun validation after every export.

## Handoff
Provide TTF, source, specimen, archive, glyph coverage, license status and omissions. Explain that variable fonts or other formats require separate implementation.

## Failure handling
If source, contours, parsing or cmap checks fail, do not distribute the TTF as approved. Preserve source and return validation evidence."""
},
{
"id":"primetech-character-sprites","name":"PrimeTech · Character and sprite production","description":"Create consistent character and pet identities, 2D sprite sheets, 3D companion assets, rigging and animation deliverables.","icon":"smile","domain":"media",
"tasks":["character_design","pet_sprite_sheet","sprite_animation","companion_3d"],"routes":["primetech_character_sprites","character_design","sprite_animation"],
"tools":["imgx_generate_image","illustration_create","meshy_text_to_3d","meshy_image_to_3d","meshy_multi_image_to_3d","meshy_rig","meshy_animate","meshy_get_task_status","moviemode_render","moviemode_export"],
"ops":["primetech.sprite-atlas.build","primetech.visuals.compare","primetech.assets.package","primetech.production-board.manage"],
"caps":["media.generate","media.transform","media.status","media.render","media.export","workflow.execute"],
"body":"""## Trigger conditions
Use for a character, mascot, pet companion, sprite sheet, character states, rigged model or animation package.

## Inputs
Clarify role, personality, visual identity, proportions, references, style, required states, frame dimensions, transparency, timing, and whether the result is 2D, 3D or both.

## Prerequisites
Choose the correct path. A 2D sprite request does not require a 3D model; a 3D companion request does not automatically require CAD. Establish a canonical character reference first.

## Workflow
1. Define identity: silhouette, palette, face, distinctive features, materials and non-negotiable traits.
2. Create a turnaround or pose reference where consistency requires it.
3. For 2D, generate or illustrate individual states and frames with transparent backgrounds and consistent scale.
4. For 3D, use active Meshy tools: text-to-3D, image-to-3D or multi-image-to-3D; retain task IDs and inspect status.
5. Use Meshy rigging and animation only when the model and requested output support them. Render or export with MovieMode where appropriate.
6. Order 2D frames and run primetech.sprite-atlas.build for atlas, metadata and controllable preview.
7. Track stages and approvals with primetech.production-board.manage; compare final render or atlas to the canonical reference.

## Artifact contract
Deliver identity/reference sheet, approved source images, individual frames, sprite atlas, frame metadata, preview and requested 3D model, rig, animation or render exports. Record hashes and provider task identifiers.

## Quality gates
Check continuity, silhouette, proportions, palette, transparent edges, frame bounds, order, cadence, model integrity and export format. A static pose sheet is not a completed animation.

## Persistence
Keep source images and original model outputs immutable. Store derivatives in the project asset pipeline. Do not assume a provider task has completed until status and files are verified.

## Iteration
Refine one dimension at a time: face, pose, material, state, timing or camera. Keep the canonical identity reference attached to each regeneration.

## Handoff
List delivered states, frame count, dimensions, FPS, loop behavior, 3D formats and preview path. Separate completed outputs from tasks still running.

## Failure handling
If a task fails or a model is unsuitable for rigging, retain task receipt and source references. Retry from the last approved stage."""
},
{
"id":"primetech-design-systems","name":"PrimeTech · Design system production","description":"Turn an approved visual direction into consistent design tokens, accessible palettes, typography rules and reusable UI foundations.","icon":"layers","domain":"design",
"tasks":["design_system","design_tokens","brand_ui_system","component_foundation"],"routes":["primetech_design_systems","design_system","design_tokens"],
"tools":["agentsam_excalidraw","excalidraw_export","excalidraw_load_library","imgx_generate_image","browser_screenshot"],
"ops":["primetech.design-system.package","primetech.visuals.compare","primetech.assets.package"],
"caps":["design.read","design.write","media.generate","media.export","browser.capture"],
"body":"""## Trigger conditions
Use for a reusable design system, token set, visual language, component foundation or design-system package.

## Inputs
Establish product or brand context, supported surfaces, theme modes, accessibility requirements, typography, color roles, spacing, radii, elevation, motion and component families.

## Prerequisites
Start from approved creative direction and actual product requirements. Do not invent a universal theme or hardcode brand colors into application code. Confirm token ownership and naming conventions.

## Workflow
1. Define semantic roles before raw values: surface, text, border, accent, status, focus and interaction states.
2. Establish type scale, spacing, radius, shadow, stroke and motion tokens.
3. Map component states and responsive behavior. Use Excalidraw for structural diagrams when useful, not as a substitute for implementation.
4. Validate contrast and token references, then run primetech.design-system.package to produce CSS variables and documentation.
5. Apply tokens in the target product using its existing theme system and component boundaries.
6. Capture actual rendered states and use primetech.visuals.compare for reference-based checks.
7. Package the approved token source and generated outputs.

## Artifact contract
Deliver source token JSON, semantic token map, CSS variables, contrast results, documentation, component/state inventory and package manifest.

## Quality gates
Check contrast, focus visibility, disabled and error states, dark/light behavior, responsive typography, token naming, missing references and accidental hardcoded values. A token file not consumed by the product is not a completed implementation.

## Persistence
Keep tokens in the product's canonical theme or design-system source. Avoid parallel token authorities or per-theme CSS patches.

## Iteration
Change semantic roles deliberately and inspect affected components. Preserve token diffs and identify impacted surfaces.

## Handoff
Provide token package, documentation, contrast results, implementation locations and remaining adoption gaps.

## Failure handling
If tokens are malformed, contrast fails or application code still uses hardcoded values, mark the package or implementation as needing review."""
},
{
"id":"primetech-ui-ux-prototypes","name":"PrimeTech · High-fidelity UX flows and demos","description":"Research, map, implement and verify complete responsive product flows and working demos in the actual application codebase.","icon":"layout","domain":"design",
"tasks":["ux_flow","ui_prototype","interactive_demo","product_experience"],"routes":["primetech_ui_ux_prototypes","ux_flow","interactive_demo"],
"tools":["agentsam_excalidraw","excalidraw_export","excalidraw_plan_map_create","agentsam_codebase_retrieve","agentsam_terminal_local","browser_navigate","browser_screenshot","browser_run_snapshot","browser_evaluate_script"],
"ops":["primetech.production-board.manage","primetech.visuals.compare","primetech.assets.package"],
"caps":["design.read","design.write","repository.read","terminal.execute","browser.navigate","browser.capture","browser.execute","workflow.execute"],
"body":"""## Trigger conditions
Use for a product flow, interface concept, high-fidelity prototype, interactive demo, UX redesign or implementation-ready experience.

## Inputs
Identify target application, user goal, primary journey, user roles, devices, required states, existing codebase, design constraints and what must be demonstrated.

## Prerequisites
Inspect the actual application and its design system before proposing architecture. Ask for the target repository or surface only when genuinely unknown. Do not substitute a generic mockup for a working product experience.

## Workflow
1. Inspect the target codebase, routes, components, tokens, data contracts and interaction patterns with repository and browser tools.
2. Map the journey and edge cases. Use Excalidraw or plan-map tools for flow diagrams when useful.
3. Define screen inventory, navigation, component states, loading, empty, error, success, permission and mobile behaviors.
4. Build the prototype in the actual product codebase using its native framework and packages. Keep data bindings and interactions real; label fixtures clearly when unavoidable.
5. Verify keyboard behavior, focus, responsive layout, state transitions, navigation, persistence and error recovery.
6. Run the actual app, navigate the implemented journey and capture screenshots or browser snapshots at desktop and mobile sizes.
7. Compare key screens with approved references using primetech.visuals.compare, then record remaining gaps in the production board.

## Artifact contract
Deliver runnable prototype or implemented flow, source changes, route and component inventory, test evidence, browser screenshots, responsive states and acceptance report. A diagram or screenshot alone is not the deliverable.

## Quality gates
No dead buttons, fake progress, placeholder-only states, blank screens, inaccessible controls, broken routes, hardcoded theme colors or unexplained fixture data. Check loading, empty, error, offline, permission and cancellation states. Verify real save and navigation behavior.

## Persistence
Work in the requested repository and preserve unrelated WIP. Use existing package and release boundaries. Keep a clean diff, test receipts and stable project identity.

## Iteration
Review each journey step against the user's goal and observed behavior. Fix the highest-impact friction first, then re-run the whole flow.

## Handoff
Show the running experience, exact route, responsive screenshots, changed files, tests and what is genuinely implemented versus still mocked or pending.

## Failure handling
If the app cannot run or a dependency is missing, report the exact blocker and keep verified work. Never label a static design, unbuilt branch or untested route as a shipped demo."""
},
{
"id":"primetech-visual-qa","name":"PrimeTech · Visual quality assurance","description":"Compare approved references and rendered outputs with measurable image evidence and a separate semantic design review.","icon":"scan-eye","domain":"design",
"tasks":["visual_qa","design_review","render_comparison","visual_regression"],"routes":["primetech_visual_qa","visual_qa","design_review"],
"tools":["browser_screenshot","browser_run_snapshot","browser_content","agentsam_terminal_local"],
"ops":["primetech.visuals.compare","primetech.production-board.manage"],
"caps":["design.read","design.write","browser.capture","browser.read","media.export","terminal.execute"],
"body":"""## Trigger conditions
Use for visual QA, reference comparison, screenshot review, render verification or evidence that a design revision actually landed.

## Inputs
Identify approved reference, candidate render, exact viewport, device scale, state, theme, browser and acceptance criteria.

## Prerequisites
Capture actual current application output. Ensure reference and candidate represent the same dimensions and state before pixel comparison. A screenshot from an old build is not proof of the current build.

## Workflow
1. Capture reference and candidate at matching viewport and state.
2. Inspect layout, typography, hierarchy, contrast, alignment, clipping, content fidelity and interaction affordances.
3. Run primetech.visuals.compare when dimensions match to generate diff, overlay, MAE, RMSE, changed-pixel ratio and report.
4. Review semantic differences separately; pixel similarity cannot determine whether a workflow is correct or accessible.
5. Record defects with screenshot evidence, location, severity, reproduction steps and expected result.
6. Re-run the full affected flow after fixes and preserve before/after evidence.

## Artifact contract
Deliver reference and candidate paths, viewport details, diff and overlay images, machine-readable metrics, semantic findings, severity and pass/review result.

## Quality gates
Do not treat pixel metrics as a substitute for UX judgment. Flag mismatched dimensions, stale references, fixture data, hidden controls, inaccessible contrast and interaction failures. State exactly which thresholds passed or failed.

## Persistence
Keep evidence with the project or approved QA artifact store. Preserve original screenshots and hashes. Never overwrite the approved reference.

## Iteration
Re-test the same viewport and state after each change. Track resolved, regressed and open findings.

## Handoff
Summarize measurable result, semantic review, affected screens and remaining defects. Link actual evidence artifacts.

## Failure handling
If screenshots cannot be captured or dimensions do not match, report the comparison as blocked. Do not invent metrics or claim a pass without the generated report."""
},
{
"id":"primetech-creative-delivery","name":"PrimeTech · Creative asset packaging and delivery","description":"Assemble approved creative sources and derivatives into traceable, checksummed delivery packages with explicit formats and handoff status.","icon":"package","domain":"media",
"tasks":["creative_delivery","asset_package","brand_export","media_handoff"],"routes":["primetech_creative_delivery","asset_package","creative_delivery"],
"tools":["agentsam_terminal_local","moviemode_export","excalidraw_export"],
"ops":["primetech.assets.package","primetech.icon-family.build","primetech.typeface.package","primetech.sprite-atlas.build","primetech.design-system.package","primetech.ebook.package"],
"caps":["media.export","design.write","terminal.execute","design.export"],
"body":"""## Trigger conditions
Use when the user asks to package, export, hand off, archive or prepare creative assets for another person, product or release.

## Inputs
Confirm deliverables, approved source files, target formats, naming, licensing notes, recipient, output location and size constraints.

## Prerequisites
Identify the canonical source for each asset. Confirm sources are approved and generated derivatives link to the correct source revision. Never package unrelated stock or fixture assets as user work.

## Workflow
1. Inventory requested assets and source formats.
2. Validate each asset and record dimensions, media type, size and source checksum.
3. Generate only requested derivatives using the appropriate PrimeTech operation.
4. Assemble approved files with primetech.assets.package.
5. Inspect archive, manifest, checksums and expected file count.
6. Confirm output directory and approved storage or delivery route.

## Artifact contract
Deliver archive, machine-readable manifest, source and derivative inventory, checksums, file formats, licensing notes and validation result.

## Quality gates
Check no source is missing, files open, names are stable, formats match, checksums are correct and no temporary or unapproved files are included.

## Persistence
Preserve original assets. Write packages to a project-relative location and use canonical asset storage for remote persistence. Do not assume Cloudflare Images is the universal destination.

## Iteration
When a file is rejected or replaced, update only the affected derivative and regenerate the package manifest. Keep prior approved packages available as prior revisions.

## Handoff
State exact archive path, contents, size, checksum and delivery status. Distinguish a locally created package from an uploaded or published package.

## Failure handling
If an asset fails validation or an archive is incomplete, do not mark delivery complete. Preserve the failure report and list missing or invalid files."""
},
{
"id":"primetech-digital-publishing","name":"PrimeTech · Digital publication production","description":"Prepare structured book content and produce validated EPUB 3 publications with navigation, preview and source provenance.","icon":"book-open","domain":"publishing",
"tasks":["ebook_production","epub_export","digital_publication"],"routes":["primetech_digital_publishing","ebook_production","epub_export"],
"tools":["imgx_generate_image","agentsam_terminal_local"],
"ops":["primetech.ebook.package","primetech.assets.package","primetech.visuals.compare"],
"caps":["media.generate","media.export","design.write","terminal.execute"],
"body":"""## Trigger conditions
Use for a digital book, ebook, EPUB export or publication package from structured content.

## Inputs
Confirm title, author, language, chapter order, source content, images, accessibility requirements, identifier, cover requirements and intended distribution.

## Prerequisites
The current exporter expects a structured source document. Confirm chapter content is authored and safe to package. Do not claim PDF, print-layout or DRM output unless a separate validated workflow exists.

## Workflow
1. Validate source structure, metadata, chapter order and referenced media.
2. Generate or prepare cover art only when requested; keep concept and final production image distinct.
3. Run primetech.ebook.package to build EPUB 3 archive, container metadata, package document, navigation, preview and manifest.
4. Inspect archive structure and open the generated preview.
5. Compare cover and representative pages at intended reading sizes.
6. Package additional approved source and media files for delivery.

## Artifact contract
Deliver EPUB 3 file, HTML preview, source document, publication manifest, chapter count, archive size and validation evidence.

## Quality gates
Verify mimetype placement, container.xml, package metadata, navigation, chapter references, language, title, author, archive integrity and readable content. Do not report PDF output unless separately generated and verified.

## Persistence
Preserve source manuscript and media. Store generated publication files under project output and use approved asset pipeline for remote delivery.

## Iteration
Correct source document and regenerate EPUB rather than editing archive in place. Re-run structural validation after each change.

## Handoff
List EPUB path, preview, metadata, validation results and unsupported formats or distribution requirements.

## Failure handling
If source validation or EPUB structure checks fail, keep source and error evidence. Do not label a malformed archive as publishable."""
},
]

for skill in skills:
    skill["caps"] = ["primetech.procedure.run"] + skill["caps"]
    directory = root / skill["id"]
    directory.mkdir(parents=True, exist_ok=True)
    manifest = {
        "schema": "agentsam.skill.v1",
        "package": "@inneranimalmedia/primetech-procedures",
        "id": skill["id"],
        "name": skill["name"],
        "description": skill["description"],
        "icon": skill["icon"],
        "slash": {"suggested": "/" + skill["id"]},
        "instructions": {"source": "local_file", "ref": "SKILL.md"},
        "execution": {
            "mode": "turn",
            "tools": skill["tools"],
            "operations": skill["ops"],
            "capabilities": skill["caps"],
        },
        "provenance": {
            "source": "PrimeTech Creative Production",
            "status": "authored",
            "notice": "Original PrimeTech workflow. Tool references are validated against the live AgentSam registry.",
        },
        "metadata": {
            "skill_domain": skill["domain"],
            "task_types": skill["tasks"],
            "route_keys": skill["routes"],
        },
    }
    markdown = "\n".join([
        "---",
        "name: " + skill["name"],
        "description: " + skill["description"],
        "---",
        "",
        skill["body"].strip(),
        "",
    ])
    (directory / "agentsam.skill.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (directory / "SKILL.md").write_text(markdown)

print(json.dumps({"count": len(skills), "ids": [skill["id"] for skill in skills]}, indent=2))
