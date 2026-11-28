---
name: PrimeTech · Creative asset packaging and delivery
description: Assemble approved creative sources and derivatives into traceable, checksummed delivery packages with explicit formats and handoff status.
---

## Trigger conditions
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
If an asset fails validation or an archive is incomplete, do not mark delivery complete. Preserve the failure report and list missing or invalid files.
