-- Portable local skill retrieval shape (NOT applied to IAM D1 as-is).
-- strategy ≠ provider_id ≠ driver_id ≠ accelerator_ref ≠ embedding_profile_id
-- Hyperdrive is accelerator_ref, never a provider.

CREATE TABLE IF NOT EXISTS agentsam_skill_retrieval (
  id                   TEXT PRIMARY KEY,
  skill_id             TEXT NOT NULL,

  strategy             TEXT NOT NULL CHECK (
    strategy IN (
      'relational',
      'object_store',
      'vector_index',
      'filesystem'
    )
  ),

  provider_id          TEXT NOT NULL,
  driver_id            TEXT NOT NULL,

  connection_ref       TEXT,
  accelerator_ref      TEXT,

  embedding_profile_id TEXT,

  index_name           TEXT,
  namespace            TEXT,

  is_primary           INTEGER NOT NULL DEFAULT 0,

  config_json          TEXT NOT NULL DEFAULT '{}',

  last_synced_at       TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_skill_retrieval_skill
  ON agentsam_skill_retrieval(skill_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_skill_retrieval_primary
  ON agentsam_skill_retrieval(skill_id) WHERE is_primary = 1;
