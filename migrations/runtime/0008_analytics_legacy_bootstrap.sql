-- Bootstrap compatibility for analytics authority migration 0009.
--
-- Production D1 already had the legacy aggregate-shaped agentsam_analytics
-- table before 0009 was introduced. A fresh portable/local SQLite database did
-- not, so 0009 could not run its row-count guard or rename step.
--
-- This migration intentionally sorts before 0009 and creates the old empty
-- aggregate shape only when no agentsam_analytics table exists. On production
-- or any database that already has either the legacy or canonical table, this
-- is a no-op. 0009 remains immutable after release.

CREATE TABLE IF NOT EXISTS agentsam_analytics (
  id               TEXT NOT NULL PRIMARY KEY,
  account_id       TEXT NOT NULL,
  date_key         TEXT NOT NULL DEFAULT '',
  event_type       TEXT NOT NULL DEFAULT '',
  event_name       TEXT NOT NULL DEFAULT '',
  workflow_key     TEXT NOT NULL DEFAULT '',
  task_type        TEXT NOT NULL DEFAULT '',
  model_id         TEXT NOT NULL DEFAULT '',

  total_calls      INTEGER NOT NULL DEFAULT 0,
  success_calls    INTEGER NOT NULL DEFAULT 0,
  failure_calls    INTEGER NOT NULL DEFAULT 0,
  timeout_calls    INTEGER NOT NULL DEFAULT 0,

  total_input_tok  INTEGER NOT NULL DEFAULT 0,
  total_output_tok INTEGER NOT NULL DEFAULT 0,
  total_cached_tok INTEGER NOT NULL DEFAULT 0,

  total_cost_usd   REAL NOT NULL DEFAULT 0.0,
  avg_latency_ms   REAL NOT NULL DEFAULT 0.0,
  p95_latency_ms   REAL NOT NULL DEFAULT 0.0,

  success_rate     REAL NOT NULL DEFAULT 0.0,

  source           TEXT NOT NULL DEFAULT 'live',
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(account_id, date_key, event_type, event_name, workflow_key, task_type, model_id)
    ON CONFLICT REPLACE
);
