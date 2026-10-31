-- Expand agentsam_hook.trigger CHECK so Notification / PermissionRequest can live in D1 SSOT.
-- Then seed desktop OS notification hooks (permission wait + idle after long task).

CREATE TABLE agentsam_hook__new (
  id            TEXT    PRIMARY KEY,
  tenant_id     TEXT,
  workspace_id  TEXT,
  user_id       TEXT    NOT NULL,
  provider      TEXT    NOT NULL DEFAULT 'system',
  external_id   TEXT,
  trigger       TEXT    NOT NULL
                        CHECK(trigger IN (
                          'start','stop','pre_deploy','post_deploy',
                          'pre_commit','error','imessage_reply','email_reply',
                          'Notification','PermissionRequest'
                        )),
  command       TEXT    NOT NULL DEFAULT '',
  target_id     TEXT    NOT NULL DEFAULT '',
  metadata      TEXT    DEFAULT '{}',
  is_active     INTEGER NOT NULL DEFAULT 1,
  run_count     INTEGER DEFAULT 0,
  last_run_at   TEXT,
  subagent_slug TEXT,
  person_uuid   TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  event_type TEXT,
  hook_key TEXT,
  handler_type TEXT DEFAULT 'log_only',
  handler_config TEXT DEFAULT '{}',
  priority INTEGER DEFAULT 100,
  updated_at TEXT,
  workflow_id TEXT REFERENCES agentsam_workflows(id) ON DELETE SET NULL
);

INSERT INTO agentsam_hook__new (
  id, tenant_id, workspace_id, user_id, provider, external_id, trigger, command,
  target_id, metadata, is_active, run_count, last_run_at, subagent_slug, person_uuid,
  created_at, event_type, hook_key, handler_type, handler_config, priority, updated_at, workflow_id
)
SELECT
  id, tenant_id, workspace_id, user_id, provider, external_id, trigger, command,
  target_id, metadata, is_active, run_count, last_run_at, subagent_slug, person_uuid,
  created_at, event_type, hook_key, handler_type, handler_config, priority, updated_at, workflow_id
FROM agentsam_hook;

DROP TABLE agentsam_hook;
ALTER TABLE agentsam_hook__new RENAME TO agentsam_hook;

CREATE INDEX IF NOT EXISTS idx_hook_user_ws   ON agentsam_hook(user_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_hook_provider  ON agentsam_hook(provider);
CREATE INDEX IF NOT EXISTS idx_hook_trigger   ON agentsam_hook(trigger, is_active);
CREATE INDEX IF NOT EXISTS idx_hook_tenant    ON agentsam_hook(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hook_external  ON agentsam_hook(external_id, provider);
CREATE INDEX IF NOT EXISTS idx_agentsam_hook_event_type_active
  ON agentsam_hook(tenant_id, event_type, is_active)
  WHERE is_active = 1;
CREATE UNIQUE INDEX IF NOT EXISTS idx_agentsam_hook_tenant_hook_key
  ON agentsam_hook(tenant_id, hook_key);

INSERT INTO agentsam_hook (
  id, tenant_id, workspace_id, user_id, provider,
  trigger, command, target_id, metadata, is_active,
  event_type, hook_key, handler_type, handler_config, priority, updated_at
) VALUES
(
  'hook_desktop_permission_prompt',
  'tenant_sam_primeaux', 'ws_inneranimalmedia', 'sam_primeaux', 'system',
  'Notification',
  'osascript -e ''display notification "Sam needs approval to proceed" with title "AgentSam"''',
  'desktop_notification',
  '{"matcher":"permission_prompt","purpose":"OS banner when a permission prompt has waited ~6s"}',
  1,
  'Notification', 'hook_desktop_permission_prompt', 'command',
  '{"matcher":"permission_prompt"}',
  50, CAST(unixepoch() AS TEXT)
),
(
  'hook_desktop_idle_prompt',
  'tenant_sam_primeaux', 'ws_inneranimalmedia', 'sam_primeaux', 'system',
  'Notification',
  'osascript -e ''display notification "Sam finished — ready for your next step" with title "AgentSam"''',
  'desktop_notification',
  '{"matcher":"idle_prompt","purpose":"OS banner ~60s after a finished response with no further input"}',
  1,
  'Notification', 'hook_desktop_idle_prompt', 'command',
  '{"matcher":"idle_prompt"}',
  50, CAST(unixepoch() AS TEXT)
)
ON CONFLICT(id) DO UPDATE SET
  trigger=excluded.trigger,
  command=excluded.command,
  target_id=excluded.target_id,
  metadata=excluded.metadata,
  is_active=excluded.is_active,
  event_type=excluded.event_type,
  hook_key=excluded.hook_key,
  handler_type=excluded.handler_type,
  handler_config=excluded.handler_config,
  priority=excluded.priority,
  updated_at=excluded.updated_at;
