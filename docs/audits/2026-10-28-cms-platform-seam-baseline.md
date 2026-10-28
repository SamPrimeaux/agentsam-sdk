# CMS/platform seam baseline — read-only findings

Audit date: 2026-10-28
Scope: local source checks, Git status, package declarations and tests.
Classification: PRELIMINARY — not a production database or R2 object audit.

## Known issues and source evidence

P0 / Schema divergence:
  - /Users/samprimeaux/inneranimalmedia-cms/schemas/sqlite/cms-local-runtime.v2.sql
    defines 16 cms_* data tables, including cms_page_sections and
    cms_section_blocks. Standalone branch fix/cms-schema-v2-site-contract-20261017
    has uncommitted changes (do NOT overwrite).
  - agentsam-sdk/packages/cms-runtime/schemas/sqlite/cms-local-runtime.v1.sql
    remains SDK-published schema entry; its package.json exports v1.
  - agentsam-sdk/packages/agentsam-cms/src/node-sqlite-repository.js
    accesses cms_sections and cms_blocks from the v1 family.
    The SDK packages do not yet prove shape parity with standalone v2.
  - agentsam-sdk/packages/theme-plain-jane/source/seed/plain-jane-journal.sql
    inserts into 11 CMS tables. A seed is not an upgrade plan.
  Action: table/column diff, choose a canonical schema with explicit
  compatibility adapters before any table rename, drop or tenant migration.

P0 / Hosted false-state UI:
  - Screenshot of agentsam.inneranimalmedia.com/sites shows empty desktop
    and mobile previews while "No active theme" is paired with "Active".
  - SDK ecommerce CMS frontend/static/store.html contains static Active
    badge; frontend/static/js/store.js inserts No active theme fallback.
  - This code seam is a plausible root cause but hosted runtime routing
    must be traced before saying that exact file is what generated screenshot.
  Action: trace source for hosted route; implement explicit missing/failed/
  loading/ready theme statuses and remove Active badge when no identity.

P1 / Preview/product contract gap:
  - SDK local package catalog lists Resolve, Violet and Plain Jane as
    preview-ready but installed:false and purchasable:false.
  - SDK preview server is a local read-only environment, not authenticated
    installation. Journal's static ZIP has hash and 9 physical deep links.
  - Existing Studio selectors and storefront readers use different data
    sources/fixtures and can diverge.
  Action: shared authenticated catalog reader, separate preview-vs-installed
  identity, safe page manifest adapter, no duplicate UI catalog.

P1 / Storage authority:
  - Host src/core/agentsam/cms/adapters/cloudflare/storage.js sets
    CMS_DEFAULT_R2_BUCKET to cms and public origin cms.inneranimalmedia.com.
  - Host config/projects/inneranimalmedia.deploy.json maps CMS_BUCKET to cms,
    ARTIFACTS to artifacts, DB to inneranimalmedia-business.
  - getCmsR2Binding for cms can fall back to ASSETS or R2. Must verify
    actual binding and read/write boundary; do not infer bucket availability
    from configuration alone.
  Action: local test first, private R2 lab only with scoped credentials and
  explicit approval. Prefixes alone do not make publicly served buckets private.

P1 / Dirty tree and divergent workstreams:
  - inneranimalmedia-cms has branch-local uncommitted edits in runtime code,
    manifest/schema and tests, with multiple worktrees (including Studio
    and Resolve migrations). Reconcile current work before merging/pruning.
  - inneranimalmedia host is also on dirty feature worktree. Do not reset it.
  - SDK local main was ahead of origin/main when this baseline was taken.
  Action: freeze destructive cleanup, document branch SHA, changed paths,
  and ownership; accept only tested, reviewed fast-forward/PR migrations.

## Current test evidence

- python3 -m unittest discover in inneranimalmedia-cms: 22 tests, pass.
- node --test SDK cms-runtime and agentsam-cms: 3 tests, pass.
- The tests run independently; they DO NOT validate cross-runtime schema
  compatibility, customer D1 data, R2 durability or hosted UI screenshots.

## Compatibility decisions not yet made

- Does hosted D1 currently match v2 names/columns or legacy variants?
- Which existing published snapshot and change-version fields are mandatory?
- Are FNF's commerce CMS tables a customer-specific adapter or a parallel
  authority needing migration?
- Is the public /sites route mounted from SDK static HTML, hosted React CMS
  shell, or another adapter for this particular workspace?
- Which of the many CMS worktrees contains the latest reviewed canonical
  Studio behavior?
- Is the artifacts bucket private and suitable for immutable signed ZIPs?
- Which components are still invoked by production Workers despite being
  marked legacy in comments?

These must be answered through Agent 2 evidence before enabling any
production CMS installer, data merge or deprecation.
