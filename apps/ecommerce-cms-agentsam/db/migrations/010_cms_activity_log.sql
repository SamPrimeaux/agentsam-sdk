-- Canonical site-owned CMS activity spine; already present in deployed D1.
-- Idempotent for existing installations; not an alternate activity database.
CREATE TABLE IF NOT EXISTS cms_activity_log (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES cms_sites(id),
  actor_account_id TEXT REFERENCES accounts(id),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(details_json)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_cms_activity_log_site_created
  ON cms_activity_log(site_id, created_at DESC);
