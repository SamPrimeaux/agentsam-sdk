-- agentsam-engine: d1
-- Host platform's canonical media_assets IDs are opaque TEXT, not legacy numeric IDs.
-- Product images retain foreign keys to products and the single media registry.
CREATE TABLE IF NOT EXISTS product_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  media_asset_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0,1)),
  created_at TEXT NOT NULL DEFAULT(datetime('now')),
  UNIQUE(product_id,media_asset_id)
);
CREATE INDEX IF NOT EXISTS idx_product_images_product_position
  ON product_images(product_id,is_primary,position);
