-- identity.oauth-server consent catalog.
-- Issuer branding remains owned by portable identity_companies (identity.core).

INSERT OR IGNORE INTO identity_schema_meta (key, value)
VALUES ('pack_oauth_consent_catalog', '1');

CREATE TABLE IF NOT EXISTS identity_oauth_resources (
  id TEXT PRIMARY KEY NOT NULL,
  audience TEXT NOT NULL UNIQUE,
  resource_type TEXT NOT NULL DEFAULT 'mcp',
  display_name TEXT NOT NULL,
  description TEXT,
  logo_url TEXT,
  homepage_url TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS identity_oauth_scopes (
  scope TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  sensitivity TEXT NOT NULL DEFAULT 'normal'
    CHECK (sensitivity IN ('normal','elevated','sensitive')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 50,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS identity_oauth_resource_scopes (
  resource_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 0 CHECK (required IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 50,
  PRIMARY KEY (resource_id, scope),
  FOREIGN KEY (resource_id) REFERENCES identity_oauth_resources(id) ON DELETE CASCADE,
  FOREIGN KEY (scope) REFERENCES identity_oauth_scopes(scope) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_identity_oauth_resources_active
  ON identity_oauth_resources(is_active, resource_type);

CREATE INDEX IF NOT EXISTS idx_identity_oauth_resource_scopes_sort
  ON identity_oauth_resource_scopes(resource_id, sort_order, scope);
