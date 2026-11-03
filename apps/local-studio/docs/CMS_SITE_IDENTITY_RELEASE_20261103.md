# CMS page identity — release notes (2026-11-03)

## Decision implemented

cms_sites.id is the only page ownership key. cms_pages.site_id is the only
page-to-site relationship. Account ownership is resolved through
cms_sites.account_id; it is not copied onto every page.

A page's stable identity is cms_pages.id. Its site-local URL identity is the
pair (site_id, route_path) / (site_id, slug).

No cms_artifacts registry is introduced by this change. Existing section and
block composition remains in cms_page_sections and cms_section_blocks.

## Production D1 preflight

Read-only audit of inneranimalmedia-business before the migration:

- 79 page rows across 12 sites.
- 0 pages without a matching cms_sites.id.
- 0 duplicate (site_id, slug) pairs.
- 0 duplicate (site_id, route_path) pairs.
- One site (inneranimalmedia) has two distinct legacy project_id values.
- All 79 legacy path values are equivalent to either route_path or r2_key.
- All 79 is_homepage flags agree with route_path = '/'.
- One archived page is incorrectly marked is_active = 1; status is the
  authoritative lifecycle field.
- 42 pages have an R2 object key, 18 have an R2 URL, 18 have a published
  manifest key, 4 have non-empty analytics JSON, and 6 are system pages.
- The existing cms_mig_backup_cms_pages snapshot contains 72 rows, so it is
  not a complete rollback snapshot for the current 79-row table.
- The global foreign-key audit reports two pre-existing violations in
  account_identities -> accounts. The CMS page/section/block/Liquid/live-edit
  tables have zero violations. This migration does not alter account identity
  tables or attempt to repair those unrelated records.

## Schema migration

backend/migrations/1350_cms_pages_site_identity.sql:

1. Snapshots the current page, section, nested block, Liquid-section, and
   live-edit-session tables before changing their schemas.
2. Rebuilds cms_pages with site_id as its sole ownership key.
3. Rebuilds the dependent tables together because page sections and imported
   Liquid sections have a nullable reference cycle; nested blocks and live
   edit sessions also reference the old page graph.
4. Replaces project-scoped uniqueness with UNIQUE(site_id, slug) and
   UNIQUE(site_id, route_path).
5. Removes duplicate or derived page fields:
   project_id, project_slug, workspace_id, worker_id, person_uuid,
   path, is_homepage, and is_active.
6. Retains the full page content/SEO/R2/publication data, is_system_page,
   requires_auth, sort order, authorship, timestamps, section content,
   Liquid mappings, block trees, and live-edit sessions.
7. Recreates the site, status, route, definition, template, section, block,
   and system-page indexes.

The path field is safe to remove because the preflight found no row where it
contains a value that is not already represented by route_path or r2_key.
is_homepage is derived from route_path = '/'; is_active is superseded by
status.

The migration uses PRAGMA defer_foreign_keys = ON, not foreign_keys=OFF.
The migration test runs the full dependency graph in a transaction and
verifies that page sections, Liquid mappings, nested block parents, and live
edit sessions survive. It checks each rebuilt CMS table independently and
confirms that the only remaining global foreign-key results are the two
pre-existing account_identities rows.

## Application changes

- Local Studio's CMS D1 client scopes page, section, and block operations
  through the authorized site_id.
- Site discovery and access checks use cms_sites directly. Shared-D1 site
  responses no longer invent project_id, tenant_id, or workspace_id aliases.
- Source HTML draft writes use WHERE id = ? AND site_id = ?.
- The Ecommerce CMS site-owned page adapter reads and writes the same
  site_id model, including page SEO, metadata, template, navigation, and
  access fields.
- Legacy schema detection keeps reads available but returns an explicit
  migration-required response for new page creation until the D1 migration is
  applied. This prevents a partially upgraded Worker from writing into the
  old required project_id / project_slug columns.

## Release order and current blocker

The Worker must be deployed before the D1 rebuild so the old schema remains
readable while the new code is in place. New page creation is deliberately
gated with HTTP 503 during that short transition. Apply the CMS migration only
after the Worker update is ready.

DO NOT run the default remote wrangler d1 migrations apply yet. The remote
migration inventory currently has four earlier, unrelated pending migrations
ahead of this one:

- 1345_local_studio_company_branding_cf_oauth.sql
- 1346_agentsam_tools_account_scope.sql
- 1347_agentsam_widget_persistence.sql
- 1349_projects_metrics_time_ssot.sql

Those migrations need an explicit release decision before using the normal
migration runner; otherwise the command will apply them along with 1350.
No production migration has been applied by this work.

After the pending migration sequence is reconciled, verify:

~~~sql
SELECT COUNT(*) AS pages FROM cms_pages;
SELECT COUNT(*) AS backup_pages FROM cms_mig_backup_cms_pages_20261103;
SELECT COUNT(*) AS missing_sites
FROM cms_pages p LEFT JOIN cms_sites s ON s.id=p.site_id
WHERE s.id IS NULL;
SELECT site_id, slug, COUNT(*) AS n
FROM cms_pages GROUP BY site_id, slug HAVING COUNT(*) > 1;
SELECT site_id, route_path, COUNT(*) AS n
FROM cms_pages GROUP BY site_id, route_path HAVING COUNT(*) > 1;
PRAGMA foreign_key_check;
PRAGMA foreign_key_check(cms_pages);
PRAGMA foreign_key_check(cms_page_sections);
PRAGMA foreign_key_check(cms_liquid_sections);
PRAGMA foreign_key_check(cms_section_blocks);
PRAGMA foreign_key_check(cms_live_edit_sessions);
~~~

Expected: 79 pages, 79 page-backup rows, zero missing sites, no duplicate
result rows, and zero violations in each CMS table. The global foreign-key
check will continue to show the two pre-existing account_identities rows;
this CMS migration intentionally leaves that unrelated table untouched.

## Verification completed on the Mac

- npm run verify:cms in apps/ecommerce-cms-agentsam: 54 passed.
- npm run verify:cms:canonical at repository root: 14 passed.
- Site-scoped Local Studio CMS D1 client integration tests: pass.
- CMS migration rebuild and child-FK preservation tests: pass.
- Full apps/local-studio npm run cf:dry-run: pass.
  - All included apps built and staged.
  - Local Studio output verification passed.
  - Worker route smoke tests passed.
  - Wrangler completed its deployment dry-run and read the production bindings.
- No Worker deployment or production D1 migration was performed.
