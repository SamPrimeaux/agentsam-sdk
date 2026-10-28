# AGENT 2 — CMS systems auditor and compatibility owner

## Mission

Audit and classify all active / legacy / duplicate CMS runtimes, data schemas,
adapters, storefront previews, theme packages, SDK components and R2 paths.
Prove what is canonical, what is merely a facade, what is outdated but still
invoked, and what is safe to replace. Start READ-ONLY. Deliver a migration
plan based on evidence, not guesses or green tests in isolated repos.

## Repositories and working tree protection

1. /Users/samprimeaux/inneranimalmedia-cms
   - Remote named editorial-commons (do not assume origin remote).
   - Current feature branch contains uncommitted runtime/schema changes.
   - Separate worktrees of the same Git repository include portable Studio
     features and brand-specific builds. Inventory before consolidation.
2. /Users/samprimeaux/agentsam-sdk
   - Current local main contains source-backed Resolve, Violet, Plain Jane.
   - packages/agentsam-cms has the operation engine and Node adapter.
   - packages/cms-runtime has currently packaged schema v1.
   - apps/ecommerce-cms-agentsam/backend/cms has FNF-side CRUD and R2.
3. /Users/samprimeaux/inneranimalmedia
   - Host dashboard under app/dashboard/pages/cms.
   - API composition root src/api/cms.js and cms-routes modules.
   - Canonical CMS adapters under src/core/agentsam/cms.
   - D1 and R2 bindings in config/projects/inneranimalmedia.deploy.json.

NEVER reset/clean, rename original tables, merge dirty worktrees, or run a
schema script against live CMS D1 during audit. Never treat existing
branch-local uncommitted changes as merged main.

## Audit dimensions

A. Source-of-truth and runtime reachability
  Trace each route from dashboard /sites (public/host alias) through CMS shell
  and frontend assets to its API. Trace FNF /admin/store and /admin/theme-editor
  separately, noting duplicated inline store.js vs store.html implementations.
  Find import path or actual runtime call evidence for every module classified
  as canonical. A description or README is insufficient by itself.

B. Schema comparison
  - Standalone CMS v2 schema uses cms_page_sections / cms_section_blocks.
  - SDK node operations reference cms_sections / cms_blocks, using v1 schema.
  - SDK cms-runtime currently exports cms-local-runtime.v1.sql.
  - Journal seed uses 11 cms_* tables and is only a seed; not migration.
  - Host D1 schemas and actual deployed schema need a SAFE read-only query
    with workspace scoping and current migrations inspected first.
  - Flag field mismatches (site_id, account_id, workspace_id, version,
    definition_key, schema_json, settings_json, sort_order, deleted/status,
    draft revision, published snapshot) and FK/unique/index differences.
  - Preserve versioned adapter compatibility until data is proved migratable.

C. CMS CRUD and publishing contract
  Follow real operations: create page -> add section -> add block -> media
  resolve -> change inspector field -> autosave/version CAS -> draft preview
  -> revision restore -> authorized publish -> live hydration -> rollback.
  Trace auth and permission on every transition. Exclude demo fixtures.
  For a nonworking step give exact request/response and missing dependency.

D. Theme and app package contract
  For Resolve, Violet and Plain Jane: package manifest, source_sha,
  build and compiled site, CMS registry definitions, settings_schema,
  R2 assets, preview path, D1 binding, artifact SHA, install/release state.
  Compare FNF, host Sites, local Studio and SDK catalog.
  Distinguish merely packed from actually installable/publishable.
  Assess how agentsam.app.json permissions/entitlements fit the same catalog.

E. Storage
  Verify CMS_DEFAULT_R2_BUCKET = cms, public origin
  https://cms.inneranimalmedia.com, and actual env.CMS_BUCKET presence.
  The current helper falls back to ASSETS/R2, which can conceal a missing
  dedicated binding; report where read fallback masks write authority.
  Inspect R2 object key conventions, site/tenant scoping, cache invalidation,
  immutable releases, content hashes, preview/live access and URL signing.
  Do not upload private customer data or trial ZIPs to the public CMS origin.

F. Worktrees, dead code and historical migrations
  Enumerate exact git worktree status, current SHA and diverged commits.
  Classify each candidate as:
  verified_canonical | active_compatibility_facade | legacy_still_called |
  unreachable_or_deprecated | generated_fixture | unknown_needs_trace.
  A file may be deprecated-looking yet active through the Worker dispatcher.
  No pruning until callgraph / tests / deployment references prove non-use.

## Safe lab plan

Run tests using local SQLite and disposable temp directories first. The
standalone CMS repo is a suitable CONTRACT LAB, not an automatic source of
host production data authority. Protect its current uncommitted branch. Use
a separate audit-only worktree or clean isolated test copy if tests require
mutation; do not create another product implementation.

For R2 integration, propose a private non-production bucket (or an explicitly
private restricted binding) and short-lived namespace such as
cms-lab/<test-run-id>/<package-sku>/. The existing CMS_BUCKET may be
publicly served; never assume that a prefix alone enforces privacy.
Do not create buckets or write cloud objects without separate approval.
Use ARTIFACTS for release candidates only after confirming policies.

## Concrete outputs

1. CMS authority map: path/owner/backend/runtime/schema + evidence.
2. Table/column-level schema matrix (standalone v2, SDK v1, FNF D1, host D1).
3. Legacy/refactor classification CSV with verified import/runtime links.
4. CRUD transaction trace with real status for each operation.
5. R2 object provenance and isolation/retention plan.
6. Migration strategy: bridge adapters first, backfill/read-compare, version
   gate, dual-read only when justified, separate publish and rollback.
7. PR sequence with one owner per file; acceptance tests and rollback plan.
8. Honest blocked/unverified items (especially D1 production introspection).

## Audit commands (safe and illustrative)

git status -sb
git worktree list
rg -n "^CREATE TABLE|cms_page_sections|cms_sections" schemas/sqlite
node --test packages/agentsam-cms/test/standalone.test.mjs
node --test packages/cms-runtime/test/runtime.test.mjs
python3 -m unittest discover -s test -p "test_*.py"

Read-only queries may be used only after account/workspace authorization is
known. Do NOT execute a seed, drop/rename table, write R2 or run migrations
to demonstrate parity.

## Initial evidence already collected

- Standalone CMS source: 16 v2 tables, including cms_page_sections and
  cms_section_blocks. Test suite: 22 passing, despite dirty branch.
- SDK runtime: v1 sqlite contract; SDK Node adapter still issues queries
  against cms_sections and cms_blocks; 3 package tests passing.
- Journal: 11 inserted CMS tables and 9 pages / 18 definition keys.
- Host deploy config binds CMS_BUCKET -> cms and ARTIFACTS -> artifacts;
  CMS R2 custom domain appears public and helper has legacy fallback paths.
- Current /sites screenshot has empty preview plus contradictory Active badge.
- Standalone CMS repo has multiple in-progress worktrees and no simple
  guaranteed 'clean main' for destructive branch operations.

## Definition of done

Agent 1 can consume a signed-off normalized schema/API and theme install
state without conditional per-repo hacks. CRUD, published revision snapshots,
R2 content and live URLs are proven end to end in one isolated tenant.
No customer data loss; no duplication; no fake installation claims.
