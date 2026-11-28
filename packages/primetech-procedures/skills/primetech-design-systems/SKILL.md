---
name: PrimeTech · Design system production
description: Turn an approved visual direction into consistent design tokens, accessible palettes, typography rules and reusable UI foundations.
---

## Trigger conditions
Use for a reusable design system, token set, visual language, component foundation or design-system package.

## Inputs
Establish product or brand context, supported surfaces, theme modes, accessibility requirements, typography, color roles, spacing, radii, elevation, motion and component families.

## Prerequisites
Start from approved creative direction and actual product requirements. Do not invent a universal theme or hardcode brand colors into application code. Confirm token ownership and naming conventions.

## Source of truth and handoff
Record the canonical source, owner, version, provenance and approval status. References and screenshots inform the work; they do not automatically constrain it or prove production readiness. Map approved choices into semantic tokens, components, assets and platform conventions. Specify component anatomy, variants, states, breakpoints, keyboard/focus behavior, content constraints, accessibility and acceptance criteria. If sources conflict, explain the conflict and recommend a source of truth instead of silently overwriting it. Mark each delivered item observed, proposed, approved or implemented.

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
If tokens are malformed, contrast fails or application code still uses hardcoded values, mark the package or implementation as needing review.
