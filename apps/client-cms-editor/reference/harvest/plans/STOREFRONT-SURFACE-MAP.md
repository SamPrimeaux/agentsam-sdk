# Inner Animals Storefront Surface Map

This file exists so the storefront can be harvested as a coherent website/theme rather than as disconnected React files.

## Current route surfaces

| Surface | Source |
| --- | --- |
| Home | `app/page.tsx` + `app/components/Storefront.tsx` |
| Shop | `app/shop/page.tsx` |
| Collection | `app/collections/[slug]/page.tsx` |
| Product | `app/product/[slug]/page.tsx` |
| Journal index | `app/journal/page.tsx` |
| Journal detail | `app/journal/[slug]/page.tsx` |
| Story | `app/story/page.tsx` |
| Shared storefront data | `app/storefront-data.ts` |
| Shared storefront styles | `app/storefront.css` |
| Layout | `app/layout.tsx` |

The CMS editor is deliberately separate at `app/studio/page.tsx`.

## Harvest goal

Preserve enough source to reconstruct the entire public-facing experience:

- page composition
- content hierarchy
- navigation behavior
- product cards
- product detail behavior
- collection behavior
- journal surfaces
- story/brand narrative
- footer
- responsive behavior
- styles/tokens
- sample data shape

Do not reduce this to screenshots or static HTML if the React behavior can be preserved.

## Theme normalization target

The eventual reusable theme should separate four concerns.

### 1. Layout/presentation

Reusable visual implementation:

- site header
- hero
- section shells
- product grid/card
- editorial/journal grid
- product detail layout
- story layout
- footer
- responsive rules

### 2. CMS block/section definitions

The old implementation does not need to already be perfectly block-oriented.

Normalize later into stable section/block contracts, for example:

- announcement bar
- navigation
- cinematic hero
- instinct/use navigation
- product collection/grid
- manifesto
- archetype collection
- film/story feature
- journal feed
- community/gallery
- newsletter/community CTA
- footer
- product detail
- editorial article

### 3. Content bindings

Replace baked-in content with explicit structured bindings:

- brand name/mark
- nav
- hero copy/media
- collections
- products
- archetypes
- journal entries
- story sections
- CTAs
- footer links
- SEO metadata

Historical content can remain as demo/sample content but should be clearly marked as such.

### 4. Commerce/provider data

Product/catalog truth must eventually come from the ecommerce/CMS host contract, not from the theme package itself.

The theme may ship sample data for preview, but sample data must never masquerade as production inventory/catalog authority.

## Preservation rule

The harvest export copies all route/component/data/style files listed in this document before normalization.

That intentionally favors preserving too much source at the donor stage rather than prematurely deleting behavior that later turns out to be useful.

## What not to import as theme authority

Do not make the theme own:

- authentication
- account/session logic
- CMS persistence
- publishing
- inventory truth
- order truth
- payment/provider credentials
- Worker bindings
- D1/R2 resources
- deployment commands

The theme is a presentation/layout/content-binding package.

## Gallery target

Once normalized, the theme should be able to appear as a real live example with:

- desktop preview
- mobile preview
- route/page list
- source provenance
- feature list
- normalization status
- installability status
- CMS block compatibility status

Previewing it must remain side-effect free.
