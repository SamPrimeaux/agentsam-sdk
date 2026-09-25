-- 0011_agentsam_skill_v2.sql
-- Skill redesign: identity/config · metrics · retrieval (three tables).
-- Migration strategy for hosts with legacy agentsam_skill:
--   1) CREATE these tables
--   2) backfill from agentsam_skill_legacy (rename old → agentsam_skill_legacy first)
--   3) verify → drop legacy
-- Fresh installs: apply directly. Do not drop production agentsam_skill without backup.

CREATE TABLE IF NOT EXISTS agentsam_skill (
  id                 TEXT PRIMARY KEY,
  account_id         TEXT NOT NULL,

  name               TEXT NOT NULL,
  slash_trigger      TEXT NOT NULL
                       CHECK (slash_trigger GLOB '/[a-z0-9][a-z0-9-]*'),

  npm_package_name   TEXT,
  npm_version        TEXT,
  is_published       INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0,1)),

  description        TEXT NOT NULL DEFAULT '',
  content_markdown   TEXT NOT NULL DEFAULT '',
  file_path          TEXT NOT NULL DEFAULT '',
  content_checksum   TEXT NOT NULL DEFAULT '',

  globs              TEXT NOT NULL DEFAULT '[]',
  always_apply       INTEGER NOT NULL DEFAULT 0 CHECK (always_apply IN (0,1)),
  task_types_json    TEXT NOT NULL DEFAULT '[]',
  route_keys_json    TEXT NOT NULL DEFAULT '[]',

  access_mode        TEXT NOT NULL DEFAULT 'read_write'
                       CHECK (access_mode IN ('read_only','read_write')),

  icon               TEXT NOT NULL DEFAULT '',
  tags_json          TEXT NOT NULL DEFAULT '[]',
  metadata_json      TEXT NOT NULL DEFAULT '{}',

  invocation_count   INTEGER NOT NULL DEFAULT 0,
  last_invoked_at    TEXT,

  version            INTEGER NOT NULL DEFAULT 1,
  is_active          INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  sort_order         INTEGER NOT NULL DEFAULT 0,

  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE (account_id, slash_trigger),
  UNIQUE (npm_package_name, npm_version)
);

CREATE INDEX IF NOT EXISTS idx_skill_account ON agentsam_skill(account_id);
CREATE INDEX IF NOT EXISTS idx_skill_active ON agentsam_skill(is_active) WHERE is_active = 1;
CREATE INDEX IF NOT EXISTS idx_skill_published ON agentsam_skill(is_published) WHERE is_published = 1;

-- Partial unique: published slash triggers globally unique (npm publish lane)
CREATE UNIQUE INDEX IF NOT EXISTS idx_skill_published_slash
  ON agentsam_skill(slash_trigger) WHERE is_published = 1;

CREATE TABLE IF NOT EXISTS agentsam_skill_metrics (
  skill_id           TEXT PRIMARY KEY REFERENCES agentsam_skill(id) ON DELETE CASCADE,
  byte_size          INTEGER NOT NULL DEFAULT 0,
  char_count         INTEGER NOT NULL DEFAULT 0,
  line_count         INTEGER NOT NULL DEFAULT 0,
  estimated_tokens   INTEGER NOT NULL DEFAULT 0,
  estimation_method  TEXT NOT NULL DEFAULT 'chars_div_4'
                       CHECK (estimation_method IN ('chars_div_4','tiktoken_cl100k','tiktoken_o200k','provider_reported')),
  computed_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agentsam_skill_retrieval (
  id                 TEXT PRIMARY KEY,
  skill_id           TEXT NOT NULL REFERENCES agentsam_skill(id) ON DELETE CASCADE,

  provider           TEXT NOT NULL CHECK (provider IN (
                        'local_fs',
                        'cloudflare_d1',
                        'cloudflare_hyperdrive',
                        'cloudflare_r2',
                        'cloudflare_vectorize',
                        'supabase_postgres',
                        'supabase_vectorize'
                      )),
  strategy           TEXT NOT NULL CHECK (strategy IN (
                        'relational',
                        'object_store',
                        'vector_index',
                        'none'
                      )),

  is_primary         INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),

  index_name         TEXT,
  namespace          TEXT,
  connection_ref     TEXT,
  embedding_model    TEXT,
  dimensions         INTEGER,

  config_json        TEXT NOT NULL DEFAULT '{}',
  last_synced_at     TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE (skill_id, provider, strategy)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_skill_retrieval_primary
  ON agentsam_skill_retrieval(skill_id) WHERE is_primary = 1;

CREATE INDEX IF NOT EXISTS idx_skill_retrieval_skill ON agentsam_skill_retrieval(skill_id);

CREATE TABLE IF NOT EXISTS agentsam_skill_revision (
  id           TEXT PRIMARY KEY DEFAULT ('skillrev_' || lower(hex(randomblob(8)))),
  skill_id     TEXT NOT NULL REFERENCES agentsam_skill(id) ON DELETE CASCADE,
  content_markdown TEXT NOT NULL,
  version      INTEGER NOT NULL,
  changed_by   TEXT NOT NULL DEFAULT 'system',
  change_note  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agentsam_skill_invocation (
  id              TEXT PRIMARY KEY DEFAULT ('skillinv_' || lower(hex(randomblob(8)))),
  skill_id        TEXT NOT NULL REFERENCES agentsam_skill(id) ON DELETE CASCADE,
  account_id      TEXT NOT NULL,
  repository_id   TEXT,
  conversation_id TEXT,
  trigger_method  TEXT NOT NULL DEFAULT 'slash'
    CHECK (trigger_method IN ('slash','at','auto','api')),
  input_summary   TEXT,
  success         INTEGER NOT NULL DEFAULT 1,
  error_message   TEXT,
  duration_ms     INTEGER,
  model_used      TEXT,
  tokens_in       INTEGER DEFAULT 0,
  tokens_out      INTEGER DEFAULT 0,
  cost_usd        REAL DEFAULT 0.0,
  invoked_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
