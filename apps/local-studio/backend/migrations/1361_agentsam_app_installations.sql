-- agentsam-engine: d1
-- Account-scoped installs for the `apps` catalog (the Apps launcher spine).
-- Mirrors the production table; idempotent so existing databases are unchanged.
CREATE TABLE IF NOT EXISTS agentsam_app_installations (
  id TEXT PRIMARY KEY DEFAULT ('ainst_' || lower(hex(randomblob(8)))),
  account_id TEXT NOT NULL,
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  config_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(config_json)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (account_id, app_id)
);
