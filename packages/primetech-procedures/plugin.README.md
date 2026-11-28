# PrimeTech Design Studio

**Creative system:** PrimeTech
**Companion:** Architect — great horned owl
**Workbench:** brand identity, iconography, typography, character and sprite production, design systems, UI/UX, visual QA, creative delivery and digital publishing

PrimeTech is an agent-native creative-production system, not a thin wrapper around Figma or another design provider. Its nine reusable skills define the creative workflows; the `@inneranimalmedia/primetech-procedures` package supplies AgentSam procedure manifests, local execution adapters, builders and evidence contracts.

## Included skills

- `primetech-brand-kit` — build complete brand identity systems from a focused brief, with distinct directions, rationale, approvals and production-ready assets.
- `primetech-character-sprites` — develop consistent character and pet identities, 2D sprite sheets, 3D companion assets, rigging and animation deliverables.
- `primetech-creative-delivery` — package creative source, derivatives, manifests, provenance and delivery-ready exports.
- `primetech-design-systems` — build accessible semantic tokens, typography, component foundations and implementation handoffs.
- `primetech-digital-publishing` — create structured, validated digital publications and distribution assets.
- `primetech-iconography` — develop, refine, remaster and compare logo marks, product icons and coherent icon families.
- `primetech-type-design` — develop type systems, custom letterforms, wordmarks and production-ready font packages.
- `primetech-ui-ux-prototypes` — audit, map, implement and verify responsive product flows and interactive demos in the actual application codebase.
- `primetech-visual-qa` — compare approved references and rendered outputs with measurable image evidence and a separate semantic review.

## Execution model

Use the PrimeTech workflow and the tools available in the current host. In AgentSam, use the packaged PrimeTech procedures through the existing SAM authorization and local runtime. In ChatGPT, skills guide the agent to use available native image, file, code and browser capabilities. Do not claim that a generated preview is a verified font, sprite atlas, Figma edit, or running application.

This is a skills-first plugin release. It intentionally has no `mcp.json` until a real, verified remote PrimeTech MCP service exists. The plugin does not create a second assistant, scheduler, global registry or design-system UI.

## Production standards

- Start from the user's brief; do not bulk-load unrelated brand archives or assume existing assets are mandatory.
- Separate observations, inferences, proposals and approved decisions.
- Preserve canonical sources and unrelated work in the target repository.
- Use external design providers only as explicit, connected handoff targets; PrimeTech workflows are the default.
- Label simulated behavior and unverified deliverables. Report exact outputs, checks, and remaining gaps.

## Private reference note

The existing private plugin retains an Inner Animal Media design-system reference pack under `skills/design-system-handoff/references/inner-animal-design-system/`. Use it only when the target is Inner Animal Media or AgentSam. Never apply it as a global design system or load it for unrelated brands. It is intentionally not included in the public npm package.
