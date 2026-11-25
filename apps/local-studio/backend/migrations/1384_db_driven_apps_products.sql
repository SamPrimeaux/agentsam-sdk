-- agentsam-engine: d1
-- Move the application/product catalog onto the existing apps + products tables.
-- agentsam_products is retained as a legacy snapshot during rollout; it is no
-- longer a parent table for app, product, CMS-site, theme, global, or Worker data.
--
-- products owns product identity and lifecycle metadata. Its existing
-- product_kind/status/price/site fields remain the commerce-facing projection.
-- catalog_kind/lifecycle_status describe the technical catalog without
-- conflating technical readiness with merchant publication.
--
-- No product or release rows are deleted by this migration.

ALTER TABLE products ADD COLUMN catalog_kind TEXT
  CHECK (catalog_kind IS NULL OR catalog_kind IN (
    'ui-component','sdk-package','integration','theme','section','block',
    'app','script','service','solution','product','collection','product-line'
  ));
ALTER TABLE products ADD COLUMN lifecycle_status TEXT
  CHECK (lifecycle_status IS NULL OR lifecycle_status IN (
    'prototype','scaffolded','wired','production','deprecated'
  ));
ALTER TABLE products ADD COLUMN display_name TEXT;
ALTER TABLE products ADD COLUMN legacy_product_id TEXT;
ALTER TABLE products ADD COLUMN catalog_visibility TEXT NOT NULL DEFAULT 'internal'
  CHECK (catalog_visibility IN ('internal','unlisted','public'));
ALTER TABLE products ADD COLUMN sku TEXT;
ALTER TABLE products ADD COLUMN package_name TEXT;
ALTER TABLE products ADD COLUMN version TEXT;
ALTER TABLE products ADD COLUMN canonical_path TEXT;
ALTER TABLE products ADD COLUMN repository_id TEXT REFERENCES code_repositories(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN source_type TEXT;
ALTER TABLE products ADD COLUMN source_id TEXT;
ALTER TABLE products ADD COLUMN account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(tags_json) AND json_type(tags_json) = 'array');
ALTER TABLE products ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}'
  CHECK (json_valid(metadata_json) AND json_type(metadata_json) = 'object');

-- Preserve the old-to-new identity mapping only for this migration.
CREATE TABLE _product_identity_map_1384 (
  legacy_product_id TEXT PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE
);

-- First reuse commerce product rows that already point at a legacy product.
INSERT INTO _product_identity_map_1384 (legacy_product_id, product_id)
SELECT ap.id, p.id
FROM agentsam_products ap
JOIN products p ON p.registry_id = ap.id;

-- Also reuse a same-slug commerce row if it was created without the old FK.
INSERT OR IGNORE INTO _product_identity_map_1384 (legacy_product_id, product_id)
SELECT ap.id, p.id
FROM agentsam_products ap
JOIN products p ON p.slug = ap.slug;

-- Materialize missing catalog identities into products. Internal technical
-- products have no storefront site; they remain invisible to site product lists.
INSERT INTO products (
  slug, title, description, collection, price_cents, image_url, status,
  created_at, updated_at, site_id, product_kind, digital_ref,
  catalog_kind, lifecycle_status, display_name, legacy_product_id, catalog_visibility, sku,
  package_name, version, canonical_path, repository_id, source_type, source_id,
  account_id, tags_json, metadata_json
)
SELECT
  ap.slug,
  COALESCE(NULLIF(ap.display_name, ''), ap.name),
  ap.description,
  json_extract(ap.metadata, '$.product_profile.collection'),
  0,
  json_extract(ap.metadata, '$.product_profile.thumbnail_url'),
  CASE WHEN ap.status = 'production' AND ap.catalog_visibility = 'public' THEN 'active' ELSE 'draft' END,
  datetime(ap.created_at, 'unixepoch'),
  datetime(ap.updated_at, 'unixepoch'),
  NULL,
  CASE ap.kind
    WHEN 'app' THEN 'app'
    WHEN 'theme' THEN 'theme'
    WHEN 'integration' THEN 'plugin'
    WHEN 'service' THEN 'service'
    WHEN 'product' THEN 'physical'
    ELSE 'digital_download'
  END,
  CASE WHEN ap.kind = 'product' THEN NULL ELSE ap.slug END,
  ap.kind,
  ap.status,
  ap.display_name,
  ap.id,
  ap.catalog_visibility,
  ap.sku,
  ap.package_name,
  ap.version,
  ap.canonical_path,
  ap.repository_id,
  ap.source_type,
  ap.source_id,
  CASE
    WHEN EXISTS (SELECT 1 FROM accounts a WHERE a.id = json_extract(ap.metadata, '$.account_id'))
    THEN json_extract(ap.metadata, '$.account_id')
    ELSE NULL
  END,
  ap.tags,
  ap.metadata
