# FNF live CMS bootstrap — 2026-10-07

FNF Worker binding: `wrangler.toml` database `9fd6ff92-e407-4b51-8b01-3c93f3845bb2`, bucket `fuelnfreetime`.

Applied `db/migrations/002_cms_definitions.sql` through the authorized D1 connector. Read-back confirmed `cms_definitions` exists alongside the original six canonical tables.

Seeded 4 tenant-scoped draft definitions for existing runtime keys: section `collections`; blocks `collection-card`, `feature`, and `value`. The existing instances and published storefront were not modified. They remain draft definitions until their actual renderer, inspector and artifact binding are verified.

The live `cms_artifacts` table currently has **zero rows** and has a different shape from the local reference `db/schema/cms.sql`: the live table uses `r2_prefix`, `manifest_r2_key`, `content_mode`, and `content_hash`. Reconcile that drift before adding any writer or generated artifacts; do not deploy the local reference over the live table.

R2 bucket `fuelnfreetime` is accessible and contains `cms/pages/about/draft/*` and `cms/pages/about/history/*` data. No R2 code-bundle write was made or claimed. Existing media delivery and asset references remain unchanged.

Next: produce an idempotent tenant-aware importer using the existing section/block registry; wire definition resolution to the current Theme Studio and artifact schema; verify renderer/edit/reload/publish before activating catalog entries.

## Wave 1 — site-first CMS migration (prepared, not applied)

The final CMS revision wave now has an explicit SQLite/D1-compatible migration at `db/migrations/004_cms_site_first.sql` and a guarded runner at `db/schema/migrations/cms-site-first.mjs`. It backfills one default site per account, moves canonical page/section/block/global/revision ownership to that site, and adds site navigation, immutable release records and mixed-content CMS collections. Existing IDs and object keys are preserved; R2-specific column names are renamed to provider-neutral object-key names.

The migration is covered by local data-preservation, idempotency, cross-account isolation and foreign-key tests. It has **not** been applied to the live Fuel N Free Time D1 database. The live schema shape noted above must be re-read and reconciled against this exact migration before any production apply. No live D1 or R2 resources were changed by this wave.

**Portability boundary:** the migration/schema names are provider-neutral at the CMS data layer, but the current runtime still reads/writes through the `WEBSITE_ASSETS` R2 binding (`backend/cms/r2-store.js` and generated-section paths). AgentSam-injected object-store capabilities, local-filesystem/S3 adapters, and a PostgreSQL dialect migration are not yet complete. Treat those as explicit follow-on integration work, not as delivered by this migration.
