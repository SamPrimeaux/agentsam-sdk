---
name: PrimeTech · Custom type and letterform design
description: Develop custom lettering and type systems, then turn approved Typeface Studio glyph geometry into verified static font packages.
---

## Trigger conditions
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
If source, contours, parsing or cmap checks fail, do not distribute the TTF as approved. Preserve source and return validation evidence.
