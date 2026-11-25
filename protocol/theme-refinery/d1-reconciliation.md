# Product catalog reconciliation contract

Target DB: **inneranimalmedia-business**.

## Canonical ownership

- **apps** owns installable application identity and launch/catalog metadata.
- **agentsam_app_installations** owns per-account app installation and preferences.
- **products** owns product identity, technical classification, lifecycle, metadata, and commerce fields.
- **agentsam_product_releases** remains the existing release-history table. Its product_id stores the canonical products.id as text for compatibility with the existing release schema.
- **products_catalog** and **products_pricing_catalog** remain AgentSam service/pricing catalogs, not product identity registries.
- **asset_relationships** uses source_type='product' and target_type='product'; IDs are products.id serialized as text.

**agentsam_products is a frozen legacy source** retained for migration/rollback evidence. It is not a runtime authority and new code must not read or write it.

## Inventory query

    SELECT
      id, slug, title, product_kind, catalog_kind, status, lifecycle_status,
      catalog_visibility, repository_id, canonical_path, package_name, version, sku
    FROM products
    ORDER BY catalog_kind, slug;

Commerce state and technical readiness are separate:

- **products.status**: commerce publication state (draft, active, archived).
- **products.lifecycle_status**: technical readiness (prototype, scaffolded, wired, production, deprecated).
- **products.product_kind**: commerce/product behavior (physical, digital_download, app, plugin, app_embed, theme, service).
- **products.catalog_kind**: technical catalog classification (app, sdk-package, integration, theme, ui-component, section, block, script, service, solution, product, collection, product-line).
- **products.metadata_json** and **products.tags_json**: product metadata and searchable tags.
- **products.account_id**, **repository_id**, and **site_id**: ownership scopes; a platform product need not belong to a storefront site.

## Product upsert

    INSERT INTO products (
      slug, title, product_kind, digital_ref, catalog_kind, lifecycle_status,
      status, catalog_visibility, repository_id, canonical_path, package_name,
      version, sku, tags_json, metadata_json, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, 'draft', 'internal', ?, ?, ?, ?, ?, ?, ?, datetime('now')
    )
    ON CONFLICT(slug) DO UPDATE SET
      title = excluded.title,
      product_kind = excluded.product_kind,
      digital_ref = excluded.digital_ref,
      catalog_kind = excluded.catalog_kind,
      lifecycle_status = excluded.lifecycle_status,
      repository_id = COALESCE(excluded.repository_id, products.repository_id),
      canonical_path = excluded.canonical_path,
      package_name = excluded.package_name,
      version = excluded.version,
      sku = COALESCE(excluded.sku, products.sku),
      tags_json = excluded.tags_json,
      metadata_json = excluded.metadata_json,
      updated_at = excluded.updated_at;

Resolve repository_id through code_repositories. Never invent repository identities. For a sellable app, link the optional listing through apps.product_id -> products.id; do not create a second application identity.

## Relationship upsert

Honor uniqueness on (source_type, source_id, target_type, target_id, relationship_type).

    INSERT INTO asset_relationships (
      source_type, source_id, target_type, target_id, relationship_type, metadata
    )
    SELECT 'product', CAST(p.id AS TEXT), ?, ?, ?, ?
    FROM products p
    WHERE p.slug = ?
    ON CONFLICT(source_type, source_id, target_type, target_id, relationship_type)
    DO UPDATE SET metadata = excluded.metadata;

## Evidence

Write agentsam_evidence_snapshots with snapshot_type in (repository, website, seo, business), using the same account_id as the owning product/repository where applicable.

## Do not

- Dual-write app identity into products; only an optional commerce listing belongs there.
- Dual-write products into agentsam_products.
- Register whole sites as cms_component_templates or only as cms_themes.
- Put credentials, secrets, or giant archaeology dumps into products.metadata_json.
- Emit tools/workflows/skills/hooks unless formally exposed.
