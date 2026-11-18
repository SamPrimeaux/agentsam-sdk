# AgentSam Growth — Increase Sales Starter Library

14 interactive, original sales campaign starters with separate visual compositions, configurable copy, offers, channels, desktop/mobile previews, local approval state, and exportable JSON.

**Scope:** Portable starter previews and configuration contracts. This does not add a CMS spine, a D1 table, a publishing engine, or a new admin route.

## Local build

```sh
cd apps/ecommerce-cms-agentsam/apps/growth/starter-packs/v1
npm test
npm run pack
open dist/index.html
```

## R2 storage

Bucket: `cms`
Prefix: `growth/starter-campaigns/increase-sales/v1/`
ZIP object: `growth/starter-campaigns/increase-sales/v1/agentsam-growth-increase-sales-v1.zip`

117 generated files plus the ZIP are stored in R2; the R2 ZIP and manifest were independently downloaded and byte-compared against the original local build.

The previews are **demo-only** and cannot make real purchases, send messages, charge advertisers, or publish to storefronts. Production integration must use existing account/site ownership, CMS, products, discounts, consent, publishing, order, and attribution services in `inneranimalmedia-business`. R2 is private; no public preview route is implied.

Source: `src/catalog.mjs`, `src/preview.js`, `src/style.css`, `build.mjs`, `upload-r2.mjs`.
Generated outputs (`dist/`, `release/`) are ignored by Git because the distribution resides in R2.
