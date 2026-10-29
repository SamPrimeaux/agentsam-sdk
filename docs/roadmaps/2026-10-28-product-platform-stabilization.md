# Stabilize AgentSam Sites, Theme Studio, Ecommerce CMS and Apps

Status: execution roadmap / design + audit briefs, not an implementation receipt
Baseline: 2026-10-28
Source implementation: agentsam-sdk, commit 7a9097d4 or later on current local main
Host application: SamPrimeaux/inneranimalmedia (do not overwrite its dirty branch)
CMS product source: /Users/samprimeaux/inneranimalmedia-cms, remote editorial-commons
Existing source snapshots: Resolve, Violet and Plain Jane Journal package roots

## Outcome

Make the existing hosted Sites / Online Store, ecommerce CMS, CMS editor,
local Theme Studio, SDK theme packages and future Apps one coherent product
surface. Every public control must correspond to a real server capability,
draft, installed package, or a truthful unavailable/empty state.

A customer can ultimately select a product, preview it with its REAL authored
theme, install a compatible version into an owned site, edit actual sections,
blocks, navigation, assets and theme tokens, preview drafts, publish after
approval, update and roll back. The first milestone DOES NOT enable payment
or unattended production installation.

Do not create another bespoke UI or competing CMS schema. Extend canonical
source, use packaged product contracts, and preserve current customer content.

## Ownership and concurrency

Agent 1 — Product UI and workflow:
  SDK: apps/ecommerce-cms-agentsam/frontend/static/
  SDK: apps/client-cms-editor/ and apps/local-studio/ only when needed
  SDK: packages/catalog/src/theme-products.mjs and theme contract consumers
  Host dashboard: app/dashboard/pages/cms/ and shared UI components
  UX testing, responsive navigation, theme catalog, honest state machine,
  and structured inspectors. No database migrations.

Agent 2 — CMS authority and compatibility auditor:
  Read-only inspect SDK packages/agentsam-cms, packages/cms-runtime,
  apps/ecommerce-cms-agentsam/backend/cms, hosted src/api/cms-routes,
  hosted src/core/agentsam/cms, standalone CMS repo, CMS R2 binding contracts.
  Reconcile D1 schema, SQLite v1/v2, R2 routes and package manifests.
  Produce evidence + plan; no destructive commands or production writes.

Agent 1 CAN work on UI-only states and source-backed preview catalog in
parallel. Agent 1 MUST NOT implement authenticated customer writes or claim
install/live status until Agent 2 confirms authoritative endpoints, schema
mappings and tenant requirements. Agent 2 MUST NOT edit Agent 1's UI files.
Cross-cutting API contracts require a brief shared agreement before edits.

## System-of-record boundaries

Auth, workspace ownership, purchase entitlements, tenant bindings: host.
Product catalog SKU, package, version, license, capabilities: SDK manifest
and server release catalog, not arbitrary browser records.
CMS page/section/block definitions: canonical compatible schema, identified
and approved by Agent 2 before migrations.
Compiled theme and original media: immutable artifacts in versioned object
storage, indexed by checksum.
CMS editor: consumes definitions and instance data; no separate editor chrome
inside a reusable storefront theme.
Publishing: separately authorized and receipt-producing backend action.
Local dev preview: read-only fixtures expressly marked preview; no false
live, purchased, installed, or published states.

Use existing Cloudflare CMS_BUCKET / cms R2 binding for CMS content where
host contracts already use it. The cms bucket has public origin
https://cms.inneranimalmedia.com, so DO NOT put confidential customer copies
or unreviewed preview ZIPs there. Prefer local SQLite and fixtures first, then
an isolated private testing bucket and scoped keys with explicit controls.
Existing ARTIFACTS bucket is a logical candidate for immutable release bundles
only after permissions and accessibility policies are confirmed.
No production R2 writes in this wave.

## Rollout waves and dependencies

