-- Test-only SQLite fixture mirroring the existing production CMS theme registry.
-- This is not a D1 migration and must never be applied to production.
-- Portable account-scoped CMS theme registry.
-- Public presets are read-only; edits are saved as private account-owned copies.
-- Existing canonical IAM deployments already have these tables; IF NOT EXISTS
-- lets this migration also initialize a fresh application D1 with the same contract.

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'human' CHECK (type IN ('human','agent','system')),
  email TEXT UNIQUE,
  display_name TEXT NOT NULL DEFAULT 'Account',
  avatar_url TEXT,
  password_hash TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','pending','deleted')),
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro','agency','enterprise')),
  timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  meta_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_active_at INTEGER,
  notification_email TEXT
);

CREATE TABLE IF NOT EXISTS cms_themes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  css_url TEXT,
  config TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(config)),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  wcag_scores TEXT CHECK (wcag_scores IS NULL OR json_valid(wcag_scores)),
  contrast_flags TEXT CHECK (contrast_flags IS NULL OR json_valid(contrast_flags)),
  theme_family TEXT NOT NULL DEFAULT 'custom',
  sort_order INTEGER DEFAULT 100,
  workspace_id TEXT DEFAULT NULL,
  monaco_theme TEXT NOT NULL DEFAULT 'vs-dark',
  monaco_bg TEXT NOT NULL DEFAULT '#1e293b',
  monaco_theme_data TEXT,
  tokens_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(tokens_json)),
  css_vars_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(css_vars_json)),
  brand_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(brand_json)),
  layout_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(layout_json)),
  typography_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(typography_json)),
  components_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(components_json)),
  motion_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(motion_json)),
  css_r2_key TEXT DEFAULT NULL,
  compiled_css_hash TEXT DEFAULT NULL,
  preview_image_url TEXT DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  updated_at TEXT DEFAULT NULL,
  visibility TEXT NOT NULL DEFAULT 'public',
  css_r2_bucket TEXT DEFAULT NULL,
  created_at_unix INTEGER,
  tags_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags_json) AND json_type(tags_json) = 'array'),
  account_id TEXT REFERENCES accounts(id),
  alias_of_theme_id TEXT REFERENCES cms_themes(id)
);

CREATE TABLE IF NOT EXISTS cms_theme_preferences (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES accounts(id),
  user_id TEXT DEFAULT NULL,
  workspace_id TEXT DEFAULT NULL,
  project_id TEXT DEFAULT NULL,
  page_id TEXT DEFAULT NULL,
  theme_id TEXT NOT NULL REFERENCES cms_themes(id),
  theme_slug TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'account'
    CHECK (scope IN ('account','user_global','tenant','workspace','project','page')),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  site_id TEXT REFERENCES cms_sites(id),
  CHECK (scope != 'account' OR (
    account_id IS NOT NULL AND site_id IS NULL AND workspace_id IS NULL
    AND project_id IS NULL AND page_id IS NULL
  ))
);

CREATE INDEX IF NOT EXISTS idx_cms_themes_catalog_visibility
  ON cms_themes(visibility, status, workspace_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_cms_themes_account_status
  ON cms_themes(account_id, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_cms_theme_preferences_account_scope
  ON cms_theme_preferences(account_id, scope, is_active, updated_at);

-- Preserve the most recently selected account preference if a legacy database
-- contains duplicate active account rows, then enforce one active default per account.
UPDATE cms_theme_preferences
SET is_active = 0, updated_at = datetime('now')
WHERE scope = 'account' AND is_active = 1 AND account_id IS NOT NULL
  AND id NOT IN (
    SELECT id FROM cms_theme_preferences p2
    WHERE p2.scope = 'account' AND p2.is_active = 1
      AND p2.account_id = cms_theme_preferences.account_id
    ORDER BY p2.updated_at DESC, p2.id DESC LIMIT 1
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_cms_theme_preferences_one_active_account
  ON cms_theme_preferences(account_id)
  WHERE scope = 'account' AND is_active = 1 AND account_id IS NOT NULL;
