-- 0010_portable_tickets_memory.sql
-- Portable GOAP / ticket + memory spine for new AgentSam projects (local SQLite or D1).
-- Account-owned tickets — NOT Inner Animal Media's shared platform DB.
-- Every write path MUST populate account_id and repository_id (NULL = broken implementation).

CREATE TABLE IF NOT EXISTS agentsam_tickets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('backlog', 'active', 'blocked', 'in_review', 'shipped', 'abandoned')),
  status_reason TEXT,
  project TEXT,
  subsystem TEXT,
  tags TEXT,
  priority TEXT,
  doc_path TEXT,
  blocks TEXT,
  blocked_by TEXT,
  supersedes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  closed_at INTEGER,
  dedup_key TEXT,
  consecutive_pass_count INTEGER,
  last_gate_run_id INTEGER,
  last_gate_ok_at INTEGER,
  required_pass_count INTEGER,
  description TEXT,
  client_id TEXT,
  due_at INTEGER,
  surface TEXT NOT NULL DEFAULT 'platform',
  start_at INTEGER,
  estimated_minutes INTEGER,
  percent_complete INTEGER NOT NULL DEFAULT 0,
  owner_kind TEXT NOT NULL DEFAULT 'unassigned',
  owner_ref TEXT,
  parent_ticket_id TEXT,
  agent_run_id TEXT,
  worktree TEXT,
  linked_commit TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  account_id TEXT NOT NULL,
  repository_id TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agentsam_tickets_account_repository
  ON agentsam_tickets(account_id, repository_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_agentsam_tickets_status
  ON agentsam_tickets(account_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS agentsam_ticket_events (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES agentsam_tickets(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  detail TEXT,
  commit_sha TEXT,
  created_at INTEGER NOT NULL,
  actor_type TEXT,
  actor_id TEXT,
  media_asset_id TEXT,
  account_id TEXT NOT NULL,
  repository_id TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agentsam_ticket_events_ticket
  ON agentsam_ticket_events(ticket_id, created_at);

CREATE TABLE IF NOT EXISTS agentsam_memory (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  repository_id TEXT NOT NULL,
  project_id TEXT,
  memory_key TEXT NOT NULL,
  memory_type TEXT NOT NULL
    CHECK (memory_type IN (
      'fact', 'preference', 'decision', 'policy', 'state', 'procedure'
    )),
  title TEXT,
  content TEXT NOT NULL,
  summary TEXT,
  importance INTEGER NOT NULL DEFAULT 5
    CHECK (importance BETWEEN 1 AND 10),
  tags TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived', 'deleted')),
  is_pinned INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT NOT NULL,
  source TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  revision INTEGER NOT NULL DEFAULT 1,
  semantic_hash TEXT,
  sensitivity TEXT NOT NULL DEFAULT 'normal'
    CHECK (sensitivity IN ('normal','internal','confidential','secret')),
  source_client TEXT,
  source_ref TEXT,
  supersedes_id TEXT,
  expires_at INTEGER,
  scope_type TEXT,
  scope_id TEXT,
  idempotency_key TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(metadata_json)),
  UNIQUE(account_id, memory_key)
);

CREATE INDEX IF NOT EXISTS idx_agentsam_memory_account_repo
  ON agentsam_memory(account_id, repository_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS agentsam_memory_outbox (
  id TEXT PRIMARY KEY NOT NULL,
  memory_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  repository_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  semantic_hash TEXT NOT NULL,
  operation TEXT NOT NULL DEFAULT 'upsert'
    CHECK (operation IN ('upsert','deactivate','delete')),
  projection_target TEXT NOT NULL DEFAULT 'node_api_pgvector'
    CHECK (projection_target = 'node_api_pgvector'),
  payload_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(payload_json)),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER,
  locked_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(memory_id, revision, operation)
);

CREATE INDEX IF NOT EXISTS idx_agentsam_memory_outbox_pending
  ON agentsam_memory_outbox(status, next_attempt_at)
  WHERE status IN ('pending','failed');