FROM agentsam_products ap
WHERE NOT EXISTS (
  SELECT 1 FROM _product_identity_map_1384 m WHERE m.legacy_product_id = ap.id
)
AND NOT EXISTS (
  SELECT 1 FROM products p WHERE p.slug = ap.slug
);

-- Complete the mapping for rows inserted above.
INSERT OR IGNORE INTO _product_identity_map_1384 (legacy_product_id, product_id)
SELECT ap.id, p.id
FROM agentsam_products ap
JOIN products p ON p.slug = ap.slug;

-- Bring technical catalog fields onto the reused commerce rows without
-- overwriting merchant-owned price, status, site, media, or product title.
UPDATE products
SET
  catalog_kind = (SELECT ap.kind FROM agentsam_products ap JOIN _product_identity_map_1384 m ON m.legacy_product_id = ap.id WHERE m.product_id = products.id),
  lifecycle_status = (SELECT ap.status FROM agentsam_products ap JOIN _product_identity_map_1384 m ON m.legacy_product_id = ap.id WHERE m.product_id = products.id),
  display_name = COALESCE(display_name, (SELECT ap.display_name FROM agentsam_products ap JOIN _product_identity_map_1384 m ON m.legacy_product_id = ap.id WHERE m.product_id = products.id)),
  legacy_product_id = (SELECT ap.id FROM agentsam_products ap JOIN _product_identity_map_1384 m ON m.legacy_product_id = ap.id WHERE m.product_id = products.id),
  catalog_visibility = (SELECT ap.catalog_visibility FROM agentsam_products ap JOIN _product_identity_map_1384 m ON m.legacy_product_id = ap.id WHERE m.product_id = products.id),
  sku = COALESCE(sku, (SELECT ap.sku FROM agentsam_products ap JOIN _product_identity_map_1384 m ON m.legacy_product_id = ap.id WHERE m.product_id = products.id)),
  package_name = (SELECT ap.package_name FROM agentsam_products ap JOIN _product_identity_map_1384 m ON m.legacy_product_id = ap.id WHERE m.product_id = products.id),
  version = (SELECT ap.version FROM agentsam_products ap JOIN _product_identity_map_1384 m ON m.legacy_product_id = ap.id WHERE m.product_id = products.id),
  canonical_path = (SELECT ap.canonical_path FROM agentsam_products ap JOIN _product_identity_map_1384 m ON m.legacy_product_id = ap.id WHERE m.product_id = products.id),
  repository_id = (SELECT ap.repository_id FROM agentsam_products ap JOIN _product_identity_map_1384 m ON m.legacy_product_id = ap.id WHERE m.product_id = products.id),
  source_type = (SELECT ap.source_type FROM agentsam_products ap JOIN _product_identity_map_1384 m ON m.legacy_product_id = ap.id WHERE m.product_id = products.id),
  source_id = (SELECT ap.source_id FROM agentsam_products ap JOIN _product_identity_map_1384 m ON m.legacy_product_id = ap.id WHERE m.product_id = products.id),
  account_id = (
    SELECT CASE
      WHEN EXISTS (SELECT 1 FROM accounts a WHERE a.id = json_extract(ap.metadata, '$.account_id'))
      THEN json_extract(ap.metadata, '$.account_id')
      ELSE NULL
    END
    FROM agentsam_products ap JOIN _product_identity_map_1384 m ON m.legacy_product_id = ap.id
    WHERE m.product_id = products.id
  ),
  tags_json = (SELECT ap.tags FROM agentsam_products ap JOIN _product_identity_map_1384 m ON m.legacy_product_id = ap.id WHERE m.product_id = products.id),
  metadata_json = (SELECT ap.metadata FROM agentsam_products ap JOIN _product_identity_map_1384 m ON m.legacy_product_id = ap.id WHERE m.product_id = products.id)
WHERE id IN (SELECT product_id FROM _product_identity_map_1384);

-- Repoint every existing product identity relationship before removing the
-- legacy foreign-key columns.
ALTER TABLE apps ADD COLUMN product_id_v2 INTEGER REFERENCES products(id) ON DELETE SET NULL;
UPDATE apps
SET product_id_v2 = (
  SELECT m.product_id FROM _product_identity_map_1384 m
  WHERE m.legacy_product_id = apps.product_id
)
WHERE product_id IS NOT NULL;
DROP INDEX IF EXISTS idx_apps_product;
ALTER TABLE apps DROP COLUMN product_id;
ALTER TABLE apps RENAME COLUMN product_id_v2 TO product_id;
CREATE INDEX idx_apps_product ON apps(product_id);

