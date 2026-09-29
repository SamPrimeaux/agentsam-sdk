PRAGMA foreign_keys = ON;

-- Account -> site ownership only. No tenant_id or workspace_id.

CREATE TABLE IF NOT EXISTS cms_sites (
  account_id TEXT NOT NULL,
  id TEXT NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  domain TEXT,
  status TEXT NOT NULL DEFAULT 'harvest',
  source_repo TEXT,
  source_ref TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (account_id, id),
  UNIQUE (account_id, slug)
);

CREATE TABLE IF NOT EXISTS cms_brand_profiles (
  account_id TEXT NOT NULL,
  id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  profile_key TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  source_file TEXT,
  status TEXT NOT NULL DEFAULT 'candidate',
  PRIMARY KEY (account_id, id),
  UNIQUE (account_id, site_id, profile_key),
  FOREIGN KEY (account_id, site_id) REFERENCES cms_sites(account_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cms_brand_tokens (
  account_id TEXT NOT NULL,
  id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  token_key TEXT NOT NULL,
  category TEXT NOT NULL,
  value_text TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  status TEXT NOT NULL DEFAULT 'observed',
  source_file TEXT,
  source_line INTEGER,
  PRIMARY KEY (account_id, id),
  FOREIGN KEY (account_id, site_id) REFERENCES cms_sites(account_id, id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, profile_id) REFERENCES cms_brand_profiles(account_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cms_routes (
  account_id TEXT NOT NULL,
  id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  path TEXT NOT NULL,
  route_kind TEXT NOT NULL,
  title TEXT,
  source_file TEXT,
  source_symbol TEXT,
  status TEXT NOT NULL DEFAULT 'candidate',
  PRIMARY KEY (account_id, id),
  UNIQUE (account_id, site_id, path),
  FOREIGN KEY (account_id, site_id) REFERENCES cms_sites(account_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cms_layouts (
  account_id TEXT NOT NULL,
  id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  route_id TEXT,
  layout_key TEXT NOT NULL,
  name TEXT NOT NULL,
  source_file TEXT,
  source_symbol TEXT,
  status TEXT NOT NULL DEFAULT 'candidate',
  structure_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (account_id, id),
  UNIQUE (account_id, site_id, layout_key),
  FOREIGN KEY (account_id, site_id) REFERENCES cms_sites(account_id, id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, route_id) REFERENCES cms_routes(account_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cms_sections (
  account_id TEXT NOT NULL,
  id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  route_id TEXT,
  layout_id TEXT,
  section_key TEXT NOT NULL,
  name TEXT NOT NULL,
  section_type TEXT NOT NULL,
  zone TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  authority TEXT NOT NULL DEFAULT 'harvest',
  status TEXT NOT NULL DEFAULT 'candidate',
  source_file TEXT,
  source_line INTEGER,
  source_symbol TEXT,
  props_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (account_id, id),
  FOREIGN KEY (account_id, site_id) REFERENCES cms_sites(account_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cms_navigation (
  account_id TEXT NOT NULL,
  id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  nav_key TEXT NOT NULL,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  source_file TEXT,
  source_symbol TEXT,
  status TEXT NOT NULL DEFAULT 'candidate',
  PRIMARY KEY (account_id, id),
  UNIQUE (account_id, site_id, nav_key),
  FOREIGN KEY (account_id, site_id) REFERENCES cms_sites(account_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cms_navigation_items (
  account_id TEXT NOT NULL,
  id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  navigation_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  label TEXT NOT NULL,
  href TEXT NOT NULL,
  item_kind TEXT NOT NULL DEFAULT 'internal',
  source_file TEXT,
  source_line INTEGER,
  status TEXT NOT NULL DEFAULT 'candidate',
  PRIMARY KEY (account_id, id),
  FOREIGN KEY (account_id, navigation_id) REFERENCES cms_navigation(account_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cms_content_items (
  account_id TEXT NOT NULL,
  id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  collection_key TEXT NOT NULL,
  item_key TEXT NOT NULL,
  item_type TEXT NOT NULL,
  title TEXT,
  slug TEXT,
  authority TEXT NOT NULL DEFAULT 'sample',
  status TEXT NOT NULL DEFAULT 'sample',
  source_file TEXT,
  source_line INTEGER,
  data_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (account_id, id),
  UNIQUE (account_id, site_id, collection_key, item_key),
  FOREIGN KEY (account_id, site_id) REFERENCES cms_sites(account_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cms_assets (
  account_id TEXT NOT NULL,
  id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  asset_key TEXT NOT NULL,
  asset_kind TEXT NOT NULL,
  uri TEXT,
  local_path TEXT,
  authority TEXT NOT NULL DEFAULT 'reference',
  status TEXT NOT NULL DEFAULT 'candidate',
  source_file TEXT,
  source_line INTEGER,
  PRIMARY KEY (account_id, id),
  FOREIGN KEY (account_id, site_id) REFERENCES cms_sites(account_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cms_drafts (
  account_id TEXT NOT NULL,
  id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  route_id TEXT,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'working',
  snapshot_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (account_id, id),
  FOREIGN KEY (account_id, site_id) REFERENCES cms_sites(account_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cms_change_sets (
  account_id TEXT NOT NULL,
  id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  draft_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  source_kind TEXT NOT NULL DEFAULT 'human',
  patch_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'accepted',
  created_at TEXT NOT NULL,
  PRIMARY KEY (account_id, id),
  UNIQUE (account_id, draft_id, sequence),
  FOREIGN KEY (account_id, draft_id) REFERENCES cms_drafts(account_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cms_publications (
  account_id TEXT NOT NULL,
  id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published',
  created_at TEXT NOT NULL,
  published_at TEXT,
  PRIMARY KEY (account_id, id),
  UNIQUE (account_id, site_id, revision),
  FOREIGN KEY (account_id, site_id) REFERENCES cms_sites(account_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS harvest_runs (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  source_repo TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  source_commit TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS harvest_sources (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  lane TEXT NOT NULL,
  path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  source_commit TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES harvest_runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS harvest_findings (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  signal TEXT NOT NULL,
  message TEXT NOT NULL,
  source_file TEXT,
  source_line INTEGER,
  status TEXT NOT NULL DEFAULT 'review',
  FOREIGN KEY (run_id) REFERENCES harvest_runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS harvest_candidates (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  candidate_kind TEXT NOT NULL,
  candidate_key TEXT NOT NULL,
  value_text TEXT,
  confidence REAL NOT NULL DEFAULT 0.5,
  source_file TEXT,
  source_line INTEGER,
  status TEXT NOT NULL DEFAULT 'review',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (run_id) REFERENCES harvest_runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tooling_probe_runs (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  profile TEXT NOT NULL,
  sdk_root TEXT,
  fixture_root TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  ok INTEGER
);

CREATE TABLE IF NOT EXISTS tooling_probe_steps (
  id TEXT PRIMARY KEY,
  probe_run_id TEXT NOT NULL,
  step_key TEXT NOT NULL,
  category TEXT NOT NULL,
  command_json TEXT NOT NULL,
  cwd TEXT NOT NULL,
  mutability TEXT NOT NULL,
  network_mode TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  exit_code INTEGER,
  ok INTEGER,
  stdout_text TEXT,
  stderr_text TEXT,
  FOREIGN KEY (probe_run_id) REFERENCES tooling_probe_runs(id) ON DELETE CASCADE
);


-- Historical archive/theme intake provenance.
CREATE TABLE IF NOT EXISTS archive_ingests (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  source_path TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_sha256 TEXT,
  quarantine_path TEXT NOT NULL,
  classification TEXT NOT NULL,
  created_at TEXT NOT NULL,
  manifest_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS archive_files (
  id TEXT PRIMARY KEY,
  ingest_id TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  category TEXT NOT NULL,
  FOREIGN KEY (ingest_id) REFERENCES archive_ingests(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS archive_outputs (
  id TEXT PRIMARY KEY,
  ingest_id TEXT NOT NULL,
  output_kind TEXT NOT NULL,
  path TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  FOREIGN KEY (ingest_id) REFERENCES archive_ingests(id) ON DELETE CASCADE
);
