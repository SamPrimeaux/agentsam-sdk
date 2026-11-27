---
name: PrimeTech · Icon and mark families
description: Develop, refine, remaster and compare logo marks, product icons and coherent icon families with vector masters and production-ready variants.
---

## Trigger conditions
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
Stop if the source SVG is malformed, the required colorway set is incomplete, or transparency checks fail. Keep the original master untouched and report the failing variant.