ALTER TABLE cms_sites ADD COLUMN product_id_v2 INTEGER REFERENCES products(id) ON DELETE SET NULL;
UPDATE cms_sites
SET product_id_v2 = (
  SELECT m.product_id FROM _product_identity_map_1384 m
  WHERE m.legacy_product_id = cms_sites.product_id
)
WHERE product_id IS NOT NULL;
DROP INDEX IF EXISTS idx_cms_sites_product;
ALTER TABLE cms_sites DROP COLUMN product_id;
ALTER TABLE cms_sites RENAME COLUMN product_id_v2 TO product_id;
CREATE INDEX idx_cms_sites_product ON cms_sites(product_id);

ALTER TABLE cms_globals ADD COLUMN product_id_v2 INTEGER REFERENCES products(id) ON DELETE SET NULL;
UPDATE cms_globals
SET product_id_v2 = (
  SELECT m.product_id FROM _product_identity_map_1384 m
  WHERE m.legacy_product_id = cms_globals.product_id
)
WHERE product_id IS NOT NULL;
ALTER TABLE cms_globals DROP COLUMN product_id;
ALTER TABLE cms_globals RENAME COLUMN product_id_v2 TO product_id;

ALTER TABLE cms_site_themes ADD COLUMN source_product_id_v2 INTEGER REFERENCES products(id) ON DELETE SET NULL;
UPDATE cms_site_themes
SET source_product_id_v2 = (
  SELECT m.product_id FROM _product_identity_map_1384 m
  WHERE m.legacy_product_id = cms_site_themes.source_product_id
)
WHERE source_product_id IS NOT NULL;
ALTER TABLE cms_site_themes DROP COLUMN source_product_id;
ALTER TABLE cms_site_themes RENAME COLUMN source_product_id_v2 TO source_product_id;

ALTER TABLE worker_registry ADD COLUMN product_id_v2 INTEGER REFERENCES products(id) ON DELETE SET NULL;
UPDATE worker_registry
SET product_id_v2 = (
  SELECT m.product_id FROM _product_identity_map_1384 m
  WHERE m.legacy_product_id = worker_registry.product_id
)
WHERE product_id IS NOT NULL;
ALTER TABLE worker_registry DROP COLUMN product_id;
ALTER TABLE worker_registry RENAME COLUMN product_id_v2 TO product_id;

-- Release history remains its own table; its product_id now carries the
-- canonical products.id rather than a prod_* identifier from the legacy table.
UPDATE agentsam_product_releases
SET product_id = CAST((
  SELECT m.product_id FROM _product_identity_map_1384 m
  WHERE m.legacy_product_id = agentsam_product_releases.product_id
) AS TEXT)
WHERE product_id IS NOT NULL
AND EXISTS (
  SELECT 1 FROM _product_identity_map_1384 m
  WHERE m.legacy_product_id = agentsam_product_releases.product_id
);

-- Re-key the generic asset graph as product relationships. Both ends are
-- mapped in one pass so product-to-product edges are preserved as well.
INSERT OR IGNORE INTO asset_relationships (
  source_type, source_id, target_type, target_id, relationship_type, metadata, created_at
)
SELECT
  CASE WHEN ar.source_type = 'agentsam_product' THEN 'product' ELSE ar.source_type END,
  CASE WHEN ar.source_type = 'agentsam_product' THEN CAST(source_map.product_id AS TEXT) ELSE ar.source_id END,
  CASE WHEN ar.target_type = 'agentsam_product' THEN 'product' ELSE ar.target_type END,
  CASE WHEN ar.target_type = 'agentsam_product' THEN CAST(target_map.product_id AS TEXT) ELSE ar.target_id END,
  ar.relationship_type,
  CASE
    WHEN ar.source_type = 'agentsam_product'
     AND ar.relationship_type IN ('defined_in','sourced_from')
     AND json_valid(ar.metadata)
     AND json_extract(ar.metadata,'$.managed_by') = 'agentsam_products'
    THEN json_set(ar.metadata,'$.managed_by','products')
    ELSE ar.metadata
  END,
  ar.created_at
FROM asset_relationships ar
LEFT JOIN _product_identity_map_1384 source_map
  ON ar.source_type = 'agentsam_product' AND source_map.legacy_product_id = ar.source_id
LEFT JOIN _product_identity_map_1384 target_map
  ON ar.target_type = 'agentsam_product' AND target_map.legacy_product_id = ar.target_id
WHERE (ar.source_type = 'agentsam_product' AND source_map.product_id IS NOT NULL)
   OR (ar.target_type = 'agentsam_product' AND target_map.product_id IS NOT NULL);

DELETE FROM asset_relationships
WHERE source_type = 'agentsam_product' OR target_type = 'agentsam_product';

