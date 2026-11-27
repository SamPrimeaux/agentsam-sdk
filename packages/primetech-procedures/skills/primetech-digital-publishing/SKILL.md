---
name: PrimeTech · Digital publication production
description: Prepare structured book content and produce validated EPUB 3 publications with navigation, preview and source provenance.
---

## Trigger conditions
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
If source validation or EPUB structure checks fail, keep source and error evidence. Do not label a malformed archive as publishable.
