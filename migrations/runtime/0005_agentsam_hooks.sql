-- Portable AgentSam hook registry and execution evidence.
--
-- This is the standalone/local baseline. Shared hosts may map owner_id to their
-- account authority, but tenant_id/workspace_id are intentionally not part of
-- the portable contract. Repository/project/session applicability belongs in
-- scope_type + scope_ref; less common correlations stay in JSON.
--
-- Handler secrets are references resolved by the host. Never store API keys,
-- bearer tokens, or decrypted credentials in handler_config_json or receipts.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS agentsam_hook (
  id TEXT PRIMARY KEY DEFAULT ('hook_' || lower(hex(randomblob(8)))),
  owner_id TEXT NOT NULL DEFAULT 'local',
  hook_key TEXT NOT NULL CHECK(length(trim(hook_key)) > 0 AND hook_key = trim(hook_key)),
  event_type TEXT NOT NULL CHECK(length(trim(event_type)) > 0 AND event_type = trim(event_type)),
  source_kind TEXT NOT NULL DEFAULT 'stored'
    CHECK(source_kind IN ('stored','config','code','system')),
  scope_type TEXT NOT NULL DEFAULT 'project'
    CHECK(scope_type IN ('global','account','repository','project','session')),
  scope_ref TEXT,
  handler_type TEXT NOT NULL DEFAULT 'log_only'
    CHECK(length(trim(handler_type)) > 0 AND handler_type = trim(handler_type)),
  handler_config_json TEXT NOT NULL DEFAULT '{}'
    CHECK(json_valid(handler_config_json)),
  match_json TEXT NOT NULL DEFAULT '{}'
    CHECK(json_valid(match_json)),
  failure_mode TEXT NOT NULL DEFAULT 'open'
    CHECK(failure_mode IN ('open','closed','error')),
  priority INTEGER NOT NULL DEFAULT 100,
  timeout_ms INTEGER NOT NULL DEFAULT 30000
    CHECK(timeout_ms BETWEEN 1 AND 600000),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  workflow_id TEXT,
  description TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}'
    CHECK(json_valid(metadata_json)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  created_at_unix INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at_unix INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agentsam_hook_identity
  ON agentsam_hook(owner_id, scope_type, IFNULL(scope_ref, ''), hook_key);
CREATE INDEX IF NOT EXISTS idx_agentsam_hook_dispatch
  ON agentsam_hook(owner_id, event_type, is_active, priority, hook_key);
CREATE INDEX IF NOT EXISTS idx_agentsam_hook_scope
  ON agentsam_hook(owner_id, scope_type, scope_ref, is_active);

CREATE TABLE IF NOT EXISTS agentsam_hook_execution (
  id TEXT PRIMARY KEY DEFAULT ('hexec_' || lower(hex(randomblob(8)))),
  owner_id TEXT NOT NULL DEFAULT 'local',
  hook_id TEXT,
  hook_key TEXT NOT NULL,
  source_kind TEXT NOT NULL DEFAULT 'stored'
    CHECK(source_kind IN ('stored','config','code','system')),
  event_type TEXT NOT NULL,
  invocation_id TEXT,
  agent_run_id TEXT,
  session_id TEXT,
  conversation_id TEXT,
  status TEXT NOT NULL
    CHECK(status IN ('completed','failed','timeout','skipped','blocked')),
  duration_ms INTEGER NOT NULL DEFAULT 0 CHECK(duration_ms >= 0),
  input_keys_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(input_keys_json)),
  output_keys_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(output_keys_json)),
  decision TEXT,
  reason TEXT,
  error_code TEXT,
  error_message TEXT,
  receipt_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(receipt_json)),
  correlation_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(correlation_json)),
  ran_at_unix INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_agentsam_hook_execution_hook
  ON agentsam_hook_execution(owner_id, hook_key, ran_at_unix DESC);
CREATE INDEX IF NOT EXISTS idx_agentsam_hook_execution_run
  ON agentsam_hook_execution(agent_run_id, ran_at_unix DESC)
  WHERE agent_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agentsam_hook_execution_session
  ON agentsam_hook_execution(session_id, ran_at_unix DESC)
  WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agentsam_hook_execution_failure
  ON agentsam_hook_execution(owner_id, status, ran_at_unix DESC)
  WHERE status IN ('failed','timeout','blocked');
