-- @inneranimalmedia/agentsam-campaign / SQLite-D1 schema v1
-- Additive, installation-local, tenant-scoped. Apply BEFORE any backfill.
-- No destructive ALTER, DROP, or rewiring of existing business tables.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS campaign_schema_versions (
  version INTEGER PRIMARY KEY,
  installed_at TEXT NOT NULL DEFAULT (datetime('now')),
  notes TEXT NOT NULL
);
INSERT OR IGNORE INTO campaign_schema_versions(version, notes)
VALUES (1, 'agentsam-campaign canonical D1 schema v1');

-- A scope is provisioned by the trusted installation resolver, NEVER by a client parameter.
-- Distinct accounts/tenants/sites in the same D1 remain isolated.
CREATE TABLE IF NOT EXISTS campaign_scopes (
  id TEXT PRIMARY KEY,
  owner_kind TEXT NOT NULL CHECK(owner_kind IN ('account','tenant','site')),
  owner_ref TEXT NOT NULL,
  site_ref TEXT,
  display_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  scope_id TEXT NOT NULL REFERENCES campaign_scopes(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK(length(trim(name)) > 0),
  slug TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'marketing'
    CHECK(kind IN ('marketing','fundraising','event','email','community','other')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','generating','review','approved','scheduled','active','paused','completed','archived','failed')),
  objective TEXT,
  audience TEXT,
  brief TEXT,
  approval_mode TEXT NOT NULL DEFAULT 'manual',
  starts_at TEXT,
  ends_at TEXT,
  attributes_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(attributes_json)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(scope_id, slug),
  UNIQUE(id, scope_id)
);
CREATE INDEX IF NOT EXISTS idx_campaigns_scope_status ON campaigns(scope_id, status, updated_at);

CREATE TABLE IF NOT EXISTS campaign_channels (
  id TEXT PRIMARY KEY,
  scope_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  channel_key TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft'
    CHECK(state IN ('draft','review','approved','scheduled','active','paused','completed','failed','disabled')),
  destination_ref TEXT,
  settings_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(settings_json)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(campaign_id, channel_key),
  FOREIGN KEY(campaign_id, scope_id) REFERENCES campaigns(id, scope_id) ON DELETE CASCADE
);

-- Content payloads and revisions; binary assets remain in original R2/media authority.
CREATE TABLE IF NOT EXISTS campaign_materials (
  id TEXT PRIMARY KEY,
  scope_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  material_type TEXT NOT NULL,
  channel_key TEXT,
  title TEXT,
  content_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(content_json)),
  state TEXT NOT NULL DEFAULT 'draft'
    CHECK(state IN ('draft','review','approved','published','archived')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
  source_table TEXT,
  source_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(scope_id, source_table, source_id),
  FOREIGN KEY(campaign_id, scope_id) REFERENCES campaigns(id, scope_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_campaign_materials_campaign ON campaign_materials(scope_id, campaign_id, material_type);

CREATE TABLE IF NOT EXISTS campaign_asset_refs (
  id TEXT PRIMARY KEY,
  scope_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  material_id TEXT REFERENCES campaign_materials(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  external_asset_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'attachment',
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(campaign_id, provider, external_asset_id, role),
  FOREIGN KEY(campaign_id, scope_id) REFERENCES campaigns(id, scope_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS campaign_approvals (
  id TEXT PRIMARY KEY,
  scope_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision > 0),
  decision TEXT NOT NULL CHECK(decision IN ('requested','approved','rejected','revoked')),
  actor_id TEXT NOT NULL,
  rationale TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(campaign_id, scope_id) REFERENCES campaigns(id, scope_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_campaign_approvals_campaign ON campaign_approvals(scope_id, campaign_id, revision, created_at);

-- Publishing is channel-specific, idempotent and evidence-backed. NEVER infer success
-- from campaign.status or old content. Test delivery is explicitly NOT live.
CREATE TABLE IF NOT EXISTS campaign_publications (
  id TEXT PRIMARY KEY,
  scope_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  channel_key TEXT NOT NULL,
  revision INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN ('test','publish','unpublish','rollback')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','running','succeeded','failed')),
  destination_ref TEXT,
  provider_receipt_id TEXT,
  receipt_json TEXT CHECK(receipt_json IS NULL OR json_valid(receipt_json)),
  error_code TEXT,
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  UNIQUE(scope_id, idempotency_key),
  FOREIGN KEY(campaign_id, scope_id) REFERENCES campaigns(id, scope_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_campaign_publications_campaign ON campaign_publications(scope_id, campaign_id, requested_at);

-- Unknown/unmeasured is NULL, not zero. Evidence provenance is mandatory.
CREATE TABLE IF NOT EXISTS campaign_metric_facts (
  id TEXT PRIMARY KEY,
  scope_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  metric_key TEXT NOT NULL,
  value_num REAL NOT NULL,
  unit TEXT NOT NULL,
  evidence_kind TEXT NOT NULL CHECK(evidence_kind IN ('observed','legacy_snapshot','estimated')),
  source_system TEXT NOT NULL,
  source_ref TEXT,
  window_start TEXT,
  window_end TEXT,
  measured_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json)),
  UNIQUE(scope_id, campaign_id, metric_key, source_system, source_ref, measured_at),
  FOREIGN KEY(campaign_id, scope_id) REFERENCES campaigns(id, scope_id) ON DELETE CASCADE
);

-- Deterministic legacy mapping for reversible, repeatable imports.
CREATE TABLE IF NOT EXISTS campaign_source_links (
  id TEXT PRIMARY KEY,
  scope_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  source_system TEXT NOT NULL,
  source_table TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_status TEXT,
  linked_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(scope_id, source_system, source_table, source_id),
  FOREIGN KEY(campaign_id, scope_id) REFERENCES campaigns(id, scope_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS campaign_activity (
  id TEXT PRIMARY KEY,
  scope_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT,
  request_id TEXT,
  detail_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(detail_json)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(scope_id, request_id),
  FOREIGN KEY(campaign_id, scope_id) REFERENCES campaigns(id, scope_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_campaign_activity_campaign ON campaign_activity(scope_id, campaign_id, created_at);
