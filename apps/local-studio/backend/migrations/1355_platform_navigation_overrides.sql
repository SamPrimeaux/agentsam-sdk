-- agentsam-engine: d1
-- Account-scoped presentation overrides for the installed platform navigation.
-- The app/route manifests remain the authority for installed capabilities.
-- User edits never create routes or grant permissions.
CREATE TABLE IF NOT EXISTS agentsam_platform_navigation_overrides (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  overrides_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(overrides_json) AND json_type(overrides_json) = 'object'),
  updated_at_ms INTEGER NOT NULL DEFAULT 0
);
