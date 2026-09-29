# Inner Animals Theme / Layout Harvest

## Goal

Turn the useful public storefront and visual/layout language in this donor into a reusable theme/preset candidate without making the donor repo or its content the runtime authority.

Potential destination:

`packages/theme-inneranimals-site`

Potential gallery destination:

`apps/theme-gallery-preview/themes/inneranimals-site`

## Current donor source

The latest merged source separates the public website from the CMS editor.

Public/theme donor:

- `app/page.tsx`
- `app/components/Storefront.tsx`
- `app/storefront-data.ts`
- `app/storefront.css`
- `app/layout.tsx`
- `app/shop/page.tsx`
- `app/collections/[slug]/page.tsx`
- `app/product/[slug]/page.tsx`
- `app/journal/page.tsx`
- `app/journal/[slug]/page.tsx`
- `app/story/page.tsx`

CMS editor donor remains separate at `app/studio/page.tsx`.

See `STOREFRONT-SURFACE-MAP.md` for the route-to-theme mapping.

## Preserve

Preserve source-level evidence for:

- section ordering
- navigation patterns
- hero treatment
- typography hierarchy
- spacing rhythm
- palette/token choices
- footer patterns
- content widths
- responsive behavior
- product/store behavior
- collection behavior
- journal/editorial behavior
- story/brand narrative behavior
- reusable component/template ideas

The harvest export intentionally copies the original source and CSS intact so no layout behavior is lost before normalization.

## Normalize later

The real theme implementation should separate:

### Theme contract

- tokens
- typography
- colors
- radii
- spacing
- motion defaults
- container rules
- section presets

### Content bindings

- nav links
- hero copy/media
- CTAs
- collections
- product fields
- archetypes
- journal entries
- story content
- footer links

### CMS blocks

If the old source is not truly block-oriented, do not fake it during harvest.

Normalize during implementation into explicit blocks/sections.

## Content rule

Historical Inner Animals copy may be useful for a live historical preview, but should not silently become generic scaffold copy for unrelated customer sites.

The reusable package should distinguish:

- design/layout preset,
- sample/demo content,
- customer content.

## Side-effect rule

Installing or previewing the theme must not:

- publish it,
- sync it,
- upload assets,
- overwrite an active customer theme,
- change a CMS publication.

A future theme command should keep these steps distinct:

```
inspect
preview
install/stage
apply
sync
publish
```

Only the explicitly invoked mutating step may alter its declared target.

## Gallery value

Keep the historical donor as a real showcase example.

A future gallery entry should communicate:

- historical source/provenance
- available pages/surfaces
- whether the item is previewable
- whether it is installable
- whether it has been normalized into CMS blocks
- which capabilities are real versus visual/demo-only

This lets AgentSam advertise real prior systems without misrepresenting prototype behavior as production capability.
