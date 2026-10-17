# FNF live CMS bootstrap — 2026-10-07

FNF Worker binding: `wrangler.toml` database `9fd6ff92-e407-4b51-8b01-3c93f3845bb2`, bucket `fuelnfreetime`.

Applied `db/migrations/002_cms_definitions.sql` through the authorized D1 connector. Read-back confirmed `cms_definitions` exists alongside the original six canonical tables.

Seeded 4 tenant-scoped draft definitions for existing runtime keys: section `collections`; blocks `collection-card`, `feature`, and `value`. The existing instances and published storefront were not modified. They remain draft definitions until their actual renderer, inspector and artifact binding are verified.

The live `cms_artifacts` table currently has **zero rows** and has a different shape from the local reference `db/schema/cms.sql`: the live table uses `r2_prefix`, `manifest_r2_key`, `content_mode`, and `content_hash`. Reconcile that drift before adding any writer or generated artifacts; do not deploy the local reference over the live table.

R2 bucket `fuelnfreetime` is accessible and contains `cms/pages/about/draft/*` and `cms/pages/about/history/*` data. No R2 code-bundle write was made or claimed. Existing media delivery and asset references remain unchanged.

Next: produce an idempotent tenant-aware importer using the existing section/block registry; wire definition resolution to the current Theme Studio and artifact schema; verify renderer/edit/reload/publish before activating catalog entries.

