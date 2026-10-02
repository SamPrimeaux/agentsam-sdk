-- @inneranimalmedia/ecommerce-cms-agentsam — portable baseline D1 schema

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  email        TEXT NOT NULL UNIQUE,
  source_page  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===== Account identity =====

CREATE TABLE IF NOT EXISTS accounts (
  id           TEXT PRIMARY KEY,
  account_key  TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','suspended','closed')),
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS account_cloudflare_resources (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL,
  resource_id   TEXT NOT NULL,
  resource_name TEXT,
  zone_id       TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(account_id, resource_type, resource_id)
);

-- ===== Admin auth =====

CREATE TABLE IF NOT EXISTS auth_users (
  id                      TEXT PRIMARY KEY,
  email                   TEXT UNIQUE NOT NULL,
  name                    TEXT,
  password_hash           TEXT NOT NULL,
  salt                    TEXT NOT NULL,
  created_at              TEXT DEFAULT (datetime('now')),
  updated_at              TEXT DEFAULT (datetime('now')),
  is_verified             INTEGER NOT NULL DEFAULT 0,
  verified_at             INTEGER,
  status                  TEXT DEFAULT 'active',
  display_name            TEXT,
  avatar_url              TEXT,
  last_login_at           INTEGER,
  login_count             INTEGER DEFAULT 0,
  phone                    TEXT,
  mfa_enabled             INTEGER DEFAULT 0,
  timezone                TEXT DEFAULT 'America/Chicago',
  role                    TEXT NOT NULL DEFAULT 'member',
  account_type            TEXT NOT NULL DEFAULT 'human',
  iam_owned               INTEGER NOT NULL DEFAULT 0,
  downgrade_protected     INTEGER NOT NULL DEFAULT 0,
  notification_email      TEXT,
  plan                    TEXT NOT NULL DEFAULT 'free',
  stripe_customer_id      TEXT,
  meta_json               TEXT NOT NULL DEFAULT '{}',
  default_account_id      TEXT REFERENCES accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_auth_users_account_status
  ON auth_users(default_account_id, status);
CREATE INDEX IF NOT EXISTS idx_auth_users_email
  ON auth_users(email);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash        TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  expires_at        TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  active_account_id TEXT REFERENCES accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_account ON auth_sessions(active_account_id);

CREATE TABLE IF NOT EXISTS account_memberships (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner','admin','member','viewer')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (account_id, user_id)
);

-- ===== Products / inventory =====

CREATE TABLE IF NOT EXISTS products (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  description  TEXT,
  collection   TEXT,
  price_cents  INTEGER NOT NULL DEFAULT 0,
  image_url    TEXT,
  status       TEXT NOT NULL DEFAULT 'draft',
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_variants (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id     INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku            TEXT NOT NULL UNIQUE,
  size           TEXT,
  color          TEXT,
  price_cents    INTEGER,
  inventory_qty  INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Merchandising layer: products own commerce truth; collections own grouping, order, and presentation.
CREATE TABLE IF NOT EXISTS store_collections (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  slug            TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  eyebrow         TEXT NOT NULL DEFAULT '',
  image_url       TEXT,
  accent_color    TEXT NOT NULL DEFAULT '#ff4d00',
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  sort_order      INTEGER NOT NULL DEFAULT 0,
  seo_title       TEXT,
  seo_description TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS store_collection_products (
  collection_id INTEGER NOT NULL REFERENCES store_collections(id) ON DELETE CASCADE,
  product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (collection_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_store_collections_status_sort ON store_collections(status, sort_order);
CREATE INDEX IF NOT EXISTS idx_store_collection_products_product ON store_collection_products(product_id);

-- ===== Orders (schema ready; no checkout wired yet) =====

CREATE TABLE IF NOT EXISTS orders (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_email  TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  total_cents     INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id   INTEGER REFERENCES product_variants(id),
  title        TEXT NOT NULL,
  qty          INTEGER NOT NULL DEFAULT 1,
  price_cents  INTEGER NOT NULL DEFAULT 0
);

-- ===== Media library (R2-backed, CMS-reusable across products) =====

CREATE TABLE IF NOT EXISTS media_assets (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  r2_key        TEXT NOT NULL UNIQUE,
  url           TEXT NOT NULL,
  filename      TEXT NOT NULL,
  content_type  TEXT,
  size_bytes    INTEGER,
  category      TEXT,
  folder        TEXT NOT NULL DEFAULT 'images',
  display_order INTEGER NOT NULL DEFAULT 0,
  alt_text      TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_media_assets_folder_order ON media_assets(folder, display_order, id);

CREATE TABLE IF NOT EXISTS media_albums (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  slug                 TEXT NOT NULL UNIQUE,
  name                 TEXT NOT NULL,
  description          TEXT,
  cover_media_asset_id INTEGER REFERENCES media_assets(id) ON DELETE SET NULL,
  meta_json            TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS media_album_assets (
  album_id       INTEGER NOT NULL REFERENCES media_albums(id) ON DELETE CASCADE,
  media_asset_id INTEGER NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  position       INTEGER NOT NULL DEFAULT 0,
  added_at       TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (album_id, media_asset_id)
);

CREATE INDEX IF NOT EXISTS idx_media_album_assets_album_position
  ON media_album_assets(album_id, position, media_asset_id);
CREATE INDEX IF NOT EXISTS idx_media_album_assets_media
  ON media_album_assets(media_asset_id, album_id);

CREATE TABLE IF NOT EXISTS product_images (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id      INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  media_asset_id  INTEGER NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  position        INTEGER NOT NULL DEFAULT 0,
  is_primary      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(product_id, media_asset_id)
);

-- ===== Mail (Gmail inbox + Resend sending) =====

CREATE TABLE IF NOT EXISTS mail_settings (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  settings_json TEXT NOT NULL,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS store_settings (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  settings_json TEXT NOT NULL,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===== CMS (pages + editable sections) =====

CREATE TABLE IF NOT EXISTS pages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'draft',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS page_sections (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id      INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  section_key  TEXT NOT NULL,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  content_json TEXT NOT NULL DEFAULT '{}',
  status       TEXT NOT NULL DEFAULT 'draft',
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(page_id, section_key)
);

CREATE INDEX IF NOT EXISTS idx_page_sections_page ON page_sections(page_id, sort_order);

-- ===== Product Studio durable drafts =====
CREATE TABLE IF NOT EXISTS product_studio_drafts (
  id                              TEXT PRIMARY KEY,
  product_id                      INTEGER NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
  completeful_catalog_product_id  TEXT NOT NULL,
  completeful_shop_id             TEXT,
  selected_variant_ids_json       TEXT NOT NULL DEFAULT '[]',
  print_locations_json            TEXT NOT NULL DEFAULT '[]',
  placement_json                  TEXT NOT NULL DEFAULT '{}',
  original_media_asset_id         INTEGER REFERENCES media_assets(id) ON DELETE SET NULL,
  prepared_media_asset_id         INTEGER REFERENCES media_assets(id) ON DELETE SET NULL,
  preview_media_asset_id          INTEGER REFERENCES media_assets(id) ON DELETE SET NULL,
  completeful_design_id           TEXT,
  completeful_render_id           TEXT,
  completeful_render_status       TEXT,
  completeful_render_url          TEXT,
  title                           TEXT NOT NULL,
  description                     TEXT,
  retail_price_cents              INTEGER NOT NULL DEFAULT 0 CHECK (retail_price_cents >= 0),
  state                           TEXT NOT NULL DEFAULT 'draft'
                                  CHECK (state IN ('draft','prepared','rendering','rendered','created','published','error')),
  version                         INTEGER NOT NULL DEFAULT 1,
  last_error_code                 TEXT,
  last_error_message              TEXT,
  created_at                      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_product_studio_drafts_catalog
  ON product_studio_drafts(completeful_catalog_product_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_product_studio_drafts_state
  ON product_studio_drafts(state, updated_at);
