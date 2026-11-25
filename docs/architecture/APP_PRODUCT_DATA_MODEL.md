# AgentSam App and Product Data Model

- **Status:** canonical ownership contract
- **Migration:** Local Studio D1 migration 1384
- **Scope:** platform app catalog, product catalog, CMS product references, release identity

## 1. Ownership boundaries

| Data | Canonical owner | Responsibility |
|---|---|---|
| Application identity | apps | Installable app identity, display metadata, classification, launch/editor URLs, optional commerce listing |
| Account app state | agentsam_app_installations | Installed/enabled/pinned state, last-opened time, account preferences and screen overrides |
| Product identity | products | Stable product ID/slug, technical classification, lifecycle, package metadata, ownership and commerce state |
| Product variants | product_variants | Sellable configurations and SKU-level variants |
| Product media | product_images | Product-to-media relationships |
| Product groupings | products.collection and CMS collection tables | Product labels plus site-scoped merchandising collections |
| Release history | agentsam_product_releases | Immutable versioned release/artifact history |
| Generic relationships | asset_relationships | Product-to-repository/runtime/worker/asset relationships |

agentsam_products is a frozen legacy source retained for migration and rollback evidence. It is not a runtime authority. No new app, product, theme, CMS, CAD, or release-registration code may read or write it. The separate products_catalog and products_pricing_catalog tables remain AgentSam service/pricing catalogs; they are not product identity mirrors and are not part of this migration.

## 2. Application identity

The apps table represents applications that can be discovered and launched by AgentSam. It is not a package registry and it is not a per-account install table.

The app manifest remains the trusted runtime descriptor for package-owned routes, screen IDs, capabilities, and embedded build instructions. The database owns the user-facing catalog record and account installation state.

The optional apps.product_id relationship points to products.id when an app also has a commerce listing. Most apps do not need a product listing. An app is not created merely because an npm package exists.

The account launcher must read apps joined to agentsam_app_installations. It may use trusted package manifests to validate declared screens and mounts; it must not reconstruct app identity from the legacy product registry.

## 3. Product identity and lifecycle

The products table has two independent status dimensions:

| Field | Meaning | Values |
|---|---|---|
| status | Commercial publication state | draft, active, archived |
| lifecycle_status | Technical readiness | prototype, scaffolded, wired, production, deprecated |

Classification is also split:

| Field | Meaning |
|---|---|
| product_kind | Commerce behavior: physical, digital download, app, plugin, app embed, theme, service |
| catalog_kind | Technical catalog classification: app, SDK package, integration, theme, UI component, section, block, script, service, solution, product, collection, product line |

This prevents a technically deployed service from automatically becoming a published storefront product.

### Canonical product metadata

- id: INTEGER primary key; canonical product identity.
- slug: unique, stable lookup key.
- title: product title.
- display_name: preferred catalog display label.
- catalog_kind: technical classification.
- lifecycle_status: technical readiness.
- product_kind: commerce behavior.
- status: commerce publication state.
- catalog_visibility: internal, unlisted, or public.
- account_id: optional account ownership.
- site_id: optional storefront/site ownership.
- repository_id: optional registered repository ownership.
- package_name, version, canonical_path: package identity and source location.
- source_type, source_id: source provenance for generated resources.
- tags_json, metadata_json: searchable tags and structured product metadata.
- sku: stable internal catalog SKU; not a merchant SKU or proof of publication.
- legacy_product_id: compatibility alias for the old prod_* identifier only.

Product variants and images remain in product_variants and product_images. Merchant collections remain site-scoped in cms_collections and cms_collection_items; products.collection is only a catalog grouping label. Pricing and inventory remain in their existing specialized tables. Do not duplicate those records in product metadata.

## 4. Product-to-app relationship

The only app/product identity relationship is:

    apps.product_id -> products.id

It is nullable and optional. One app may have one commerce listing; many apps have none. Product records may also represent themes, services, packages, integrations, UI components, and other products that are not installable apps.

Do not use a package name, route, manifest filename, legacy prod_* identifier, or display name as an app primary key.

## 5. Ownership and access

Product access is resolved through existing ownership boundaries:

- Account-owned technical products: products.account_id.
- Repository-owned products: products.repository_id joined to code_repositories.
- Storefront products: products.site_id joined to cms_sites.account_id.
- App installation and enablement: agentsam_app_installations.account_id.

A platform product with no storefront site_id is valid. It must not leak into another account's merchant product list.

## 6. Release history

The existing agentsam_product_releases table name is retained to avoid a second release table during this repair. Its product_id stores the canonical products.id as text for compatibility with its existing schema. product_slug remains the stable human-readable lookup.

Release records own immutable artifact/version information. They do not own product identity, app installation, or storefront publication.

## 7. Migration 1384

Migration 1384:

1. Adds technical catalog fields to the existing products table.
2. Copies all legacy product identities into products, reusing matching commerce rows by old ID or slug.
3. Preserves old prod_* IDs in products.legacy_product_id.
4. Repoints app, CMS site, CMS global, installed theme, Worker, release, and asset-relationship references to canonical product IDs.
5. Removes apps.product_id and products.registry_id references to agentsam_products.
6. Replaces legacy product relationship triggers with products-owned triggers for repository/source edges and updated_at.
7. Drops all legacy write/relationship triggers and installs read-only guards on agentsam_products; the legacy table remains available as a frozen rollback snapshot.

The migration is forward-only and must be applied through the normal D1 migration/release process. Do not manually update production rows or run historical SKU backfills again.

## 8. Guardrails

- Do not create another app registry, product registry, product mirror, or per-app installation table.
- Do not use agentsam_products in runtime SQL or write to its frozen legacy snapshot.
- Do not conflate technical lifecycle with commerce publication.
- Do not treat every package as an installable app or every app as a sellable product.
- Do not create duplicate product rows for a product that already exists by canonical slug.
- Keep historical migration SQL immutable; add forward migrations instead.
- Tests must validate ownership, foreign keys, account isolation, product lifecycle, and the app/product optional relationship.