-- Retire the old table's relationship/FTS/touch triggers. The legacy table
-- remains readable as a frozen snapshot, but can no longer recreate legacy
-- relationship edges or mutate the canonical asset graph.
DROP TRIGGER IF EXISTS agentsam_products_ad;
DROP TRIGGER IF EXISTS agentsam_products_ai;
DROP TRIGGER IF EXISTS agentsam_products_au_fts;
DROP TRIGGER IF EXISTS agentsam_products_au_relationships;
DROP TRIGGER IF EXISTS agentsam_products_touch;

-- Product identity now owns its repository/source edges. These triggers
-- preserve the former registry behavior against the canonical products row.
CREATE TRIGGER products_ai AFTER INSERT ON products BEGIN
  INSERT OR IGNORE INTO asset_relationships
    (source_type,source_id,target_type,target_id,relationship_type,metadata)
  SELECT 'product',CAST(new.id AS TEXT),'code_repository',new.repository_id,'defined_in',
    json_object('managed_by','products','canonical_path',new.canonical_path,
      'package_name',new.package_name,'version',new.version)
  WHERE new.repository_id IS NOT NULL;

  INSERT OR IGNORE INTO asset_relationships
    (source_type,source_id,target_type,target_id,relationship_type,metadata)
  SELECT 'product',CAST(new.id AS TEXT),new.source_type,new.source_id,'sourced_from',
    json_object('managed_by','products')
  WHERE new.source_type IS NOT NULL AND new.source_id IS NOT NULL;
END;

CREATE TRIGGER products_au_relationships
AFTER UPDATE OF repository_id,source_type,source_id,canonical_path,package_name,version ON products BEGIN
  DELETE FROM asset_relationships
  WHERE source_type='product' AND source_id=CAST(old.id AS TEXT)
    AND relationship_type IN ('defined_in','sourced_from')
    AND json_valid(metadata) AND json_extract(metadata,'$.managed_by')='products';

  INSERT OR IGNORE INTO asset_relationships
    (source_type,source_id,target_type,target_id,relationship_type,metadata)
  SELECT 'product',CAST(new.id AS TEXT),'code_repository',new.repository_id,'defined_in',
    json_object('managed_by','products','canonical_path',new.canonical_path,
      'package_name',new.package_name,'version',new.version)
  WHERE new.repository_id IS NOT NULL;

  INSERT OR IGNORE INTO asset_relationships
    (source_type,source_id,target_type,target_id,relationship_type,metadata)
  SELECT 'product',CAST(new.id AS TEXT),new.source_type,new.source_id,'sourced_from',
    json_object('managed_by','products')
  WHERE new.source_type IS NOT NULL AND new.source_id IS NOT NULL;
END;

CREATE TRIGGER products_ad AFTER DELETE ON products BEGIN
  DELETE FROM asset_relationships
  WHERE (source_type='product' AND source_id=CAST(old.id AS TEXT))
     OR (target_type='product' AND target_id=CAST(old.id AS TEXT));
END;

CREATE TRIGGER products_touch
AFTER UPDATE OF slug,title,product_kind,catalog_kind,lifecycle_status,description,
  repository_id,source_type,source_id,canonical_path,package_name,version,
  tags_json,metadata_json,display_name,sku,catalog_visibility,account_id,site_id,
  status,collection,price_cents,image_url ON products BEGIN
  UPDATE products SET updated_at=datetime('now') WHERE id=new.id;
END;

-- Guard against any stale writer silently repopulating the legacy catalog.
CREATE TRIGGER agentsam_products_legacy_readonly_insert
BEFORE INSERT ON agentsam_products BEGIN
  SELECT RAISE(ABORT,'agentsam_products_legacy_read_only');
END;
CREATE TRIGGER agentsam_products_legacy_readonly_update
BEFORE UPDATE ON agentsam_products BEGIN
  SELECT RAISE(ABORT,'agentsam_products_legacy_read_only');
END;
CREATE TRIGGER agentsam_products_legacy_readonly_delete
BEFORE DELETE ON agentsam_products BEGIN
  SELECT RAISE(ABORT,'agentsam_products_legacy_read_only');
END;

-- Remove the old product foreign-key column after all consumers have moved.
ALTER TABLE products DROP COLUMN registry_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_legacy_product_id
  ON products(legacy_product_id) WHERE legacy_product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_catalog_kind_status
  ON products(catalog_kind, lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_products_account
  ON products(account_id, status);
CREATE INDEX IF NOT EXISTS idx_products_repository
  ON products(repository_id);
CREATE INDEX IF NOT EXISTS idx_products_source
  ON products(source_type, source_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_catalog_sku
  ON products(sku) WHERE sku IS NOT NULL AND TRIM(sku) <> '';

DROP TABLE _product_identity_map_1384;
