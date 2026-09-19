-- agentsam-desktop-updates D1 schema
-- One shared DB can serve every brand's desktop shell; releases are
-- scoped by app_id so Inner Animals / Meauxbility / AgentSam builds
-- never see each other's updates.

CREATE TABLE IF NOT EXISTS releases (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  target TEXT NOT NULL,
  arch TEXT NOT NULL,
  version TEXT NOT NULL,
  url TEXT NOT NULL,
  signature TEXT NOT NULL,
  notes TEXT,
  pub_date TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_releases_lookup
  ON releases(app_id, target, arch, version);
