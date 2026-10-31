# AgentSam — reusable themes, templates and apps

> **Contract SSOT (2026-10-31):** `protocol/product-releases/README.md` +
> `migrations/runtime/0011_agentsam_product_releases.sql`.
> Product identity = live `agentsam_products`. Versioned artifacts =
> `agentsam_product_releases`. Do **not** apply `desktop_shell_releases`.

## Product lifecycle decision

Separate authored source Git repos, immutable built artifacts, catalog metadata
and per-customer installations. Do not copy a theme per customer or put ZIPs
in D1. A read-only preview is not proof of a production CMS installer.

The working first product is theme-plain-jane-starter v0.1.0. Its original
source is SamPrimeaux/inneranimalmedia-blog-template, pinned in
packages/theme-plain-jane/provenance.json. The SDK compiles the real source
and exports its manifest. Resolve and Violet retain their existing packages.

1. Author in GitHub and pin the source SHA.
2. Build package and typed CMS manifest; keep original visual components.
3. Prove TypeScript, deep links, metadata/SEO, accessibility, install schema,
   tenant ownership, rollback, asset integrity, CSP and license.
4. Review in local Theme Studio and produce a staged candidate, not an install.
5. Release immutable SHA-256-named ZIP/TAR assets and preview imagery to R2.
6. Store SKU/version, compatibility, release state, entitlement, artifact hash,
   preview URI and category in the existing D1 catalog structures.
7. Install through an authenticated backend with schema compatibility checks,
   staging, idempotency keys, tenant isolation and an install receipt.
8. Publish in a separate explicitly authorized transaction; retain rollback
   and customer-specific customization history.

The shared catalog product contract should include sku, kind, package,
version, source_sha, preview_url, cms_manifest_url, artifact_url, sha256,
runtime_requirements, compatible_schema_version, entitlement policy,
review_status, release_status and install_status. Only the backend can assign
installed, purchased or published from authoritative records.

### Canonical storage roles

GitHub: authored source, review and release tags.
AgentSam SDK: package manifests, component contracts, build/test commands.
Cloudflare R2: immutable compiled storefronts, source media and archives.
D1: products, releases, entitlements, per-site installs, install jobs/receipts.
Workers/app API: auth, catalog, safe download grants and install orchestration.
Customer CMS: actual owned pages, sections, blocks, media and overrides.

### UI integration

Local SDK: /admin/store browses original packaged previews and links to Studio.
It offers a preview-only ZIP and cannot publish, install or charge a customer.

Fuel N Free Time: its authenticated online store and CMS page picker should use
the same catalog API; publishing remains separate and versioned. The localhost
preview endpoint must NOT become its production backend by simple copying.

AgentSam /sites: repair empty/loading/error active-theme previews, offer Retry,
and add Browse Templates beside site management. Show source-backed gallery
cards, real live demos, compatibility and install status. Preview themes are
never displayed as the active site theme.

Apps: reuse catalog, releases, entitlements, installation logs and receipts.
Apps additionally require explicit permissions and connection setup. Do not
build a second marketplace for apps.

### Next guarded implementation wave

- Reconcile the Journal seed's 11 tables with canonical D1 migrations; keep
  existing site-specific CMS rows as authority and avoid parallel legacy tables.
- Implement authenticated product/release catalog readers and licensed assets.
- Implement staging install/upgrade/uninstall with validation, rollback receipts,
  conflict detection, idempotency and per-tenant authorization.
- Run browser-level visual, route and SEO verification. Chrome headless exited
  before render during this local build, so visual acceptance is not claimed.
- Confirm commercial license, source provenance, accessibility and customer
  entitlement before setting a product publicly available for sale.
- Consolidate the upstream Journal's two SEO implementations (cms.ts and
  useSEO.ts) into one tested hook before a public release.

This local archive proves packing and static materialization, not checkout,
authenticated content CRUD, or a live customer installation.
