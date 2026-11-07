# Financial integrations + account billing: source acceptance

Date: 2026-11-07 (UTC). Scope: one AgentSam SDK lane, not a new billing system.

## Implemented and verified

- Dynamic mobile-first financial provider connect sheet in financial-analytics;
  HTTPS authorization handoff, explicit account/provider states, no fictional
  providers, and CSS safe-area/viewport support.
- Portable AgentSam Settings billing panel with authenticated host adapters,
  invoices, current subscription, validated hosted invoice links, and
  unavailable states. No assumed currency or forged zero-dollar bills.
- The Local Studio **web** host reads real account-scoped tool call receipts
  from its existing /api/analytics/tool-usage endpoint. The receipt now reports
  count of priced calls separately, so totals never turn missing cost fields
  into false free usage. Tool receipts are not total model/provider spending.
- CMS customer_billing manifest-backed app-embed entry, generated catalog,
  editor inspector and inert preview, and canonical site/page section/block
  installation. The theme link is always a host-owned authenticated route.

## Validation

- npm --prefix packages/financial-analytics run test
- npm --prefix packages/agentsam-settings run build
- npm --prefix packages/agentsam-settings run test
- node --test apps/local-studio/backend/worker/analytics-tool-usage-v2.test.mjs
- node --test apps/ecommerce-cms-agentsam/tests/theme-embed-review.test.mjs apps/ecommerce-cms-agentsam/tests/cms-site-api.test.mjs
- npm pack --dry-run --json on both packages; CSS and .d.ts exports included.

## Not yet launch-accepted

- No Stripe/PayPal customer authorization, live merchant account, or payment
  settlement has been tested. Existing IAM billing backend is separate from
  Local Studio's host; a verified deployment/API bridge is still required.
- CMS app-embed installation does not automatically implement a published
  storefront renderer. Template host mounting and an authenticated billing
  destination must be explicitly tested per site before a live payment CTA.
- No real iPhone Safari/VoiceOver acceptance yet.
- SDK CI clean external installs are blocked by the unpublished 2.6.14
  package train (including agentsam-workbench). Publishing requires
  authorized npm credentials. Do not treat successful source builds as npm
  publication or a completed customer billing launch.
