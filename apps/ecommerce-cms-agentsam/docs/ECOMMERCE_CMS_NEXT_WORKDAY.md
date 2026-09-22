# ecommerce-cms-agentsam — next workday plan

**Reference deployment:** Fuel & Free Time (fuelnfreetime.com)
**Target:** `apps/ecommerce-cms-agentsam` as a portable product, F&FT as its first tenant.

Every item below is tagged for reuse value — this app's whole point is that work done here should pay off across F&FT, Inner Animals, Meauxbility, and any future `User123` tenant. **R = reuse now** (portable code/pattern, benefits ≥2 ventures today), **F = reuse later** (portable once genericized, not yet), **1x = single-tenant** (F&FT-specific, do it but don't over-engineer it).

---

## Confirmed architecture (no re-litigating tomorrow)

**Media pipeline — R.** This is the single highest-leverage decision in the doc, because every venture with a storefront/CMS needs it:

```
Admin/Content → Worker → R2 originals → Cloudflare Images transforms → storefront/admin/email/products
```

- R2 = canonical originals / asset ownership (never migrate off this)
- Cloudflare Images = transformation + optimized delivery only
- D1 = metadata / relationships / searchable catalog
- Browser never holds R2 credentials or PUTs directly — always Worker → `env.WEBSITE_ASSETS.put()`

