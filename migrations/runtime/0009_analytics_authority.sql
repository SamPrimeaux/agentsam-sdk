-- AgentSam analytics authority v1.
--
-- Replace the old, empty aggregate-shaped agentsam_analytics table with the
-- canonical HOT analytical fact ledger.
--
-- Safety: the guard aborts if the legacy table contains any rows.
-- Operational tables remain authoritative for live transactional state.
-- agentsam_analytics owns normalized analytical facts.
-- Basin/Iceberg receives compact projections from those facts.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS agentsam_analytics_migration_guard_0009 (
  row_count INTEGER NOT NULL CHECK (row_count = 0)
);

DELETE FROM agentsam_analytics_migration_guard_0009;

INSERT INTO agentsam_analytics_migration_guard_0009 (row_count)
SELECT COUNT(*) FROM agentsam_analytics;

DROP TABLE agentsam_analytics_migration_guard_0009;

ALTER TABLE agentsam_analytics
RENAME TO agentsam_analytics_aggregate_legacy_20261003;

CREATE TABLE agentsam_analytics (
  id                    TEXT PRIMARY KEY NOT NULL,
  schema_name           TEXT NOT NULL DEFAULT 'agentsam.metric-event.v1',

  account_id            TEXT,
  tenant_id             TEXT,
  workspace_id          TEXT,
  repository_id         TEXT,
  git_sha               TEXT,
  run_id                TEXT,
  receipt_id            TEXT,

  event_kind            TEXT NOT NULL,
  domain                TEXT NOT NULL,
  operation             TEXT NOT NULL,
  outcome               TEXT,

  source_client         TEXT,
  source_table          TEXT,
  source_id             TEXT,
  provider              TEXT,
  model_key             TEXT,
  tool_key              TEXT,

  duration_ms           INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  queue_wait_ms         INTEGER CHECK (queue_wait_ms IS NULL OR queue_wait_ms >= 0),
  external_wait_ms      INTEGER CHECK (external_wait_ms IS NULL OR external_wait_ms >= 0),
  active_model_ms       INTEGER CHECK (active_model_ms IS NULL OR active_model_ms >= 0),

  input_tokens          INTEGER CHECK (input_tokens IS NULL OR input_tokens >= 0),
  cached_input_tokens   INTEGER CHECK (cached_input_tokens IS NULL OR cached_input_tokens >= 0),
  output_tokens         INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0),
  reasoning_tokens      INTEGER CHECK (reasoning_tokens IS NULL OR reasoning_tokens >= 0),
  cost_usd              REAL CHECK (cost_usd IS NULL OR cost_usd >= 0),
  cost_basis            TEXT,

  attempt_count         INTEGER CHECK (attempt_count IS NULL OR attempt_count >= 0),
  retry_count           INTEGER CHECK (retry_count IS NULL OR retry_count >= 0),
  plan_points           REAL,

  score_family          TEXT,
  score_value           REAL,
  weights_version       TEXT,

  error_code            TEXT,
  failure_origin        TEXT,
  artifact_ref          TEXT,

  dimensions_json       TEXT NOT NULL DEFAULT '{}',
  metrics_json          TEXT NOT NULL DEFAULT '{}',

  dedup_key             TEXT,
  created_at_unix       INTEGER NOT NULL DEFAULT (unixepoch()),

  CHECK (score_value IS NULL OR score_family IS NOT NULL),
  CHECK (score_family IS NULL OR weights_version IS NOT NULL)
);

CREATE UNIQUE INDEX idx_agentsam_analytics_dedup
  ON agentsam_analytics(dedup_key)
  WHERE dedup_key IS NOT NULL;

CREATE INDEX idx_agentsam_analytics_created
  ON agentsam_analytics(created_at_unix DESC);

CREATE INDEX idx_agentsam_analytics_run
  ON agentsam_analytics(run_id, created_at_unix DESC);

CREATE INDEX idx_agentsam_analytics_repo
  ON agentsam_analytics(repository_id, git_sha, created_at_unix DESC);

CREATE INDEX idx_agentsam_analytics_domain_operation
  ON agentsam_analytics(domain, operation, created_at_unix DESC);

CREATE INDEX idx_agentsam_analytics_outcome
  ON agentsam_analytics(outcome, created_at_unix DESC);

CREATE INDEX idx_agentsam_analytics_receipt
  ON agentsam_analytics(receipt_id);

CREATE INDEX idx_agentsam_analytics_score
  ON agentsam_analytics(score_family, weights_version, created_at_unix DESC);