W0 — Establish proof baseline:
  - Capture current screenshots for desktop, tablet and narrow mobile.
  - Verify exact source route for hosted /sites and online-store shell.
  - Record active site, preview URL and saved draft source separately.
  - Inventory local clean/dirty branches; never reset uncommitted work.
  - Publish accepted source-of-truth table and surface inventory.
  - Keep a known rollback commit for each repo.

W1 — Studio foundation and truthful empty states (Agent 1):
  - Fix "No active theme" + "Active" contradiction, blank iframes,
    first-time install path, error + retry and unsupported controls.
  - Make no-theme, no-page, no-blog, no-product and no-app states actionable.
  - Responsive compact app shell: rail transitions, mobile sheet/dock,
    desktop drag/resize only where supported, no nested horizontal overflow.
  - Keep editor routing, sections, field selection, save and draft semantics.
  - Put Browse Templates in Sites and Online Store; use package-owned
    manifest and preview identity, not hardcoded bespoke demos.

W2 — Theme Studio authoring parity (Agent 1 with Agent 2 contracts):
  - Shared page/resource picker for page/product/collection/blog/article,
    customer account, cart, search, password, error and editable custom page.
  - Show actual section -> block hierarchy and a schema-generated inspector.
  - Theme global settings: logo/favicon, colors, type, motion, spacing,
    buttons, product cards, variants, forms, search, cart, drawers and media.
  - Single draft preview and authenticated publication pathway.
  - Exact article/page identity persists through navigation and refresh.
  - AgentSam assistance only when actual authenticated proposals work.

W3 — CMS adapter/contract convergence (Agent 2 findings required):
  - Compare 16-table standalone v2 vs packaged v1 and hosted D1 reality.
  - Choose one canonical persisted shape for each runtime/adapter.
  - Build transparent translation adapter where compatibility requires it;
    do not silently drop fields or rewrite all customers at once.
  - Add contract fixtures for Journal, Resolve, Violet and one real
    customer-owned site (only with permission and scrubbed read-only data).
  - Versioned, tenant-scoped edit/preview/revision/publish smoke tests.

W4 — Productization:
  - Promote compatible packages through draft -> reviewed -> released.
  - R2 immutable release bundle + SHA256 + provenance + preview images.
  - Authenticated catalog, entitlement, scoped download, staged install,
    install receipt, version compatibility, delta update and rollback.
  - Apps use same product catalog with additional permission/connection
    scopes. No second checkout or separate Apps marketplace data authority.
  - Only after W0-W3 acceptance is any product labeled installable.

## Exit criteria and evidence

- Every UI state truthfully represents a backend state, with explicit reason
  and next action when unavailable. No "Active" without authoritative theme.
- Every theme card resolves to source package, version, manifest, tested
  preview and known release state.
- Real authored source fidelity on Resolve, Violet, Plain Jane and Fuel N Free
  Time. No newly invented visuals that replace the packaged theme.
- Page and section edits survive save, reload, route changes and draft
  preview; live remains unchanged before publish.
- All narrow viewports render without body-level horizontal scrolling;
  primary actions have accessible focus and at least 44px touch targets.
- Cross-repo schema + CMS authority test matrix is green, or precise
  blocked gates are recorded (no inferred success from separate test suites).
- D1 and R2 tenant isolation, no unintended customer writes or public
  preview leaks; explicit rollback and content hash receipts.
- Agent 1 presents desktop/mobile before/after evidence and tests.
- Agent 2 submits a classified module inventory, schema diff, authority
  graph and migration-safe PR plan, with no destructive migration.
- Do not publish, deploy, charge, modify customer themes or mark installed
  without separate authorization and passing integration gates.

## Related references

docs/architecture/AGENTSAM-PRODUCT-CATALOG-RELEASES-20261028.md
docs/agent-briefs/2026-10-28-agent1-ui-product-foundation.md
docs/agent-briefs/2026-10-28-agent2-cms-audit.md
docs/audits/2026-10-28-cms-platform-seam-baseline.md
GitHub issue: SamPrimeaux/inneranimalmedia#495 (hosted Sites gallery and status).