Bounded variant vocabulary (don't generate arbitrary WxH — free tier caps at 5,000 unique transforms/mo):

| Variant | Size |
|---|---|
| thumb | 240 |
| card | 480 |
| medium | 800 |
| large | 1280 |
| hero | 1920 |
| social | 1200×630 |

**Provider content vs. our content — R.** This boundary applies to any future provider integration (Completeful today, something else tomorrow, on any venture):

```
PROVIDER CONTENT: provider origin → edge transform/cache → UI (never copied into our R2)
PROVIDER DATA:     provider API → R2 raw provenance + D1 hot catalog
OUR CONTENT:       admin upload → Worker → R2 originals → Images transforms → everywhere
```

Do not move the 13,495 Completeful images into our R2 — they own those assets. We cache/optimize what the UI needs, not what the provider has.

---

## P0 — Catalog + media performance (1x, but the *pattern* is R)

Current state: 49 products / 456 variants / 430 mockups / 62 print areas / **13,495** image rows in the hot mirror. One product has 4,356 image URLs in a browsing path that needs one.

```
Completeful raw payload → R2 (everything retained)
                        ↓ normalization
                D1 hot catalog: primary image, gallery subset,
                variant representative images, mockup refs, provider pointer
```

Catalog browsing requests one visual per card, loads more after selection. This matters as much as compression.

## P0 — Finish shared shell (R — this is the app-law pattern from `apps/README.md`)

Every admin URL mounts into one shell. No analytics shell, no legacy admin shell, no special-case shell because a route came from a donor repo.

```
Nav.Provider / ecommerce shell
├── Topbar
├── Sidenav
├── Account/store switcher
├── AgentSam
└── Page outlet
```

Shell contract (fixes the dead 20% region — no inventing a new fixed width):

```css
.console-workspace { display: flex; flex: 1 1 auto; min-width: 0; width: 100%; }
.console-main      { flex: 1 1 auto; min-width: 0; width: 100%; max-width: none; }
```

Then each page owns its own inner max-width: Home (centered) · Preferences (~920px) · Product edit (~1120px) · Product Studio (~1400px, responsive) · Analytics (~1640px, responsive) · AgentSam (full bleed) · Media library (wide responsive grid). Check wide/desktop/tablet/mobile.

---

## P1 — Media system as a formal primitive (R — highest reuse item after the pipeline itself)

`/admin/content` is already strong (folders, uploads, metadata, alt text, R2 key visibility, delete/save, product media selection) — formalize rather than rebuild:

```
media_assets: image · video · product artwork · generated artwork · storefront graphic · document
storage:   R2
metadata:  D1
delivery:  Cloudflare Images transforms (images) · R2 (everything else)
```

Fields: choose/upload/replace/remove, alt text, folder, usage/attached-to, dimensions, MIME, size, created/modified.

Reusable consumers (this is the actual payoff): Product · SEO/social image · page section · email · design studio · storefront. No more raw URL fields anywhere an owner should be picking an owned asset — that rule alone is worth carrying into the CMS-consolidation work on the inneranimalmedia side.

## P1 — Preferences repair (1x, but the fake-vs-real audit method is R)

Make the screen real instead of half-real: SEO/sharing (title, meta description, social preview + image picker, canonical URL, live preview, dirty state, save, validation, actual persisted storefront effect), then Store access / Spam protection / Geolocation / Language / Navigation — each one gets a pass sorting **actually implemented** from **pretty toggle that does nothing**. Anything fake gets implemented or visibly marked unavailable — no silent stubs.

## P1 — Markets (F)

First useful version, one market (United States: active, USD, English, storefront/domain, product availability, Stripe availability, fulfillment availability, shipping policy) + "Add market." Consume provider capabilities instead of hardcoding Completeful into the page — that's what makes this portable later (currency, language, country/region, domain/subpath, catalog availability, price adjustment, shipping zones, tax behavior, payment methods, fulfillment availability, storefront preview).

## P1 — Point of Sale (R — this is the standout reusable app inside the app)

Register UI, not another settings dashboard:

```
┌ Product search / barcode ──────────────────┐
│  Catalog          │  Current cart            │
│                    │  Tee       $28           │
│                    │  Tumbler   $22           │
│                    │  Customer / Discount /   │
│                    │  Tax / Total    $50      │
│                    │  [ Take payment ]        │
└──────────────────────────────────────────────┘
```

Per line item: **Take home now** vs. **Ship to customer**. Stack: Stripe (payment/refund/status) · Completeful (made-to-order fulfillment) · Resend (receipt/shipment comms) · F&FT inventory (take-home). Stripe Terminal is later, for card-present. Then: customer lookup, receipt/email receipt, discount, refund, order history, inventory decrement, fulfillment status, register/session totals. Any venture with in-person + online sales wants this exact shape.

---

## P2 — Crawler access (F)

Ship "Coming soon" tomorrow, not the current imaginary functional panel. Future: create authorization (name, scopes, allowed paths, expires, created, last used, revoke) with HTTP Message Signature-style credentials + example request. Useful later for AgentSam, an SEO auditor, authorized crawlers, private/staging content. Ordinary search engines don't need this.

## P2 — R2 hygiene (R)

Keep current CORS (GET/HEAD, approved origins only). Never expose `completeful/catalog-source/*`, `agentsam/*`, or internal metadata directly. Formalize lifecycle classes — this taxonomy is portable to any R2 bucket on any venture:

```
cms/originals/             durable
completeful/catalog-source/  version-retention policy
temporary/                 short TTL
agentsam/                  application-specific policy
```

Don't split into `ecommerce-media` / `ecommerce-private` buckets tomorrow just for architecture aesthetics — wait until there's a real reason.

## P2 — Finish making ecommerce-cms-agentsam a product (R — the whole point)

F&FT stays the reference deployment; the app becomes portable by extracting the last hardcoded assumptions into config seams:

```
AppHostConfig · BrandConfig · CommerceProvider · FulfillmentProvider · PaymentProvider · MailProvider · MediaProvider
```

F&FT supplies: Stripe, Completeful, Resend, Cloudflare R2, Cloudflare Images, F&FT branding. Remove from the reusable boundary: F&FT logo, F&FT domain, specific Completeful shop IDs, hardcoded brand colors, hardcoded provider assumptions.

---

## Suggested order for tomorrow (leverage-first, not doc-order)

1. **Shared shell** (P0) — every other screen you touch today sits inside this; fixing it once avoids re-fixing layout on every subsequent page.
2. **Catalog D1 hot-mirror normalization** (P0) — unblocks fast browsing, which every other admin screen depends on for testing.
3. **Media system formalization** (P1) — this is the item every future venture/app benefits from; do it before POS or Markets so both can consume it instead of re-inventing an image picker.
4. **Preferences fake-vs-real pass** (P1) — cheap, mechanical, clears debt before it compounds.
5. **POS** (P1) — highest standalone product value, but sequence after media/shell so it isn't built against a shell you're about to change.
6. Markets, Crawler access, R2 hygiene, config-seam extraction — P2, opportunistic.

## Status note

Not committed/pushed/deployed — repo execution handoff was declined this session. WIP is still on the feature branch. This file is the closure plan for when execution resumes.
