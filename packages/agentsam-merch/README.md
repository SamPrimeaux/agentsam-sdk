# @inneranimalmedia/agentsam-merch

Portable manufacturing preflight and merch planning for AgentSam applications.

The package separates manufacturing profile **data** from execution code, provider adapters from the media engine, preserved source masters from manufacturing/storefront derivatives, and deterministic preflight from human/process-specific handoffs.

## Profile contract

Profiles are JSON under `profiles/<manufacturer>/`. Provider requirements do not belong in application conditionals.

The engine returns:

- `ready`
- `ready_with_transform`
- `needs_variant`
- `prepared_for_digitization`
- `unsupported`

A low-resolution raster is never called production-ready. An embroidery source is never represented as a finished stitch file.

## Derivative authority

```text
original/master
  ├─ manufacturing
  ├─ storefront/gallery
  ├─ thumbnail
  ├─ social
  └─ mockup
```

The manufacturing plan is marked `mustNotUseStorefrontDerivative`.

## Collection Lab

Portable candidate states:

```text
concept
approved-art
production-ready
sample-ordered
sample-approved
published
retired
```

## Collection merchandising

Portable product planning and presentation are available without ecommerce-app
coupling:

- `MERCH_ASSORTMENT_RECIPES` and `assortmentSearchTerms()` describe reusable
  garment/accessory lineups. Providers execute searches and supply real blanks.
- `normalizeCollectionRules()`, `matchesCollectionRules()`, and
  `resolveCollectionMembers()` deterministically resolve manual, automatic,
  and hybrid membership. They operate on caller-supplied catalog rows, use
  allowlisted field/operators, and support explicit exclusions.
- `renderMerchHero()` is a sanitized, browser-compatible storefront renderer
  with a portable stylesheet. The same renderer powers editor previews.
- `renderMerchCollectionShowcase()` renders responsive, theme-coordinated
  product grids from **real product imagery only**, with an explicit missing
  media state. Host routes are supplied as `links.productBase` and
  `links.shop`; the core package does not prescribe storefront paths.
- There are **no routes, account IDs, D1 bindings, R2 buckets, or manufacturer
  credentials in this package**. The ecommerce CMS owns those interfaces.

The Fuel N Free Time installation's `CollectionLibrary` and
`CollectionEditor` TypeScript components consume these contracts. Its
`store_collection_rules` D1 table persists per-collection policies; legacy
manual memberships remain in `store_collection_products`.

## Provider adapters

Adapters only translate provider catalog metadata into a neutral selection context. The Completeful adapter knows field names such as `print_type` and `file_width`; manufacturing rules remain profile data.

## CLI kernel

The standalone proof is:

```text
agentsam-merch build <manifest.json> --all-compatible
```

The distributed AgentSam CLI can delegate `agentsam merch build ...` to the same `buildMerchPlan()` kernel.

Seed Completeful profiles are marked `operator-defined` until verified against provider documentation.
