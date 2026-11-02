# Discovery — Brand Presentation Context (2026-11-01)

During shell / creative revisions, SamSketch showed a working **brand-aware 3D scene presentation** capability that must not be mistaken for application chrome theming.

## Observed behavior

SamSketch `Product identity` currently hardcodes two choices (`AgentSam`, `InnerAnimalMedia`). Switching them restyles the **same composition**:

- Brand names and screen labels
- Monitor / frame colors
- Chart accents and object materials
- Overall presentation identity of authored output

The editing environment and geometry authoring path stay shared. That split is correct and valuable.

## Ownership boundaries (do not collapse)

| Concern | Owner |
|---|---|
| Global AgentSam application appearance | AgentSam Settings |
| Approved brand identity + registered assets | Brand Studio / authorized `BrandContract` |
| Which brand a project is presenting | Project / document reference |
| Applying that brand to authored output | Creative apps (SamSketch first) |

AgentSam chrome ≠ brand of the thing being created.

Example: work inside AgentSam → use SamSketch → author a presentation for InnerAnimalMedia (or a client brand) → scene carries that brand → shell remains Settings-owned.

## Required generalization (not a rewrite)

Do **not** keep AgentSam / InnerAnimalMedia as the permanent product-identity architecture.

1. Trace SamSketch (`apps/samsketch/src/main.ts` brand map + `brand-choice`) — separate data-driven presentation bindings from hardcoded branches.
2. Preserve scene-presentation, material refinement, and editable object properties.
3. Replace the fixed two-brand selector with a dynamic brand reference.
4. Bind presentation tokens (identity, materials, semantic colors, typography, logo/imagery) to Brand Studio / `BrandContract` — no duplicate brand tables, parallel asset libraries, or independent theme systems.
5. Eventually reuse one Brand Presentation Context across SamSketch, CAD viz, MovieMode, CMS previews, mockups, and export presentation.

## Shell revision constraint

Incorporate this as an architectural discovery only. **Do not derail active shell revision WIP** and **do not replace SamSketch**. Preserve the editor; generalize the identity source when that lane is ready.
