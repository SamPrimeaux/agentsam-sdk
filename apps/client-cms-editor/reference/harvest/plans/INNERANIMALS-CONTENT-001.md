# INNERANIMALS-CONTENT-001 — Replace storefront concepts with owned content and commerce data

## Status

- Priority: P1
- Project: `studio-cms-editor`
- Subsystem: `inneranimals-content`
- Owner: Agent Sam with Sam Primeaux as content approver
- State: backlog
- Production surface: `https://inneranimals.com`
- Editor surface: `https://inneranimals.com/studio`

## Objective

Turn the approved Inner Animals public-site scaffold into a production storefront using Sam's real brand content, products, photography, inventory, editorial work, and checkout. Preserve the current visual system, route structure, responsive behavior, and the original CMS editor at `/studio`.

This is a content and data-plumbing pass, not a redesign.

## Source-of-truth rules

- Routine copy, images, product details, collections, articles, and campaign settings must be editable through the CMS/data layer rather than hardcoded React arrays.
- Use owned or explicitly licensed assets stored in the project's Cloudflare media system. Remove demo photography before launch.
- Existing Shopify/catalog data may be imported when Sam identifies it as authoritative.
- Never invent prices, inventory, fabric composition, GSM, performance claims, testimonials, athlete quotes, release dates, or shipping promises.
- Draft missing copy in the established voice, but mark factual gaps for approval.
- Preserve `/studio` and do not move the editor into IAM dashboard routes under this ticket.

## Workstreams

### 1. Brand foundation

- Confirm display name, wordmark/logo variants, favicon, social preview image, campaign lockup, and announcement-bar copy.
- Replace placeholder metadata and social sharing content on every public route.
- Finalize the hero statement, manifesto excerpt, CTA labels, and voice rules.

### 2. Asset migration

- Inventory usable product, campaign, founder, community, and editorial media.
- Upload approved originals to Cloudflare storage and record stable asset IDs/URLs.
- Create responsive crops and useful alt text; preserve original files.
- Replace every demo/Unsplash asset on production.

### 3. Product catalog

For every live product, map and verify:

- name, slug/handle, collection, price, compare-at price if applicable
- status, inventory policy, sizes, colorways, variants, and SKU
- product description, fit, intended use, material, care, and GSM when known
- studio imagery, campaign imagery, alt text, and display order
- size guide, model measurements, shipping/returns note, and related products

Do not publish a field that has not been verified from Sam's source data.

### 4. Homepage population

Populate the existing modules without changing their approved layout:

- cinematic campaign/drop hero
- Shop by Instinct: Train, Recover, Roam, Everyday
- Issue 001 featured products
- manifesto break
- Wolf, Bear, Panther, and Bull archetypes, unless Sam renames them
- field film or training story
- Field Journal highlights
- The Pack community gallery
- Join the Pack membership/email capture

### 5. Collections and product pages

- Populate `/shop` and each approved collection with real catalog data and filters.
- Populate product routes with verified variants, sizing, fit, media, specifications, availability, and related editorial content.
- Keep sticky mobile purchase controls and ensure unavailable variants cannot be purchased.

### 6. Story and journal

- Replace concept copy in `/story` with the approved founder story, manifesto, and brand code.
- Publish the first approved journal articles with author, date, excerpt, hero media, body, SEO fields, and related products.
- Do not fabricate community or athlete stories.

### 7. Commerce and lifecycle wiring

- Connect the authoritative catalog, cart, inventory, and checkout provider selected by Sam.
- Connect Join the Pack to the approved email/CRM destination with consent language and a confirmed success state.
- Record orders and leads in the appropriate system without exposing secrets in the browser.
- Add analytics events for product view, collection view, add to cart, checkout start, purchase, article view, and signup.

### 8. CMS editing contract

- Model homepage modules, navigation, collections, products, journal entries, story content, SEO, and campaign settings in the CMS/data layer.
- Map those records to the public routes with loading, empty, and error states.
- Ensure changes can be previewed and published from `/studio` without editing source files.
- Preserve drafts and prevent unpublished content from leaking into public responses.

### 9. Accessibility, SEO, and legal checks

- Meaningful alt text, keyboard access, visible focus, reduced motion, and WCAG AA text contrast.
- Unique titles/descriptions, canonical URLs, Open Graph data, product structured data, article structured data, sitemap, and robots behavior.
- Link approved privacy, terms, returns, shipping, and contact policies before enabling checkout.

## Inputs required from Sam

1. Identify the authoritative product/inventory source and the products included in Issue 001.
2. Provide or approve logo files and the first campaign/product image set.
3. Approve the hero headline, manifesto, and founder-story source.
4. Confirm whether Wolf, Bear, Panther, and Bull remain the collection archetypes.
5. Choose the checkout provider and newsletter/CRM destination.
6. Provide or approve shipping, returns, privacy, and terms content.

Agent Sam may infer formatting, navigation labels, copy polish, alt-text drafts, responsive crops, and product ordering. It must pause for approval when a missing answer would create a factual claim or irreversible commerce setting.

## Acceptance criteria

- No placeholder, concept, or unlicensed imagery is visible on production.
- Every public route is populated, linked, responsive, and scrollable.
- Product facts, prices, variants, and inventory match the authoritative source.
- Cart and checkout work end-to-end, or non-purchasable products use an explicitly approved waitlist state.
- Routine content changes are possible through the CMS without a code deploy.
- `/studio` remains functional and visually unchanged.
- Mobile QA includes navigation, filtering, product selection, sticky purchase controls, forms, and checkout on a 375px viewport.
- Keyboard, reduced-motion, image-alt, contrast, SEO, sitemap, and structured-data checks pass.
- Production verification covers `/`, `/shop`, every collection, at least one product, `/journal`, one article, `/story`, and `/studio`.

## Evidence and handoff

Attach to the ticket before shipping:

- source PR and deployed commit
- imported catalog record count and rejected/error count
- Cloudflare asset identifiers for the approved media set
- CMS record identifiers or export snapshot
- live-route verification results and checkout receipt/test order
- list of any intentionally deferred fields or assets

## Suggested Agent Sam kickoff

Read this plan, inspect the current public routes and CMS schema, then produce a content inventory that separates: ready to import, needs Sam approval, and missing. Do not redesign the scaffold. Begin implementation only with verified source material, keep the site deployable after each workstream, and report blockers as specific content decisions rather than substituting invented facts.
